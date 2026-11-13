// Daily Glofox member sync: counts ACTIVE members per Capacity row and never writes from a partial read.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { capacity, hoursAgo, records, runNode } from './harness.mjs';

const cfg = (o = {}) => ({ ...runNode('glofox-sync-config', {})[0].json.cfg, ...o });
const WB = '64c9870292e260894f0247a4';
const GP = '67cf4fe8ef346c3817003b8f';
const LES = '6a1741e58f61326070010c0a';
let n = 0;
const member = (branch, name, status = 'ACTIVE', type = 'time') => ({ _id: `m${++n}`, branch_id: branch, type: 'member', membership: name ? { membership_name: name, status, type } : { type: 'payg', status: 'ACTIVE' } });
const page = (data, total = data.length) => ({ object: 'list', page: 1, has_more: false, total_count: total, data });
const count = (pages, c = cfg()) => runNode('glofox-count', { nodes: { Config: [{ json: { cfg: c } }] }, input: pages.map((json) => ({ json })) })[0].json;
const plan = (counted, caps, c = cfg()) => runNode('glofox-plan', {
  nodes: { Config: [{ json: { cfg: c } }], 'Count Members': [{ json: counted }], 'Get Capacity': records(caps) },
})[0].json;
const threeBranches = (extra = []) => [
  page([member(WB, 'Unlimited Membership'), member(WB, 'Unlimited Membership - Founding Members'), member(WB, 'Unlimited Membership', 'PAUSED'), member(WB, null), ...extra]),
  page([member(GP, 'Greenpoint - Unlimited'), member(GP, 'Limited Membership')]),
  page([member(LES, 'LES Unlimited Membership', 'LOCKED'), member(LES, 'LES Unlimited Membership')]),
];

test('counts everyone holding a membership (Jack, 11 Nov): active, paused, locked and future count; pay-as-you-go does not', () => {
  const c = count(threeBranches());
  assert.equal(c.counts['unlimited membership'].n, 2, 'active + paused');
  assert.equal(c.counts['les unlimited membership'].n, 2, 'active + locked');
  assert.equal(c.members, 8);
});

test('countStatuses can be narrowed back to ACTIVE only in Config', () => {
  const c = count(threeBranches(), cfg({ countStatuses: ['ACTIVE'] }));
  assert.equal(c.counts['unlimited membership'].n, 1);
  assert.equal(c.counts['les unlimited membership'].n, 1);
});

test('a member listed by two branches is counted once', () => {
  const twice = member(WB, 'Unlimited Membership');
  const c = count([page([twice, member(WB, 'Daytime Membership')]), page([member(GP, 'Greenpoint - Daytime'), { ...twice }]), page([member(LES, 'LES Daytime Membership')])]);
  assert.equal(c.counts['unlimited membership'].n, 1);
});

test('stops without changing anything on a Glofox error, a missing branch, or an incomplete list', () => {
  assert.throws(() => count([...threeBranches().slice(0, 2), { success: false, message: 'this branch is not in any of the allowed namespaces for this token' }]), /nothing was changed.*allowed namespaces/);
  assert.throws(() => count(threeBranches().slice(0, 2)), /LES: no members returned/);
  const short = threeBranches();
  short[0].total_count = 400;
  assert.throws(() => count(short), /Williamsburg: read 4 of 400 members/);
});

test('each Capacity row adds up its Glofox Memberships names; writes Active Members only when it changed, stamps every mapped row', () => {
  const c = count(threeBranches(), cfg({ countStatuses: ['ACTIVE'] }));
  const wb = capacity({ Queue: 'Williamsburg · Unlimited', 'Active Members': 1, 'Glofox Memberships': 'Unlimited Membership\nUnlimited Membership - Founding Members' });
  const les = { ...capacity({ Queue: 'LES · Unlimited', Location: 'LES', 'Active Members': 1, 'Glofox Memberships': 'LES Unlimited Membership' }), id: 'recCAP0000000002' };
  const unmapped = { ...capacity({ Queue: 'Akari Yu · Unlimited', Location: 'Akari Yu', 'Active Members': 0 }), id: 'recCAP0000000003' };
  const p = plan(c, [wb, les, unmapped]);
  const writes = p.chunks.flatMap((x) => x.records);
  assert.deepEqual(writes.map((w) => [w.id, w.fields['Active Members']]), [[wb.id, 2], [les.id, undefined]]);
  assert.ok(writes.every((w) => w.fields['Active Counted At']));
  assert.deepEqual(p.updated, ['Williamsburg · Unlimited 1 → 2']);
  assert.match(p.log.records[0].fields.Detail, /Active in Glofox but not counted in any queue: Greenpoint - Unlimited \(1\), Limited Membership \(1\)/);
  assert.equal(p.log.records[0].fields.Event, 'Active Synced');
});

test('a count that halves overnight is held back and flagged; a mapped name Glofox does not know is flagged', () => {
  const c = count(threeBranches(), cfg({ countStatuses: ['ACTIVE'] }));
  const big = capacity({ Queue: 'Williamsburg · Unlimited', 'Active Members': 261, 'Glofox Memberships': 'Unlimited Membership\nUnlimted Membership' });
  const p = plan(c, [big]);
  assert.equal(p.chunks.length, 0, 'nothing written');
  assert.deepEqual(p.held, ['Williamsburg · Unlimited 261 → 1']);
  assert.deepEqual(p.missing, ['Williamsburg · Unlimited: "Unlimted Membership"']);
});

test('daily summary: flags a sync that did not run, and surfaces held-back counts', () => {
  const rep = (logs) => runNode('build-daily-report', {
    nodes: {
      Config: [{ json: { cfg: { ...runNode('config', { input: [{ json: {} }] })[0].json.cfg, sandboxMode: false } } }],
      'Get Log (30 days)': records(logs.map((fields) => ({ fields }))),
      'Get Queue Snapshot': records([]),
      'Get Capacity (report)': records([capacity({ 'Glofox Memberships': 'Unlimited Membership' })]),
      'Get Not Right Now (report)': records([]),
    },
  })[0].json.payload.content[1].value;
  assert.match(rep([]), /The Glofox member sync has not run in the last day/);
  const html = rep([{ Event: 'Active Synced', Timestamp: hoursAgo(3), Detail: 'No changes to Active Members.\nHeld back, count fell by more than 50% (check Glofox, then type the number in if it\'s right): Williamsburg · Unlimited 261 → 1' }]);
  assert.doesNotMatch(html, /has not run/);
  assert.match(html, /Glofox sync: Held back[^<]*Williamsburg · Unlimited 261 → 1/);
});

test('existing members on the waitlist: "Glofox Membership" set for holders, cleared when they no longer hold one, unchanged rows not written', () => {
  const pages = [
    page([{ ...member(WB, 'Daytime Membership'), email: 'Holder@Example.com' }, { ...member(WB, 'Unlimited Membership', 'PAUSED'), email: 'paused@example.com' }, { ...member(WB, null), email: 'payg@example.com' }]),
    page([member(GP, 'Greenpoint - Unlimited')]),
    page([member(LES, 'LES Unlimited Membership')]),
  ];
  const c = count(pages);
  assert.deepEqual(Object.keys(c.holders).sort(), ['holder@example.com', 'paused@example.com'], 'pay-as-you-go accounts are not members');
  const wl = [
    { id: 'recA', fields: { Email: 'holder@example.com' } },
    { id: 'recB', fields: { Email: 'paused@example.com', 'Glofox Membership': 'Unlimited Membership' } },
    { id: 'recC', fields: { Email: 'left@example.com', 'Glofox Membership': 'Daytime Membership' } },
    { id: 'recD', fields: { Email: 'payg@example.com' } },
  ];
  const out = runNode('glofox-member-flags', { nodes: { Config: [{ json: { cfg: cfg() } }], 'Count Members': [{ json: c }], 'Get Waitlist': records(wl), 'Get Capacity': records([]) } })[0].json;
  assert.deepEqual(out.chunks.flatMap((x) => x.records), [
    { id: 'recA', fields: { 'Glofox Membership': 'Daytime Membership' } },
    { id: 'recC', fields: { 'Glofox Membership': null } },
  ]);
  assert.equal(out.flagged, 2);
});
