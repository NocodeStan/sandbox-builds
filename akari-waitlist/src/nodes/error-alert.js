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
const html = `<p><strong>The Akari waitlist automation hit an error.</strong></p>
<table cellpadding="4">${lines.map(([k, v]) => `<tr><td style="color:#666">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
<p>Open the execution in n8n to see the input data, fix the cause, and retry it if needed.</p>`;
const text = lines.map(([k, v]) => `${k}: ${v}`).join('\n');

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
