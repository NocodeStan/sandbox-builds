const CFG = $('Config').first().json.cfg;
const NOW = new Date();
const ACTIVE_STATUSES = ['Waiting', 'Primed', 'Invited', 'Tour Requested', 'Warm', 'Not Right Now', 'No Reply'];
const HOLD_STATUSES = ['Invited', 'Tour Requested'];
const HOUR = 3600000;
const DAY = 86400000;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toDate = (v) => (v ? new Date(v) : null);
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || 'there';
const article = (word) => (/^[aeiou]/i.test(String(word || '')) ? 'an' : 'a');
// "Akari Williamsburg", but "Akari Yu" stays "Akari Yu" (the location's own name already says Akari).
const place = (loc) => (/^akari\b/i.test(String(loc || '').trim()) ? String(loc).trim() : `Akari ${String(loc || '').trim()}`);
const recordsOf = (nodeName) => $(nodeName).all().flatMap((i) => i.json.records || []);
const fmtTime = (d) =>
  new Date(d).toLocaleString('en-US', {
    timeZone: CFG.timezone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });

// When Active Members was last counted: a staff edit (Active Updated At) or the daily Glofox sync
// (Active Counted At), whichever is later. A sign-up after that count still holds a spot ("pending").
const countedAtOf = (f = {}) => [toDate(f['Active Updated At']), toDate(f['Active Counted At'])]
  .filter(Boolean).reduce((a, b) => (b > a ? b : a), new Date(0));
const isPendingSignup = (e, countedAt) => e.status === 'Signed Up' && !!e.responseAt && e.responseAt > countedAt;

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
    reason: f['Reason'] || '',
    tourAt: toDate(f['Tour At']),
    interestConfirmedAt: toDate(f['Interest Confirmed At']),
  };
}

// Cal.com booking page for this person's queue (blank if none is set), pre-filled with their name
// and email, and tagged with their row ID so the booking notification can be matched back to them.
// The queue's Capacity row (Tour Booking URL) wins; Config's tourBookingUrlByLocation is the fallback.
function tourBookingUrl(e, settings) {
  const base = String((settings && settings.fields && settings.fields['Tour Booking URL']) || (CFG.tourBookingUrlByLocation || {})[e.location] || '').trim();
  if (!base) return '';
  const params = [['name', e.name], ['email', e.email], ['metadata[entry]', e.id]]
    .filter(([, v]) => v)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${base}${base.includes('?') ? '&' : '?'}${params}`;
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
