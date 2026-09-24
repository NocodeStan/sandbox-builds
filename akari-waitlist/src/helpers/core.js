const CFG = $('Config').first().json.cfg;
const NOW = new Date();
const ACTIVE_STATUSES = ['Waiting', 'Primed', 'Invited', 'Tour Requested', 'Warm', 'Not Right Now', 'No Reply'];
const HOLD_STATUSES = ['Invited', 'Tour Requested'];
const HOUR = 3600000;
const DAY = 86400000;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toDate = (v) => (v ? new Date(v) : null);
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || 'there';
const recordsOf = (nodeName) => $(nodeName).all().flatMap((i) => i.json.records || []);
const fmtTime = (d) =>
  new Date(d).toLocaleString('en-US', {
    timeZone: CFG.timezone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });

// Real tokens come from the "Generate Tokens" (Crypto) node in the executor; Code nodes can't
// reliably reach secure randomness, so they emit this placeholder instead.
const TOKEN = '__TOKEN__';

function normEntry(r) {
  const f = r.fields || {};
  return {
    id: r.id,
    name: f['Name'] || '',
    email: String(f['Email'] || '').trim().toLowerCase(),
    phone: f['Phone'] || '',
    location: f['Location'] || '',
    membership: f['Membership'] || '',
    memberType: f['Member Type'] === 'Existing' ? 'Existing' : 'New',
    joinedAt: toDate(f['Joined At']) || toDate(r.createdTime) || NOW,
    manualRank: typeof f['Manual Rank'] === 'number' ? f['Manual Rank'] : null,
    status: f['Status'] || 'Waiting',
    token: f['Invite Token'] || '',
    invitedAt: toDate(f['Invited At']),
    expiresAt: toDate(f['Invite Expires At']),
    source: f['Invite Source'] || '',
    timeoutCount: Number(f['Timeout Count'] || 0),
    primedAt: toDate(f['Primed At']),
    responseAt: toDate(f['Response At']),
    tourNotes: f['Tour Notes'] || '',
  };
}

function logRow(e, event, extra = {}) {
  return {
    Summary: `${event} · ${e.email}`,
    Timestamp: NOW.toISOString(),
    Event: event,
    Email: e.email,
    Name: e.name,
    Location: e.location,
    Membership: e.membership,
    'Entry ID': e.id,
    ...extra,
  };
}
