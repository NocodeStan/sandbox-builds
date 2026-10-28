// Shared test stack: the shipped workflow JSON (test-only Config swapped in) running in a real n8n,
// pointed at the in-memory Airtable/SendGrid mock. Used by the e2e suite and the UAT run.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acknowledge, buildErrorWorkflow, buildMain, webhook } from '../../build/build-workflow.mjs';
import { AIRTABLE_TOKEN, SENDGRID_KEY, createMockServices } from './mock-services.mjs';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(fn, label, ms = 30000) {
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

export const CAL_SECRET = 'cal-secret-789';
export const CAL_URL = 'https://cal.test/akari/williamsburg';

export async function startStack({ port = Number(process.env.N8N_TEST_PORT) || 5678, mockPort = Number(process.env.MOCK_TEST_PORT) || 4010, secret = 'e2e-secret-123', wfId = 'akariWaitlistE2E1', lockoutMs = 0 } = {}) {
  const NODE = process.env.NODE24 || process.execPath;
  const N8N = process.env.N8N_BIN;
  if (!N8N) throw new Error('Set N8N_BIN to the n8n CLI entry (node_modules/n8n/bin/n8n)');
  const BASE = `http://localhost:${port}/webhook/akari-waitlist`;
  const MOCK = `http://127.0.0.1:${mockPort}`;
  const home = mkdtempSync(join(process.env.E2E_TMP || tmpdir(), 'n8n-e2e-'));
  const env = {
    ...process.env,
    N8N_USER_FOLDER: home,
    N8N_ENCRYPTION_KEY: 'e2e-test-key',
    N8N_PORT: String(port),
    N8N_RUNNERS_BROKER_PORT: String(port + 1), // default 5679; lets two stacks run side by side
    N8N_LISTEN_ADDRESS: '127.0.0.1',
    N8N_DIAGNOSTICS_ENABLED: 'false',
    N8N_PERSONALIZATION_ENABLED: 'false',
    N8N_VERSION_NOTIFICATIONS_ENABLED: 'false',
    N8N_TEMPLATES_ENABLED: 'false',
    GENERIC_TIMEZONE: 'America/New_York',
    WEBHOOK_URL: `http://localhost:${port}/`,
    NO_PROXY: 'localhost,127.0.0.1',
    no_proxy: 'localhost,127.0.0.1',
    N8N_LOG_LEVEL: 'warn',
  };

  // Workflow under test = the shipped JSON with test-only config swapped in.
  const wf = buildMain();
  wf.id = wfId;
  const config = wf.nodes.find((n) => n.name === 'Config');
  const swaps = [
    ["'appXXXXXXXXXXXXXX'", "'appE2ETEST000001'"],
    ["'https://YOUR-N8N-HOST/webhook/akari-waitlist'", `'${BASE}'`],
    ["'https://api.airtable.com/v0'", `'${MOCK}/v0'`],
    ["'https://api.sendgrid.com/v3/mail/send'", `'${MOCK}/v3/mail/send'`],
    ["sendNowSecret: 'CHANGE-ME'", `sendNowSecret: '${secret}'`],
    ['sendWindow: { startHour: 8, endHour: 20 }', 'sendWindow: { startHour: 0, endHour: 24 }'],
    ['sandboxMode: true', 'sandboxMode: false'],
    ["calWebhookSecret: 'CHANGE-ME'", `calWebhookSecret: '${CAL_SECRET}'`],
    ["Williamsburg: 'https://akari-sauna.cal.com/akari-williamsburg/akari-williamsburg-tours'", `Williamsburg: '${CAL_URL}'`],
    ["Greenpoint: 'https://akari-sauna.cal.com/akari-greenpoint/akari-greenpoint-tours'", "Greenpoint: ''"],
    ["'Lower East Side': 'https://akari-sauna.cal.com/hello/akari-les-tours'", "'Lower East Side': ''"],
  ];
  for (const [from, to] of swaps) {
    assert.ok(config.parameters.jsCode.includes(from), `Config is missing ${from}`);
    config.parameters.jsCode = config.parameters.jsCode.replace(from, to);
  }
  // Real schedules off (a run crossing :00 would fire the engine mid-test); tests drive the engine and
  // report through webhooks instead: the (pending) Glofox webhook and an extra report webhook.
  for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.scheduleTrigger')) n.disabled = true;
  for (const n of wf.nodes.filter((x) => x.name.includes('Glofox'))) delete n.disabled;
  wf.nodes.push(webhook('TEST: Report', [0, 1400], 'POST', 'akari-waitlist/test-report', 'responseNode'));
  wf.nodes.push(acknowledge('TEST: Acknowledge Report', [200, 1400]));
  wf.connections['TEST: Report'] = { main: [[{ node: 'TEST: Acknowledge Report', type: 'main', index: 0 }]] };
  wf.connections['TEST: Acknowledge Report'] = { main: [[{ node: 'Route: Report', type: 'main', index: 0 }]] };

  // Error-alert workflow, wired in as the main workflow's error workflow.
  const errWf = buildErrorWorkflow();
  errWf.id = `${wfId}Err`;
  errWf.nodes.find((n) => n.name === 'Send Alert (SendGrid)').parameters.url = `${MOCK}/v3/mail/send`;
  wf.settings.errorWorkflow = errWf.id;

  writeFileSync(join(home, 'workflow.json'), JSON.stringify(wf));
  writeFileSync(join(home, 'error-workflow.json'), JSON.stringify(errWf));
  writeFileSync(join(home, 'credentials.json'), JSON.stringify([
    { id: 'akariAirtablePAT', name: 'Airtable PAT (Akari)', type: 'httpHeaderAuth', data: { name: 'Authorization', value: `Bearer ${AIRTABLE_TOKEN}` } },
    { id: 'akariSendGridKey', name: 'SendGrid API Key (Akari)', type: 'httpHeaderAuth', data: { name: 'Authorization', value: `Bearer ${SENDGRID_KEY}` } },
  ]));

  const cli = (...args) => execFileSync(NODE, [N8N, ...args], { env, stdio: 'pipe', encoding: 'utf8' });
  const version = cli('--version').trim();
  cli('import:credentials', `--input=${join(home, 'credentials.json')}`);
  cli('import:workflow', `--input=${join(home, 'error-workflow.json')}`);
  cli('import:workflow', `--input=${join(home, 'workflow.json')}`);
  cli('publish:workflow', `--id=${wfId}`);
  cli('publish:workflow', `--id=${errWf.id}`); // n8n 2.x only runs error workflows that are published

  const mock = createMockServices({ lockoutMs });
  await mock.listen(mockPort);

  const n8n = spawn(NODE, [N8N, 'start'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  n8n.stdout.on('data', (d) => { log += d; });
  n8n.stderr.on('data', (d) => { log += d; });

  const stack = {
    BASE, wf, mock, version,
    log: () => log,
    async ready() {
      await waitFor(async () => (await fetch(`http://localhost:${port}/healthz`)).ok, 'n8n /healthz', 120000);
      await waitFor(async () => (await fetch(`${BASE}/respond?t=x&a=yes`)).status === 410, 'production webhooks registered', 60000);
    },
    post: (path, body) => fetch(`${BASE}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    form: (fields) => fetch(`${BASE}/respond-confirm`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() }),
    async stop() {
      n8n.kill('SIGTERM');
      await mock.close();
    },
  };
  return stack;
}
