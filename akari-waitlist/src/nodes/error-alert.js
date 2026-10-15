// ── Edit these to match the main workflow's Config node ──
const CFG = {
  fromEmail: 'waitlist@YOUR-DOMAIN.com',
  fromName: 'Akari Waitlist Automation',
  adminEmails: ['team@YOUR-DOMAIN.com'],
  sandboxMode: false, // keep false so failures actually reach you
};

const d = $input.first().json;
const ex = d.execution || {};
const err = ex.error || {};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lines = [
  ['Workflow', d.workflow?.name || '—'],
  ['Failed node', ex.lastNodeExecuted || err.node?.name || '—'],
  ['Error', err.message || '—'],
  ['Mode', ex.mode || '—'],
  ['Execution', ex.url || ex.id || '—'],
];
// Airtable's 30s rate-limit lockout is temporary: say so, so a one-off doesn't read as an outage.
const rateLimited = /too many requests|429|rate.?limit/i.test(`${err.message} ${err.description || ''}`);
const advice = rateLimited
  ? 'This was Airtable\'s temporary rate limit (several things happened at once). Nothing was half-saved: the hourly engine simply runs again next hour, and candidates were asked to try again. No action needed unless you see this repeatedly.'
  : 'Open the execution in n8n to see the input data, fix the cause, and retry it if needed.';
const html = `<p><strong>The Akari waitlist automation hit ${rateLimited ? 'a temporary Airtable rate limit' : 'an error'}.</strong></p>
<table cellpadding="4">${lines.map(([k, v]) => `<tr><td style="color:#666">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
<p>${esc(advice)}</p>`;
const text = [...lines.map(([k, v]) => `${k}: ${v}`), '', advice].join('\n');

return [{
  json: {
    payload: {
      personalizations: [{ to: CFG.adminEmails.map((email) => ({ email })) }],
      from: { email: CFG.fromEmail, name: CFG.fromName },
      subject: `[Waitlist automation] ${err.message ? err.message.slice(0, 80) : 'Execution failed'}`,
      content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }],
      mail_settings: { sandbox_mode: { enable: !!CFG.sandboxMode } },
    },
  },
}];
