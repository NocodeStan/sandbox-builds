// End-to-end: imports the real workflow JSON into a real n8n, points it at mock Airtable/SendGrid,
// and drives every lane through its webhooks.
// Usage: NODE24=/path/to/node24 N8N_BIN=/path/to/node_modules/n8n/bin/n8n node test/e2e/run-e2e.mjs
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acknowledge, buildErrorWorkflow, buildMain, webhook } from '../../build/build-workflow.mjs';
import { typeformPayload } from '../fixtures.mjs';
import { AIRTABLE_TOKEN, SENDGRID_KEY, createMockServices } from './mock-services.mjs';

const NODE = process.env.NODE24 || process.execPath;
const N8N = process.env.N8N_BIN;
if (!N8N) throw new Error('Set N8N_BIN to the n8n CLI entry (node_modules/n8n/bin/n8n)');
const PORT = 5678;
const BASE = `http://localhost:${PORT}/webhook/akari-waitlist`;
const WF_ID = 'akariWaitlistE2E1';
const SECRET = 'e2e-secret-123';
const home = mkdtempSync(join(process.env.E2E_TMP || tmpdir(), 'n8n-e2e-'));
const env = {
  ...process.env,
  N8N_USER_FOLDER: home,
  N8N_ENCRYPTION_KEY: 'e2e-test-key',
  N8N_PORT: String(PORT),
  N8N_LISTEN_ADDRESS: '127.0.0.1',
  N8N_DIAGNOSTICS_ENABLED: 'false',
  N8N_PERSONALIZATION_ENABLED: 'false',
  N8N_VERSION_NOTIFICATIONS_ENABLED: 'false',
  N8N_TEMPLATES_ENABLED: 'false',
  GENERIC_TIMEZONE: 'America/New_York',
  WEBHOOK_URL: `http://localhost:${PORT}/`,
  NO_PROXY: 'localhost,127.0.0.1',
  no_proxy: 'localhost,127.0.0.1',
  N8N_LOG_LEVEL: 'warn',
};

// ── Workflow under test = the shipped JSON with test-only config swapped in ──
const wf = buildMain();
wf.id = WF_ID;
const config = wf.nodes.find((n) => n.name === 'Config');
const swaps = [
  ["'appXXXXXXXXXXXXXX'", "'appE2ETEST000001'"],
  ["'https://YOUR-N8N-HOST/webhook/akari-waitlist'", `'${BASE}'`],
  ["'https://api.airtable.com/v0'", "'http://127.0.0.1:4010/v0'"],
  ["'https://api.sendgrid.com/v3/mail/send'", "'http://127.0.0.1:4010/v3/mail/send'"],
  ["sendNowSecret: 'CHANGE-ME'", `sendNowSecret: '${SECRET}'`],
  ['sendWindow: { startHour: 8, endHour: 20 }', 'sendWindow: { startHour: 0, endHour: 24 }'],
  ['sandboxMode: true', 'sandboxMode: false'],
];
for (const [from, to] of swaps) {
  assert.ok(config.parameters.jsCode.includes(from), `Config is missing ${from}`);
  config.parameters.jsCode = config.parameters.jsCode.replace(from, to);
}
// Test hooks: the (pending) Glofox webhook drives the engine; an extra webhook drives the report.
for (const n of wf.nodes.filter((x) => x.name.includes('Glofox'))) delete n.disabled;
wf.nodes.push(webhook('TEST: Report', [0, 1400], 'POST', 'akari-waitlist/test-report', 'responseNode'));
wf.nodes.push(acknowledge('TEST: Acknowledge Report', [200, 1400]));
wf.connections['TEST: Report'] = { main: [[{ node: 'TEST: Acknowledge Report', type: 'main', index: 0 }]] };
wf.connections['TEST: Acknowledge Report'] = { main: [[{ node: 'Route: Report', type: 'main', index: 0 }]] };

// Error-alert workflow, wired in as the main workflow's error workflow.
const errWf = buildErrorWorkflow();
errWf.id = 'akariWaitlistErr1';
const alertSend = errWf.nodes.find((n) => n.name === 'Send Alert (SendGrid)');
alertSend.parameters.url = 'http://127.0.0.1:4010/v3/mail/send';
wf.settings.errorWorkflow = errWf.id;

writeFileSync(join(home, 'workflow.json'), JSON.stringify(wf));
writeFileSync(join(home, 'error-workflow.json'), JSON.stringify(errWf));
writeFileSync(join(home, 'credentials.json'), JSON.stringify([
  { id: 'akariAirtablePAT', name: 'Airtable PAT (Akari)', type: 'httpHeaderAuth', data: { name: 'Authorization', value: `Bearer ${AIRTABLE_TOKEN}` } },
  { id: 'akariSendGridKey', name: 'SendGrid API Key (Akari)', type: 'httpHeaderAuth', data: { name: 'Authorization', value: `Bearer ${SENDGRID_KEY}` } },
]));

const cli = (...args) => execFileSync(NODE, [N8N, ...args], { env, stdio: 'pipe', encoding: 'utf8' });
console.log('• importing credentials + workflow into n8n', cli('--version').trim());
cli('import:credentials', `--input=${join(home, 'credentials.json')}`);
cli('import:workflow', `--input=${join(home, 'error-workflow.json')}`);
cli('import:workflow', `--input=${join(home, 'workflow.json')}`);
cli('publish:workflow', `--id=${WF_ID}`);
cli('publish:workflow', `--id=${errWf.id}`); // n8n 2.x only runs error workflows that are published

// ── Mock services + seed data ─────────────────────────────────
const mock = createMockServices();
await mock.listen(4010);
const HOUR = 3600000;
const ago = (days) => new Date(Date.now() - days * 24 * HOUR).toISOString();
const SIGNUP = (slug) => `https://app.glofox.test/signup/${slug}`;
mock.seed('Capacity', [
  { Queue: 'Williamsburg · Unlimited', Location: 'Williamsburg', Membership: 'Unlimited', 'Minimum Members': 12, 'Active Members': 10, Enabled: true, 'Signup URL': SIGNUP('wb-unl') },
  { Queue: 'Williamsburg · Daytime', Location: 'Williamsburg', Membership: 'Daytime', 'Minimum Members': 5, 'Active Members': 5, Enabled: true, 'Signup URL': SIGNUP('wb-day') },
  { Queue: 'Greenpoint · Daytime', Location: 'Greenpoint', Membership: 'Daytime', 'Minimum Members': 0, 'Active Members': 0, Enabled: true, 'Signup URL': SIGNUP('gp-day') },
  { Queue: 'Lower East Side · Unlimited', Location: 'Lower East Side', Membership: 'Unlimited', 'Minimum Members': 50, 'Active Members': 0, Enabled: false },
]);
const person = (name, fields) => ({ Name: name, Email: `${name.toLowerCase()}@example.com`, Location: 'Williamsburg', Membership: 'Unlimited', 'Member Type': 'New', Status: 'Waiting', 'Timeout Count': 0, ...fields });
const [alex, blair, casey, dana, alexDaytime] = mock.seed('Waitlist', [
  person('Alex', { 'Joined At': ago(60) }), // weighted 180
  person('Blair', { 'Joined At': ago(100), 'Member Type': 'Existing' }), // weighted 100
  person('Casey', { 'Joined At': ago(30) }), // weighted 90
  person('Dana', { 'Joined At': ago(1), 'Manual Rank': 1 }), // manual override
  person('Alex', { 'Joined At': ago(60), Membership: 'Daytime', Status: 'Not Right Now' }),
]);
// 250 Greenpoint entries, seeded newest-first: the 10 longest-waiting sit on the LAST page, so a
// pagination failure would prime the wrong people.
const bulk = mock.seed('Waitlist', Array.from({ length: 250 }, (_, i) => person(`Bulk${String(i).padStart(3, '0')}`, { Location: 'Greenpoint', Membership: 'Daytime', 'Joined At': ago(1 + i) })));
const oldestBulk = bulk.slice(-10).map((r) => r.id).sort();

// ── Start n8n ─────────────────────────────────────────────────
const n8n = spawn(NODE, [N8N, 'start'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let n8nLog = '';
n8n.stdout.on('data', (d) => { n8nLog += d; });
n8n.stderr.on('data', (d) => { n8nLog += d; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, label, ms = 30000) {
  const end = Date.now() + ms;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch { /* retry */ }
    if (Date.now() > end) throw new Error(`Timed out waiting for: ${label}`);
    await sleep(250);
  }
}

const results = [];
async function step(name, fn) {
  await sleep(1200); // keep executions from overlapping so rate-limit checks measure a single execution
  const t = Date.now();
  try {
    await fn();
    results.push(['PASS', name, Date.now() - t]);
    console.log(`  ✓ ${name}`);
  } catch (e) {
    results.push(['FAIL', name, Date.now() - t, e.message]);
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}
const get = (id) => mock.table('Waitlist').find((r) => r.id === id);
const logs = (event) => mock.table('Activity Log').filter((r) => r.fields.Event === event);
const emailsTo = (addr) => mock.state.emails.filter((m) => m.personalizations[0].to.some((t) => t.email === addr));
const tokenOf = (id) => get(id).fields['Invite Token'];
const post = (path, body) => fetch(`${BASE}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const form = (fields) => fetch(`${BASE}/respond-confirm`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });

try {
  await waitFor(async () => (await fetch(`http://localhost:${PORT}/healthz`)).ok, 'n8n /healthz', 120000);
  await waitFor(async () => (await fetch(`${BASE}/respond?t=x&a=yes`)).status === 410, 'production webhooks registered', 60000);
  console.log('• n8n is up with the workflow published\n');

  await step('Intake: Typeform submission → one row per location × membership, logged', async () => {
    const r = await post('intake', typeformPayload({ locations: ['Williamsburg', 'LES'], memberships: ['Unlimited', 'Daytime'] }));
    assert.equal(r.status, 200, await r.text());
    await waitFor(() => logs('Joined').length === 4, 'intake rows + logs');
    const jane = mock.table('Waitlist').filter((x) => x.fields.Email === 'jane.doe@example.com');
    assert.equal(jane.length, 4);
    assert.ok(jane.every((x) => x.fields.Status === 'Waiting' && x.fields.Name === 'Jane Doe' && x.fields['Entry Source'] === 'Typeform'));
    assert.equal(logs('Joined').length, 4);
  });

  await step('Intake: resubmitting the same form creates no duplicates', async () => {
    const r = await post('intake', typeformPayload({ locations: ['Williamsburg'], memberships: ['Unlimited'], token: 'tok-again' }));
    assert.equal(r.status, 200, 'duplicates are acknowledged so Typeform does not retry');
    await sleep(1500);
    assert.equal(mock.table('Waitlist').filter((x) => x.fields.Email === 'jane.doe@example.com').length, 4);
  });

  await step('Intake: an unprocessable submission returns an error to Typeform and emails an alert (never silently dropped)', async () => {
    const r = await post('intake', { event_type: 'form_response', form_response: { token: 'broken', answers: [] } });
    assert.ok(r.status >= 500, `expected 5xx, got ${r.status}`);
    assert.equal(logs('Joined').length, 4);
    const alert = await waitFor(() => mock.state.emails.find((m) => m.subject.startsWith('[Waitlist automation]')), 'error alert email');
    assert.match(alert.subject, /missing email, location, membership/);
    assert.match(alert.content[1].value, /Parse Typeform/);
  });

  await step('Engine: fills the gap (manual rank first, then weighted wait), primes the next in line, paginates 250+ rows', async () => {
    const r = await post('glofox-end-date', {});
    assert.equal(r.status, 200, await r.text());
    await waitFor(() => logs('Invited').length === 2 && logs('Primed').length >= 14, 'engine actions');
    assert.deepEqual([get(dana.id).fields.Status, get(alex.id).fields.Status], ['Invited', 'Invited']);
    assert.equal(get(casey.id).fields.Status, 'Primed');
    assert.equal(get(blair.id).fields.Status, 'Primed');
    assert.match(tokenOf(alex.id), /^[a-f0-9]{48}$/);
    const primedBulk = mock.table('Waitlist').filter((x) => x.fields.Location === 'Greenpoint' && x.fields.Status === 'Primed').map((x) => x.id).sort();
    assert.deepEqual(primedBulk, oldestBulk);
    const janePrimed = mock.table('Waitlist').filter((x) => x.fields.Email === 'jane.doe@example.com' && x.fields.Status === 'Primed');
    assert.equal(janePrimed.length, 2, 'Jane primed on both Williamsburg queues');
    await waitFor(() => emailsTo('jane.doe@example.com').length === 1, 'one combined heads-up for Jane');
    assert.equal(emailsTo('alex@example.com').length, 1);
    assert.match(emailsTo('alex@example.com')[0].subject, /Unlimited spot at Williamsburg is open/);
    assert.ok(emailsTo('alex@example.com')[0].content[1].value.includes(`respond?t=${tokenOf(alex.id)}&amp;a=yes`), 'emailed link carries the stored token');
    assert.notEqual(tokenOf(alex.id), tokenOf(dana.id));
    assert.doesNotMatch(JSON.stringify(mock.state.emails), /__TOKEN__/);
    assert.equal(logs('Primed').length, 14, '3 + Jane on Daytime + 10 Greenpoint');
    await waitFor(() => mock.state.emails.length === 16, 'error alert + 2 invites + 13 heads-ups (Jane gets one combined)');
  });

  await step('Engine is idempotent: an immediate second run sends nothing new', async () => {
    const before = mock.state.emails.length;
    const r = await post('glofox-end-date', {});
    assert.equal(r.status, 200);
    await sleep(4000);
    assert.equal(mock.state.emails.length, before);
    assert.equal(logs('Invited').length, 2);
  });

  await step('Response link (GET) only shows a confirmation page — no state change', async () => {
    const r = await fetch(`${BASE}/respond?t=${tokenOf(alex.id)}&a=yes`);
    const html = await r.text();
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.match(html, /action="http:\/\/localhost:5678\/webhook\/akari-waitlist\/respond-confirm"/);
    assert.equal(get(alex.id).fields.Status, 'Invited');
  });

  await step('Yes on Unlimited → Signed Up, sent to Glofox signup, removed from other waitlists, confirmation email', async () => {
    const r = await form({ t: tokenOf(alex.id), a: 'yes' });
    const html = await r.text();
    assert.equal(r.status, 200);
    assert.match(html, /url=https:\/\/app\.glofox\.test\/signup\/wb-unl/);
    await waitFor(() => get(alexDaytime.id).fields.Status === 'Removed', 'Alex removed from Daytime');
    assert.equal(get(alex.id).fields.Status, 'Signed Up');
    await waitFor(() => emailsTo('alex@example.com').length === 2, 'confirmation email');
    const conf = emailsTo('alex@example.com')[1];
    assert.match(conf.content[1].value, /wb-unl/);
    assert.match(conf.content[0].value, /taken you off your other waitlists/);
    assert.equal(logs('Signed Up').length, 1);
  });

  await step('Tour request → spot held (Tour Requested), team alerted with preferred times', async () => {
    const r = await form({ t: tokenOf(dana.id), a: 'tour', reason: 'Saturday 10am' });
    assert.equal(r.status, 200);
    await waitFor(() => get(dana.id).fields.Status === 'Tour Requested', 'Dana tour requested');
    assert.equal(get(dana.id).fields['Tour Notes'], 'Saturday 10am');
    await waitFor(() => emailsTo('team@YOUR-DOMAIN.com').some((m) => /Tour request: Dana/.test(m.subject)), 'team alert');
  });

  await step('Send Now: wrong key is refused', async () => {
    const r = await fetch(`${BASE}/send-now?id=${casey.id}&k=wrong`);
    assert.equal(r.status, 403);
    assert.equal(get(casey.id).fields.Status, 'Primed');
  });

  await step('Send Now: invites a specific person immediately even though the queue has no gap', async () => {
    const r = await fetch(`${BASE}/send-now?id=${casey.id}&k=${SECRET}`);
    const html = await r.text();
    assert.equal(r.status, 200, html);
    assert.match(html, /Invite sent/);
    await waitFor(() => get(casey.id).fields.Status === 'Invited', 'Casey invited');
    assert.equal(get(casey.id).fields['Invite Source'], 'Send Now');
    await waitFor(() => emailsTo('casey@example.com').length === 2, 'Casey invite email');
  });

  await step('Timeout: expired hold → Warm; staff recount + higher minimum → chain advances to the next person', async () => {
    get(casey.id).fields['Invite Expires At'] = new Date(Date.now() - HOUR).toISOString();
    const cap = mock.table('Capacity')[0];
    Object.assign(cap.fields, { 'Minimum Members': 13, 'Active Members': 11, 'Active Updated At': new Date().toISOString() });
    await post('glofox-end-date', {});
    await waitFor(() => get(casey.id).fields.Status === 'Warm' && get(blair.id).fields.Status === 'Invited', 'Casey warm, Blair invited');
    assert.equal(get(casey.id).fields['Timeout Count'], 1);
    assert.equal(logs('Timed Out').length, 1);
  });

  await step('Late reply after the hold expired → stays Warm with priority, told they are first in line', async () => {
    const r = await form({ t: tokenOf(casey.id), a: 'yes' });
    assert.match(await r.text(), /first in line/);
    await waitFor(() => logs('Late Reply').length === 1, 'late reply logged');
    assert.equal(get(casey.id).fields.Status, 'Warm');
    assert.ok(get(casey.id).fields['Response At']);
  });

  await step('Not right now / No longer interested → buckets with reasons', async () => {
    await form({ t: tokenOf(blair.id), a: 'notnow', reason: 'Travelling until November' });
    await waitFor(() => get(blair.id).fields.Status === 'Not Right Now', 'Blair not right now');
    assert.equal(get(blair.id).fields.Reason, 'Travelling until November');
  });

  await step('Tampered or unknown token → 410, nothing changes', async () => {
    const before = JSON.stringify(mock.table('Waitlist'));
    const r = await form({ t: 'deadbeef'.repeat(6), a: 'yes' });
    assert.equal(r.status, 410);
    await sleep(1200);
    const r2 = await form({ t: '', a: 'yes' });
    assert.equal(r2.status, 410);
    await sleep(1500);
    assert.equal(JSON.stringify(mock.table('Waitlist')), before);
  });

  await step('Daily report → one email to the team with counts, conversion and queue snapshot', async () => {
    const before = mock.state.emails.length;
    const r = await post('test-report', {});
    assert.equal(r.status, 200, await r.text());
    await waitFor(() => mock.state.emails.length === before + 1, 'report email');
    const rep = mock.state.emails.at(-1);
    assert.match(rep.subject, /^Waitlist summary/);
    const html = rep.content[1].value;
    assert.match(html, /Signed up<\/td><td[^>]*>1</);
    assert.match(html, /Williamsburg · Unlimited/);
    assert.match(html, /Travelling until November/);
  });

  await step('Airtable limits respected: no 429s, no >10-record batches, no bad formulas or payloads', async () => {
    assert.equal(mock.state.rateViolations, 0, `${mock.state.rateViolations} rate-limit violations:\n${JSON.stringify(mock.state.violations, null, 1)}`);
    assert.deepEqual(mock.state.errors, []);
  });
} catch (e) {
  results.push(['FAIL', 'harness', 0, e.message]);
  console.log(`✗ ${e.message}`);
} finally {
  n8n.kill('SIGTERM');
  await mock.close();
}

const failed = results.filter((r) => r[0] === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} end-to-end checks passed · ${mock.state.requests.length} API calls · ${mock.state.emails.length} emails`);
if (failed.length) {
  console.log('\n--- n8n log (tail) ---\n', n8nLog.split('\n').slice(-60).join('\n'));
  process.exitCode = 1;
}
