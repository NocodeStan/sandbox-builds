import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseConfig, capacity, entry, hoursAgo, hoursFromNow, records, runNode } from './harness.mjs';

const TOKEN = 'a1b2c3d4'.repeat(6);
const invited = (fields = {}) => entry({ Status: 'Invited', 'Invite Token': TOKEN, 'Invite Expires At': hoursFromNow(10), 'Invite Source': 'Auto', ...fields });

function decide(e, action, { others = [], reason = '', cap = capacity(), token = TOKEN, cfg = {} } = {}) {
  return runNode('decide-response', {
    nodes: {
      Config: [{ json: { cfg: baseConfig(cfg), body: { t: token, a: action, reason } } }],
      'Find Entry by Token (commit)': records(e ? [e] : []),
      'Find Entries by Email': records(e ? [e, ...others] : []),
      'Find Queue Settings': records(cap ? [cap] : []),
    },
  })[0].json;
}
const byId = (acts, id) => acts.filter((a) => a.recordId === id);

test('Yes within the hold → Signed Up, confirmation email with the Glofox link, redirect to signup', () => {
  const e = invited({ Membership: 'Daytime' });
  const r = decide(e, 'yes');
  assert.equal(r.status, 200);
  assert.equal(r.actions.length, 1);
  assert.equal(r.actions[0].fields.Status, 'Signed Up');
  assert.ok(r.actions[0].email.html.includes('https://app.glofox.test/signup/williamsburg-unlimited'));
  assert.match(r.page, /http-equiv="refresh" content="1;url=https:\/\/app\.glofox\.test/);
});

test('Yes on Unlimited → removed from every other waitlist automatically', () => {
  const e = invited({ Email: 'u@example.com', Membership: 'Unlimited' });
  const o1 = entry({ Email: 'u@example.com', Membership: 'Daytime' });
  const o2 = entry({ Email: 'u@example.com', Location: 'Greenpoint', Status: 'Not Right Now' });
  const closed = entry({ Email: 'u@example.com', Membership: '4-Visit', Status: 'No Longer Interested' });
  const r = decide(e, 'yes', { others: [o1, o2, closed] });
  assert.equal(byId(r.actions, o1.id)[0].fields.Status, 'Removed');
  assert.equal(byId(r.actions, o2.id)[0].fields.Status, 'Removed');
  assert.equal(byId(r.actions, closed.id).length, 0);
  assert.match(r.actions[0].email.text, /taken you off your other waitlists/);
});

test('Yes on a lower tier → stays on other lists, email offers a one-click way off', () => {
  const e = invited({ Email: 'd@example.com', Membership: 'Daytime' });
  const o1 = entry({ Email: 'd@example.com', Membership: 'Unlimited' });
  const r = decide(e, 'yes', { others: [o1] });
  assert.equal(r.actions.length, 1);
  assert.ok(r.actions[0].email.html.includes(`respond?t=${TOKEN}&amp;a=leave`));
});

test('Yes after the hold expired → Warm (first in line next time), no email', () => {
  const r = decide(invited({ 'Invite Expires At': hoursAgo(1) }), 'yes');
  assert.equal(r.actions[0].fields.Status, 'Warm');
  assert.equal(r.actions[0].log.Event, 'Late Reply');
  assert.equal(r.actions[0].email, null);
  assert.match(r.page, /first in line/);
});

test('Yes after already timing out (status Warm) is also a late reply', () => {
  const r = decide(invited({ Status: 'Warm', 'Invite Expires At': hoursAgo(5) }), 'yes');
  assert.equal(r.actions[0].fields.Status, 'Warm');
  assert.ok(r.actions[0].fields['Response At']);
});

test('Tour within the hold → Tour Requested (spot stays held), team alerted with preferred times', () => {
  const r = decide(invited(), 'tour', { reason: 'Saturday morning' });
  const a = r.actions[0];
  assert.equal(a.fields.Status, 'Tour Requested');
  assert.equal(a.fields['Tour Notes'], 'Saturday morning');
  assert.deepEqual(a.email.to, ['team@akari.test']);
  assert.match(a.email.text, /Saturday morning/);
  assert.match(a.email.text, /Send Now/);
});

test('Tour after the hold expired → Warm, team still alerted', () => {
  const a = decide(invited({ 'Invite Expires At': hoursAgo(1) }), 'tour').actions[0];
  assert.equal(a.fields.Status, 'Warm');
  assert.match(a.email.subject, /\(late\)/);
});

test('Yes after a tour (status Tour Requested, original hold long gone) → Signed Up', () => {
  const r = decide(invited({ Status: 'Tour Requested', 'Invite Expires At': hoursAgo(48) }), 'yes');
  assert.equal(r.actions[0].fields.Status, 'Signed Up');
});

test('Not right now / No longer interested → their buckets with the reason, no email', () => {
  const nn = decide(invited(), 'notnow', { reason: 'Moving in March' }).actions[0];
  assert.equal(nn.fields.Status, 'Not Right Now');
  assert.equal(nn.fields.Reason, 'Moving in March');
  assert.equal(nn.email, null);
  const no = decide(invited(), 'no', { reason: 'Too far' }).actions[0];
  assert.equal(no.fields.Status, 'No Longer Interested');
  assert.equal(no.log.Reason, 'Too far');
});

test('unknown or tampered tokens change nothing', () => {
  assert.equal(decide(null, 'yes').status, 410);
  assert.equal(decide(invited(), 'yes', { token: 'short' }).status, 410);
  const wrong = decide(invited({ 'Invite Token': 'f'.repeat(48) }), 'yes');
  assert.equal(wrong.status, 410);
  assert.deepEqual(wrong.actions, []);
});

test('double-clicking Yes is harmless: already signed up → just redirect again', () => {
  const r = decide(invited({ Status: 'Signed Up' }), 'yes');
  assert.deepEqual(r.actions, []);
  assert.match(r.page, /refresh/);
});

test('"Remove me from my other waitlists" link', () => {
  const e = invited({ Email: 'l@example.com', Status: 'Signed Up', Membership: 'Daytime' });
  const o1 = entry({ Email: 'l@example.com', Membership: 'Unlimited' });
  const r = decide(e, 'leave', { others: [o1] });
  assert.equal(r.actions.length, 1);
  assert.equal(r.actions[0].recordId, o1.id);
  assert.equal(r.actions[0].fields.Status, 'Removed');
});

test('unknown action → 400, nothing changes', () => {
  const r = decide(invited(), 'hack');
  assert.equal(r.status, 400);
  assert.deepEqual(r.actions, []);
});

test('missing Signup URL → still confirmed, flagged for staff in the log', () => {
  const r = decide(invited(), 'yes', { cap: capacity({ 'Signup URL': '' }) });
  assert.equal(r.actions[0].fields.Status, 'Signed Up');
  assert.match(r.actions[0].log.Detail, /SIGNUP URL MISSING/);
  assert.doesNotMatch(r.page, /refresh/);
});

// ── GET confirmation page ───────────────────────────────────
function view(e, action, token = TOKEN) {
  return runNode('render-confirm-page', {
    nodes: {
      Config: [{ json: { cfg: baseConfig(), query: { t: token, a: action } } }],
      'Find Entry by Token (view)': records(e ? [e] : []),
    },
  })[0].json;
}

test('email links only render a confirmation form (POST) and never change state', () => {
  const r = view(invited(), 'no');
  assert.equal(r.status, 200);
  assert.deepEqual(r.actions, []);
  assert.match(r.page, /<form method="POST" action="https:\/\/n8n\.test\/webhook\/akari-waitlist\/respond-confirm">/);
  assert.match(r.page, new RegExp(`name="t" value="${TOKEN}"`));
  assert.match(r.page, /name="a" value="no"/);
  assert.match(r.page, /<textarea/);
});

test('confirmation page warns when the hold has lapsed; escapes data', () => {
  const r = view(invited({ 'Invite Expires At': hoursAgo(2), Membership: '<script>x</script>' }), 'yes');
  assert.match(r.page, /hold has passed/);
  assert.doesNotMatch(r.page, /<script>x/);
  assert.equal(view(null, 'yes').status, 410);
  assert.equal(view(invited(), 'bogus').status, 400);
});

// ── Send Now ─────────────────────────────────────────────────
function sendNow(rec, cfg = {}) {
  return runNode('build-send-now', {
    nodes: { Config: [{ json: { cfg: baseConfig(cfg), query: { id: rec?.id } } }], 'Get Entry for Send Now': [{ json: rec || { error: { type: 'NOT_FOUND' } } }] },
  })[0].json;
}

test('Send Now invites anyone immediately, whatever their status, with a fresh 24h hold', () => {
  for (const status of ['Waiting', 'Not Right Now', 'No Reply', 'Tour Requested', 'Signed Up']) {
    const r = sendNow(entry({ Status: status }));
    assert.equal(r.status, 200);
    const a = r.actions[0];
    assert.equal(a.fields.Status, 'Invited');
    assert.equal(a.fields['Invite Source'], 'Send Now');
    assert.match(a.email.html, /claim my spot/);
    assert.match(a.log.Detail, new RegExp(`previous status: ${status}`));
  }
});

test('Send Now ignores an accidental second click within two minutes', () => {
  const r = sendNow(entry({ Status: 'Invited', 'Invite Source': 'Send Now', 'Invited At': new Date().toISOString() }));
  assert.deepEqual(r.actions, []);
  assert.match(r.page, /Already sent/);
});

test('Send Now with a bad record → 404, nothing sent', () => {
  const r = sendNow(null);
  assert.equal(r.status, 404);
  assert.deepEqual(r.actions, []);
});

test('Send Now page tells staff when sandbox/test mode is on', () => {
  const r = sendNow(entry({}), { testRecipient: 'qa@akari.test', sandboxMode: true });
  assert.match(r.page, /redirected to qa@akari\.test/);
  assert.match(r.page, /sandbox mode is on/);
});
