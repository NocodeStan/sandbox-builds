// Jack's test notes, 5 Nov: one test (or more) per item, named after the note it covers.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseConfig, capacity, daysAgo, entry, hoursAgo, hoursFromNow, records, runNode } from './harness.mjs';

const TOKEN = 'a1b2c3d4'.repeat(6);
const PAGE = 'https://www.akarisauna.com/membership';
const plan = (caps, entries, { cfg = {}, pauses = [] } = {}) => runNode('plan-engine-actions', {
  nodes: { Config: [{ json: { cfg: baseConfig(cfg) } }], 'Get Capacity': records(caps), 'Get Active Entries': records(entries), 'Get Recent Pause Alerts': records(pauses) },
}).map((i) => i.json);
const of = (actions, event) => actions.filter((a) => a.log?.Event === event);
const decide = (e, action, { others = [], cap = capacity(), reason = '' } = {}) => runNode('decide-response', {
  nodes: {
    Config: [{ json: { cfg: baseConfig(), body: { t: TOKEN, a: action, reason } } }],
    'Find Entry by Token (commit)': records([e]),
    'Find Entries by Email': records([e, ...others]),
    'Find Queue Settings': records([cap]),
  },
})[0].json;
const view = (e, action) => runNode('render-confirm-page', {
  nodes: { Config: [{ json: { cfg: baseConfig(), query: { t: TOKEN, a: action } } }], 'Find Entry by Token (view)': records([e]) },
})[0].json;
const invited = (f = {}) => entry({ Email: 'jack@example.com', Status: 'Invited', 'Invite Token': TOKEN, 'Invite Expires At': hoursFromNow(10), ...f });
const primed = (f = {}) => entry({ Email: 'jack@example.com', Status: 'Primed', 'Invite Token': TOKEN, 'Primed At': hoursAgo(2), ...f });

// ── Test 2 · "hyperlink the membership page to the 'here' text" ──
test('T2: invite links the membership page on the word "here"; the plain-text version keeps the address', () => {
  const m = plan([capacity({ 'Minimum Members': 11 })], [entry({})]).find((a) => a.log.Event === 'Invited').email;
  assert.ok(m.html.includes(`membership page <a href="${PAGE}" style="color:#1f1d1a">here</a>.`), m.html);
  assert.ok(!m.html.includes(`>${PAGE}<`), 'the address itself is no longer shown');
  assert.ok(m.text.includes(`membership page here ${PAGE}.`));
});

// ── Test 3 · "link pending" and "hyperlink ... to the 'here' text" ──
test('T3: "signup link pending" only appears when the queue has no Signup URL (with one, the link is in the email)', () => {
  const withUrl = decide(invited({ Membership: 'Daytime' }), 'yes', { cap: capacity({ Membership: 'Daytime', 'Signup URL': 'https://app.glofox.test/wb-day' }) });
  assert.match(withUrl.actions[0].email.text, /Akari Williamsburg: https:\/\/app\.glofox\.test\/wb-day/);
  assert.doesNotMatch(withUrl.actions[0].email.text, /pending/);
  const noUrl = decide(invited({ Membership: 'Daytime' }), 'yes', { cap: capacity({ Membership: 'Daytime', 'Signup URL': '' }) });
  assert.match(noUrl.actions[0].email.text, /signup link pending/);
  assert.match(noUrl.actions[0].log.Detail, /SIGNUP URL MISSING/);
});

test('T3: "remove yourself here" in the confirmation is the link; plain text keeps the address', () => {
  const r = decide(invited({ Membership: 'Daytime' }), 'yes', { others: [entry({ Email: 'jack@example.com' })], cap: capacity({ Membership: 'Daytime' }) });
  const m = r.actions[0].email;
  assert.match(m.html, /you can remove yourself <a href="[^"]*a=leave" style="color:#1f1d1a">here<\/a>\./);
  assert.match(m.text, /you can remove yourself here: \S+a=leave/);
});

// ── Test 5 · "Not allowed" page ──
test('T5: the "Not allowed" page no longer says Send Now and explains how to fix the button URL', () => {
  const [{ json }] = runNode('forbidden-page', { nodes: { Config: [{ json: { cfg: baseConfig() } }] } });
  assert.equal(json.status, 403);
  assert.doesNotMatch(json.page, /Send Now link/);
  assert.match(json.page, /RECORD_ID\(\)/);
  assert.match(json.page, /sendNowSecret/);
});

// ── Test 6 · "your spot is held until..." on Not right now / No longer interested ──
test('T6: the hold deadline shows on Sign up and Tour first, not on Not right now or No longer interested', () => {
  for (const a of ['yes', 'tour']) assert.match(view(invited(), a).page, /held until/, a);
  for (const a of ['notnow', 'no']) assert.doesNotMatch(view(invited(), a).page, /held until/, a);
});

test('T6: where "changed my mind" appears — Not ready yet, then Sign up from the same email', () => {
  const nrn = invited({ Status: 'Not Right Now' });
  assert.match(view(nrn, 'yes').page, /already told us you weren't ready/);
  assert.match(decide(nrn, 'yes').page, /back in line/);
});

// ── Test 7 · "two buttons ... so that we know they are actually primed" (+ decision 2) ──
test('T7: "still interested" stamps Interest Confirmed At on every list named in that heads-up, and logs it', () => {
  const e = primed();
  const sameEmail = entry({ Email: 'jack@example.com', Status: 'Primed', Membership: 'Daytime', 'Primed At': e.fields['Primed At'] });
  const otherRun = entry({ Email: 'jack@example.com', Status: 'Primed', Location: 'Greenpoint', 'Primed At': daysAgo(3) });
  const r = decide(e, 'still', { others: [sameEmail, otherRun] });
  assert.deepEqual(r.actions.map((a) => a.recordId).sort(), [e.id, sameEmail.id].sort());
  assert.ok(r.actions.every((a) => a.fields['Interest Confirmed At'] && a.log.Event === 'Still Interested'));
  assert.match(r.page, /keep your place in line/);
  assert.deepEqual(decide(primed({ 'Interest Confirmed At': hoursAgo(1) }), 'still').actions, [], 'second click changes nothing');
});

test('T7: "remove me" from the heads-up → No Longer Interested on the lists that email named, with the reason', () => {
  const e = primed();
  const sameEmail = entry({ Email: 'jack@example.com', Status: 'Primed', Membership: 'Daytime', 'Primed At': e.fields['Primed At'] });
  const r = decide(e, 'remove', { others: [sameEmail], reason: 'Moved away' });
  assert.equal(r.actions.length, 2);
  assert.ok(r.actions.every((a) => a.fields.Status === 'No Longer Interested' && a.fields.Reason === 'Moved away'));
  assert.match(r.actions[0].log.Detail, /"almost up" email/);
});

test('T7: heads-up buttons only work while Primed, and a heads-up link can\'t be used to jump the queue', () => {
  assert.equal(decide(primed(), 'yes').status, 400);
  assert.deepEqual(decide(primed(), 'tour').actions, []);
  assert.equal(view(primed(), 'yes').status, 400);
  const afterInvite = decide(invited(), 'still');
  assert.deepEqual(afterInvite.actions, []);
  assert.match(afterInvite.page, /Nothing to change/);
  assert.match(view(primed(), 'still').page, /Yes, I(?:'|&#39;)m still interested/);
  assert.match(view(primed(), 'remove').page, /<textarea/);
});

// ── Test 8 · "remove the no reply people initially, with an option to put them back" ──
test('T8: a No Reply person who later presses Sign up on the old invite is back in line, first', () => {
  const r = decide(invited({ Status: 'No Reply', 'Invite Expires At': daysAgo(14), 'Timeout Count': 1 }), 'yes');
  assert.equal(r.actions[0].fields.Status, 'Warm');
  assert.match(r.page, /first in line/);
});

test('T8: staff putting a No Reply person back to Warm in Airtable makes them first in line on the next run', () => {
  for (const expired of [daysAgo(14), hoursAgo(1)]) {
    const back = entry({ Status: 'Warm', 'Invite Expires At': expired, 'Timeout Count': 1, 'Joined At': daysAgo(1) });
    const longWait = entry({ 'Joined At': daysAgo(200) });
    const out = plan([capacity({ 'Minimum Members': 11 })], [longWait, back]);
    assert.deepEqual(of(out, 'Invited').map((a) => a.recordId), [back.id], `invite expired ${expired}`);
  }
});

test('T8: with the two-strike setting, the engine\'s own first-miss Warm still waits out the 72h cool-down', () => {
  const warm = entry({ Status: 'Warm', 'Invite Expires At': hoursAgo(1), 'Timeout Count': 1, 'Joined At': daysAgo(300) });
  const next = entry({ 'Joined At': daysAgo(5) });
  const out = plan([capacity({ 'Minimum Members': 11 })], [warm, next], { cfg: { timeoutsBeforeNoReply: 2 } });
  assert.deepEqual(of(out, 'Invited').map((a) => a.recordId), [next.id]);
});

// ── Decision 4 · pause a queue with an implausible number of open spots ──
test('D4: a mistyped minimum (500) pauses the queue: no invites, no heads-ups, one alert email to the team, logged', () => {
  const people = Array.from({ length: 30 }, () => entry({}));
  const out = plan([capacity({ 'Minimum Members': 500 })], people);
  assert.equal(of(out, 'Invited').length + of(out, 'Primed').length, 0);
  const alert = of(out, 'Queue Paused');
  assert.equal(alert.length, 1);
  assert.equal(alert[0].recordId, null);
  assert.deepEqual(alert[0].email.to, ['team@akari.test']);
  assert.equal(alert[0].email.subject, 'Check Minimum Members: Williamsburg · Unlimited is paused');
  assert.match(alert[0].email.text, /490 open spots \(Minimum Members 500, Active Members 10\)/);
});

test('D4: no second alert within a day; 15 open spots is still allowed', () => {
  const people = Array.from({ length: 30 }, () => entry({}));
  const pauses = [{ id: 'recLOG1', fields: { Event: 'Queue Paused', Location: 'Williamsburg', Membership: 'Unlimited' } }];
  assert.equal(plan([capacity({ 'Minimum Members': 500 })], people, { pauses }).length, 0);
  assert.equal(of(plan([capacity({ 'Minimum Members': 25 })], people), 'Invited').length, 10);
});

test('D4: an alert-only run still reaches the log and email steps (the executor skips the empty row update)', () => {
  const out = runNode('chunk-waitlist-updates', { input: [{ json: { recordId: null, fields: null, log: {}, email: {} } }] }).map((i) => i.json);
  assert.deepEqual(out, [{ records: [], typecast: true }]);
});

// ── Decisions 1 & 3 · daily summary ──
function report({ logs = [], live = [], caps = [capacity().fields], notReady = [], cfg = {} } = {}) {
  const [{ json }] = runNode('build-daily-report', {
    nodes: {
      Config: [{ json: { cfg: baseConfig({ sandboxMode: false, airtableBaseId: 'appTEST123', ...cfg }) } }],
      'Get Log (30 days)': records(logs.map((fields, i) => ({ id: `recL${i}`, fields }))),
      'Get Queue Snapshot': records(live),
      'Get Capacity (report)': records(caps.map((fields) => ({ fields }))),
      'Get Not Right Now (report)': records(notReady),
    },
  });
  return json.payload;
}

test('D3: the daily summary follows Jack\'s template: subject, preview, Needs attention, Last 24 hours, By location, dashboard link', () => {
  const log = (Event, id, extra = {}) => ({ Timestamp: hoursAgo(2), Event, 'Entry ID': id, Location: 'Williamsburg', Membership: 'Unlimited', ...extra });
  const p = report({
    logs: [log('Joined', 'a'), log('Joined', 'b'), log('Invited', 'a'), log('Signed Up', 'a'), log('Not Right Now', 'c'), log('No Longer Interested', 'd'), log('Timed Out', 'e'), log('Tour Requested', 'f')],
    live: [
      entry({ Status: 'Invited', 'Invite Expires At': hoursFromNow(5) }), entry({ Status: 'Invited', 'Invite Expires At': hoursFromNow(40) }),
      entry({ Status: 'Tour Requested', 'Response At': hoursAgo(3) }), entry({ Status: 'Waiting' }), entry({ Status: 'Primed', Location: 'Greenpoint' }),
    ],
    caps: [capacity({ 'Minimum Members': 15, 'Active Members': 10 }).fields],
  });
  assert.match(p.subject, /^Akari Waitlist Daily Summary: \w+day, \w+ \d+$/);
  const html = p.content[1].value;
  assert.match(html, /Today&#39;s waitlist activity and action items/);
  assert.match(html, /Hi team,[\s\S]*Anything that needs attention is listed first/);
  assert.match(html, /Invites expiring in the next 24 hours<\/td><td[^>]*>1</);
  assert.match(html, /Tour requests not yet booked<\/td><td[^>]*>1</);
  assert.match(html, /Open spots with no invite sent<\/td><td[^>]*>2</, '15 − 10 − 3 held');
  for (const [k, v] of [['New sign-ups', 2], ['Invites sent', 1], ['Accepted', 1], ['Passed', 2], ['Expired', 1], ['Tour requests', 1]]) assert.ok(html.includes(`>${k}</th>`), k), v;
  assert.match(html, /<td[^>]*>2<\/td><td[^>]*>1<\/td><td[^>]*>1<\/td><td[^>]*>2<\/td><td[^>]*>1<\/td><td[^>]*>1<\/td>/, 'last-24h row in Jack\'s column order');
  assert.match(html, /Greenpoint<\/td><td[^>]*>1<\/td><td[^>]*>0<\/td><td[^>]*>0</);
  assert.match(html, /Williamsburg<\/td><td[^>]*>1<\/td><td[^>]*>2<\/td><td[^>]*>2</);
  assert.ok(html.indexOf('Williamsburg</td>') < html.indexOf('Greenpoint</td>'), 'locations follow the Capacity table, then any only on the waitlist');
  assert.match(html, /can be found <a href="https:\/\/airtable\.com\/appTEST123"[^>]*>here<\/a>/);
  assert.match(html, /More detail[\s\S]*Queues now/);
});

test('D1: "Not ready yet" people are listed for a check-in after 60 days, not before', () => {
  const due = entry({ Name: 'Noor', Email: 'noor@example.com', Status: 'Not Right Now', 'Response At': daysAgo(61), Reason: 'Back in November' });
  const recent = entry({ Name: 'Sam', Email: 'sam@example.com', Status: 'Not Right Now', 'Response At': daysAgo(30) });
  const html = report({ notReady: [due, recent] }).content[1].value;
  assert.match(html, /due a check-in \(60\+ days\)<\/td><td[^>]*>1</);
  assert.match(html, /Noor<\/td><td[^>]*>noor@example\.com<\/td><td[^>]*>Unlimited at Williamsburg<\/td><td[^>]*>[^<]+<\/td><td[^>]*>Back in November</);
  assert.doesNotMatch(html, /sam@example\.com/);
});

test('D4: a paused queue is named in the summary', () => {
  const html = report({ caps: [capacity({ 'Minimum Members': 500 }).fields] }).content[1].value;
  assert.match(html, /Williamsburg · Unlimited: paused — 490 open spots is more than 15/);
});
