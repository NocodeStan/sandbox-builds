// Jack's notes after go-live (13 Nov): tours booked directly need no team email, All-Access tours,
// and existing Glofox members upgrading through the membership team instead of the sign-up link.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseConfig, capacity, entry, hoursAgo, hoursFromNow, records, runNode } from './harness.mjs';

const TOKEN = 'a1b2c3d4'.repeat(6);
const CAL = {
  tourBookingUrlByLocation: { Williamsburg: 'https://cal.test/wb', Greenpoint: 'https://cal.test/gp', LES: 'https://cal.test/les' },
  tourChoiceLocations: { 'All-Access': ['Williamsburg', 'Greenpoint', 'LES'] },
};
const invited = (f = {}) => entry({ Name: 'Jiazhen Lin', Email: 'jl@example.com', Phone: "'+16145550100", Status: 'Invited', 'Invite Token': TOKEN, 'Invite Expires At': hoursFromNow(10), ...f });
const view = (e, action, cfg = CAL) => runNode('render-confirm-page', {
  nodes: { Config: [{ json: { cfg: baseConfig(cfg), query: { t: TOKEN, a: action } } }], 'Find Entry by Token (view)': records([e]) },
})[0].json;
const decide = (e, action, { cfg = CAL, others = [], cap = capacity({ Location: e.fields.Location, Membership: e.fields.Membership }) } = {}) => runNode('decide-response', {
  nodes: {
    Config: [{ json: { cfg: baseConfig(cfg), body: { t: TOKEN, a: action, reason: '' } } }],
    'Find Entry by Token (commit)': records([e]),
    'Find Entries by Email': records([e, ...others]),
    'Find Queue Settings': records([cap]),
  },
})[0].json;
const plan = (caps, entries) => runNode('plan-engine-actions', {
  nodes: { Config: [{ json: { cfg: baseConfig() } }], 'Get Capacity': records(caps), 'Get Active Entries': records(entries), 'Get Recent Pause Alerts': records([]) },
}).map((i) => i.json);

// ── Tours ──
test('All-Access "Tour first": a page with the three locations\' booking links (pre-filled, tagged with their row), and no team email', () => {
  const e = invited({ Location: 'All-Access', Membership: 'Daytime' });
  const page = view(e, 'tour').page;
  assert.match(page, /Choose a tour time/);
  assert.doesNotMatch(page, /<textarea/, 'no "when suits you?" box');
  const r = decide(e, 'tour');
  assert.equal(r.actions[0].fields.Status, 'Tour Requested');
  assert.equal(r.actions[0].email, null);
  for (const [loc, url] of [['Williamsburg', 'wb'], ['Greenpoint', 'gp'], ['LES', 'les']]) {
    assert.ok(r.page.includes(`href="https://cal.test/${url}?name=Jiazhen%20Lin&amp;email=jl%40example.com&amp;metadata%5Bentry%5D=${e.id}"`), loc);
    assert.match(r.page, new RegExp(`Tour Akari ${loc}`));
  }
});

test('a queue with its own Tour Booking URL on Capacity uses it, not the location choice', () => {
  const e = invited({ Location: 'All-Access', Membership: 'Daytime' });
  const r = decide(e, 'tour', { cap: capacity({ Location: 'All-Access', Membership: 'Daytime', 'Tour Booking URL': 'https://cal.test/all-access' }) });
  assert.match(r.page, /url=https:\/\/cal\.test\/all-access\?/);
});

test('a location with no booking page and no choice (e.g. Akari Yu) keeps the "when suits you?" box and the team email', () => {
  const e = invited({ Location: 'Akari Yu', Membership: 'Unlimited' });
  assert.match(view(e, 'tour').page, /<textarea/);
  assert.match(decide(e, 'tour').actions[0].email.subject, /^Tour Request: Jiazhen Lin at Akari Yu$/);
});

test('phone numbers from the spreadsheet import show without the leading apostrophe', () => {
  const alert = decide(invited({ Location: 'Akari Yu' }), 'tour').actions[0].email.text;
  assert.match(alert, /Phone: \+16145550100/);
  assert.doesNotMatch(alert, /'\+1614/);
});

// ── Existing members ──
const member = (f = {}) => invited({ Location: 'Williamsburg', Membership: 'Unlimited', 'Glofox Membership': 'Daytime Membership', ...f });

test('an existing Glofox member\'s invite is Jack\'s upgrade email: three buttons, no sign-up link', () => {
  const e = entry({ Name: 'Jack Elder', 'Glofox Membership': 'Daytime Membership' });
  const m = plan([capacity({ 'Minimum Members': 11 })], [e]).find((a) => a.log?.Event === 'Invited').email;
  assert.equal(m.subject, 'Unlimited Membership Now Available at Akari Williamsburg');
  assert.match(m.text, /^Hi Jack,\n\nWe really appreciate your patience during the waitlist process for the Unlimited membership at Akari Williamsburg\. We are in the process of opening more memberships this month, and we would love to have you join us!/);
  assert.match(m.text, /The cost for your membership will be \$220\/month, and additional membership details can be found on our membership page here/);
  assert.match(m.text, /We'll hold it for you until .+\. After that it goes to the next person in line\./);
  assert.deepEqual([...m.html.matchAll(/a=(\w+)"[^>]*>([^<]+)</g)].map((x) => [x[1], x[2]]),
    [['upgradenow', 'Upgrade today - prorate the difference'], ['upgradenext', 'Upgrade on my next billing cycle'], ['keep', 'Keep my current membership']]);
  assert.doesNotMatch(m.html, /a=yes|a=tour|Sign up/);
  assert.match(m.text, /please reply to this email and we will get back to you shortly!\n\nWarmly,\nAkari team$/);
});

test('everyone else still gets the standard invite', () => {
  const m = plan([capacity({ 'Minimum Members': 11 })], [entry({})]).find((a) => a.log?.Event === 'Invited').email;
  assert.match(m.html, /a=yes/);
  assert.doesNotMatch(m.html, /a=upgradenow/);
});

test('"Upgrade today" → Signed Up (spot taken), membership team emailed with what to do; no sign-up link', () => {
  const e = member();
  const other = entry({ Email: 'jl@example.com', Location: 'Greenpoint', Membership: 'Unlimited', Status: 'Waiting' });
  const r = decide(e, 'upgradenow', { others: [other] });
  const [me, removed] = r.actions;
  assert.deepEqual([me.fields.Status, me.fields.Reason], ['Signed Up', 'Upgrade today - prorate the difference']);
  assert.match(me.log.Detail, /Membership team to change it in Glofox/);
  assert.deepEqual(me.email.to, ['team@akari.test']);
  assert.match(me.email.subject, /^Membership upgrade: Jiazhen Lin - Unlimited at Akari Williamsburg$/);
  assert.match(me.email.text, /Current Glofox membership: Daytime Membership/);
  assert.match(me.email.text, /upgrade their membership in Glofox today and prorate the difference/);
  assert.equal(removed.fields.Status, 'Removed', 'Unlimited takes them off their other lists, as with Sign up');
  assert.match(r.page, /Our membership team will upgrade your account today/);
  assert.doesNotMatch(r.page, /url=/, 'not sent to the Glofox sign-up page');
});

test('"Upgrade on my next billing cycle" → Signed Up; the team is told to schedule it; upgradeTeamEmails is used when set', () => {
  const r = decide(member({ Membership: 'Daytime' }), 'upgradenext', { cfg: { ...CAL, upgradeTeamEmails: ['membership@akari.test'] } });
  assert.equal(r.actions.length, 1, 'lower tiers stay on other lists');
  assert.equal(r.actions[0].fields.Reason, 'Upgrade on my next billing cycle');
  assert.deepEqual(r.actions[0].email.to, ['membership@akari.test']);
  assert.match(r.actions[0].email.text, /schedule the upgrade in Glofox for their next billing cycle/);
  assert.match(r.page, /from your next billing cycle/);
});

test('"Keep my current membership" → off this waitlist, team told no change is needed', () => {
  const r = decide(member(), 'keep');
  assert.deepEqual([r.actions[0].fields.Status, r.actions[0].fields.Reason], ['No Longer Interested', 'Keeping their current membership']);
  assert.match(r.actions[0].email.subject, /^Keeping current membership:/);
  assert.match(r.page, /You'll keep your current membership/);
});

test('an upgrade answer after the hold lapsed → first in line (Warm), nobody emailed', () => {
  const r = decide(member({ 'Invite Expires At': hoursAgo(2) }), 'upgradenow');
  assert.equal(r.actions[0].fields.Status, 'Warm');
  assert.equal(r.actions[0].email, null);
  assert.match(r.page, /first in line/);
});

test('upgrade confirm pages: hold deadline shown on the two upgrade choices, not on "keep"; scanners change nothing', () => {
  const e = member();
  for (const a of ['upgradenow', 'upgradenext']) assert.match(view(e, a).page, /held until/, a);
  assert.doesNotMatch(view(e, 'keep').page, /held until/);
  assert.match(view(e, 'upgradenow').page, /<button type="submit">Upgrade today<\/button>/);
});
