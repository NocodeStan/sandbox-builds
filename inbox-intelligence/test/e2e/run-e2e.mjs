// End-to-end: imports the real workflow JSON into a real n8n, points it at mock Gmail/Calendar/TypeSafe,
// and drives the Report and Sort lanes.
// Usage: N8N_BIN=/path/to/node_modules/n8n/bin/n8n node test/e2e/run-e2e.mjs
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildErrorWorkflow, buildMain } from '../../build/build-workflow.mjs';
import { calendarEvents, message, sampleMailbox } from '../fixtures.mjs';
import { SAMPLE } from '../pipeline.mjs';
import { GOOGLE_TOKEN, TYPESAFE_KEY, createMockServices } from './mock-services.mjs';

const NODE = process.env.NODE24 || process.execPath;
const N8N = process.env.N8N_BIN;
if (!N8N) throw new Error('Set N8N_BIN to the n8n CLI entry (node_modules/n8n/bin/n8n)');
const PORT = 5679;
const MOCK = 'http://127.0.0.1:4011';
const WF_ID = 'inboxIntelE2E001';
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
  GENERIC_TIMEZONE: 'Europe/London',
  WEBHOOK_URL: `http://localhost:${PORT}/`,
  NO_PROXY: 'localhost,127.0.0.1',
  no_proxy: 'localhost,127.0.0.1',
  N8N_LOG_LEVEL: 'warn',
};

// ── Workflow under test = the shipped JSON with test-only config and two test webhooks ──
const wf = buildMain();
wf.id = WF_ID;
const config = wf.nodes.find((n) => n.name === 'Config');
const swaps = [
  ["ownerEmails: ['you@YOUR-DOMAIN.com']", "ownerEmails: ['stan@owner.test', 'stan.alias@owner.test']"],
  ["reportTo: ['you@YOUR-DOMAIN.com']", "reportTo: ['stan@owner.test']"],
  ['client: [],', "client: ['acme.test'],"],
  ['prospect: [],', "prospect: ['globex.test'],"],
  ["'https://api.typesafe.ai'", `'${MOCK}'`],
  ["'https://gmail.googleapis.com/gmail/v1/users/me'", `'${MOCK}/gmail/v1/users/me'`],
  ["'https://www.googleapis.com/calendar/v3/calendars/primary'", `'${MOCK}/calendar/v3/calendars/primary'`],
];
for (const [from, to] of swaps) {
  assert.ok(config.parameters.jsCode.includes(from), `Config is missing ${from}`);
  config.parameters.jsCode = config.parameters.jsCode.replace(from, to);
}
const hook = (name, path, target, y) => {
  wf.nodes.push({ parameters: { httpMethod: 'POST', path, responseMode: 'onReceived', options: {} }, id: `e2e-${path}`, name, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [-500, y], webhookId: `e2e-${path}` });
  wf.connections[name] = { main: [[{ node: target, type: 'main', index: 0 }]] };
};
hook('TEST: Sort', 'iq-test/sort', 'Route: Sort', 0);
hook('TEST: Report', 'iq-test/report', 'Route: Report', 400);

const errWf = buildErrorWorkflow();
errWf.id = 'inboxIntelErr001';
errWf.nodes.find((n) => n.name === 'Send Alert (Gmail)').parameters.url = `${MOCK}/gmail/v1/users/me/messages/send`;
wf.settings.errorWorkflow = errWf.id;

// Real credential types. The Google ones are OAuth2 credentials pre-seeded with an access token, so n8n
// signs requests exactly as it would after the consent screen.
const oauth = { clientId: 'e2e-client', clientSecret: 'e2e-secret', oauthTokenData: { access_token: GOOGLE_TOKEN, refresh_token: 'e2e-refresh', token_type: 'Bearer', expires_in: 3599 } };
writeFileSync(join(home, 'workflow.json'), JSON.stringify(wf));
writeFileSync(join(home, 'error-workflow.json'), JSON.stringify(errWf));
writeFileSync(join(home, 'credentials.json'), JSON.stringify([
  { id: 'iqGmailOAuth', name: 'Gmail (Inbox Intelligence)', type: 'gmailOAuth2', data: oauth },
  { id: 'iqCalendarOAuth', name: 'Google Calendar (Inbox Intelligence)', type: 'googleCalendarOAuth2Api', data: oauth },
  { id: 'iqTypeSafeKey', name: 'TypeSafe API Key', type: 'httpHeaderAuth', data: { name: 'Authorization', value: `Bearer ${TYPESAFE_KEY}` } },
]));

const cli = (...args) => execFileSync(NODE, [N8N, ...args], { env, stdio: 'pipe', encoding: 'utf8' });
console.log('• importing credentials + workflows into n8n', cli('--version').trim());
cli('import:credentials', `--input=${join(home, 'credentials.json')}`);
cli('import:workflow', `--input=${join(home, 'error-workflow.json')}`);
cli('import:workflow', `--input=${join(home, 'workflow.json')}`);
cli('publish:workflow', `--id=${WF_ID}`);
cli('publish:workflow', `--id=${errWf.id}`);

// ── Mocks ──
const mailbox = sampleMailbox();
const mock = createMockServices({ threads: mailbox, calendar: calendarEvents(), steer: SAMPLE, failSubjects: ['PO number'] });
await mock.listen(4011);
const S = mock.state;

const n8n = spawn(NODE, [N8N, 'start'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let n8nLog = '';
n8n.stdout.on('data', (d) => { n8nLog += d; });
n8n.stderr.on('data', (d) => { n8nLog += d; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, label, ms = 60000) {
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
const fire = (lane) => fetch(`http://localhost:${PORT}/webhook/iq-test/${lane}`, { method: 'POST' });
const labelId = (name) => S.labels.find((l) => l.name === name)?.id;
const lastMods = (threadId) => S.modifications.filter((m) => m.threadId === threadId).at(-1);
const decodeParts = (mime) => [...mime.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/g)].map((m) => Buffer.from(m[1].replace(/\r\n/g, ''), 'base64').toString('utf8'));

try {
  await waitFor(async () => (await fetch(`http://localhost:${PORT}/healthz`)).ok, 'n8n /healthz', 120000);
  await waitFor(async () => (await fetch(`http://localhost:${PORT}/webhook/iq-test/nope`, { method: 'POST' })).status === 404, 'webhooks up', 60000);
  console.log('• n8n is up with the workflow published\n');

  await step('Report: paginates Gmail, judges every thread with valid TypeSafe requests, emails a one-page brief', async () => {
    assert.equal((await fire('report')).status, 200);
    await waitFor(() => S.sent.length === 1, 'report email', 90000);
    assert.equal(S.listPages, 3, '7 threads at 3 per page');
    assert.equal(S.typesafeRejected.length, 0, S.typesafeRejected.join('; '));
    assert.equal(S.unauthorized, 0, 'every request carried valid credentials');
    const threadCalls = S.typesafe.filter((r) => r.state.thread || r.state.email);
    assert.ok(threadCalls.length >= 7, 'every thread judged (the failing one retried)');
    assert.equal(S.typesafe.filter((r) => r.state.events).length, 1, 'events judged in one batched request');
    assert.ok(S.typesafe.every((r) => r.model === 'jev-latest'));
    const mime = S.sent[0];
    assert.match(mime, /^To: stan@owner\.test/);
    const [text, html] = decodeParts(mime);
    assert.match(text, /1 · Relationship risk\n- Workshop follow-up/);
    assert.match(text, /2 · Decide or reply first\n- Board pack: AI operating model[^\n]*\n- Podcast invitation/);
    assert.match(html, /ACME board prep[\s\S]*substantial prep[\s\S]*Board pack: AI operating model/);
    assert.match(html, /1 thread could not be judged/);
    assert.doesNotMatch(html, /PO number/);
  });

  await step('Labels: IQ labels created once, every thread labelled, the failed judgment goes to Review', async () => {
    await waitFor(() => new Set(S.modifications.map((m) => m.threadId)).size === 7, 'all threads labelled');
    for (const n of ['IQ', 'IQ/1-Action', 'IQ/Client', 'IQ/Review', 'IQ/Reading', 'IQ/Low Value']) assert.ok(labelId(n), n);
    assert.equal(S.labels.filter((l) => l.name.startsWith('IQ')).length, 15);
    assert.deepEqual(lastMods('t-acme-board').addLabelIds.sort(), [labelId('IQ/Client'), labelId('IQ/1-Action')].sort());
    assert.ok(lastMods('t-initech-risk').addLabelIds.includes(labelId('IQ/Risk')));
    assert.deepEqual(lastMods('t-invoice').addLabelIds, [labelId('IQ/Review')]);
    assert.ok(lastMods('t-promo').addLabelIds.includes(labelId('IQ/Low Value')));
    assert.ok(!lastMods('t-promo').removeLabelIds.includes('INBOX'), 'archiving is off by default');
    assert.ok(lastMods('t-acme-board').removeLabelIds.includes(labelId('IQ/2-Waiting On')));
  });

  await step('Sort: only threads with new messages (and the previously failed one) are re-judged', async () => {
    const before = S.typesafe.length;
    const modsBefore = S.modifications.length;
    mailbox[0].messages.push(message({ from: 'Stan <stan@owner.test>', to: 'jane.park@acme.test', subject: 'Re: Board pack: AI operating model', body: 'Sent — see attached.', labels: ['SENT'] }));
    assert.equal((await fire('sort')).status, 200);
    await waitFor(() => S.modifications.length >= modsBefore + 2, 'sort labels', 60000);
    await sleep(1500);
    const judged = S.typesafe.slice(before).map((r) => r.state.thread?.subject || r.state.email?.subject);
    assert.deepEqual(judged.filter((s) => s !== 'PO number for September invoice'), ['Board pack: AI operating model']);
    // You replied last, so the Action label comes off even though the model still sees a request in the thread.
    assert.ok(lastMods('t-acme-board').removeLabelIds.includes(labelId('IQ/1-Action')));
    assert.equal(S.sent.length, 1, 'sort runs send no report');
  });

  await step('Sort: a run with nothing new makes no TypeSafe calls and touches no labels', async () => {
    mock.state.threads.delete('t-invoice');
    const before = S.typesafe.length;
    const modsBefore = S.modifications.length;
    assert.equal((await fire('sort')).status, 200);
    await sleep(5000);
    assert.equal(S.typesafe.length, before);
    assert.equal(S.modifications.length, modsBefore);
  });

  await step('Failure: a Gmail outage fails the run and the error workflow emails an alert', async () => {
    S.failGmailList = true;
    assert.equal((await fire('sort')).status, 200);
    const alert = await waitFor(() => S.sent.find((m) => /Inbox intelligence/.test(Buffer.from((m.match(/=\?UTF-8\?B\?([^?]+)\?=/) || [])[1] || '', 'base64').toString())), 'alert email', 60000);
    assert.match(alert, /Gmail: List Threads/);
    S.failGmailList = false;
  });
} finally {
  n8n.kill('SIGTERM');
  mock.close();
}

const failed = results.filter((r) => r[0] === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} end-to-end checks passed`);
if (failed.length) {
  console.log(n8nLog.split('\n').slice(-40).join('\n'));
  process.exit(1);
}
