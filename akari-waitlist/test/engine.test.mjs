import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseConfig, capacity, daysAgo, entry, hoursAgo, hoursFromNow, records, runNode } from './harness.mjs';

const plan = (caps, entries, cfg = {}) =>
  runNode('plan-engine-actions', {
    nodes: {
      Config: [{ json: { cfg: baseConfig(cfg) } }],
      'Get Capacity': records(caps),
      'Get Active Entries': records(entries),
    },
  }).map((i) => i.json);

const of = (actions, event) => actions.filter((a) => a.log.Event === event);
const ids = (actions) => actions.map((a) => a.recordId);

test('no gap → no invites, but the next 10 in line get a heads-up', () => {
  const people = Array.from({ length: 12 }, (_, i) => entry({ 'Joined At': daysAgo(30 - i) }));
  const out = plan([capacity({ 'Minimum Members': 10, 'Active Members': 10 })], people);
  assert.equal(of(out, 'Invited').length, 0);
  const primed = of(out, 'Primed');
  assert.deepEqual(ids(primed), people.slice(0, 10).map((p) => p.id));
  assert.ok(primed.every((a) => a.fields.Status === 'Primed' && a.email));
});

test('gap of 2 → the two longest-waiting are invited with a 24h hold; the next 10 are primed', () => {
  const people = Array.from({ length: 13 }, (_, i) => entry({ 'Joined At': daysAgo(30 - i) }));
  const out = plan([capacity({ 'Minimum Members': 12, 'Active Members': 10 })], people);
  const invited = of(out, 'Invited');
  assert.deepEqual(ids(invited), [people[0].id, people[1].id]);
  const inv = invited[0];
  assert.equal(inv.fields.Status, 'Invited');
  assert.equal(inv.fields['Invite Source'], 'Auto');
  assert.equal(inv.fields['Invite Token'], '__TOKEN__', 'real token is added by the Generate Tokens node');
  const holdMs = new Date(inv.fields['Invite Expires At']) - new Date(inv.fields['Invited At']);
  assert.equal(holdMs, 24 * 3600000);
  assert.ok(inv.email.html.includes('respond?t=__TOKEN__&amp;a=yes'));
  assert.ok(inv.email.html.includes('a=tour'));
  assert.deepEqual(ids(of(out, 'Primed')), people.slice(2, 12).map((p) => p.id));
});

test('open holds and unconfirmed signups count against the gap until staff recount', () => {
  const held = entry({ Status: 'Invited', 'Invite Expires At': hoursFromNow(5), 'Invite Token': 'x'.repeat(48) });
  const signed = entry({ Status: 'Signed Up', 'Response At': hoursAgo(2) });
  const waiting = entry({});
  const cap = capacity({ 'Minimum Members': 12, 'Active Members': 10, 'Active Updated At': hoursAgo(10) });
  assert.equal(of(plan([cap], [held, signed, waiting]), 'Invited').length, 0);

  const recounted = capacity({ 'Minimum Members': 12, 'Active Members': 10, 'Active Updated At': hoursAgo(1) });
  assert.deepEqual(ids(of(plan([recounted], [held, signed, waiting]), 'Invited')), [waiting.id]);
});

test('expired hold: 1st miss → Warm (cooling off, next person invited); 2nd miss → No Reply', () => {
  const first = entry({ Status: 'Invited', 'Invite Expires At': hoursAgo(1), 'Joined At': daysAgo(50) });
  const second = entry({ Status: 'Invited', 'Invite Expires At': hoursAgo(1), 'Timeout Count': 1, 'Joined At': daysAgo(60) });
  const next = entry({ 'Joined At': daysAgo(5) });
  const out = plan([capacity({ 'Minimum Members': 12, 'Active Members': 10 })], [first, second, next]);
  const timed = of(out, 'Timed Out');
  assert.equal(timed.find((a) => a.recordId === first.id).fields.Status, 'Warm');
  assert.equal(timed.find((a) => a.recordId === second.id).fields.Status, 'No Reply');
  assert.deepEqual(ids(of(out, 'Invited')), [next.id]);
});

test('warm people go first once their cool-off has passed', () => {
  const warm = entry({ Status: 'Warm', 'Invite Expires At': hoursAgo(80), 'Joined At': daysAgo(2) });
  const older = entry({ 'Joined At': daysAgo(90) });
  const out = plan([capacity({ 'Minimum Members': 11, 'Active Members': 10 })], [older, warm]);
  assert.deepEqual(ids(of(out, 'Invited')), [warm.id]);
  assert.match(of(out, 'Invited')[0].log.Detail, /Warm re-invite/);
});

test('a late replier is warm with no cool-off', () => {
  const late = entry({ Status: 'Warm', 'Invite Expires At': hoursAgo(3), 'Response At': hoursAgo(1), 'Joined At': daysAgo(2) });
  const older = entry({ 'Joined At': daysAgo(90) });
  assert.deepEqual(ids(of(plan([capacity({ 'Minimum Members': 11 })], [older, late]), 'Invited')), [late.id]);
});

test('manual rank overrides everything else, lowest number first', () => {
  const warm = entry({ Status: 'Warm', 'Invite Expires At': hoursAgo(100) });
  const oldest = entry({ 'Joined At': daysAgo(200) });
  const vip2 = entry({ 'Manual Rank': 2, 'Joined At': daysAgo(1) });
  const vip1 = entry({ 'Manual Rank': 1, 'Joined At': daysAgo(1), 'Member Type': 'Existing' });
  const out = plan([capacity({ 'Minimum Members': 13 })], [warm, oldest, vip2, vip1]);
  assert.deepEqual(ids(of(out, 'Invited')), [vip1.id, vip2.id, warm.id]);
});

test('new members count 3x their waiting time against existing-member upgrades', () => {
  const existing20 = entry({ 'Member Type': 'Existing', 'Joined At': daysAgo(20) });
  const new8 = entry({ 'Joined At': daysAgo(8) });
  assert.deepEqual(ids(of(plan([capacity({ 'Minimum Members': 11 })], [existing20, new8]), 'Invited')), [new8.id]);
  const existing30 = entry({ 'Member Type': 'Existing', 'Joined At': daysAgo(30) });
  assert.deepEqual(ids(of(plan([capacity({ 'Minimum Members': 11 })], [existing30, new8]), 'Invited')), [existing30.id]);
});

test('"Prioritise New Only" skips existing members for invites and heads-ups', () => {
  const existing = entry({ 'Member Type': 'Existing', 'Joined At': daysAgo(300) });
  const fresh = entry({ 'Joined At': daysAgo(1) });
  const out = plan([capacity({ 'Minimum Members': 11, 'Prioritise New Only': true })], [existing, fresh]);
  assert.deepEqual(ids(of(out, 'Invited')), [fresh.id]);
  assert.ok(!ids(of(out, 'Primed')).includes(existing.id));
});

test('a person only ever holds one live invite across all their queues', () => {
  const email = 'multi@example.com';
  const a = entry({ Email: email, Membership: 'Unlimited', 'Joined At': daysAgo(40) });
  const b = entry({ Email: email, Membership: 'Daytime', 'Joined At': daysAgo(40) });
  const other = entry({ Membership: 'Daytime', 'Joined At': daysAgo(3) });
  const caps = [capacity({ 'Minimum Members': 11 }), capacity({ Membership: 'Daytime', 'Minimum Members': 11 })];
  assert.deepEqual(ids(of(plan(caps, [a, b, other]), 'Invited')), [a.id, other.id]);
});

test('outside the send window only expiries run', () => {
  const expired = entry({ Status: 'Invited', 'Invite Expires At': hoursAgo(1) });
  const waiting = entry({});
  const out = plan([capacity({ 'Minimum Members': 15 })], [expired, waiting], { sendWindow: { startHour: 0, endHour: 0 } });
  assert.deepEqual(out.map((a) => a.log.Event), ['Timed Out']);
});

test('engine switch off → nothing happens', () => {
  assert.deepEqual(plan([capacity({ 'Minimum Members': 15 })], [entry({})], { engineEnabled: false }), []);
});

test('guardrail caps invites per queue per run', () => {
  const people = Array.from({ length: 30 }, () => entry({}));
  const out = plan([capacity({ 'Minimum Members': 500 })], people);
  assert.equal(of(out, 'Invited').length, 10);
});

test('a queue with no Signup URL never sends invites', () => {
  const out = plan([capacity({ 'Minimum Members': 15, 'Signup URL': '' })], [entry({})]);
  assert.equal(of(out, 'Invited').length, 0);
});

test('disabled queues are ignored', () => {
  const out = plan([capacity({ 'Minimum Members': 15, Enabled: false })], [entry({})]);
  assert.equal(out.length, 0);
});

test('someone near the front of two queues gets one combined heads-up email', () => {
  const email = 'twoqueues@example.com';
  const a = entry({ Email: email, Membership: 'Unlimited' });
  const b = entry({ Email: email, Membership: 'Daytime' });
  const caps = [capacity(), capacity({ Membership: 'Daytime' })];
  const primed = of(plan(caps, [a, b]), 'Primed');
  assert.equal(primed.length, 2);
  assert.equal(primed.filter((p) => p.email).length, 1);
  assert.match(primed.find((p) => p.email).email.text, /Unlimited at Williamsburg, Daytime at Williamsburg/);
});

test('already-primed and warm people are not primed again', () => {
  const primed = entry({ Status: 'Primed', 'Primed At': daysAgo(3) });
  const warm = entry({ Status: 'Warm', 'Invite Expires At': hoursAgo(1) });
  assert.equal(of(plan([capacity()], [primed, warm]), 'Primed').length, 0);
});
