import assert from 'node:assert/strict';
import { test } from 'node:test';
import { typeformPayload } from './fixtures.mjs';
import { baseConfig, capacity, daysAgo, entry, hoursAgo, records, runNode } from './harness.mjs';

const parse = (body) => runNode('parse-typeform', { nodes: { Config: [{ json: { cfg: baseConfig(), body } }] } })[0].json;

test('Typeform: one queue per location × membership, LES alias, normalised email', () => {
  const p = parse(typeformPayload());
  assert.equal(p.email, 'jane.doe@example.com');
  assert.equal(p.name, 'Jane Doe');
  assert.equal(p.phone, '+17185550100');
  assert.equal(p.memberType, 'New');
  assert.equal(p.joinedAt, '2026-09-20T15:00:00Z');
  assert.deepEqual(p.queues, [
    { location: 'Williamsburg', membership: 'Unlimited' },
    { location: 'Williamsburg', membership: 'Daytime' },
    { location: 'Lower East Side', membership: 'Unlimited' },
    { location: 'Lower East Side', membership: 'Daytime' },
  ]);
});

test('Typeform: label variants and existing-member question', () => {
  const p = parse(typeformPayload({ memberships: ['4 Visit Pack', 'Summer Pass'], locations: ['Lower East Side (LES)'], existing: true }));
  assert.equal(p.memberType, 'Existing');
  assert.deepEqual(p.queues.map((q) => q.membership), ['4-Visit', 'Summer Pass']);
  assert.deepEqual([...new Set(p.queues.map((q) => q.location))], ['Lower East Side']);
});

test('Typeform: "All-Access (both locations)" enrols in both real locations, not neither', () => {
  const p = parse(typeformPayload({ locations: ['All-Access (both locations)'], memberships: ['Unlimited'] }));
  assert.deepEqual(p.queues.map((q) => q.location).sort(), ['Greenpoint', 'Williamsburg']);
});

test('Typeform: Zip Code and "How did you hear about us?" are captured', () => {
  const p = parse(typeformPayload({ zip: '11211', referral: 'Instagram' }));
  assert.equal(p.zipCode, '11211');
  assert.equal(p.referralSource, 'Instagram');
});

test('Typeform: missing Zip/referral leaves those fields blank, not throwing', () => {
  const p = parse(typeformPayload());
  assert.equal(p.zipCode, '');
  assert.equal(p.referralSource, '');
});

test('Typeform: missing email fails loudly (so the error alert fires)', () => {
  assert.throws(() => parse(typeformPayload({ email: null })), /missing email/);
  assert.throws(() => parse({ foo: 1 }), /not a Typeform/);
});

test('Build New Entries skips queues the person is already on and chunks by 10', () => {
  const p = parse(typeformPayload({ locations: ['Williamsburg', 'Greenpoint', 'LES'], memberships: ['Unlimited', 'Daytime', '4-Visit', 'Summer Pass'] }));
  const existing = [
    entry({ Email: p.email, Location: 'Williamsburg', Membership: 'Unlimited', Status: 'Waiting' }),
    entry({ Email: p.email, Location: 'Greenpoint', Membership: 'Daytime', Status: 'No Longer Interested' }),
  ];
  const out = runNode('build-new-entries', {
    nodes: { Config: [{ json: { cfg: baseConfig() } }], 'Parse Typeform': [{ json: p }], 'Find Existing Entries': records(existing) },
  }).map((i) => i.json);
  assert.deepEqual(out.map((c) => c.records.length), [10, 1]);
  const created = out.flatMap((c) => c.records.map((r) => `${r.fields.Location}|${r.fields.Membership}`));
  assert.ok(!created.includes('Williamsburg|Unlimited'));
  assert.ok(created.includes('Greenpoint|Daytime'));
  assert.equal(out[0].records[0].fields.Status, 'Waiting');
  assert.equal(out[0].typecast, true);
});

test('Build New Entries carries Zip Code and Referral Source onto every created row', () => {
  const p = parse(typeformPayload({ locations: ['Williamsburg'], memberships: ['Unlimited', 'Daytime'], zip: '11211', referral: 'Instagram' }));
  const out = runNode('build-new-entries', {
    nodes: { Config: [{ json: { cfg: baseConfig() } }], 'Parse Typeform': [{ json: p }], 'Find Existing Entries': records([]) },
  }).flatMap((i) => i.json.records);
  assert.equal(out.length, 2);
  assert.ok(out.every((r) => r.fields['Zip Code'] === '11211' && r.fields['Referral Source'] === 'Instagram'));
});

test('Executor: updates merged per record and chunked by 10; logs chunked by 10', () => {
  const actions = Array.from({ length: 23 }, (_, i) => ({ json: { recordId: `rec${i % 21}`, fields: { Status: 'Primed', n: i }, log: { Event: 'Primed' }, email: null } }));
  const upd = runNode('chunk-waitlist-updates', { input: actions }).map((i) => i.json);
  assert.deepEqual(upd.map((c) => c.records.length), [10, 10, 1]);
  assert.equal(upd[0].records.find((r) => r.id === 'rec0').fields.n, 21);
  assert.equal(upd[0].typecast, true);
  const logs = runNode('chunk-log-rows', { nodes: { 'Apply Tokens': actions } }).map((i) => i.json);
  assert.deepEqual(logs.map((c) => c.records.length), [10, 10, 3]);
});

test('Build New Entries returns one empty batch when nothing is new (so Typeform still gets its 200)', () => {
  const p = parse(typeformPayload({ locations: ['Williamsburg'], memberships: ['Unlimited'] }));
  const out = runNode('build-new-entries', {
    nodes: { Config: [{ json: { cfg: baseConfig() } }], 'Parse Typeform': [{ json: p }], 'Find Existing Entries': records([entry({ Email: p.email, Status: 'Primed' })]) },
  });
  assert.deepEqual(out.map((i) => i.json.records.length), [0]);
});

test('Apply Tokens puts the generated token everywhere the placeholder appears', () => {
  const token = 'ab'.repeat(24);
  const [{ json }] = runNode('apply-tokens', { input: [{ json: { token, recordId: 'rec1', fields: { 'Invite Token': '__TOKEN__' }, email: { html: 'respond?t=__TOKEN__&a=yes', text: 't=__TOKEN__' }, log: {} } }] });
  assert.equal(json.fields['Invite Token'], token);
  assert.equal(json.email.html, `respond?t=${token}&a=yes`);
  assert.equal(json.token, undefined);
  assert.doesNotMatch(JSON.stringify(json), /__TOKEN__/);
});

test('SendGrid payload: only actions with an email; test recipient override, sandbox flag, click tracking off', () => {
  const email = { to: 'a@example.com', name: 'A', subject: 'Hello', html: '<p>x</p>', text: 'x' };
  const run = (cfg) => {
    const out = runNode('build-emails', {
      nodes: { Config: [{ json: { cfg: baseConfig(cfg) } }], 'Apply Tokens': [{ json: { email } }, { json: { email: null } }] },
    });
    assert.equal(out.length, 1);
    return out[0].json.payload;
  };
  const live = run({ sandboxMode: false });
  assert.deepEqual(live.personalizations[0].to, [{ email: 'a@example.com', name: 'A' }]);
  assert.equal(live.mail_settings.sandbox_mode.enable, false);
  assert.equal(live.tracking_settings.click_tracking.enable, false);
  const t = run({ testRecipient: 'qa@akari.test' });
  assert.deepEqual(t.personalizations[0].to, [{ email: 'qa@akari.test' }]);
  assert.match(t.subject, /^\[TEST → a@example\.com\]/);
});

test('Daily report: counts, conversion by location, attention items', () => {
  const log = (Event, extra = {}) => ({ id: `recLOG${Math.random()}`, fields: { Timestamp: hoursAgo(2), Event, Location: 'Williamsburg', Membership: 'Unlimited', 'Entry ID': extra.id || 'recA', Source: extra.Source, Reason: extra.Reason, Email: 'a@example.com' } });
  const logs = [
    log('Invited', { id: 'recA', Source: 'Auto' }), log('Invited', { id: 'recB', Source: 'Send Now' }),
    log('Signed Up', { id: 'recA' }), log('No Longer Interested', { id: 'recC', Reason: 'Moved away' }),
  ];
  const staleTour = entry({ Status: 'Tour Requested', 'Response At': daysAgo(9) });
  const caps = [capacity().fields, capacity({ Location: 'Greenpoint', 'Signup URL': '', 'Minimum Members': 3, 'Active Members': 1 }).fields];
  const [{ json }] = runNode('build-daily-report', {
    nodes: {
      Config: [{ json: { cfg: baseConfig({ sandboxMode: false }) } }],
      'Get Log (30 days)': records(logs),
      'Get Queue Snapshot': records([staleTour]),
      'Get Capacity (report)': records(caps.map((fields) => ({ fields }))),
    },
  });
  const p = json.payload;
  assert.deepEqual(p.personalizations[0].to, [{ email: 'team@akari.test' }]);
  const html = p.content[1].value;
  assert.match(html, /Invited \(auto\)<\/td><td[^>]*>1/);
  assert.match(html, /Invited \(Send Now\)<\/td><td[^>]*>1/);
  assert.match(html, /Williamsburg<\/td><td[^>]*>2<\/td><td[^>]*>1<\/td><td[^>]*>2<\/td><td[^>]*>1<\/td><td[^>]*>50%/);
  assert.match(html, /Moved away/);
  assert.match(html, /Greenpoint · Unlimited: no Signup URL/);
  assert.match(html, /has had a tour hold since/);
});
