// Revenue dashboard (13 Nov): the daily Glofox sync verifies that people the waitlist invited actually bought.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { capacity, hoursAgo, records, runNode } from './harness.mjs';

const cfg = runNode('glofox-sync-config', {})[0].json.cfg;
const GP = '67cf4fe8ef346c3817003b8f';
const sec = (iso) => Math.floor(Date.parse(iso) / 1000);
let n = 0;
const member = (email, name, { status = 'ACTIVE', start = hoursAgo(2), price = 165, unit = 'month' } = {}) => ({
  _id: `m${++n}`, branch_id: GP, email,
  membership: name
    ? { membership_name: name, status, type: 'time', start_date: sec(start), plan_price: price, duration_time_unit: unit, duration_time_unit_count: 1, user_membership_id: `um${n}` }
    : { type: 'payg', status: 'ACTIVE' },
});
const caps = [
  capacity({ Location: 'Greenpoint', Membership: 'Daytime', Price: 165, 'Glofox Memberships': 'Greenpoint - Daytime' }),
  capacity({ Location: 'All-Access', Membership: 'Daytime', Price: 205, 'Glofox Memberships': 'All Access - Daytime\nAll-Access - Daytime Membership' }),
];
const run = (members, rows) => {
  const page = { object: 'list', has_more: false, total_count: members.length, data: members };
  const threeBranches = [page, { ...page, data: [], total_count: 0 }, { ...page, data: [], total_count: 0 }].map((p, i) => ({ ...p, data: p.data.map((m) => ({ ...m, branch_id: [GP, '64c9870292e260894f0247a4', '6a1741e58f61326070010c0a'][i] })) }));
  // Every branch must return someone or the count node stops: give the empty ones a pay-as-you-go account.
  threeBranches[1].data = [{ ...member('x1@example.com', null), branch_id: '64c9870292e260894f0247a4' }];
  threeBranches[2].data = [{ ...member('x2@example.com', null), branch_id: '6a1741e58f61326070010c0a' }];
  threeBranches[1].total_count = 1;
  threeBranches[2].total_count = 1;
  const counted = runNode('glofox-count', { nodes: { Config: [{ json: { cfg } }] }, input: threeBranches.map((json) => ({ json })) })[0].json;
  const out = runNode('glofox-member-flags', {
    nodes: { Config: [{ json: { cfg } }], 'Count Members': [{ json: counted }], 'Get Waitlist': records(rows), 'Get Capacity': records(caps) },
  })[0].json;
  const byId = Object.fromEntries(out.chunks.flatMap((c) => c.records).map((r) => [r.id, r.fields]));
  return { out, byId, logs: out.logChunks.flatMap((c) => c.records) };
};
const row = (id, f) => ({ id, fields: { Name: id, Email: `${id}@example.com`, Location: 'Greenpoint', Membership: 'Daytime', 'Member Type': 'New', ...f } });

test('an invited person who now holds their queue\'s membership in Glofox is a verified purchase, logged once', () => {
  const { byId, logs, out } = run([member('ana@example.com', 'Greenpoint - Daytime')], [row('ana', { Status: 'Signed Up', 'Invited At': hoursAgo(20) })]);
  assert.ok(byId.ana['Glofox Verified At']);
  assert.equal(byId.ana['Monthly Value'], 165);
  assert.match(byId.ana['Glofox Check'], /^Verified in Glofox: Greenpoint - Daytime \(active\) from .+, \$165\/mo$/);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].fields.Event, 'Purchase Verified');
  assert.match(logs[0].fields.Summary, /^Purchase verified: ana - Daytime at Akari Greenpoint$/);
  assert.equal(out.verifiedTotal, 1);
});

test('a same-day purchase counts even though Glofox dates it from midnight', () => {
  const { byId } = run([member('ana@example.com', 'Greenpoint - Daytime', { start: hoursAgo(14) })], [row('ana', { Status: 'Signed Up', 'Invited At': hoursAgo(4) })]);
  assert.ok(byId.ana['Glofox Verified At']);
});

test('a membership that started before the invite is not credited to the waitlist', () => {
  const { byId, logs } = run([member('ana@example.com', 'Greenpoint - Daytime', { start: hoursAgo(24 * 30) })], [row('ana', { Status: 'Invited', 'Invited At': hoursAgo(5) })]);
  assert.equal(byId.ana?.['Glofox Verified At'], undefined);
  assert.equal(logs.length, 0);
});

test('never invited (still Waiting) → not credited, even if they bought elsewhere', () => {
  const { byId } = run([member('ana@example.com', 'Greenpoint - Daytime')], [row('ana', { Status: 'Waiting' })]);
  assert.equal(byId.ana?.['Glofox Verified At'], undefined);
});

test('a different membership, or a pay-as-you-go account, is not a purchase of this queue; Glofox Check says what Glofox shows', () => {
  const { byId } = run(
    [member('ana@example.com', 'Greenpoint - 4 Visits/mo'), member('bo@example.com', null)],
    [row('ana', { Status: 'Signed Up', 'Invited At': hoursAgo(5) }), row('bo', { Status: 'Tour Requested', 'Invited At': hoursAgo(5) }), row('cy', { Status: 'Signed Up', 'Invited At': hoursAgo(5) })],
  );
  assert.equal(byId.ana['Glofox Verified At'], undefined);
  assert.equal(byId.ana['Glofox Check'], "Signed up; Glofox shows Greenpoint - 4 Visits/mo, not this queue's membership yet");
  assert.equal(byId.bo['Glofox Check'], 'Tour requested; Glofox account, no membership yet');
  assert.equal(byId.cy['Glofox Check'], 'Signed up; no Glofox account under this email yet');
});

test('an existing member\'s upgrade adds only the difference: All-Access Daytime $205 − Greenpoint Daytime $165 = $40', () => {
  const lydia = row('ly', { Location: 'All-Access', 'Member Type': 'Existing', Status: 'Signed Up', 'Invited At': hoursAgo(10), 'Glofox Membership': 'Greenpoint - Daytime' });
  const before = run([member('ly@example.com', 'Greenpoint - Daytime', { start: hoursAgo(24 * 30) })], [lydia]).byId.ly;
  assert.equal(before['Monthly Value'], 40, 'pipeline value before the upgrade');
  const after = run([member('ly@example.com', 'All-Access - Daytime Membership', { start: hoursAgo(1), price: 205 })], [lydia]).byId.ly;
  assert.ok(after['Glofox Verified At']);
  assert.equal(after['Monthly Value'], 40);
  assert.equal(after['Glofox Membership'], 'All-Access - Daytime Membership');
});

test('paused, locked and future memberships verify (same statuses as Active Members); a yearly plan uses the queue price', () => {
  const { byId } = run([member('ana@example.com', 'Greenpoint - Daytime', { status: 'FUTURE', price: 1800, unit: 'year', start: hoursAgo(-24 * 10) })], [row('ana', { Status: 'Signed Up', 'Invited At': hoursAgo(5) })]);
  assert.ok(byId.ana['Glofox Verified At']);
  assert.equal(byId.ana['Monthly Value'], 165);
});

test('once verified, the row is left alone: no rewrite, no second log row', () => {
  const done = row('ana', { Status: 'Signed Up', 'Invited At': hoursAgo(30), 'Glofox Verified At': hoursAgo(20), 'Monthly Value': 165, 'Glofox Check': 'Verified in Glofox: …', 'Glofox Membership': 'Greenpoint - Daytime' });
  const { byId, logs, out } = run([member('ana@example.com', 'Greenpoint - Daytime')], [done]);
  assert.equal(byId.ana, undefined);
  assert.equal(logs.length, 0);
  assert.equal(out.verifiedTotal, 1);
});

test('Monthly Value is written for everyone with a priced queue, and only when it changes', () => {
  const { byId } = run([member('z@example.com', null)], [row('ana', { Status: 'Waiting' }), row('bo', { Status: 'Waiting', 'Monthly Value': 165 }), row('cy', { Location: 'Akari Yu', Status: 'Waiting' })]);
  assert.equal(byId.ana['Monthly Value'], 165);
  assert.equal(byId.bo, undefined);
  assert.equal(byId.cy, undefined, 'no Capacity price → left blank');
});
