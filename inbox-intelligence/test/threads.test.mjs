import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bulkAnswers, conversationAnswers, items, message, response, sampleMailbox, thread } from './fixtures.mjs';
import { configItem, daysAgo, runHelpers, runNode } from './harness.mjs';
import { assertValidRequest } from './typesafe-contract.mjs';

const prepare = (threads, { route = 'report', staticData = {}, cfg = {} } = {}) =>
  runNode('prepare-thread', { nodes: { Config: configItem(route, cfg) }, input: items(threads), staticData }).map((i) => i.json);

const combine = (prepared, answers, { staticData = {}, cfg = {} } = {}) =>
  runNode('combine-judgments', {
    nodes: { Config: configItem('report', cfg), 'Prepare Thread State': items(prepared) },
    input: items(answers.map((a) => (a && a.error ? a : a ? response(a) : { error: { message: 'timeout' } }))),
    staticData,
  }).map((i) => i.json);

// ── Helpers ──
test('message text: prefers plain text, strips quoted history, falls back to HTML', () => {
  const [a, b] = runHelpers(`return [messageText(${JSON.stringify(message({ from: 'x@y.test', body: 'New point here.\n\nOn Tue, 1 Sep 2026, Jane wrote:\n> old text' }))}),
    messageText(${JSON.stringify(message({ from: 'x@y.test', html: '<style>p{}</style><p>Hello&nbsp;<b>there</b></p>' }))})];`,
  { nodes: { Config: configItem() } });
  assert.equal(a, 'New point here.');
  assert.equal(b.trim(), 'Hello there');
});

test('address parsing handles quoted names with commas and bare addresses', () => {
  const r = runHelpers(`return parseAddressList('"Park, Jane" <Jane.Park@ACME.test>, bob@x.test');`, { nodes: { Config: configItem() } });
  assert.deepEqual(r, [{ name: 'Park, Jane', email: 'jane.park@acme.test' }, { name: 'bob', email: 'bob@x.test' }]);
});

test('date candidates resolve relative and absolute phrases against the message date', () => {
  // Reference: Tuesday 29 Sep 2026
  const r = runHelpers(`return findDateCandidates('Send it tomorrow, or by Friday latest. Next Friday works too. Workshop on 14 October, invoice by end of month, kickoff 2026-11-02, call next week.', new Date('2026-09-29T10:00:00Z'));`,
    { nodes: { Config: configItem() } });
  const byPhrase = Object.fromEntries(r.map((c) => [c.phrase.toLowerCase(), c.date]));
  assert.equal(byPhrase.tomorrow, '2026-09-30');
  assert.equal(byPhrase.friday, '2026-10-02');
  assert.equal(byPhrase['next friday'], '2026-10-09');
  assert.equal(byPhrase['14 october'], '2026-10-14');
  assert.equal(byPhrase['end of month'], '2026-09-30');
  assert.equal(byPhrase['2026-11-02'], '2026-11-02');
  assert.equal(byPhrase['next week'], '2026-10-05');
  assert.ok(r.every((c) => c.context.length > 0));
});

test('month-only dates roll to next year when well in the past; invalid dates are dropped', () => {
  const r = runHelpers(`return findDateCandidates('Due 5 Jan. Also 31 Feb.', new Date('2026-11-20T10:00:00Z'));`, { nodes: { Config: configItem() } });
  assert.deepEqual(r.map((c) => c.date), ['2027-01-05']);
});

// ── Prepare Thread State ──
test('conversation thread: facts from code, one valid TypeSafe request with all questions', () => {
  const [p] = prepare([sampleMailbox()[0]]);
  assert.equal(p.kind, 'conversation');
  assert.equal(p.counterpart.email, 'jane.park@acme.test');
  assert.equal(p.relationship, 'client');
  assert.equal(p.lastFromOwner, false);
  assertValidRequest(p.request);
  assert.deepEqual(Object.keys(p.request.questions).sort(),
    ['awaiting_others', 'category', 'deadline', 'needs_owner_action', 'owner_commitment_open', 'relationship_risk', 'strategic_value', 'urgency']);
  assert.equal(p.request.state.thread.counterpart.known_relationship, 'client');
  assert.ok(p.candidates.some((c) => c.phrase === 'Friday'));
  assert.ok(p.request.questions.deadline.criteria.none);
  assert.match(p.request.questions.deadline.criteria.d1, /Friday/);
});

test('owner messages are recognised by address or SENT label; thread without dates asks no deadline question', () => {
  const [p] = prepare([sampleMailbox()[1]]);
  assert.equal(p.lastFromOwner, true);
  assert.equal(p.ownerWrote, true);
  assert.equal(p.counterpart.email, 'raj@globex.test');
  assert.equal(p.relationship, 'prospect');
  assert.equal(p.request.questions.deadline, undefined);
  assert.equal(p.request.state.thread.recent_messages[0].from, 'Stan (owner)');
});

test('bulk mail (list headers / Gmail categories, owner never wrote) gets the cheap 2-question set', () => {
  const [n, promo] = prepare([sampleMailbox()[5], sampleMailbox()[6]]);
  for (const p of [n, promo]) {
    assert.equal(p.kind, 'bulk');
    assertValidRequest(p.request);
    assert.deepEqual(Object.keys(p.request.questions).sort(), ['kind', 'relevance']);
  }
  assert.equal(n.request.state.email.text.trim(), 'This week: evaluating agentic systems in enterprise settings.');
  assert.deepEqual(n.request.state.reader.focus_areas, configItem()[0].json.cfg.owner.focus);
});

test('a reply from you turns a list-style thread into a conversation', () => {
  const t = thread('t1', [
    message({ from: 'News <news@x.test>', headers: { 'List-Unsubscribe': '<mailto:a@b>' }, body: 'Q?' , at: daysAgo(2) }),
    message({ from: 'stan.alias@owner.test', to: 'news@x.test', body: 'Answer', labels: ['SENT'], at: daysAgo(1) }),
  ]);
  assert.equal(prepare([t])[0].kind, 'conversation');
});

test('drafts are ignored; draft-only threads are skipped', () => {
  const t = thread('t1', [message({ from: 'stan@owner.test', body: 'draft', labels: ['DRAFT'] })]);
  assert.deepEqual(prepare([t], { route: 'sort' }), []);
});

test('sort run skips threads with nothing new since last judgment; report run re-reads everything', () => {
  const t = sampleMailbox()[0];
  const staticData = { judged: { [t.id]: { m: t.messages.at(-1).id, at: new Date().toISOString() } } };
  assert.deepEqual(prepare([t], { route: 'sort', staticData }), []);
  assert.equal(prepare([t], { route: 'report', staticData }).length, 1);
});

test('report run with nothing to judge emits a placeholder so the report still goes out', () => {
  assert.deepEqual(prepare([], { route: 'report' }), [{ none: true }]);
  assert.deepEqual(prepare([], { route: 'sort' }), []);
});

test('long messages are capped and only the latest N messages are sent', () => {
  const msgs = Array.from({ length: 7 }, (_, i) => message({ from: 'jane.park@acme.test', body: `msg ${i} ${'x'.repeat(3000)}`, at: daysAgo(7 - i) }));
  const [p] = prepare([thread('t1', msgs)]);
  const sent = p.request.state.thread.recent_messages;
  assert.equal(sent.length, 4);
  assert.ok(sent[0].text.startsWith('msg 3'));
  assert.ok(sent.every((m) => m.text.length <= 1201));
  assert.equal(p.request.state.thread.message_count, 7);
});

// ── Combine Judgments ──
test('policy: action needs the other party to have written last; waiting needs you to have written last', () => {
  const [jane, raj] = prepare([sampleMailbox()[0], sampleMailbox()[1]]);
  const [a, b] = combine([jane, raj], [
    conversationAnswers({ action: 0.9, waiting: 0.9, urgency: 3, value: 3, deadline: 'd1' }),
    conversationAnswers({ category: 'new_business', action: 0.9, waiting: 0.8, value: 3 }),
  ]);
  assert.equal(a.needsAction, true);
  assert.equal(a.waitingOn, false);
  assert.equal(a.deadline.phrase, 'Friday');
  assert.ok(a.labels.includes('IQ/1-Action') && a.labels.includes('IQ/Client'));
  assert.equal(b.needsAction, false);
  assert.equal(b.waitingOn, true);
  assert.ok(b.daysWaiting >= 4 && b.nudge);
  assert.deepEqual(b.labels, ['IQ/New Business', 'IQ/2-Waiting On']);
  assert.equal(a.request, undefined);
});

test('priority is the configured weighted blend and responds to weight changes without re-judging', () => {
  const [jane] = prepare([sampleMailbox()[0]]);
  const ans = conversationAnswers({ action: 0.9, urgency: 3, value: 3, risk: 0.5 });
  const [a] = combine([jane], [ans]);
  assert.equal(a.priority, Math.round(30 + 30 + 15 + 15 * 0.5));
  const [b] = combine([jane], [ans], { cfg: { weights: { urgency: 0, value: 100, action: 0, risk: 0, deadlineSoon: 0 } } });
  assert.equal(b.priority, 100);
});

test('low category confidence adds Review; commitments and risk get their own labels', () => {
  const [t] = prepare([sampleMailbox()[2]]);
  const [r] = combine([t], [conversationAnswers({ categoryConfidence: 0.4, commitment: 0.95, risk: 0.9 })]);
  assert.ok(r.commitmentOpen && r.atRisk);
  assert.ok(['IQ/3-My Commitments', 'IQ/Risk', 'IQ/Review'].every((l) => r.labels.includes(l)));
});

test('a failed judgment never guesses: Review label, error kept, retried next sort run', () => {
  const [t] = prepare([sampleMailbox()[0]]);
  const staticData = {};
  const [r] = combine([t], [null], { staticData });
  assert.equal(r.judged, false);
  assert.equal(r.error, 'timeout');
  assert.deepEqual(r.labels, ['IQ/Review']);
  assert.equal(staticData.judged[t.threadId], undefined);
});

test('bulk: worth-reading vs low value; archiving only when switched on', () => {
  const [n, promo] = prepare([sampleMailbox()[5], sampleMailbox()[6]]);
  const [a, b] = combine([n, promo], [bulkAnswers('newsletter_research', 2.6), bulkAnswers('marketing_promo', 0.2)]);
  assert.ok(a.worthReading && a.labels.includes('IQ/Reading'));
  assert.ok(b.labels.includes('IQ/Low Value') && b.archive === false);
  const [, c] = combine([n, promo], [bulkAnswers(), bulkAnswers('marketing_promo', 0.2)], { cfg: { archiveLowValueBulk: true } });
  assert.equal(c.archive, true);
});

test('successful judgments are remembered per thread; stale memory is pruned', () => {
  const [t] = prepare([sampleMailbox()[0]]);
  const staticData = { judged: { old: { m: 'x', at: daysAgo(30).toISOString() } } };
  combine([t], [conversationAnswers()], { staticData });
  assert.equal(staticData.judged[t.threadId].m, t.lastMessageId);
  assert.equal(staticData.judged.old, undefined);
});

// ── Split + labels ──
test('split threads: de-duplicates pages, caps per run, placeholder when empty', () => {
  const run = (pages, cfg) => runNode('split-threads', { nodes: { Config: configItem('sort', cfg) }, input: items(pages) }).map((i) => i.json);
  const r = run([{ threads: [{ id: 'a' }, { id: 'b' }] }, { threads: [{ id: 'b' }, { id: 'c' }] }], { maxThreadsPerRun: 2 });
  assert.deepEqual(r.map((x) => x.threadId), ['a', 'b']);
  assert.equal(r[0].truncated, 1);
  assert.deepEqual(run([{ resultSizeEstimate: 0 }]), [{ none: true }]);
});

test('label plan: adds earned labels, removes stale IQ labels, archives only when decided', () => {
  const cfg = configItem('sort')[0].json.cfg;
  const labels = cfg.allLabels.map((name, i) => ({ id: `L${i}`, name })).concat([{ id: 'INBOX', name: 'INBOX' }]);
  const id = (n) => labels.find((l) => l.name === n).id;
  const judged = [
    { threadId: 't1', labels: ['IQ/Client', 'IQ/1-Action'], archive: false },
    { threadId: 't2', labels: ['IQ/Notifications', 'IQ/Low Value'], archive: true },
  ];
  const plan = runNode('plan-thread-labels', { nodes: { Config: configItem('sort'), 'Combine Judgments': items(judged) }, input: items([{ labels }]) }).map((i) => i.json);
  assert.deepEqual(plan[0].body.addLabelIds, [id('IQ/Client'), id('IQ/1-Action')]);
  assert.ok(plan[0].body.removeLabelIds.includes(id('IQ/2-Waiting On')));
  assert.ok(!plan[0].body.removeLabelIds.includes(id('IQ')));
  assert.ok(!plan[0].body.removeLabelIds.includes('INBOX'));
  assert.ok(plan[1].body.removeLabelIds.includes('INBOX'));
  assert.throws(() => runNode('plan-thread-labels', { nodes: { Config: configItem('sort'), 'Combine Judgments': items(judged) }, input: items([{ labels: [] }]) }), /labels missing/);
});

test('label names: every IQ label once; nothing when labelling is switched off', () => {
  const names = runNode('label-names', { nodes: { Config: configItem('sort') } }).map((i) => i.json.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes('IQ') && names.includes('IQ/1-Action'));
  assert.deepEqual(runNode('label-names', { nodes: { Config: configItem('sort', { applyLabels: false }) } }), []);
});
