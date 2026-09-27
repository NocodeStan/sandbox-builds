// ── Edit to match the main workflow's Config node ──
const CFG = {
  alertTo: ['you@YOUR-DOMAIN.com'],
};

const d = $input.first().json;
const ex = d.execution || {};
const err = ex.error || {};
const lines = [
  ['Workflow', d.workflow?.name || '—'],
  ['Failed node', ex.lastNodeExecuted || err.node?.name || '—'],
  ['Error', err.message || '—'],
  ['Mode', ex.mode || '—'],
  ['Execution', ex.url || ex.id || '—'],
];
const subject = `[Inbox intelligence] ${err.message ? err.message.slice(0, 80) : 'Execution failed'}`;
const body = `${lines.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nOpen the execution in n8n to see the input data, fix the cause, and retry it if needed.\n`;
const mime = [
  `To: ${CFG.alertTo.join(', ')}`,
  `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=UTF-8',
  '',
  body,
].join('\r\n');

return [{ json: { raw: Buffer.from(mime, 'utf8').toString('base64url') } }];
