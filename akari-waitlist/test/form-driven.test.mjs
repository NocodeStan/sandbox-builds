// Nov (go-live): the form decides the locations and memberships; per-queue settings live on Capacity.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newFormPayload } from './fixtures.mjs';
import { baseConfig, capacity, entry, hoursAgo, hoursFromNow, records, runNode } from './harness.mjs';

const cfgNode = (cfg = {}, extra = {}) => [{ json: { cfg: baseConfig(cfg), ...extra } }];
const parse = (body) => runNode('parse-typeform', { nodes: { Config: cfgNode({}, { body }) } })[0].json;
const newQueues = (p, caps) => runNode('build-new-queues', {
  nodes: { Config: cfgNode(), 'Parse Typeform': [{ json: p }], 'Get Capacity (intake)': records(caps) },
}).map((i) => i.json);
const plan = (caps, entries) => runNode('plan-engine-actions', {
  nodes: { Config: cfgNode(), 'Get Capacity': records(caps), 'Get Active Entries': records(entries), 'Get Recent Pause Alerts': records([]) },
}).map((i) => i.json);
const TOKEN = 'a1b2c3d4'.repeat(6);

test('a queue picked for the first time gets a Capacity row: switched off, numbers at 0, price from the label', () => {
  const p = parse(newFormPayload({ picks: { 'Akari Yu': ['Limited 3-Visit/Month - $XXX/month', 'Unlimited - $250/month'], Williamsburg: ['Unlimited - $220/month'] } }));
  const out = newQueues(p, [capacity({ Location: 'Williamsburg', Membership: 'Unlimited' })]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].records.map((r) => r.fields), [
    { Queue: 'Akari Yu · Limited 3-Visit/Month', Location: 'Akari Yu', Membership: 'Limited 3-Visit/Month', 'Minimum Members': 0, 'Active Members': 0, Enabled: false },
    { Queue: 'Akari Yu · Unlimited', Location: 'Akari Yu', Membership: 'Unlimited', 'Minimum Members': 0, 'Active Members': 0, Enabled: false, Price: 250 },
  ]);
  assert.equal(out[0].typecast, true);
  assert.deepEqual(newQueues(p, [
    capacity({ Location: 'Williamsburg', Membership: 'Unlimited' }), capacity({ Location: 'Akari Yu', Membership: 'Unlimited' }), capacity({ Location: 'Akari Yu', Membership: 'Limited 3-Visit/Month' }),
  ])[0].records, [], 'nothing new → empty batch (the IF skips the create)');
});

test('a new queue stays silent until staff set it up: no invites or heads-ups while it is switched off at 0', () => {
  const cap = capacity({ Location: 'Akari Yu', Membership: 'Unlimited', 'Minimum Members': 0, 'Active Members': 0, Enabled: false, 'Signup URL': '' });
  const people = Array.from({ length: 5 }, () => entry({ Location: 'Akari Yu', Membership: 'Unlimited' }));
  assert.equal(plan([cap], people).filter((a) => a.email).length, 0);
});

test('invite price comes from the Capacity row; Config priceByTier is only the fallback', () => {
  const e = entry({ Location: 'Akari Yu', Membership: 'Limited 5-Visit/Month' });
  const withPrice = plan([capacity({ Location: 'Akari Yu', Membership: 'Limited 5-Visit/Month', 'Minimum Members': 11, Price: 175 })], [e]).find((a) => a.log.Event === 'Invited').email;
  assert.match(withPrice.text, /\$175\/month/);
  const e2 = entry({});
  const fallback = plan([capacity({ 'Minimum Members': 11 })], [e2]).find((a) => a.log.Event === 'Invited').email;
  assert.match(fallback.text, /\$220\/month/, 'Unlimited from Config');
});

test('emails say "Akari Yu", not "Akari Akari Yu"', () => {
  const e = entry({ Location: 'Akari Yu' });
  const m = plan([capacity({ Location: 'Akari Yu', 'Minimum Members': 11 })], [e]).find((a) => a.log.Event === 'Invited').email;
  assert.equal(m.subject, 'Unlimited Membership Now Available at Akari Yu');
  assert.doesNotMatch(m.text + m.html, /Akari Akari/);
});

test('two Capacity rows for the same queue invite once, not twice', () => {
  const people = Array.from({ length: 4 }, () => entry({}));
  const a = capacity({ 'Minimum Members': 12 });
  const b = { ...capacity({ 'Minimum Members': 12 }), id: 'recCAP0000000002' };
  assert.equal(plan([a, b], people).filter((x) => x.log?.Event === 'Invited').length, 2);
});

test('tour link: the Capacity row\'s Tour Booking URL wins over Config, on the confirm page and after confirming', () => {
  const e = entry({ Location: 'Akari Yu', Status: 'Invited', 'Invite Token': TOKEN, 'Invite Expires At': hoursFromNow(10) });
  const settings = capacity({ Location: 'Akari Yu', 'Tour Booking URL': 'https://cal.test/akari-yu' });
  const view = runNode('render-confirm-page', {
    nodes: { Config: cfgNode({}, { query: { t: TOKEN, a: 'tour' } }), 'Find Entry by Token (view)': records([e]), 'Find Queue Settings (view)': records([settings]) },
  })[0].json;
  assert.match(view.page, /Choose a tour time/);
  const done = runNode('decide-response', {
    nodes: { Config: cfgNode({}, { body: { t: TOKEN, a: 'tour', reason: '' } }), 'Find Entry by Token (commit)': records([e]), 'Find Entries by Email': records([e]), 'Find Queue Settings': records([settings]) },
  })[0].json;
  assert.match(done.page, /url=https:\/\/cal\.test\/akari-yu\?name=/);
});

test('daily summary flags: new queue not set up, people with no Capacity row, duplicate rows, form warnings', () => {
  const html = runNode('build-daily-report', {
    nodes: {
      Config: cfgNode(),
      'Get Log (30 days)': records([{ fields: { Timestamp: hoursAgo(2), Event: 'Joined', Email: 'pat@example.com', Detail: 'Chose Greenpoint but no membership for it.' } }]),
      'Get Queue Snapshot': records([entry({ Location: 'Akari Yu', Membership: 'Unlimited' }), entry({ Location: 'Bushwick', Membership: 'Evenings' })]),
      'Get Capacity (report)': records([
        capacity({ Location: 'Akari Yu', Membership: 'Unlimited', 'Minimum Members': 0, 'Active Members': 0, Enabled: false, 'Signup URL': '' }),
        capacity({}), capacity({}),
      ]),
      'Get Not Right Now (report)': records([]),
    },
  })[0].json.payload.content[1].value;
  assert.match(html, /Akari Yu · Unlimited: new from the form, 1 on the waitlist/);
  assert.match(html, /Bushwick · Evenings: 1 on the waitlist but no Capacity row/);
  assert.match(html, /Williamsburg · Unlimited: 2 Capacity rows for the same queue/);
  assert.match(html, /Form submission from pat@example\.com: Chose Greenpoint but no membership for it\./);
});
