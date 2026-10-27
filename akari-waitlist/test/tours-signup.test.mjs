import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseConfig, capacity, daysAgo, entry, hoursAgo, hoursFromNow, records, runNode } from './harness.mjs';

const TOKEN = 'a1b2c3d4'.repeat(6);
const CAL = { tourBookingUrlByLocation: { Williamsburg: 'https://cal.com/akari/williamsburg-tour', Greenpoint: '', 'Lower East Side': '' } };
const invited = (fields = {}) => entry({ Name: 'Ava Romero', Email: 'ava@example.com', Status: 'Invited', 'Invite Token': TOKEN, 'Invite Expires At': hoursFromNow(10), ...fields });

const view = (e, cfg = {}) => runNode('render-confirm-page', {
  nodes: { Config: [{ json: { cfg: baseConfig(cfg), query: { t: TOKEN, a: 'tour' } } }], 'Find Entry by Token (view)': records([e]) },
})[0].json;
const decide = (e, action, { cfg = {}, others = [], reason = '' } = {}) => runNode('decide-response', {
  nodes: {
    Config: [{ json: { cfg: baseConfig(cfg), body: { t: TOKEN, a: action, reason } } }],
    'Find Entry by Token (commit)': records([e]),
    'Find Entries by Email': records([e, ...others]),
    'Find Queue Settings': records([capacity()]),
  },
})[0].json;

// ── Tour first → Cal.com ─────────────────────────────────────
test('tour confirm page: with a Cal.com link there is no text box, just "Choose a tour time"; without one, the box stays', () => {
  const withCal = view(invited(), CAL);
  assert.match(withCal.page, /<button type="submit">Choose a tour time<\/button>/);
  assert.doesNotMatch(withCal.page, /<textarea/);
  const without = view(invited());
  assert.match(without.page, /<textarea/);
  assert.match(without.page, /Request a tour/);
});

test('Tour first with a Cal.com link → spot held, team alerted, candidate sent to their location\'s booking page pre-filled', () => {
  const e = invited();
  const r = decide(e, 'tour', { cfg: CAL });
  assert.equal(r.actions[0].fields.Status, 'Tour Requested');
  const expected = `https://cal.com/akari/williamsburg-tour?name=Ava%20Romero&email=ava%40example.com&metadata%5Bentry%5D=${e.id}`;
  assert.ok(r.page.includes(`url=${expected.replace(/&/g, '&amp;')}`), r.page);
  const alert = r.actions[0].email.text;
  assert.match(alert, /taken to our Cal\.com page to pick a tour time/);
  assert.match(alert, /held until 48 hours after the tour/);
  assert.match(alert, /Send Sign-up Link/);
  assert.doesNotMatch(alert, /reach out within 1 business day/);
});

test('Tour first again (already Tour Requested) → back to the booking page, nothing changes', () => {
  const r = decide(invited({ Status: 'Tour Requested' }), 'tour', { cfg: CAL });
  assert.deepEqual(r.actions, []);
  assert.match(r.page, /url=https:\/\/cal\.com\/akari\/williamsburg-tour/);
});

test('Tour first after the hold lapsed → Warm, but they can still book a tour', () => {
  const r = decide(invited({ 'Invite Expires At': hoursAgo(1) }), 'tour', { cfg: CAL });
  assert.equal(r.actions[0].fields.Status, 'Warm');
  assert.match(r.page, /href="https:\/\/cal\.com\/akari\/williamsburg-tour\?/);
});

test('Cal.com link is only used for its own location', () => {
  const r = decide(invited({ Location: 'Greenpoint' }), 'tour', { cfg: CAL });
  assert.doesNotMatch(r.page, /cal\.com/);
  assert.match(r.page, /we'll be in touch to arrange your tour/);
});

// ── Cal.com booking notifications ────────────────────────────
function booking(body, rows) {
  const read = runNode('read-tour-booking', { nodes: { Config: [{ json: { cfg: baseConfig(), body } }] } });
  const out = runNode('build-tour-booking', { nodes: { Config: [{ json: { cfg: baseConfig() } }], 'Read Cal.com Booking': read, 'Find Entry for Tour Booking': records(rows) } })[0].json;
  return { read: read[0].json, out };
}
const touring = (fields = {}) => entry({ Email: 'ava@example.com', Status: 'Tour Requested', 'Response At': hoursAgo(2), ...fields });

test('booking created → Tour At recorded on the row named in the booking link, logged as Tour Booked', () => {
  const e = touring();
  const start = hoursFromNow(30);
  const { read, out } = booking({ triggerEvent: 'BOOKING_CREATED', payload: { startTime: start, uid: 'bk1', metadata: { entry: e.id }, attendees: [{ email: 'Ava@Example.com' }] } }, [e]);
  assert.equal(read.formula, `OR(RECORD_ID()="${e.id}",AND(LOWER({Email})="ava@example.com",{Status}="Tour Requested"))`);
  assert.equal(out.actions[0].recordId, e.id);
  assert.equal(out.actions[0].fields['Tour At'], new Date(start).toISOString());
  assert.equal(out.actions[0].log.Event, 'Tour Booked');
  assert.match(out.actions[0].log.Detail, /Booked for .*Cal\.com bk1/);
});

test('booking without our tag (e.g. made from the public page) is matched by email to the row waiting for a tour', () => {
  const other = entry({ Email: 'ava@example.com', Status: 'Waiting', Membership: 'Daytime' });
  const e = touring();
  const { out } = booking({ triggerEvent: 'BOOKING_CREATED', payload: { startTime: hoursFromNow(5), attendees: [{ email: 'ava@example.com' }] } }, [other, e]);
  assert.equal(out.actions[0].recordId, e.id);
});

test('rescheduled → new time; cancelled → time cleared (spot stays held); ping or stranger → ignored', () => {
  const e = touring({ 'Tour At': hoursFromNow(3) });
  const moved = booking({ triggerEvent: 'BOOKING_RESCHEDULED', payload: { startTime: hoursFromNow(50), metadata: { entry: e.id } } }, [e]).out;
  assert.match(moved.actions[0].log.Detail, /^Moved to /);
  const cancelled = booking({ triggerEvent: 'BOOKING_CANCELLED', payload: { cancellationReason: 'Sick', metadata: { entry: e.id } } }, [e]).out;
  assert.deepEqual(cancelled.actions[0].fields, { 'Tour At': null });
  assert.equal(cancelled.actions[0].log.Event, 'Tour Cancelled');
  assert.equal(cancelled.actions[0].log.Reason, 'Sick');
  assert.deepEqual(booking({ triggerEvent: 'PING', payload: {} }, []).out.actions, []);
  assert.deepEqual(booking({ triggerEvent: 'BOOKING_CREATED', payload: { startTime: hoursFromNow(5), attendees: [{ email: 'x@y.com' }] } }, []).out.actions, []);
});

test('booking lookup can\'t be broken by a crafted email or tag', () => {
  const { read } = booking({ triggerEvent: 'BOOKING_CREATED', payload: { metadata: { entry: 'rec") ,TRUE()' }, attendees: [{ email: 'a"),TRUE(),("@x.com' }] } }, []);
  assert.doesNotMatch(read.formula, /"\)\s*,\s*TRUE/);
  assert.match(read.formula, /RECORD_ID\(\)="recTRUE"/);
});

// ── Engine: release a tour hold after the tour ───────────────
const plan = (caps, entries, cfg = {}) => runNode('plan-engine-actions', {
  nodes: { Config: [{ json: { cfg: baseConfig(cfg) } }], 'Get Capacity': records(caps), 'Get Active Entries': records(entries) },
}).map((i) => i.json);

test('tour hold released 48h after the tour if no sign-up link was sent → Not Right Now, and the freed spot goes to the next person', () => {
  const toured = touring({ 'Tour At': hoursAgo(49) });
  const next = entry({ 'Joined At': daysAgo(20) });
  const out = plan([capacity({ 'Minimum Members': 11, 'Active Members': 10 })], [toured, next]);
  const rel = out.find((a) => a.log.Event === 'Tour Released');
  assert.equal(rel.recordId, toured.id);
  assert.equal(rel.fields.Status, 'Not Right Now');
  assert.match(rel.fields.Reason, /no sign-up link sent within 48h/);
  assert.equal(rel.email, null);
  assert.deepEqual(out.filter((a) => a.log.Event === 'Invited').map((a) => a.recordId), [next.id]);
});

test('tour hold kept: tour less than 48h ago, no tour booked yet, or already Signed Up', () => {
  const cases = [touring({ 'Tour At': hoursAgo(47) }), touring(), entry({ Status: 'Signed Up', 'Tour At': hoursAgo(100), 'Response At': hoursAgo(90) })];
  const out = plan([capacity()], cases);
  assert.equal(out.filter((a) => a.log.Event === 'Tour Released').length, 0);
});

// ── Staff: Send Sign-up Link ─────────────────────────────────
function sendSignup(rec, { others = [], cap = capacity(), cfg = {} } = {}) {
  return runNode('build-send-signup', {
    nodes: {
      Config: [{ json: { cfg: baseConfig(cfg), query: { id: rec?.id } } }],
      'Get Entry for Send Sign-up Link': [{ json: rec || { error: { type: 'NOT_FOUND' } } }],
      'Find Entries by Email (sign-up link)': records(rec ? [rec, ...others] : []),
      'Find Queue Settings (sign-up link)': records(cap ? [cap] : []),
    },
  })[0].json;
}

test('Send Sign-up Link after a tour → Signed Up, Jack\'s confirmation email with the Glofox link, logged as staff-sent', () => {
  const e = touring({ Membership: 'Daytime', 'Invite Token': TOKEN, 'Tour At': hoursAgo(3) });
  const r = sendSignup(e, { cap: capacity({ Membership: 'Daytime', 'Signup URL': 'https://app.glofox.test/signup/wb-day' }) });
  assert.equal(r.status, 200);
  assert.match(r.page, /Sign-up link sent/);
  const a = r.actions[0];
  assert.equal(a.fields.Status, 'Signed Up');
  assert.ok(a.fields['Response At']);
  assert.equal(a.fields['Invite Token'], undefined, 'existing token kept so their older links still work');
  assert.equal(a.email.subject, 'Your Private Sign Up Link for Akari Williamsburg');
  assert.match(a.email.text, /https:\/\/app\.glofox\.test\/signup\/wb-day/);
  assert.equal(a.log.Event, 'Signed Up');
  assert.equal(a.log.Source, 'Admin');
  assert.match(a.log.Detail, /previous status: Tour Requested/);
});

test('Send Sign-up Link on Unlimited takes them off their other waitlists; lower tiers keep them, with a way off', () => {
  const e = touring({ 'Invite Token': TOKEN });
  const other = entry({ Email: 'ava@example.com', Membership: 'Daytime' });
  const r = sendSignup(e, { others: [other] });
  assert.equal(r.actions.find((a) => a.recordId === other.id).fields.Status, 'Removed');
  assert.match(r.actions[0].email.text, /automatically remove you from any other Akari waitlists/);
  const day = sendSignup(touring({ Membership: 'Daytime', 'Invite Token': TOKEN }), { others: [entry({ Email: 'ava@example.com' })], cap: capacity({ Membership: 'Daytime' }) });
  assert.equal(day.actions.length, 1);
  assert.ok(day.actions[0].email.html.includes(`respond?t=${TOKEN}&amp;a=leave`));
});

test('Send Sign-up Link on someone never invited mints a token (for the "leave other lists" link)', () => {
  const r = sendSignup(entry({ Email: 'w@example.com', Membership: 'Daytime' }), { others: [entry({ Email: 'w@example.com' })], cap: capacity({ Membership: 'Daytime' }) });
  assert.equal(r.actions[0].fields['Invite Token'], '__TOKEN__');
  assert.ok(r.actions[0].email.html.includes('respond?t=__TOKEN__&amp;a=leave'));
});

test('Send Sign-up Link refuses when the queue has no Signup URL, and ignores a double click', () => {
  const noUrl = sendSignup(touring(), { cap: capacity({ 'Signup URL': '' }) });
  assert.equal(noUrl.status, 409);
  assert.deepEqual(noUrl.actions, []);
  const dbl = sendSignup(entry({ Status: 'Signed Up', 'Response At': new Date().toISOString() }));
  assert.match(dbl.page, /Already sent/);
  assert.deepEqual(dbl.actions, []);
});

test('Send Sign-up Link on someone already Signed Up just re-sends the email (no new pending signup)', () => {
  const r = sendSignup(entry({ Status: 'Signed Up', 'Response At': daysAgo(3), 'Invite Token': TOKEN }));
  assert.deepEqual(r.actions[0].fields, { Status: 'Signed Up' });
  assert.match(r.actions[0].log.Detail, /re-sent/);
  assert.match(r.page, /already Signed Up/);
});

test('Send Sign-up Link: busy Airtable → 503, unknown record → 404, nothing sent', () => {
  const busy = runNode('build-send-signup', {
    nodes: {
      Config: [{ json: { cfg: baseConfig() } }],
      'Get Entry for Send Sign-up Link': [{ json: { errors: [{ error: 'RATE_LIMIT_REACHED' }] } }],
      'Find Entries by Email (sign-up link)': records([]),
      'Find Queue Settings (sign-up link)': records([]),
    },
  })[0].json;
  assert.equal(busy.status, 503);
  assert.equal(sendSignup(null).status, 404);
});

// ── Daily report ─────────────────────────────────────────────
test('daily report: tours booked and released are counted; released tours and unbooked requests need attention', () => {
  const log = (Event, extra = {}) => ({ id: `recL${Math.random()}`, fields: { Timestamp: hoursAgo(2), Event, Name: 'Ava Romero', Email: 'ava@example.com', Location: 'Williamsburg', Membership: 'Unlimited', 'Entry ID': extra.id || 'recA' } });
  const unbooked = entry({ Name: 'Ben', Status: 'Tour Requested', 'Response At': hoursAgo(30) });
  const booked = entry({ Name: 'Cleo', Status: 'Tour Requested', 'Response At': hoursAgo(30), 'Tour At': hoursFromNow(5) });
  const [{ json }] = runNode('build-daily-report', {
    nodes: {
      Config: [{ json: { cfg: baseConfig({ sandboxMode: false }) } }],
      'Get Log (30 days)': records([log('Tour Booked'), log('Tour Released', { id: 'recB' })]),
      'Get Queue Snapshot': records([unbooked, booked]),
      'Get Capacity (report)': records([{ fields: capacity().fields }]),
    },
  });
  const html = json.payload.content[1].value;
  assert.match(html, /Tours booked<\/td><td[^>]*>1</);
  assert.match(html, /Tour holds released<\/td><td[^>]*>1</);
  assert.match(html, /Ava Romero \(Unlimited at Williamsburg\) toured, but no sign-up link was sent/);
  assert.match(html, /Ben \(Unlimited at Williamsburg\) asked for a tour/);
  assert.doesNotMatch(html, /Cleo \(Unlimited/);
});
