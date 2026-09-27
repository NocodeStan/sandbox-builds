const CFG = $('Config').first().json.cfg;
const ROUTE = $('Config').first().json.route;
const NOW = new Date();
const HOUR = 3600000;
const DAY = 86400000;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lower = (s) => String(s || '').trim().toLowerCase();
const OWNER_EMAILS = CFG.ownerEmails.map(lower);
const isOwner = (email) => OWNER_EMAILS.includes(lower(email));

// "Jane Doe" <jane@acme.com>, jane@acme.com, "Doe, Jane" <jane@acme.com>
function parseAddressList(h) {
  const out = [];
  const re = /(?:"?([^"<,]*(?:,[^"<,]*)?)"?\s*)?<([^>]+)>|([^\s,<>"]+@[^\s,<>"]+)/g;
  let m;
  while ((m = re.exec(String(h || '')))) {
    const email = lower(m[2] || m[3]);
    const name = String(m[1] || '').replace(/^[\s,]+|[\s,]+$/g, '').trim();
    if (email.includes('@')) out.push({ name: name || email.split('@')[0], email });
  }
  return out;
}

const header = (msg, name) =>
  ((msg.payload || {}).headers || []).find((h) => lower(h.name) === lower(name))?.value || '';

function relationshipOf(email) {
  const e = lower(email);
  const domain = e.split('@')[1] || '';
  for (const [kind, list] of Object.entries(CFG.relationships || {})) {
    if ((list || []).some((x) => lower(x) === e || lower(x) === domain)) return kind;
  }
  return null;
}

// Calendar dates in the owner's timezone
const dayKey = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: CFG.timezone }); // YYYY-MM-DD
const fmtDay = (d) => new Date(d).toLocaleDateString('en-GB', { timeZone: CFG.timezone, weekday: 'short', day: 'numeric', month: 'short' });
const fmtLongDay = (d) => new Date(d).toLocaleDateString('en-GB', { timeZone: CFG.timezone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtTime = (d) => new Date(d).toLocaleTimeString('en-GB', { timeZone: CFG.timezone, hour: '2-digit', minute: '2-digit' });
const daysBetween = (a, b) => Math.round((Date.parse(`${dayKey(b)}T00:00:00Z`) - Date.parse(`${dayKey(a)}T00:00:00Z`)) / DAY);
const gmailLink = (threadId) => `https://mail.google.com/mail/u/${CFG.gmailAccountIndex}/#all/${threadId}`;
