// Assembles the importable n8n workflow JSON from src/.
// Usage: node build/build-workflow.mjs   → writes n8n/*.json
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

export function loadCode(name) {
  return expandIncludes(read(`src/nodes/${name}.js`));
}

export function expandIncludes(src) {
  return src.replace(/^\/\/ @include-json (\w+)\s*$/gm, (_, f) => {
    const upper = f.toUpperCase();
    return `// ── ${f}.json (edit the file, then npm run build) ──\nconst ${upper} = ${JSON.stringify(JSON.parse(read(`${f}.json`)))};`;
  }).replace(/^\/\/ @include (\w+)\s*$/gm, (_, h) => {
    const body = read(`src/helpers/${h}.js`).trimEnd();
    return `// ── shared helpers: ${h} ─────────────────────────────\n${body}\n// ── end ${h} ─────────────────────────────────────────`;
  });
}

const uid = (seed) => {
  const h = createHash('sha1').update(`inbox-intelligence:${seed}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

export const CREDS = {
  gmail: { gmailOAuth2: { id: 'iqGmailOAuth', name: 'Gmail (Inbox Intelligence)' } },
  calendar: { googleCalendarOAuth2Api: { id: 'iqCalendarOAuth', name: 'Google Calendar (Inbox Intelligence)' } },
  typesafe: { httpHeaderAuth: { id: 'iqTypeSafeKey', name: 'TypeSafe API Key' } },
};

const node = (name, type, typeVersion, position, parameters, extra = {}) => ({
  parameters, id: uid(name), name, type, typeVersion, position, ...extra,
});
const code = (name, pos, file, extra = {}) => node(name, 'n8n-nodes-base.code', 2, pos, { jsCode: loadCode(file) }, extra);
const route = (name, pos, value) =>
  node(name, 'n8n-nodes-base.set', 3.4, pos, {
    assignments: { assignments: [{ id: uid(`${name}:route`), name: 'route', value, type: 'string' }] },
    includeOtherFields: true,
    options: {},
  });
const cron = (name, pos, expression) =>
  node(name, 'n8n-nodes-base.scheduleTrigger', 1.2, pos, { rule: { interval: [{ field: 'cronExpression', expression }] } });
const sticky = (name, pos, width, height, content, color = 7) =>
  node(name, 'n8n-nodes-base.stickyNote', 1, pos, { content, height, width, color });
const ifTrue = (name, pos, expr) =>
  node(name, 'n8n-nodes-base.if', 2.2, pos, {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{ id: uid(`${name}:cond`), leftValue: `={{ ${expr} }}`, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
      combinator: 'and',
    },
    options: {},
  });

const CFG = (p) => `$('Config').first().json.cfg.${p}`;
const RETRY = { retryOnFail: true, maxTries: 3, waitBetweenTries: 3000 };
// Gmail: 250 quota units/user/second; threads.get and threads.modify cost 5–10 units each.
const GMAIL_PACE = { batching: { batch: { batchSize: 10, batchInterval: 1000 } } };
const TYPESAFE_PACE = { batching: { batch: { batchSize: 5, batchInterval: 1000 } }, timeout: 30000 };

const google = (kind) => ({
  authentication: 'predefinedCredentialType',
  nodeCredentialType: kind === 'gmail' ? 'gmailOAuth2' : 'googleCalendarOAuth2Api',
});
function googleGet(name, pos, kind, url, query, options = {}, extra = {}) {
  return node(name, 'n8n-nodes-base.httpRequest', 4.2, pos, {
    url,
    ...google(kind),
    sendQuery: true,
    queryParameters: { parameters: query },
    options,
  }, { credentials: CREDS[kind], ...RETRY, ...extra });
}
function postJson(name, pos, url, body, auth, creds, options = {}, extra = {}) {
  return node(name, 'n8n-nodes-base.httpRequest', 4.2, pos, {
    method: 'POST',
    url,
    ...auth,
    sendBody: true,
    specifyBody: 'json',
    jsonBody: body,
    options,
  }, { credentials: creds, ...RETRY, ...extra });
}
const TYPESAFE_AUTH = { authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth' };

// ── Layout ──────────────────────────────────────────────────────
const X = { trig: -260, route: 0, config: 240, run: 480, list: 720, split: 960, has: 1200, get: 1440, prep: 1680, any: 1920, judge: 2160, combine: 2400, next: 2640 };
const Y = { sort: 0, report: 400, main: 200, labels: 0, rep: 460 };
const LX = [2880, 3120, 3360, 3600, 3840];

export function buildMain() {
  const nodes = [
    sticky('Note: Overview', [-320, -560], 1500, 440,
      `## Inbox Intelligence v1 · sort + weekly report\n**Sort** (weekdays, every 2h 07:00–19:00): new inbox threads are judged and labelled under **IQ/** — *1-Action* (you owe a reply), *2-Waiting On*, *3-My Commitments*, *Risk*, an area label (Client, New Business, …) and *Reading / Low Value* for bulk mail.\n**Report** (Mondays 06:30): re-reads the last 7 days of mail + 7 days back/ahead of calendar and emails you a one-page brief.\n\n**Division of labour:** code gathers facts (who wrote last, known clients, date phrases, attendee ↔ thread joins) and owns policy (thresholds, weights, labels). **TypeSafe** answers only the judgment calls, as typed probabilities. Nothing in the report is generated prose: every line is a real thread or event.\n\n**Before activating:** edit **Config**, attach the three credentials, run **Run Report Now** once with \`applyLabels: false\`.`, 4),
    sticky('Note: Judge', [1380, -300], 1260, 240, '### Judge threads\nOne TypeSafe request per thread with all questions together (category, you-owe, waiting-on, your-commitment, risk, urgency, value, deadline pick). Bulk mail gets a cheaper 2-question set. A failed request does not stop the run: that thread is labelled *IQ/Review* and retried next time.', 7),
    sticky('Note: Labels', [2840, -300], 1240, 240, '### Apply labels\nCreates any missing IQ labels (409 = already exists, ignored), then one modify call per thread: adds the labels it earns and removes IQ labels it no longer earns. `applyLabels: false` skips this lane entirely.', 7),
    sticky('Note: Report', [2840, 660], 1240, 240, '### Weekly report (report runs only)\nCalendar ±7 days → meetings with people are judged for type and prep need, joined to open threads by attendee email → one-page brief sent from your Gmail.', 7),

    // Triggers
    cron('Every 2h (weekdays)', [X.trig, Y.sort], '0 7-19/2 * * 1-5'),
    cron('Monday 06:30', [X.trig, Y.report], '30 6 * * 1'),
    node('Run Report Now (manual)', 'n8n-nodes-base.manualTrigger', 1, [X.trig, Y.report + 180], {}),
    route('Route: Sort', [X.route, Y.sort], 'sort'),
    route('Route: Report', [X.route, Y.report], 'report'),
    code('Config', [X.config, Y.main], 'config'),
    ifTrue('Should Run?', [X.run, Y.main], `$json.route === 'report' || $json.cfg.sortEnabled`),

    // Threads
    googleGet('Gmail: List Threads', [X.list, Y.main], 'gmail', `={{ ${CFG('gmailApi')} }}/threads`, [
      { name: 'q', value: `={{ $json.route === 'report' ? $json.cfg.reportQuery : $json.cfg.sortQuery }}` },
      { name: 'maxResults', value: '100' },
    ], {
      pagination: {
        pagination: {
          paginationMode: 'updateAParameterInEachRequest',
          parameters: { parameters: [{ type: 'qs', name: 'pageToken', value: '={{ $response.body.nextPageToken }}' }] },
          paginationCompleteWhen: 'other',
          completeExpression: '={{ !$response.body.nextPageToken }}',
          limitPagesFetched: true,
          maxRequests: 5, // 500 threads; maxThreadsPerRun caps what is judged
          requestInterval: 200,
        },
      },
    }),
    code('Split Threads', [X.split, Y.main], 'split-threads'),
    ifTrue('Has Threads?', [X.has, Y.main], '!$json.none'),
    googleGet('Gmail: Get Thread', [X.get, Y.main], 'gmail', `={{ ${CFG('gmailApi')} }}/threads/{{ $json.threadId }}`, [{ name: 'format', value: 'full' }], GMAIL_PACE),
    code('Prepare Thread State', [X.prep, Y.main], 'prepare-thread'),
    ifTrue('Anything to Judge?', [X.any, Y.main], '!$json.none'),
    postJson('TypeSafe: Judge Thread', [X.judge, Y.main], `={{ ${CFG('typesafeApi')} }}/v1/systemone`, '={{ JSON.stringify($json.request) }}',
      TYPESAFE_AUTH, CREDS.typesafe, TYPESAFE_PACE, { onError: 'continueRegularOutput' }),
    code('Combine Judgments', [X.combine, Y.main], 'combine-judgments'),

    // Labels
    code('Label Names', [LX[0], Y.labels], 'label-names', { executeOnce: true }),
    postJson('Gmail: Create Label', [LX[1], Y.labels], `={{ ${CFG('gmailApi')} }}/labels`,
      `={{ JSON.stringify({ name: $json.name, labelListVisibility: 'labelShow', messageListVisibility: 'show' }) }}`,
      google('gmail'), CREDS.gmail, { response: { response: { neverError: true } } }),
    googleGet('Gmail: List Labels', [LX[2], Y.labels], 'gmail', `={{ ${CFG('gmailApi')} }}/labels`, [], {}, { executeOnce: true }),
    code('Plan Thread Labels', [LX[3], Y.labels], 'plan-thread-labels', { executeOnce: true }),
    postJson('Gmail: Label Thread', [LX[4], Y.labels], `={{ ${CFG('gmailApi')} }}/threads/{{ $json.threadId }}/modify`,
      '={{ JSON.stringify($json.body) }}', google('gmail'), CREDS.gmail, GMAIL_PACE),

    // Report
    ifTrue('Report Run?', [X.next, Y.rep], `$('Config').first().json.route === 'report'`),
    googleGet('Calendar: Get Events', [LX[0], Y.rep], 'calendar', `={{ ${CFG('calendarApi')} }}/events`, [
      { name: 'timeMin', value: `={{ new Date(Date.now() - ${CFG('lookBackDays')} * 86400000).toISOString() }}` },
      { name: 'timeMax', value: `={{ new Date(Date.now() + ${CFG('lookAheadDays')} * 86400000).toISOString() }}` },
      { name: 'singleEvents', value: 'true' },
      { name: 'orderBy', value: 'startTime' },
      { name: 'maxResults', value: '250' },
    ], {}, { executeOnce: true }),
    code('Prepare Event Requests', [LX[1], Y.rep], 'prepare-events', { executeOnce: true }),
    ifTrue('Judge Events?', [LX[2], Y.rep], '!!$json.request'),
    postJson('TypeSafe: Judge Events', [LX[3], Y.rep - 100], `={{ ${CFG('typesafeApi')} }}/v1/systemone`, '={{ JSON.stringify($json.request) }}',
      TYPESAFE_AUTH, CREDS.typesafe, TYPESAFE_PACE, { onError: 'continueRegularOutput' }),
    code('Build Report', [LX[4], Y.rep], 'build-report', { executeOnce: true }),
    postJson('Gmail: Send Report', [LX[4] + 240, Y.rep], `={{ ${CFG('gmailApi')} }}/messages/send`, '={{ JSON.stringify({ raw: $json.raw }) }}',
      google('gmail'), CREDS.gmail),
  ];

  const to = (...names) => names.map((n) => ({ node: n, type: 'main', index: 0 }));
  const connections = {
    'Every 2h (weekdays)': { main: [to('Route: Sort')] },
    'Monday 06:30': { main: [to('Route: Report')] },
    'Run Report Now (manual)': { main: [to('Route: Report')] },
    'Route: Sort': { main: [to('Config')] },
    'Route: Report': { main: [to('Config')] },
    Config: { main: [to('Should Run?')] },
    'Should Run?': { main: [to('Gmail: List Threads'), []] },
    'Gmail: List Threads': { main: [to('Split Threads')] },
    'Split Threads': { main: [to('Has Threads?')] },
    'Has Threads?': { main: [to('Gmail: Get Thread'), to('Report Run?')] },
    'Gmail: Get Thread': { main: [to('Prepare Thread State')] },
    'Prepare Thread State': { main: [to('Anything to Judge?')] },
    'Anything to Judge?': { main: [to('TypeSafe: Judge Thread'), to('Report Run?')] },
    'TypeSafe: Judge Thread': { main: [to('Combine Judgments')] },
    'Combine Judgments': { main: [to('Label Names', 'Report Run?')] },
    'Label Names': { main: [to('Gmail: Create Label')] },
    'Gmail: Create Label': { main: [to('Gmail: List Labels')] },
    'Gmail: List Labels': { main: [to('Plan Thread Labels')] },
    'Plan Thread Labels': { main: [to('Gmail: Label Thread')] },
    'Report Run?': { main: [to('Calendar: Get Events'), []] },
    'Calendar: Get Events': { main: [to('Prepare Event Requests')] },
    'Prepare Event Requests': { main: [to('Judge Events?')] },
    'Judge Events?': { main: [to('TypeSafe: Judge Events'), to('Build Report')] },
    'TypeSafe: Judge Events': { main: [to('Build Report')] },
    'Build Report': { main: [to('Gmail: Send Report')] },
  };

  return {
    name: 'Inbox Intelligence v1',
    nodes,
    connections,
    pinData: {},
    active: false,
    settings: {
      executionOrder: 'v1',
      timezone: 'Europe/London',
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
    name: 'Inbox Intelligence · Error Alert',
    nodes: [
      sticky('Note: Error Alert', [-60, -220], 760, 180, '### Error alert\nSet this workflow as the **Error workflow** in the main workflow\'s settings. Edit the recipient in **Build Alert Email**.', 7),
      node('On Workflow Error', 'n8n-nodes-base.errorTrigger', 1, [0, 0], {}),
      code('Build Alert Email', [240, 0], 'error-alert'),
      postJson('Send Alert (Gmail)', [480, 0], 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', '={{ JSON.stringify({ raw: $json.raw }) }}',
        google('gmail'), CREDS.gmail),
    ],
    connections: {
      'On Workflow Error': { main: [[{ node: 'Build Alert Email', type: 'main', index: 0 }]] },
      'Build Alert Email': { main: [[{ node: 'Send Alert (Gmail)', type: 'main', index: 0 }]] },
    },
    pinData: {},
    active: false,
    settings: { executionOrder: 'v1', timezone: 'Europe/London' },
    meta: { templateCredsSetupCompleted: false },
    tags: [],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const main = buildMain();
  const err = buildErrorWorkflow();
  writeFileSync(join(ROOT, 'n8n/inbox-intelligence.json'), `${JSON.stringify(main, null, 2)}\n`);
  writeFileSync(join(ROOT, 'n8n/inbox-intelligence-error-alert.json'), `${JSON.stringify(err, null, 2)}\n`);
  console.log(`main: ${main.nodes.length} nodes · error: ${err.nodes.length} nodes`);
}
