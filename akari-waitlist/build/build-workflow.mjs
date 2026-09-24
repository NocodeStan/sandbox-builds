// Assembles the importable n8n workflow JSON from src/.
// Usage: node build/build-workflow.mjs   → writes n8n/*.json
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

export function loadCode(name) {
  return read(`src/nodes/${name}.js`).replace(/^\/\/ @include (\w+)\s*$/gm, (_, h) => {
    const body = read(`src/helpers/${h}.js`).trimEnd();
    return `// ── shared helpers: ${h} ─────────────────────────────\n${body}\n// ── end ${h} ─────────────────────────────────────────`;
  });
}

const uid = (seed) => {
  const h = createHash('sha1').update(`akari-waitlist:${seed}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

export const CREDS = {
  airtable: { httpHeaderAuth: { id: 'akariAirtablePAT', name: 'Airtable PAT (Akari)' } },
  sendgrid: { httpHeaderAuth: { id: 'akariSendGridKey', name: 'SendGrid API Key (Akari)' } },
};

const node = (name, type, typeVersion, position, parameters, extra = {}) => ({
  parameters, id: uid(name), name, type, typeVersion, position, ...extra,
});
const code = (name, pos, file, extra = {}, mode) =>
  node(name, 'n8n-nodes-base.code', 2, pos, mode ? { mode, jsCode: loadCode(file) } : { jsCode: loadCode(file) }, extra);
const route = (name, pos, value) =>
  node(name, 'n8n-nodes-base.set', 3.4, pos, {
    assignments: { assignments: [{ id: uid(`${name}:route`), name: 'route', value, type: 'string' }] },
    includeOtherFields: true,
    options: {},
  });
export const webhook = (name, pos, method, path, respond, extra = {}) =>
  node(name, 'n8n-nodes-base.webhook', 2, pos, { httpMethod: method, path, responseMode: respond, options: {} }, { webhookId: uid(`${name}:webhook`), ...extra });
const cron = (name, pos, expression) =>
  node(name, 'n8n-nodes-base.scheduleTrigger', 1.2, pos, { rule: { interval: [{ field: 'cronExpression', expression }] } });
const sticky = (name, pos, width, height, content, color = 7) =>
  node(name, 'n8n-nodes-base.stickyNote', 1, pos, { content, height, width, color });
export const acknowledge = (name, pos, extra = {}) =>
  node(name, 'n8n-nodes-base.respondToWebhook', 1.1, pos, { respondWith: 'text', responseBody: 'ok', options: { responseCode: 200 } }, extra);
const cond = (seed, leftValue, operator, rightValue = '') => ({
  options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
  conditions: [{ id: uid(seed), leftValue, rightValue, operator }],
  combinator: 'and',
});
const ifTrue = (name, pos, expr) =>
  node(name, 'n8n-nodes-base.if', 2.2, pos, {
    conditions: cond(`${name}:cond`, `={{ ${expr} }}`, { type: 'boolean', operation: 'true', singleValue: true }),
    options: {},
  });

const CFG = (p) => `$('Config').first().json.cfg.${p}`;
// Airtable allows 5 requests/second per base. Background work is paced at ≤2/s, leaving headroom for
// candidate-facing requests that may arrive at the same moment.
const RETRY = { retryOnFail: true, maxTries: 4, waitBetweenTries: 5000 };
const AIRTABLE_PACE = { batching: { batch: { batchSize: 1, batchInterval: 500 } } };
const SENDGRID_PACE = { batching: { batch: { batchSize: 5, batchInterval: 1000 } } };
const PAGINATE = {
  pagination: {
    pagination: {
      paginationMode: 'updateAParameterInEachRequest',
      parameters: { parameters: [{ type: 'qs', name: 'offset', value: '={{ $response.body.offset }}' }] },
      paginationCompleteWhen: 'other',
      completeExpression: '={{ !$response.body.offset }}',
      limitPagesFetched: true,
      maxRequests: 100,
      requestInterval: 500,
    },
  },
};

function airtableGet(name, pos, table, formula, { executeOnce = false, paginate = true } = {}) {
  const qp = [{ name: 'pageSize', value: '100' }];
  if (formula) qp.unshift({ name: 'filterByFormula', value: formula });
  return node(name, 'n8n-nodes-base.httpRequest', 4.2, pos, {
    url: `={{ ${CFG(`urls.${table}`)} }}`,
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendQuery: true,
    queryParameters: { parameters: qp },
    options: paginate ? PAGINATE : {},
  }, { credentials: CREDS.airtable, ...(executeOnce ? { executeOnce: true } : {}), ...RETRY });
}
function httpJson(name, pos, method, url, body, creds, options = {}, extra = {}) {
  return node(name, 'n8n-nodes-base.httpRequest', 4.2, pos, {
    method,
    url,
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: body,
    options,
  }, { credentials: creds, ...RETRY, ...extra });
}

// Airtable formulas (literal where possible; user input is stripped to safe characters)
const F_ACTIVE = `OR({Status}="Waiting",{Status}="Primed",{Status}="Invited",{Status}="Warm",{Status}="Tour Requested",AND({Status}="Signed Up",IS_AFTER({Response At},DATEADD(NOW(),-60,"days"))))`;
const tokenFormula = (src) =>
  `={{ '{Invite Token}="' + (String(($('Config').first().json.${src} || {}).t || '').replace(/[^A-Za-z0-9]/g, '') || 'NO_TOKEN') + '"' }}`;
const TOKEN_REC = `(($('Find Entry by Token (commit)').first().json.records || [])[0] || { fields: {} }).fields`;
const safe = (expr) => `String(${expr} || '').replace(/["\\\\]/g, '')`;

// ── Layout ──────────────────────────────────────────────────────
const X = { trig: -260, ack: -20, route: 260, config: 520, sw: 780, l1: 1060, l2: 1300, l3: 1540, l4: 1780, l5: 2020 };
const Y = { intake: -300, hourly: 40, manual: 200, glofox: 360, view: 560, commit: 760, sendnow: 1120, report: 1500 };
const EX = { respond: 2300, unpack: 2540, queue: 2780, gen: 3020, apply: 3260, chunkUpd: 3500, update: 3740, chunkLog: 3980, log: 4220, build: 4460, send: 4700 };
const EXY = 760;

export function buildMain() {
  const nodes = [
    // Notes
    sticky('Note: Overview', [-320, -940], 1240, 400,
      `## Akari Sauna · Waitlist Automation v1\nBuilt from *Waitlist Automation_1.0* (Eraser) + 24 Sep client clarifications.\n\n**Before activating:** edit the **Config** node, attach the two Header Auth credentials (Airtable PAT, SendGrid key) to every HTTP node, and keep \`sandboxMode: true\` until testing is signed off.\n\n**Lanes:** 1 Intake (Typeform) · 2 Engine (hourly: timeouts, invites, heads-ups) · 3 Candidate response (GET view → POST commit) · 4 Send Now (Airtable button) · 5 Daily report · Executor (writes Airtable, sends email, logs).\n\nEvery trigger is tagged with a **route**, passes through **Config**, and is routed by the **Route** switch.`, 4),
    sticky('Note: Intake', [1020, -500], 1640, 420, '### 1 · Intake\nTypeform webhook → one Airtable row per location × membership chosen. Skips queues the person is already on. Typeform only gets its 200 once rows are saved — a failure shows as a failed delivery in Typeform and triggers the error alert, instead of being silently lost.', 7),
    sticky('Note: Engine', [1020, -60], 1640, 280, '### 2 · Engine (hourly)\nExpires 24h holds (1st miss → Warm, 2nd → No Reply) around the clock. From 08:00–20:00 it fills each queue\'s gap (Minimum − Active − pending signups − open holds) and sends the next ~10 an early heads-up.', 7),
    sticky('Note: Responses', [1020, 360], 1640, 540, '### 3 · Candidate response\nEmail buttons open a **confirmation page** (GET). Only the button on that page (POST) changes anything, so email link scanners can\'t accept or decline for someone.\nYes → Signed Up + signup link · Tour → spot held, team alerted · Not now / No → buckets · late reply → Warm.', 7),
    sticky('Note: Send Now', [1020, 940], 1640, 400, '### 4 · Send Now (staff override)\nAirtable button → invite this person now, whatever their position or the queue count. The button URL carries the record ID and the secret key from Config.', 7),
    sticky('Note: Report', [1020, 1380], 1640, 280, '### 5 · Daily report (19:00)\nInvited · signed up · not now · no longer interested (with reasons), conversion by location, queue snapshot, items needing attention.', 7),
    sticky('Note: Executor', [2740, 560], 2200, 360, '### Executor\nCarries out every planned action in a safe order: **0)** swap in secure random response tokens → **1)** update Waitlist rows → **2)** write Activity Log → **3)** send emails. If an Airtable write fails, no email goes out. Writes go 10 rows per request, ≥500ms apart, to stay under Airtable\'s 5 requests/second limit.', 6),

    // Triggers
    webhook('Typeform: New Submission', [X.trig, Y.intake], 'POST', 'akari-waitlist/intake', 'responseNode'),
    cron('Every Hour', [X.trig, Y.hourly], '0 * * * *'),
    node('Run Engine Now (manual)', 'n8n-nodes-base.manualTrigger', 1, [X.trig, Y.manual], {}),
    webhook('Glofox: End Date Entered (pending)', [X.trig, Y.glofox], 'POST', 'akari-waitlist/glofox-end-date', 'responseNode', { disabled: true }),
    webhook('Candidate Opens Link', [X.trig, Y.view], 'GET', 'akari-waitlist/respond', 'responseNode'),
    webhook('Candidate Confirms', [X.trig, Y.commit], 'POST', 'akari-waitlist/respond-confirm', 'responseNode'),
    webhook('Airtable: Send Now Button', [X.trig, Y.sendnow], 'GET', 'akari-waitlist/send-now', 'responseNode'),
    cron('Daily Report 7pm', [X.trig, Y.report], '0 19 * * *'),

    // n8n requires every webhook here to answer via a Respond node (a Respond node sits downstream of the shared router).
    acknowledge('Acknowledge Glofox', [X.ack, Y.glofox], { disabled: true }),

    // Routing
    route('Route: Intake', [X.route, Y.intake], 'intake'),
    route('Route: Engine', [X.route, Y.manual], 'engine'),
    route('Route: Response View', [X.route, Y.view], 'view'),
    route('Route: Response Commit', [X.route, Y.commit], 'commit'),
    route('Route: Send Now', [X.route, Y.sendnow], 'sendnow'),
    route('Route: Report', [X.route, Y.report], 'report'),
    code('Config', [X.config, Y.view], 'config'),
    node('Route', 'n8n-nodes-base.switch', 3.2, [X.sw, Y.view], {
      rules: {
        values: [['intake', 'Intake'], ['engine', 'Engine'], ['view', 'Response View'], ['commit', 'Response Commit'], ['sendnow', 'Send Now'], ['report', 'Report']].map(([v, label]) => ({
          conditions: cond(`route:${v}`, '={{ $json.route }}', { type: 'string', operation: 'equals' }, v),
          renameOutput: true,
          outputKey: label,
        })),
      },
      options: {},
    }),

    // 1 · Intake
    code('Parse Typeform', [X.l1, Y.intake], 'parse-typeform'),
    airtableGet('Find Existing Entries', [X.l2, Y.intake], 'waitlist',
      `={{ 'LOWER({Email})="' + ${safe(`$('Parse Typeform').first().json.email`)} + '"' }}`, { paginate: false }),
    code('Build New Entries', [X.l3, Y.intake], 'build-new-entries'),
    ifTrue('Anything New?', [X.l4, Y.intake], '($json.records || []).length > 0'),
    acknowledge('Acknowledge Duplicate', [X.l5, Y.intake + 140]),
    httpJson('Create Waitlist Entries', [X.l5, Y.intake - 40], 'POST', `={{ ${CFG('urls.waitlist')} }}`, '={{ JSON.stringify($json) }}', CREDS.airtable, AIRTABLE_PACE),
    httpJson('Log: Joined', [X.l5 + 240, Y.intake - 40], 'POST', `={{ ${CFG('urls.log')} }}`,
      `={{ JSON.stringify({ typecast: true, records: ($json.records || []).map(r => ({ fields: { Summary: 'Joined · ' + r.fields.Email, Timestamp: new Date().toISOString(), Event: 'Joined', Email: r.fields.Email, Name: r.fields.Name, Location: r.fields.Location, Membership: r.fields.Membership, Source: 'Typeform', 'Entry ID': r.id } })) }) }}`,
      CREDS.airtable, AIRTABLE_PACE),

    // Typeform only gets its 200 once rows are saved; any failure returns an error to Typeform (and fires the error alert).
    acknowledge('Acknowledge Typeform', [X.l5 + 480, Y.intake - 40]),

    // 2 · Engine
    airtableGet('Get Capacity', [X.l1, Y.hourly], 'capacity', '{Enabled}'),
    airtableGet('Get Active Entries', [X.l2, Y.hourly], 'waitlist', F_ACTIVE, { executeOnce: true }),
    code('Plan Engine Actions', [X.l3, Y.hourly], 'plan-engine-actions', { executeOnce: true }),

    // 3 · Candidate response
    airtableGet('Find Entry by Token (view)', [X.l1, Y.view], 'waitlist', tokenFormula('query'), { paginate: false }),
    code('Render Confirm Page', [X.l2, Y.view], 'render-confirm-page'),
    airtableGet('Find Entry by Token (commit)', [X.l1, Y.commit], 'waitlist', tokenFormula('body'), { paginate: false }),
    airtableGet('Find Entries by Email', [X.l2, Y.commit], 'waitlist',
      `={{ 'LOWER({Email})="' + ${safe(`${TOKEN_REC}.Email`)}.toLowerCase() + '"' }}`, { executeOnce: true, paginate: false }),
    airtableGet('Find Queue Settings', [X.l3, Y.commit], 'capacity',
      `={{ 'AND({Location}="' + ${safe(`${TOKEN_REC}.Location`)} + '",{Membership}="' + ${safe(`${TOKEN_REC}.Membership`)} + '")' }}`, { executeOnce: true, paginate: false }),
    code('Decide Response', [X.l4, Y.commit], 'decide-response', { executeOnce: true }),

    // 4 · Send Now
    ifTrue('Send Now Authorised?', [X.l1, Y.sendnow],
      `$json.cfg.sendNowSecret !== 'CHANGE-ME' && ($json.query || {}).k === $json.cfg.sendNowSecret && /^rec[A-Za-z0-9]{14}$/.test(($json.query || {}).id || '')`),
    node('Get Entry for Send Now', 'n8n-nodes-base.httpRequest', 4.2, [X.l2, Y.sendnow - 40], {
      url: `={{ ${CFG('urls.waitlist')} }}/{{ $('Config').first().json.query.id }}`,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: { response: { response: { neverError: true } } },
    }, { credentials: CREDS.airtable, ...RETRY }),
    code('Build Send Now', [X.l3, Y.sendnow - 40], 'build-send-now'),
    code('Forbidden Page', [X.l2, Y.sendnow + 120], 'forbidden-page'),

    // Shared response + executor
    node('Respond with Page', 'n8n-nodes-base.respondToWebhook', 1.1, [EX.respond, EXY], {
      respondWith: 'text',
      responseBody: '={{ $json.page }}',
      options: {
        responseCode: '={{ $json.status || 200 }}',
        responseHeaders: { entries: [
          { name: 'Content-Type', value: 'text/html; charset=utf-8' },
          { name: 'Cache-Control', value: 'no-store' },
          { name: 'X-Robots-Tag', value: 'noindex' },
        ] },
      },
    }),
    code('Unpack Actions', [EX.unpack, EXY], 'unpack-actions'),
    // 1s pause separates the lookups above from the writes below (Airtable rate limit).
    node('Action Queue', 'n8n-nodes-base.wait', 1.1, [EX.queue, EXY], { amount: 1, unit: 'seconds' }, { webhookId: uid('Action Queue:webhook') }),
    node('Generate Tokens', 'n8n-nodes-base.crypto', 1, [EX.gen, EXY], { action: 'generate', dataPropertyName: 'token', encodingType: 'hex', stringLength: 48 }),
    code('Apply Tokens', [EX.apply, EXY], 'apply-tokens'),
    code('Chunk Waitlist Updates', [EX.chunkUpd, EXY], 'chunk-waitlist-updates'),
    httpJson('Update Waitlist Rows', [EX.update, EXY], 'PATCH', `={{ ${CFG('urls.waitlist')} }}`, '={{ JSON.stringify($json) }}', CREDS.airtable, AIRTABLE_PACE),
    code('Chunk Log Rows', [EX.chunkLog, EXY], 'chunk-log-rows'),
    httpJson('Write Activity Log', [EX.log, EXY], 'POST', `={{ ${CFG('urls.log')} }}`, '={{ JSON.stringify($json) }}', CREDS.airtable, AIRTABLE_PACE),
    code('Build Emails', [EX.build, EXY], 'build-emails'),
    httpJson('Send Email (SendGrid)', [EX.send, EXY], 'POST', `={{ ${CFG('sendgridApi')} }}`, '={{ JSON.stringify($json.payload) }}',
      CREDS.sendgrid, { ...SENDGRID_PACE, response: { response: { responseFormat: 'text' } } }),

    // 5 · Report
    airtableGet('Get Log (30 days)', [X.l1, Y.report], 'log', `IS_AFTER({Timestamp},DATEADD(NOW(),-30,"days"))`),
    airtableGet('Get Queue Snapshot', [X.l2, Y.report], 'waitlist', F_ACTIVE, { executeOnce: true }),
    airtableGet('Get Capacity (report)', [X.l3, Y.report], 'capacity', '', { executeOnce: true }),
    code('Build Daily Report', [X.l4, Y.report], 'build-daily-report', { executeOnce: true }),
    httpJson('Send Report (SendGrid)', [X.l5, Y.report], 'POST', `={{ ${CFG('sendgridApi')} }}`, '={{ JSON.stringify($json.payload) }}',
      CREDS.sendgrid, { response: { response: { responseFormat: 'text' } } }),
  ];

  const to = (...names) => names.map((n) => ({ node: n, type: 'main', index: 0 }));
  const connections = {
    'Typeform: New Submission': { main: [to('Route: Intake')] },
    'Every Hour': { main: [to('Route: Engine')] },
    'Run Engine Now (manual)': { main: [to('Route: Engine')] },
    'Glofox: End Date Entered (pending)': { main: [to('Acknowledge Glofox')] },
    'Acknowledge Glofox': { main: [to('Route: Engine')] },
    'Candidate Opens Link': { main: [to('Route: Response View')] },
    'Candidate Confirms': { main: [to('Route: Response Commit')] },
    'Airtable: Send Now Button': { main: [to('Route: Send Now')] },
    'Daily Report 7pm': { main: [to('Route: Report')] },
    'Route: Intake': { main: [to('Config')] },
    'Route: Engine': { main: [to('Config')] },
    'Route: Response View': { main: [to('Config')] },
    'Route: Response Commit': { main: [to('Config')] },
    'Route: Send Now': { main: [to('Config')] },
    'Route: Report': { main: [to('Config')] },
    Config: { main: [to('Route')] },
    Route: {
      main: [
        to('Parse Typeform'),
        to('Get Capacity'),
        to('Find Entry by Token (view)'),
        to('Find Entry by Token (commit)'),
        to('Send Now Authorised?'),
        to('Get Log (30 days)'),
      ],
    },
    'Parse Typeform': { main: [to('Find Existing Entries')] },
    'Find Existing Entries': { main: [to('Build New Entries')] },
    'Build New Entries': { main: [to('Anything New?')] },
    'Anything New?': { main: [to('Create Waitlist Entries'), to('Acknowledge Duplicate')] },
    'Create Waitlist Entries': { main: [to('Log: Joined')] },
    'Log: Joined': { main: [to('Acknowledge Typeform')] },
    'Get Capacity': { main: [to('Get Active Entries')] },
    'Get Active Entries': { main: [to('Plan Engine Actions')] },
    'Plan Engine Actions': { main: [to('Action Queue')] },
    'Find Entry by Token (view)': { main: [to('Render Confirm Page')] },
    'Render Confirm Page': { main: [to('Respond with Page')] },
    'Find Entry by Token (commit)': { main: [to('Find Entries by Email')] },
    'Find Entries by Email': { main: [to('Find Queue Settings')] },
    'Find Queue Settings': { main: [to('Decide Response')] },
    'Decide Response': { main: [to('Respond with Page')] },
    'Send Now Authorised?': { main: [to('Get Entry for Send Now'), to('Forbidden Page')] },
    'Get Entry for Send Now': { main: [to('Build Send Now')] },
    'Build Send Now': { main: [to('Respond with Page')] },
    'Forbidden Page': { main: [to('Respond with Page')] },
    'Respond with Page': { main: [to('Unpack Actions')] },
    'Unpack Actions': { main: [to('Action Queue')] },
    'Action Queue': { main: [to('Generate Tokens')] },
    'Generate Tokens': { main: [to('Apply Tokens')] },
    'Apply Tokens': { main: [to('Chunk Waitlist Updates')] },
    'Chunk Waitlist Updates': { main: [to('Update Waitlist Rows')] },
    'Update Waitlist Rows': { main: [to('Chunk Log Rows')] },
    'Chunk Log Rows': { main: [to('Write Activity Log')] },
    'Write Activity Log': { main: [to('Build Emails')] },
    'Build Emails': { main: [to('Send Email (SendGrid)')] },
    'Get Log (30 days)': { main: [to('Get Queue Snapshot')] },
    'Get Queue Snapshot': { main: [to('Get Capacity (report)')] },
    'Get Capacity (report)': { main: [to('Build Daily Report')] },
    'Build Daily Report': { main: [to('Send Report (SendGrid)')] },
  };

  return {
    name: 'Akari Waitlist Automation v1',
    nodes,
    connections,
    pinData: {},
    active: false,
    settings: {
      executionOrder: 'v1',
      timezone: 'America/New_York',
      saveDataErrorExecution: 'all',
      saveDataSuccessExecution: 'all',
      saveManualExecutions: true,
      callerPolicy: 'workflowsFromSameOwner',
    },
    meta: { templateCredsSetupCompleted: false },
    tags: [],
  };
}

export function buildErrorWorkflow() {
  return {
    name: 'Akari Waitlist · Error Alert',
    nodes: [
      sticky('Note: Error Alert', [-60, -220], 760, 180, '### Error alert\nSet this workflow as the **Error workflow** in the main workflow\'s settings. Edit the recipients in **Build Alert Email**.', 7),
      node('On Workflow Error', 'n8n-nodes-base.errorTrigger', 1, [0, 0], {}),
      code('Build Alert Email', [240, 0], 'error-alert'),
      httpJson('Send Alert (SendGrid)', [480, 0], 'POST', 'https://api.sendgrid.com/v3/mail/send', '={{ JSON.stringify($json.payload) }}',
        CREDS.sendgrid, { response: { response: { responseFormat: 'text' } } }),
    ],
    connections: {
      'On Workflow Error': { main: [[{ node: 'Build Alert Email', type: 'main', index: 0 }]] },
      'Build Alert Email': { main: [[{ node: 'Send Alert (SendGrid)', type: 'main', index: 0 }]] },
    },
    pinData: {},
    active: false,
    settings: { executionOrder: 'v1', timezone: 'America/New_York' },
    meta: { templateCredsSetupCompleted: false },
    tags: [],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const main = buildMain();
  const err = buildErrorWorkflow();
  writeFileSync(join(ROOT, 'n8n/akari-waitlist-automation.json'), `${JSON.stringify(main, null, 2)}\n`);
  writeFileSync(join(ROOT, 'n8n/akari-waitlist-error-alert.json'), `${JSON.stringify(err, null, 2)}\n`);
  console.log(`main: ${main.nodes.length} nodes · error: ${err.nodes.length} nodes`);
}
