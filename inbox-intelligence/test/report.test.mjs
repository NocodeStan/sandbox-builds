import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildMain, loadCode } from '../build/build-workflow.mjs';
import { calendarEvents, items, message, thread } from './fixtures.mjs';
import { configItem, runNode } from './harness.mjs';
import { runReportLane } from './pipeline.mjs';
import { assertValidRequest } from './typesafe-contract.mjs';

const decodeMime = (raw) => {
  const mime = Buffer.from(raw, 'base64url').toString('utf8');
  const parts = [...mime.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/g)].map((m) => Buffer.from(m[1].replace(/\r\n/g, ''), 'base64').toString('utf8'));
  return { mime, text: parts[0], html: parts[1] };
};

// ── Events ──
test('events: cancelled, declined and working-location dropped; solo and OOO classified by rule, not judged', () => {
  const nodes = { Config: configItem(), 'Combine Judgments': null };
  const [r] = runNode('prepare-events', { nodes, input: items([calendarEvents()]) }).map((i) => i.json);
  const ids = r.events.map((e) => e.id);
  assert.ok(!ids.includes('ev-cancelled') && !ids.includes('ev-declined'));
  assert.equal(r.events.find((e) => e.id === 'ev-focus').judge, false);
  assert.equal(r.events.find((e) => e.id === 'ev-ooo').judge, false);
  assertValidRequest(r.request);
  // Past meetings get a type question only; upcoming ones also get prep.
  const titles = r.request.state.events.map((e) => e.title);
  const past = titles.indexOf('ACME steering committee');
  const next = titles.indexOf('ACME board prep');
  assert.ok(r.request.questions[`e${past}_type`] && !r.request.questions[`e${past}_prep`]);
  assert.ok(r.request.questions[`e${next}_prep`]);
  assert.equal(r.keys[`e${next}`], 'ev-acme-board');
});

test('events are joined to open threads by attendee address and chunked per request', () => {
  const { nodes } = runReportLane();
  const [r] = nodes['Prepare Event Requests'].map((i) => i.json);
  const board = r.events.find((e) => e.id === 'ev-acme-board');
  assert.deepEqual(board.related.map((x) => x.threadId), ['t-acme-board']);
  assert.equal(board.relationship, 'client');
  const many = { items: Array.from({ length: 25 }, (_, i) => ({ id: `e${i}`, summary: `M${i}`, start: { dateTime: new Date(Date.now() + 86400000).toISOString() }, end: { dateTime: new Date(Date.now() + 90000000).toISOString() }, attendees: [{ email: 'x@y.test' }] })) };
  const chunks = runNode('prepare-events', { nodes: { Config: configItem(), 'Combine Judgments': null }, input: items([many]) });
  assert.deepEqual(chunks.map((c) => c.json.request.state.events.length), [12, 12, 1]);
  chunks.forEach((c) => assertValidRequest(c.json.request));
});

test('no meetings with people → no TypeSafe call, report still builds', () => {
  const [r] = runNode('prepare-events', { nodes: { Config: configItem(), 'Combine Judgments': null }, input: items([{ items: [] }]) });
  assert.equal(r.json.request, null);
});

// ── Report ──
test('report: every section is populated from the right judgments, ranked by priority', () => {
  const { report } = runReportLane();
  const s = report.stats;
  assert.deepEqual(
    { actions: s.actions, commitments: s.commitments, waiting: s.waiting, risks: s.risks, pipeline: s.pipeline, reading: s.reading, failed: s.failed },
    { actions: 3, commitments: 1, waiting: 1, risks: 1, pipeline: 1, reading: 1, failed: 0 },
  );
  assert.ok(s.prep >= 2, 'board prep and Globex meeting flagged');
  const { html, text, mime } = decodeMime(report.raw);
  assert.match(mime, /^To: stan@owner\.test/);
  const order = ['Board pack: AI operating model', 'Podcast invitation', 'PO number'].map((x) => text.indexOf(x));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), 'actions ranked by priority');
  assert.match(html, /1 · Relationship risk[\s\S]*Workshop follow-up[\s\S]*2 · Decide/);
  assert.match(html, /4 · Waiting on others[\s\S]*Proposal: agentic automation pilot[\s\S]*chase[\s\S]*5 · Other pipeline/);
  // Listed once: the proposal (waiting + pipeline) and the workshop thread (risk + commitment) are not repeated.
  const section = (n) => html.split(`${n} · `)[1].split('<h2')[0];
  assert.doesNotMatch(section(5), /Proposal: agentic/);
  assert.doesNotMatch(section(3), /Workshop follow-up/);
  assert.match(html, /ACME board prep[\s\S]*substantial prep[\s\S]*open thread/);
  assert.match(html, /Agents in production/);
  assert.doesNotMatch(html, /50% off/);
  assert.match(report.subject, /3 to act on, 1 at risk, \d meetings to prep/);
});

test('report: HTML escapes untrusted subjects and names', () => {
  const mailbox = [thread('t-evil', [message({ from: '"<b>Eve</b>" <eve@x.test>', subject: '<script>alert(1)</script> urgent', body: 'Please reply' })])];
  const { report } = runReportLane({ mailbox, steer: { 't-evil': { needs_owner_action: 0.95 } } });
  assert.equal(report.stats.actions, 1);
  assert.doesNotMatch(report.html, /<script>|<b>Eve/);
  assert.match(report.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; urgent/);
});

test('report: failed judgments are disclosed, not hidden', () => {
  const { report } = runReportLane({ failThreads: ['t-acme-board'] });
  assert.equal(report.stats.failed, 1);
  assert.match(report.html, /1 thread could not be judged/);
  assert.equal(report.stats.actions, 2);
});

test('report: quiet week (no threads, no events) still sends a well-formed brief', () => {
  const nodes = { Config: configItem(), 'Combine Judgments': null };
  nodes['Prepare Event Requests'] = runNode('prepare-events', { nodes, input: items([{ items: [] }]) });
  nodes['TypeSafe: Judge Events'] = null;
  const [r] = runNode('build-report', { nodes });
  const { html } = decodeMime(r.json.raw);
  assert.match(html, /Nothing outstanding from you/);
  assert.match(r.json.subject, /0 to act on/);
});

// ── Workflow wiring ──
test('workflow: every connection and every $("Node") reference points at a real node', () => {
  const wf = buildMain();
  const names = new Set(wf.nodes.map((n) => n.name));
  assert.equal(names.size, wf.nodes.length, 'node names unique');
  for (const [from, c] of Object.entries(wf.connections)) {
    assert.ok(names.has(from), from);
    for (const out of c.main) for (const t of out) assert.ok(names.has(t.node), `${from} → ${t.node}`);
  }
  for (const n of wf.nodes) {
    const src = n.parameters.jsCode || JSON.stringify(n.parameters);
    for (const [, ref] of src.matchAll(/\$\('([^']+)'\)/g)) assert.ok(names.has(ref), `${n.name} references missing node "${ref}"`);
  }
});

test('workflow: credentials on every external call; TypeSafe failures do not stop the run', () => {
  const wf = buildMain();
  for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.httpRequest')) {
    assert.ok(n.credentials && Object.keys(n.credentials).length === 1, `${n.name} has one credential`);
    if (n.name.startsWith('TypeSafe')) {
      assert.equal(n.onError, 'continueRegularOutput');
      assert.match(n.parameters.url, /\/v1\/systemone/);
    }
  }
});

test('workflow: shipped JSON is up to date with src/ (run npm run build)', () => {
  const shipped = JSON.parse(readFileSync(new URL('../n8n/inbox-intelligence.json', import.meta.url), 'utf8'));
  assert.deepEqual(shipped, JSON.parse(JSON.stringify(buildMain())));
  assert.ok(loadCode('build-report').includes('shared helpers: core'));
});
