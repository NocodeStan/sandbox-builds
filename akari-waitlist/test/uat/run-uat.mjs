// UAT, written from the client's seat: "a week at Akari" run through the real workflow in a real n8n
// (mock Airtable + SendGrid). Every check is phrased as what Jack expects to see. Results go to
// test/uat/reports/uat-<label>.md, with the full inbox so the email copy can be reviewed.
//
// Statuses: PASS · FAIL (defect, must fix) · RISK (works, but a known residual risk) · OPEN (needs a product decision)
// Usage: NODE24=... N8N_BIN=... UAT_LABEL=run-1 node test/uat/run-uat.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMain } from '../../build/build-workflow.mjs';
import { sleep, startStack } from '../e2e/stack.mjs';
import { typeformPayload } from '../fixtures.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LABEL = process.env.UAT_LABEL || new Date().toISOString().replace(/[:.]/g, '-');
const SECRET = 'uat-secret-456';
const HOUR = 3600000;
const DAY = 24 * HOUR;
const TEAM = 'team@YOUR-DOMAIN.com';
const SIGNUP = (slug) => `https://app.glofox.test/signup/${slug}`;
const iso = (ms) => new Date(ms).toISOString();
const daysAgo = (d) => iso(Date.now() - d * DAY);
const at = (n) => `stan+${n}@optimizewise.org`;

// Allowed single-select values (airtable/setup-airtable.mjs). With typecast:true a stray value would
// silently create a new option in the real base, so the run checks every value written.
const SELECTS = {
  Waitlist: {
    Status: ['Waiting', 'Primed', 'Invited', 'Tour Requested', 'Warm', 'Signed Up', 'Not Right Now', 'No Longer Interested', 'No Reply', 'Removed'],
    Location: ['Williamsburg', 'Greenpoint', 'Lower East Side'],
    Membership: ['Unlimited', 'Daytime', '4-Visit', 'Summer Pass'],
    'Member Type': ['New', 'Existing'],
    'Entry Source': ['Typeform', 'Admin'],
    'Invite Source': ['Auto', 'Send Now'],
  },
  'Activity Log': {
    Event: ['Joined', 'Primed', 'Invited', 'Tour Requested', 'Signed Up', 'Not Right Now', 'No Longer Interested', 'Timed Out', 'Late Reply', 'Removed'],
  },
};

// ── Stack ───────────────────────────────────────────────────────
// lockoutMs: model real Airtable, which refuses every request for 30s after a rate-limit hit.
const stack = await startStack({ secret: SECRET, wfId: 'akariWaitlistUAT1', lockoutMs: 30000 });
const { BASE, mock, post, form } = stack;
console.log(`• UAT ${LABEL} · n8n ${stack.version}`);

// ── Reporting ───────────────────────────────────────────────────
const scenarios = [];
const timeline = [];
let cur = null;
let clockHours = 0;
const dayLabel = () => `Day ${Math.floor(clockHours / 24)}${clockHours % 24 ? ` +${clockHours % 24}h` : ''}`;
function scenario(id, title, story) {
  cur = { id, title, story, when: dayLabel(), checks: [] };
  scenarios.push(cur);
  console.log(`\n${id} · ${title}`);
}
function expect(desc, fn, kind = 'req') {
  let ok = false;
  let detail = '';
  try {
    const v = fn();
    if (v && typeof v === 'object' && 'ok' in v) ({ ok, detail = '' } = v);
    else ok = !!v;
  } catch (e) {
    detail = e.message;
  }
  const status = ok ? 'PASS' : { risk: 'RISK', decision: 'OPEN' }[kind] || 'FAIL';
  cur.checks.push({ desc, status, detail: ok ? '' : detail });
  console.log(`  ${{ PASS: '✓', FAIL: '✗', RISK: '△', OPEN: '?' }[status]} ${desc}${ok ? '' : `\n      ${detail}`}`);
}
const eq = (a, b) => ({ ok: JSON.stringify(a) === JSON.stringify(b), detail: `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}` });
const has = (s, re) => ({ ok: re.test(String(s ?? '')), detail: `no match for ${re} in: “${String(s ?? '').replace(/\s+/g, ' ').slice(0, 260)}”` });
const hasNot = (s, re) => ({ ok: !re.test(String(s ?? '')), detail: `found ${re}: “${(String(s ?? '').match(re) || [''])[0]}”` });

// ── Data helpers ────────────────────────────────────────────────
const W = () => mock.table('Waitlist');
const LOG = () => mock.table('Activity Log');
const rowsOf = (email) => W().filter((r) => r.fields.Email === email);
const rowOf = (email, loc, mem) => W().find((r) => r.fields.Email === email && r.fields.Location === loc && r.fields.Membership === mem);
const statusOf = (email, loc, mem) => rowOf(email, loc, mem)?.fields.Status;
const mails = () => mock.state.emails;
const toOf = (m) => m.personalizations[0].to.map((t) => t.email);
const inbox = (addr, since = 0) => mails().slice(since).filter((m) => toOf(m).includes(addr));
const textOf = (m) => m?.content.find((c) => c.type === 'text/plain')?.value || '';
const htmlOf = (m) => m?.content.find((c) => c.type === 'text/html')?.value || '';
const preheaderOf = (m) => ((htmlOf(m).match(/<div style="display:none[^>]*>([^<]*?)(?:&zwnj;|<)/) || [])[1] || '').trim();
const isInvite = (m) => /Membership Now Available/.test(m.subject);
const isHeadsUp = (m) => /Almost Up|nearly at the front/i.test(m.subject);
const isConfirmation = (m) => /Private Sign Up Link/.test(m.subject);
const tokenIn = (m, action) => (htmlOf(m).match(new RegExp(`respond\\?t=([A-Za-z0-9]+)&amp;a=${action}\\b`)) || [])[1];

// Waits until the stack goes quiet. After any Airtable refusal the workflow deliberately pauses 35s
// before resending, so "quiet" then has to mean 40s without a request.
async function settle(quietMs = 3500, maxMs = 240000) {
  const end = Date.now() + maxMs;
  let n = -1;
  let since = Date.now();
  while (Date.now() < end) {
    await sleep(250);
    const now = mock.state.requests.length;
    const need = Date.now() - mock.state.lastRefusalAt < 45000 ? Math.max(quietMs, 40000) : quietMs;
    if (now !== n) {
      n = now;
      since = Date.now();
    } else if (Date.now() - since >= need) return;
  }
}
async function engine(label) {
  const mark = mails().length;
  const logMark = LOG().length;
  const r = await post('glofox-end-date', {});
  await settle();
  const sent = mails().slice(mark);
  const logs = LOG().slice(logMark).map((x) => x.fields);
  timeline.push(`${dayLabel()} · engine run (${label}): ${logs.filter((l) => l.Event === 'Invited').length} invited, ${logs.filter((l) => l.Event === 'Primed').length} heads-ups, ${logs.filter((l) => l.Event === 'Timed Out').length} timed out · HTTP ${r.status}`);
  return { sent, logs };
}
async function openLink(m, action) {
  const r = await fetch(`${BASE}/respond?t=${tokenIn(m, action)}&a=${action}`);
  return { status: r.status, page: await r.text() };
}
async function confirm(m, action, reason = '', { wait = true } = {}) {
  const r = await form({ t: tokenIn(m, action) || '', a: action, reason });
  const out = { status: r.status, page: await r.text() };
  if (wait) await settle();
  return out;
}
// The "busy, try again" page carries the same answer in hidden fields; pressing Try again re-posts it.
async function tryAgain(page) {
  const fields = Object.fromEntries([...page.matchAll(/<input type="hidden" name="(\w+)" value="([^"]*)">/g)].map((m) => [m[1], m[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")]));
  const r = await form(fields);
  return { status: r.status, page: await r.text() };
}
async function sendNow(id, key = SECRET) {
  const r = await fetch(`${BASE}/send-now?id=${id}&k=${key}`);
  const out = { status: r.status, page: await r.text() };
  await settle();
  return out;
}
async function typeform(payload) {
  const r = await post('intake', payload);
  const body = await r.text();
  await settle();
  return { status: r.status, body };
}
// Staff edits in Airtable. "Active Updated At" is a last-modified field on Active Members.
function staffEditCapacity(queue, fields) {
  const c = mock.table('Capacity').find((x) => x.fields.Queue === queue);
  Object.assign(c.fields, fields);
  if ('Active Members' in fields) c.fields['Active Updated At'] = iso(Date.now());
}
// Time travel: shift every stored timestamp into the past, i.e. "N hours pass".
const DATE_FIELDS = { Waitlist: ['Joined At', 'Invited At', 'Invite Expires At', 'Primed At', 'Response At'], Capacity: ['Active Updated At'], 'Activity Log': ['Timestamp'] };
function travel(hours) {
  for (const [t, fields] of Object.entries(DATE_FIELDS)) {
    for (const r of mock.table(t)) for (const f of fields) if (r.fields[f]) r.fields[f] = iso(new Date(r.fields[f]).getTime() - hours * HOUR);
  }
  clockHours += hours;
  timeline.push(`⏩ ${hours}h pass → ${dayLabel()}`);
}

// ── Jack's Airtable, as set up before go-live ───────────────────
const cap = (Queue, Location, Membership, min, active, extra = {}) => ({ Queue, Location, Membership, 'Minimum Members': min, 'Active Members': active, Enabled: true, 'Active Updated At': daysAgo(10), ...extra });
mock.seed('Capacity', [
  cap('Williamsburg · Unlimited', 'Williamsburg', 'Unlimited', 40, 38, { 'Signup URL': SIGNUP('wb-unl') }),
  cap('Williamsburg · Daytime', 'Williamsburg', 'Daytime', 20, 20, { 'Signup URL': SIGNUP('wb-day') }),
  cap('Greenpoint · Unlimited', 'Greenpoint', 'Unlimited', 30, 30, { 'Signup URL': SIGNUP('gp-unl'), 'Prioritise New Only': true }),
  cap('Greenpoint · 4-Visit', 'Greenpoint', '4-Visit', 10, 9), // Signup URL forgotten
  cap('Lower East Side · Unlimited', 'Lower East Side', 'Unlimited', 50, 0, { Enabled: false }), // not open yet
  cap('Greenpoint · Summer Pass', 'Greenpoint', 'Summer Pass', 5, 4, { 'Signup URL': SIGNUP('gp-sp') }),
  cap('Williamsburg · 4-Visit', 'Williamsburg', '4-Visit', 500, 10, { 'Signup URL': SIGNUP('wb-4v') }), // typo: meant 50
]);
const person = (name, n, fields) => ({ Name: name, Email: at(n), Phone: '+17185550111', Location: 'Williamsburg', Membership: 'Unlimited', 'Member Type': 'New', 'Entry Source': 'Typeform', Status: 'Waiting', 'Timeout Count': 0, ...fields });
mock.seed('Waitlist', [
  person('Cleo Ortiz', 10, { 'Joined At': daysAgo(2), 'Manual Rank': 1 }), // founder's friend, bumped by Jack
  person('Cleo Ortiz', 10, { 'Joined At': daysAgo(2), Membership: 'Daytime' }),
  person('Ava Romero', 11, { 'Joined At': daysAgo(50) }),
  person('Ben Fischer', 12, { 'Joined At': daysAgo(120), 'Member Type': 'Existing' }),
  // 12 people on Williamsburg 4-Visit; Guest01 has waited longest.
  ...Array.from({ length: 12 }, (_, i) => person(`Guest${String(i + 1).padStart(2, '0')} Test`, 101 + i, { Membership: '4-Visit', 'Joined At': daysAgo(31 - i) })),
  person('Guest01 Test', 101, { Location: 'Greenpoint', 'Joined At': daysAgo(31) }),
  person('Guest03 Test', 103, { Membership: 'Daytime', 'Joined At': daysAgo(25) }),
]);
const G = (k) => at(100 + k);

try {
  await stack.ready();
  console.log('• n8n is up with the workflow published');

  // ═══ DAY 0 · MORNING: Typeform submissions ═══════════════════
  scenario('T1', 'New member signs up via Typeform', 'Maya fills in the form for Unlimited at Williamsburg, giving her zip and that she heard about us on Instagram.');
  let r = await typeform(typeformPayload({ email: 'Stan+1@OptimizeWise.org', first: 'Maya', last: 'Chen', locations: ['Williamsburg'], memberships: ['Unlimited'], existing: false, zip: '11211', referral: 'Instagram', token: 'maya-1', submittedAt: daysAgo(10) }));
  expect('Typeform gets a 200 so it does not retry', () => eq(r.status, 200));
  const maya = rowOf(at(1), 'Williamsburg', 'Unlimited');
  expect('one Waiting row appears for Unlimited · Williamsburg', () => eq(maya?.fields.Status, 'Waiting'));
  expect('email is stored lower-case', () => eq(maya?.fields.Email, at(1)));
  expect('zip code and referral source are captured', () => eq([maya?.fields['Zip Code'], maya?.fields['Referral Source']], ['11211', 'Instagram']));
  expect('name and phone are captured', () => eq([maya?.fields.Name, maya?.fields.Phone], ['Maya Chen', '+17185550100']));
  expect('a "Joined" entry is logged', () => eq(LOG().filter((l) => l.fields.Event === 'Joined' && l.fields.Email === at(1)).length, 1));

  scenario('T2', '"All-Access (both locations)" choice', 'Leo, an existing member, picks the All-Access option and Unlimited.');
  await typeform(typeformPayload({ email: at(2), first: 'Leo', last: 'Brooks', locations: ['All-Access (both locations)'], memberships: ['Unlimited'], existing: true, token: 'leo-1', submittedAt: daysAgo(5) }));
  expect('Leo is on both Williamsburg and Greenpoint Unlimited', () => eq(rowsOf(at(2)).map((x) => x.fields.Location).sort(), ['Greenpoint', 'Williamsburg']));
  expect('both rows are marked as an Existing member', () => eq(rowsOf(at(2)).map((x) => x.fields['Member Type']), ['Existing', 'Existing']));

  scenario('T3', '"LES" shorthand for a location that is not open yet', 'Priya picks "LES" — the Lower East Side queue is switched off until opening.');
  await typeform(typeformPayload({ email: at(3), first: 'Priya', last: 'Shah', locations: ['LES'], memberships: ['Unlimited'], token: 'priya-1', submittedAt: daysAgo(3) }));
  expect('Priya is on the Lower East Side Unlimited list', () => eq(statusOf(at(3), 'Lower East Side', 'Unlimited'), 'Waiting'));

  scenario('T4', 'Messy email + descriptive choice labels', 'Sam types their email with capitals and spaces; the form labels read "Daytime (weekdays before 4pm)" and "4-Visit Pack".');
  await typeform(typeformPayload({ email: '  STAN+4@OptimizeWise.org ', first: 'Sam', last: "O'Connor", locations: ['Greenpoint'], memberships: ['Daytime (weekdays before 4pm)', '4-Visit Pack'], token: 'sam-1', submittedAt: daysAgo(4) }));
  expect('email is trimmed and lower-cased', () => eq(rowsOf(at(4)).length, 2));
  expect('both memberships are recognised', () => eq(rowsOf(at(4)).map((x) => x.fields.Membership).sort(), ['4-Visit', 'Daytime']));
  expect('apostrophe in the surname survives', () => eq(rowsOf(at(4))[0]?.fields.Name, "Sam O'Connor"));

  scenario('T5', 'Same person submits twice', 'Maya submits the identical form again a few minutes later.');
  const joinedBefore = LOG().filter((l) => l.fields.Event === 'Joined').length;
  r = await typeform(typeformPayload({ email: at(1), first: 'Maya', last: 'Chen', locations: ['Williamsburg'], memberships: ['Unlimited'], token: 'maya-2', submittedAt: iso(Date.now()) }));
  expect('Typeform still gets a 200', () => eq(r.status, 200));
  expect('no duplicate row, no extra "Joined" log', () => eq([rowsOf(at(1)).length, LOG().filter((l) => l.fields.Event === 'Joined').length], [1, joinedBefore]));

  scenario('T6', 'Same person adds a second membership', 'Maya comes back and ticks Unlimited and Daytime.');
  await typeform(typeformPayload({ email: at(1), first: 'Maya', last: 'Chen', locations: ['Williamsburg'], memberships: ['Unlimited', 'Daytime'], token: 'maya-3', submittedAt: iso(Date.now()) }));
  expect('only the new Daytime row is added', () => eq(rowsOf(at(1)).map((x) => x.fields.Membership).sort(), ['Daytime', 'Unlimited']));
  expect('her Unlimited place in line is untouched', () => eq(rowOf(at(1), 'Williamsburg', 'Unlimited')?.fields['Joined At'], maya.fields['Joined At']));

  scenario('T7', 'Broken submission', 'A form arrives with no email or choices (e.g. a question was renamed in Typeform).');
  const alertsBefore = inbox(TEAM).filter((m) => m.subject.startsWith('[Waitlist automation]')).length;
  r = await typeform({ event_type: 'form_response', form_response: { token: 'broken-1', answers: [] } });
  expect('Typeform gets an error (so it shows as a failed delivery and can be resent)', () => ({ ok: r.status >= 500, detail: `got ${r.status}` }));
  expect('the team gets an alert email naming what is missing', () => has(inbox(TEAM).filter((m) => m.subject.startsWith('[Waitlist automation]')).slice(alertsBefore).map((m) => m.subject).join(' | '), /missing email, location, membership/));

  scenario('T8', 'Summer Pass (no price set yet)', 'Noor joins the Greenpoint Summer Pass list.');
  await typeform(typeformPayload({ email: at(5), first: 'Noor', last: 'Haddad', locations: ['Greenpoint'], memberships: ['Summer Pass'], token: 'noor-1', submittedAt: daysAgo(6) }));
  expect('Noor is on Greenpoint Summer Pass', () => eq(statusOf(at(5), 'Greenpoint', 'Summer Pass'), 'Waiting'));

  scenario('T9', 'Someone types HTML into their name', 'A form arrives with first name "<b>Zed</b>" and last name "\\"Q\\"".');
  await typeform(typeformPayload({ email: at(6), first: '<b>Zed</b>', last: '"Q"', locations: ['Williamsburg'], memberships: ['Unlimited'], token: 'zed-1', submittedAt: daysAgo(1) }));
  expect('the row is created (name stored as typed)', () => eq(rowOf(at(6), 'Williamsburg', 'Unlimited')?.fields.Name, '<b>Zed</b> "Q"'));

  scenario('T10', '"Existing member" answered as a multiple-choice', 'Jo answers "Yes, I\'m a current member" (a choice question, not yes/no).');
  const jo = typeformPayload({ email: at(7), first: 'Jo', last: 'Park', locations: ['Williamsburg'], memberships: ['Unlimited'], token: 'jo-1', submittedAt: daysAgo(30) });
  jo.form_response.definition.fields.find((f) => f.id === 'f7').type = 'multiple_choice';
  jo.form_response.answers.push({ type: 'choice', choice: { label: "Yes, I'm a current member" }, field: { id: 'f7', type: 'multiple_choice', ref: 'existing' } });
  await typeform(jo);
  expect('Jo is recorded as an Existing member', () => eq(rowOf(at(7), 'Williamsburg', 'Unlimited')?.fields['Member Type'], 'Existing'));

  // ═══ DAY 0 · 9AM: first engine run ═══════════════════════════
  scenario('E1', 'First hourly run fills open spots', 'Williamsburg Unlimited has 2 open spots, Summer Pass 1, Williamsburg 4-Visit has a mistyped minimum of 500 (meant 50), Greenpoint 4-Visit has no signup link, LES is switched off.');
  const e1 = await engine('Day 0 9am');
  const invited1 = e1.logs.filter((l) => l.Event === 'Invited');
  const invitedWBU = invited1.filter((l) => l.Location === 'Williamsburg' && l.Membership === 'Unlimited').map((l) => l.Name).sort();
  expect('Williamsburg Unlimited: Cleo (manual rank 1) and Ava (longest weighted wait) are invited', () => eq(invitedWBU, ['Ava Romero', 'Cleo Ortiz']));
  expect('Summer Pass: Noor is invited', () => eq(statusOf(at(5), 'Greenpoint', 'Summer Pass'), 'Invited'));
  expect('Greenpoint 4-Visit (no signup link): nobody invited', () => eq(invited1.filter((l) => l.Location === 'Greenpoint' && l.Membership === '4-Visit').length, 0));
  expect('Lower East Side (switched off): nobody invited or nudged', () => eq(e1.logs.filter((l) => l.Location === 'Lower East Side').length, 0));
  expect('the mistyped minimum (500) only lets 10 invites out in one run', () => eq(invited1.filter((l) => l.Location === 'Williamsburg' && l.Membership === '4-Visit').length, 10));
  expect('…and the 10 are the 10 longest-waiting (Guest01–Guest10)', () => eq(invited1.filter((l) => l.Membership === '4-Visit').map((l) => l.Name).sort(), Array.from({ length: 10 }, (_, i) => `Guest${String(i + 1).padStart(2, '0')} Test`)));
  expect('a mistyped minimum is stopped, not just slowed (it would keep sending 10 invites every hour)', () => ({ ok: false, detail: 'The per-run cap limits the damage to 10/hour per queue but nothing pauses the queue or alerts staff; the daily report does not flag an implausible minimum.' }), 'decision');
  const holdsByPerson = {};
  for (const x of W().filter((x) => ['Invited', 'Tour Requested'].includes(x.fields.Status))) holdsByPerson[x.fields.Email] = (holdsByPerson[x.fields.Email] || 0) + 1;
  expect('nobody holds two spots at once (Cleo is on 2 lists, Guest01/03 on 2 lists)', () => eq(Object.values(holdsByPerson).filter((n) => n > 1).length, 0));
  const headsUps = e1.sent.filter(isHeadsUp);
  const huTo = headsUps.map((m) => toOf(m)[0]);
  expect('heads-up goes to the next in line: Ben, Jo, Maya, Leo, Zed (Williamsburg Unlimited), Sam (Greenpoint 4-Visit), Guest11, Guest12', () => eq([...huTo].sort(), [at(1), at(2), at(4), at(6), at(7), at(12), G(11), G(12)].sort()));
  expect('Maya gets ONE heads-up covering both her lists', () => eq(huTo.filter((x) => x === at(1)).length, 1));
  expect('nobody gets an invite and a heads-up in the same minute (Guest01, Guest03)', () => eq(huTo.filter((x) => [G(1), G(3)].includes(x)), []));
  expect('Leo (existing member) gets no heads-up for Greenpoint Unlimited, which is set to "Prioritise New Only"', () => hasNot(textOf(headsUps.find((m) => toOf(m)[0] === at(2))), /Greenpoint/));

  scenario('C1', 'Jack reviews the invite copy', 'Jack opens the invites Cleo (Unlimited), Guest02 (4-Visit) and Noor (Summer Pass) received and compares them with his approved copy.');
  const inv = (email) => inbox(email).find(isInvite);
  const cleoInv = inv(at(10));
  expect('subject: "Unlimited Membership Now Available at Akari Williamsburg"', () => eq(cleoInv?.subject, 'Unlimited Membership Now Available at Akari Williamsburg'));
  expect('inbox preview: "Your spot is available for a limited time"', () => eq(preheaderOf(cleoInv), 'Your spot is available for a limited time'));
  expect('opens "Hi Cleo,"', () => has(textOf(cleoInv), /^Hi Cleo,/));
  expect('Unlimited price $220/month', () => has(textOf(cleoInv), /\$220\/month/));
  expect('4-Visit price $140/month', () => has(textOf(inv(G(2))), /\$140\/month/));
  expect('Summer Pass (no price yet) falls back to "details, including pricing, … membership page"', () => has(textOf(inv(at(5))), /including pricing, can be found on our membership page/));
  expect('the membership page is a clickable link in the email', () => has(htmlOf(cleoInv), /<a [^>]*href="https:\/\/www\.akarisauna\.com\/membership"/));
  expect('deadline shown is 24 hours out', () => {
    const exp = new Date(rowOf(at(10), 'Williamsburg', 'Unlimited').fields['Invite Expires At']);
    return { ok: Math.abs(exp - Date.now() - DAY) < 10 * 60000, detail: `expires ${exp.toISOString()}` };
  });
  expect('four buttons in Jack\'s order: Sign up · Tour first · Not ready yet · No longer interested', () => eq([...htmlOf(cleoInv).matchAll(/a=(yes|tour|notnow|no)"[^>]*>([^<]+)</g)].map((x) => x[2]), ['Sign up', 'Tour first', 'Not ready yet', 'No longer interested']));
  expect('"Not ready yet" explains they stay on the list', () => has(textOf(cleoInv), /Not ready yet: \S+ \(we'll keep you on the waitlist/));
  expect('signed "Warmly, Akari team"', () => has(textOf(cleoInv), /Warmly,\nAkari team$/));
  expect('each button carries this person\'s own token', () => eq(tokenIn(cleoInv, 'yes'), rowOf(at(10), 'Williamsburg', 'Unlimited').fields['Invite Token']));

  scenario('C2', 'Jack reviews the heads-up copy', 'Jack compares the "nearly at the front" email with his draft (template 3), with the hold at 24h not 48h.');
  const benHU = inbox(at(12)).find(isHeadsUp);
  const mayaHU = inbox(at(1)).find(isHeadsUp);
  const zedHU = inbox(at(6)).find(isHeadsUp);
  expect('subject follows Jack\'s template: "You\'re Almost Up for an Unlimited Membership at Akari Williamsburg"', () => eq(benHU?.subject, "You're Almost Up for an Unlimited Membership at Akari Williamsburg"));
  expect('inbox preview: "A spot could open up any day now"', () => eq(preheaderOf(benHU), 'A spot could open up any day now'));
  expect('body follows Jack\'s wording ("close to the front of the line…")', () => has(textOf(benHU), /you're now close to the front of the line, and a spot could open up any day now/));
  expect('states the real hold: 24 hours (not 48)', () => has(textOf(benHU), /you'll have 24 hours to claim your spot/));
  expect('tells them how to come off the list', () => has(textOf(benHU), /let us know|reply/i));
  expect('signed "Warmly, Akari team"', () => has(textOf(benHU), /Warmly,\nAkari team$/));
  expect('Maya\'s combined heads-up names both memberships', () => has(textOf(mayaHU), /Unlimited[\s\S]*Daytime|Daytime[\s\S]*Unlimited/));
  expect('a name typed as HTML is shown as text, not rendered', () => ({ ok: htmlOf(zedHU).includes('&lt;b&gt;Zed') && !htmlOf(zedHU).includes('<b>Zed'), detail: (htmlOf(zedHU).match(/Hi [^,]*,/) || [''])[0] }));
  expect('the heads-up offers a one-click way off the list (Jack\'s {{remove_link}})', () => has(htmlOf(benHU), /a=remove|a=leave/), 'decision');

  // ═══ DAY 0 · candidates respond ═══════════════════════════════
  scenario('R1', 'Cleo signs up (Unlimited) — after her mail scanner pre-clicks every link', 'Cleo\'s work email security scanner opens all four links first. Then Cleo clicks "Sign up" and confirms.');
  for (const a of ['yes', 'tour', 'notnow', 'no']) await openLink(cleoInv, a);
  await settle(1500);
  expect('the scanner\'s clicks change nothing', () => eq(statusOf(at(10), 'Williamsburg', 'Unlimited'), 'Invited'));
  const view = await openLink(cleoInv, 'yes');
  expect('the link opens a confirmation page showing the hold deadline', () => has(view.page, /held until/));
  expect('the confirm button can\'t be double-submitted (button disables on submit)', () => has(view.page, /onsubmit="[^"]*disabled/));
  r = await confirm(cleoInv, 'yes');
  expect('confirming sends her straight to the Williamsburg Unlimited signup page', () => has(r.page, /url=https:\/\/app\.glofox\.test\/signup\/wb-unl/));
  expect('status → Signed Up', () => eq(statusOf(at(10), 'Williamsburg', 'Unlimited'), 'Signed Up'));
  expect('she is removed from her Williamsburg Daytime list automatically', () => eq(statusOf(at(10), 'Williamsburg', 'Daytime'), 'Removed'));
  const cleoConf = inbox(at(10)).find(isConfirmation);
  expect('confirmation subject: "Your Private Sign Up Link for Akari Williamsburg"', () => eq(cleoConf?.subject, 'Your Private Sign Up Link for Akari Williamsburg'));
  expect('confirmation preview: "Your Unlimited membership is ready for you"', () => eq(preheaderOf(cleoConf), 'Your Unlimited membership is ready for you'));
  expect('confirmation carries the private signup link', () => has(textOf(cleoConf), /https:\/\/app\.glofox\.test\/signup\/wb-unl/));
  expect('Unlimited wording: "we\'ll automatically remove you from any other Akari waitlists"', () => has(textOf(cleoConf), /automatically remove you from any other Akari waitlists/));

  scenario('R2', 'Ava wants a tour first', 'Ava clicks "Tour first" and writes "Weekday evenings after 6".');
  const avaInv = inv(at(11));
  r = await confirm(avaInv, 'tour', 'Weekday evenings after 6');
  expect('Ava is told her spot is held', () => has(r.page, /held for you/));
  expect('status → Tour Requested, notes saved', () => eq([statusOf(at(11), 'Williamsburg', 'Unlimited'), rowOf(at(11), 'Williamsburg', 'Unlimited').fields['Tour Notes']], ['Tour Requested', 'Weekday evenings after 6']));
  const tourMail = inbox(TEAM).find((m) => /^Tour Request: Ava Romero/.test(m.subject));
  expect('team alert: "Tour Request: Ava Romero at Akari Williamsburg"', () => eq(tourMail?.subject, 'Tour Request: Ava Romero at Akari Williamsburg'));
  expect('alert lists email, phone, waitlist date and preferred times', () => has(textOf(tourMail), /stan\+11@optimizewise\.org[\s\S]*\+17185550111[\s\S]*On the waitlist since[\s\S]*Weekday evenings after 6/));
  expect('alert reads naturally: "committing to an Unlimited membership"', () => has(textOf(tourMail), /committing to an Unlimited membership/));
  expect('alert tells staff exactly what to do after the tour (Send Now)', () => has(textOf(tourMail), /Send Now/));

  scenario('R3', 'Noor is not ready yet', 'Noor clicks "Not ready yet" and writes "Back in town in November".');
  r = await confirm(inv(at(5)), 'notnow', 'Back in town in November');
  expect('Noor is told she stays on the list', () => has(r.page, /still on the waitlist/));
  expect('status → Not Right Now with her reason', () => eq([statusOf(at(5), 'Greenpoint', 'Summer Pass'), rowOf(at(5), 'Greenpoint', 'Summer Pass').fields.Reason], ['Not Right Now', 'Back in town in November']));
  expect('Jack\'s copy promises "we\'ll check back in with you down the road" — something brings Noor back to Jack\'s attention later', () => ({ ok: false, detail: 'Not Right Now is a dead end: the engine never re-offers, and the daily report only shows the reason on the day it is given.' }), 'decision');

  scenario('R4', 'Guest02 is no longer interested', 'Guest02 clicks "No longer interested": "Too far from me".');
  await confirm(inv(G(2)), 'no', 'Too far from me');
  expect('status → No Longer Interested with reason', () => eq([statusOf(G(2), 'Williamsburg', '4-Visit'), rowOf(G(2), 'Williamsburg', '4-Visit').fields.Reason], ['No Longer Interested', 'Too far from me']));
  expect('no email is sent to them', () => eq(inbox(G(2)).filter((m) => !isInvite(m)).length, 0));

  scenario('R5', 'Guest03 signs up for 4-Visit, then leaves the Daytime list', 'Guest03 also waits for Williamsburg Daytime. After signing up they use the link in the confirmation to come off the other list.');
  await confirm(inv(G(3)), 'yes');
  const g3Conf = inbox(G(3)).find(isConfirmation);
  expect('4-Visit wording: stays on other waitlists, with a link to come off them', () => has(textOf(g3Conf), /You'll stay on any other Akari waitlists you've joined\. If you'd rather come off them, you can remove yourself here: \S+a=leave/));
  expect('they are still on the Daytime list until they choose', () => ({ ok: ['Waiting', 'Primed'].includes(statusOf(G(3), 'Williamsburg', 'Daytime')), detail: statusOf(G(3), 'Williamsburg', 'Daytime') }));
  const leaveView = await openLink(g3Conf, 'leave');
  expect('the "remove me" link opens a confirmation page first', () => has(leaveView.page, /Leave your other waitlists/));
  r = await confirm(g3Conf, 'leave');
  expect('after confirming: removed from Daytime; 4-Visit signup untouched', () => eq([statusOf(G(3), 'Williamsburg', 'Daytime'), statusOf(G(3), 'Williamsburg', '4-Visit')], ['Removed', 'Signed Up']));
  expect('the page says what they were removed from', () => has(r.page, /Daytime at Williamsburg/));

  scenario('R6', 'Guest04 says "not ready", then changes their mind within the hour', 'Guest04 clicks "Not ready yet", then goes back to the same email and clicks "Sign up".');
  await confirm(inv(G(4)), 'notnow', '');
  r = await confirm(inv(G(4)), 'yes');
  expect('the page does not wrongly say their hold "passed before we heard back"', () => hasNot(r.page, /passed before we heard back/));
  expect('the page tells them they\'re first in line for the next spot', () => has(r.page, /first in line/));
  expect('status → Warm (first in line)', () => eq(statusOf(G(4), 'Williamsburg', '4-Visit'), 'Warm'));

  scenario('R7', 'Three people click "Sign up" in the same second', 'Guest05, Guest06 and Guest07 confirm at the same moment (invites landed together at 9am). Airtable allows 5 requests a second and locks the base for 30s if exceeded.');
  const before7 = mock.state.rateViolations;
  const burst = await Promise.all([G(5), G(6), G(7)].map((e) => confirm(inv(e), 'yes', '', { wait: false })));
  timeline.push(`${dayLabel()} · burst of 3 replies → pages: ${burst.map((b) => `${b.status} “${(b.page.match(/<title>([^<·]*)/) || [])[1]?.trim()}”`).join(', ')}`);
  expect('nobody sees a raw n8n error — each gets the signup page or a friendly "try again in a minute"', () => ({ ok: burst.every((b) => (b.status === 200 && /url=https:\/\/app\.glofox/.test(b.page)) || (b.status === 503 && /Try again/.test(b.page))), detail: burst.map((b) => `${b.status}: ${b.page.slice(0, 80)}`).join(' | ') }));
  const busy = burst.filter((b) => b.status === 503);
  expect('the "busy" page retries by itself after a random 35–55s, so people caught in one burst don\'t all retry in the same second', () => ({ ok: busy.every((b) => /setTimeout\([\s\S]*Math\.random\(\)/.test(b.page)), detail: 'no jittered auto-retry on the busy page' }));
  await settle(40000);
  // Emulate that auto-retry: each busy page resubmits at its own moment, a few seconds apart.
  const tries = [];
  for (const b of busy) {
    let page = b.page;
    let n = 0;
    while (n < 3 && /Try again/.test(page)) {
      n++;
      ({ page } = await tryAgain(page));
      if (/Try again/.test(page)) await settle(40000);
    }
    tries.push(n);
    await sleep(3000);
  }
  if (busy.length) expect('everyone told "try again" gets through on the automatic retry', () => ({ ok: tries.every((n) => n === 1), detail: `attempts needed: ${tries.join(', ')}` }));
  await settle(busy.length ? 40000 : 3500);
  expect('all three are Signed Up', () => eq([G(5), G(6), G(7)].map((e) => statusOf(e, 'Williamsburg', '4-Visit')), ['Signed Up', 'Signed Up', 'Signed Up']));
  expect('each gets exactly one confirmation, with no "other waitlists" paragraph (they have none)', () => eq([G(5), G(6), G(7)].map((e) => inbox(e).filter(isConfirmation).length === 1 && !/other Akari waitlists/.test(textOf(inbox(e).find(isConfirmation)))), [true, true, true]));
  expect('anyone shown the signup page is recorded as Signed Up, even though Airtable was locked when they clicked', () => eq(burst.map((b, i) => (b.status === 200 ? statusOf([G(5), G(6), G(7)][i], 'Williamsburg', '4-Visit') : 'Signed Up')), ['Signed Up', 'Signed Up', 'Signed Up']));
  expect('Airtable\'s 5 requests/second limit was not exceeded', () => ({ ok: mock.state.rateViolations === before7, detail: `${mock.state.rateViolations - before7} burst(s) tripped Airtable's 30s lockout; handled gracefully (see checks above)` }), 'risk');

  scenario('R8', 'Guest08 double-clicks "Sign up"', 'Guest08 hits the confirm button twice in quick succession, then a third time a minute later.');
  const g8 = inv(G(8));
  await Promise.all([confirm(g8, 'yes', '', { wait: false }), sleep(300).then(() => confirm(g8, 'yes', '', { wait: false }))]);
  await settle(40000);
  expect('a fast double POST (bypassing the disabled button) still sends only one confirmation', () => ({ ok: inbox(G(8)).filter(isConfirmation).length === 1, detail: `${inbox(G(8)).filter(isConfirmation).length} confirmations sent` }), 'risk');
  const g8count = inbox(G(8)).filter(isConfirmation).length;
  r = await confirm(g8, 'yes');
  expect('a later click just re-opens signup — no new email, nothing changes', () => eq([inbox(G(8)).filter(isConfirmation).length, statusOf(G(8), 'Williamsburg', '4-Visit')], [g8count, 'Signed Up']));
  expect('…and the page still takes them to signup', () => has(r.page, /url=https:\/\/app\.glofox\.test\/signup\/wb-4v/));

  scenario('R9', 'Someone tampers with a link', 'A made-up token is posted to the confirm endpoint.');
  const snap = JSON.stringify(W());
  r = await confirm({ content: [{ type: 'text/html', value: '' }] }, 'yes');
  const r2 = await form({ t: 'deadbeef'.repeat(6), a: 'yes' });
  await settle(1500);
  expect('both are refused with "link has expired" (410)', () => eq([r.status, r2.status], [410, 410]));
  expect('no data changes', () => eq(JSON.stringify(W()), snap));

  // ═══ DAY 0 · staff actions ═══════════════════════════════════
  scenario('S1', 'Send Now with a bad key', 'Someone edits the Airtable button URL and the key is wrong.');
  const priya = rowOf(at(3), 'Lower East Side', 'Unlimited');
  r = await sendNow(priya.id, 'wrong-key');
  expect('refused (403) and nothing sent', () => eq([r.status, inbox(at(3)).length], [403, 0]));

  scenario('S2', 'Jack uses Send Now for an LES pre-opening member', 'LES is switched off, but Jack wants to invite Priya now. He clicks the button twice.');
  r = await sendNow(priya.id);
  expect('page: "Invite sent", with the hold deadline', () => has(r.page, /Invite sent[\s\S]*held until/));
  expect('Priya → Invited (source: Send Now)', () => eq([statusOf(at(3), 'Lower East Side', 'Unlimited'), rowOf(at(3), 'Lower East Side', 'Unlimited').fields['Invite Source']], ['Invited', 'Send Now']));
  const r2b = await sendNow(priya.id);
  expect('second click within 2 minutes is ignored ("Already sent")', () => has(r2b.page, /Already sent/));
  expect('Priya received exactly one invite', () => eq(inbox(at(3)).filter(isInvite).length, 1));
  expect('invite subject names the location: "…at Akari Lower East Side"', () => eq(inbox(at(3)).find(isInvite)?.subject, 'Unlimited Membership Now Available at Akari Lower East Side'));

  scenario('S3', 'Priya signs up but LES has no signup link yet', 'Priya clicks "Sign up"; the LES Capacity row has no Signup URL.');
  r = await confirm(inbox(at(3)).find(isInvite), 'yes');
  expect('Priya is told her spot is confirmed and the link will follow', () => has(r.page, /confirmed[\s\S]*signup link shortly/));
  expect('status → Signed Up', () => eq(statusOf(at(3), 'Lower East Side', 'Unlimited'), 'Signed Up'));
  expect('the log flags "SIGNUP URL MISSING" for staff', () => ({ ok: LOG().some((l) => l.fields.Email === at(3) && /SIGNUP URL MISSING/.test(l.fields.Detail || '')), detail: 'no flagged log row' }));

  // ═══ DAY 0 · evening report ═══════════════════════════════════
  scenario('D1', 'Jack reads the daily report', 'The team report arrives. Jack checks it covers today and points him at what needs action.');
  let mark = mails().length;
  await post('test-report', {});
  await settle();
  let rep = mails().slice(mark).find((m) => toOf(m).includes(TEAM));
  expect('one report email to the team', () => ({ ok: !!rep, detail: 'no report email' }));
  expect('needs attention: Greenpoint 4-Visit has no signup link', () => has(htmlOf(rep), /Greenpoint · 4-Visit: no Signup URL/));
  expect('needs attention: Priya signed up but needs her link sent manually', () => has(htmlOf(rep), /stan\+3@optimizewise\.org signed up[^<]*send it manually/));
  expect('signed-up count covers Cleo, Guest03, 05, 06, 07, 08 and Priya (7)', () => {
    const n = Number((htmlOf(rep).match(/Signed up<\/td><td[^>]*>(\d+)</) || [])[1]);
    return { ok: n === 7, detail: `report says ${n}` };
  });
  expect('reasons given today are listed (Guest02 and Noor)', () => ({ ok: /Too far from me/.test(htmlOf(rep)) && /Back in town in November/.test(htmlOf(rep)), detail: 'one or both reasons missing' }));
  const reportCron = buildMain().nodes.find((n) => n.type === 'n8n-nodes-base.scheduleTrigger' && /Report/.test(n.name))?.parameters.rule.interval[0].expression;
  expect('report is scheduled for 7:30am, before doors open (Jack\'s spec)', () => eq(reportCron, '30 7 * * *'));
  expect('report layout matches Jack\'s template 4 (Needs attention / Last 24 hours / By location)', () => has(htmlOf(rep), /Invites expiring in the next 24 hours/), 'decision');

  // ═══ DAY 1 ═══════════════════════════════════════════════════
  travel(25);
  scenario('E2', 'Next morning: unanswered holds time out, the line moves on', 'Guest01, Guest09, Guest10 never replied. Guest04 changed their mind yesterday and was told they\'re first in line.');
  const e2 = await engine('Day 1 10am');
  expect('Guest01, Guest09, Guest10 → Warm (1st timeout)', () => eq([G(1), G(9), G(10)].map((e) => [statusOf(e, 'Williamsburg', '4-Visit'), rowOf(e, 'Williamsburg', '4-Visit').fields['Timeout Count']]), [['Warm', 1], ['Warm', 1], ['Warm', 1]]));
  expect('Ava\'s tour hold does not time out', () => eq(statusOf(at(11), 'Williamsburg', 'Unlimited'), 'Tour Requested'));
  const inv2 = e2.logs.filter((l) => l.Event === 'Invited' && l.Membership === '4-Visit').map((l) => l.Email).sort();
  expect('Guest04 (told "first in line") is re-invited straight away', () => ({ ok: inv2.includes(G(4)), detail: `invited: ${inv2.join(', ')}` }));
  expect('people who simply ignored us (Guest01/09/10) wait out the 72h cool-down', () => eq(inv2.filter((e) => [G(1), G(9), G(10)].includes(e)), []));
  expect('Guest11 and Guest12 get their turn', () => ({ ok: inv2.includes(G(11)) && inv2.includes(G(12)), detail: `invited: ${inv2.join(', ')}` }));
  expect('Williamsburg Unlimited: no new invite while Cleo\'s signup awaits Jack\'s recount and Ava\'s tour holds the other spot', () => eq(e2.logs.filter((l) => l.Event === 'Invited' && l.Membership === 'Unlimited').length, 0));

  scenario('S4', 'Jack recounts and adds a spot; Guest09 replies late', 'Jack updates Williamsburg Unlimited: Active 39 (Cleo joined), Minimum 41. Guest09 finds yesterday\'s email and clicks "Sign up".');
  staffEditCapacity('Williamsburg · Unlimited', { 'Active Members': 39, 'Minimum Members': 41 });
  r = await confirm(inv(G(9)), 'yes');
  expect('Guest09 is told the hold passed and they\'re first in line', () => has(r.page, /first in line/));
  expect('Guest09 stays Warm, reply time recorded', () => eq([statusOf(G(9), 'Williamsburg', '4-Visit'), !!rowOf(G(9), 'Williamsburg', '4-Visit').fields['Response At']], ['Warm', true]));
  const e3 = await engine('Day 1 11am');
  const inv3 = e3.logs.filter((l) => l.Event === 'Invited').map((l) => l.Name);
  expect('the new Williamsburg Unlimited spot goes to Ben (existing member, 121 days waiting)', () => eq(e3.logs.filter((l) => l.Event === 'Invited' && l.Membership === 'Unlimited').map((l) => l.Name), ['Ben Fischer']));
  expect('Guest09 (late reply) is re-invited; Guest10 (no reply) is not', () => ({ ok: inv3.includes('Guest09 Test') && !inv3.includes('Guest10 Test'), detail: `invited: ${inv3.join(', ')}` }));

  scenario('S5', 'After Ava\'s tour, Jack sends her the invite again', 'Ava loved the tour. Jack presses Send Now on her row; Ava uses the new email.');
  r = await sendNow(rowOf(at(11), 'Williamsburg', 'Unlimited').id);
  expect('page: "Invite sent"', () => has(r.page, /Invite sent/));
  const oldView = await openLink(avaInv, 'yes');
  expect('the old invite\'s links stop working (410)', () => eq(oldView.status, 410));
  const avaNew = inbox(at(11)).filter(isInvite).at(-1);
  r = await confirm(avaNew, 'yes');
  expect('Ava → Signed Up, sent to signup', () => ({ ok: statusOf(at(11), 'Williamsburg', 'Unlimited') === 'Signed Up' && /wb-unl/.test(r.page), detail: statusOf(at(11), 'Williamsburg', 'Unlimited') }));

  scenario('S6', 'A new member fills in the form again', 'Cleo (signed up yesterday) fills in the Typeform again out of habit, ticking Williamsburg Unlimited.');
  await typeform(typeformPayload({ email: at(10), first: 'Cleo', last: 'Ortiz', locations: ['Williamsburg'], memberships: ['Unlimited'], token: 'cleo-again', submittedAt: iso(Date.now()) }));
  expect('she is not put back on the waitlist for the membership she just bought', () => eq(rowsOf(at(10)).filter((x) => x.fields.Membership === 'Unlimited' && x.fields.Status === 'Waiting').length, 0));

  // ═══ DAY 4 ═══════════════════════════════════════════════════
  travel(72);
  scenario('E4', 'Day 4: cool-downs end, repeat no-shows drop out', 'Three days later. Guest09 ignored their second invite. Ben ignored his.');
  const e4 = await engine('Day 4');
  expect('Guest09 (2nd timeout) → No Reply, out of the line', () => eq([statusOf(G(9), 'Williamsburg', '4-Visit'), rowOf(G(9), 'Williamsburg', '4-Visit').fields['Timeout Count']], ['No Reply', 2]));
  expect('Guest10 (cool-down over) is invited again', () => eq(statusOf(G(10), 'Williamsburg', '4-Visit'), 'Invited'));
  expect('Ben timed out → Warm; the Williamsburg Unlimited spot goes to Maya (Ben is cooling down)', () => eq([statusOf(at(12), 'Williamsburg', 'Unlimited'), e4.logs.filter((l) => l.Event === 'Invited' && l.Membership === 'Unlimited').map((l) => l.Name)], ['Warm', ['Maya Chen']]));
  const mayaInv = inbox(at(1)).filter(isInvite).at(-1);
  await confirm(mayaInv, 'tour', 'Saturday morning');
  expect('Maya asks for a tour; the alert reads "an Unlimited membership"', () => has(textOf(inbox(TEAM).filter((m) => /Tour Request: Maya/.test(m.subject)).at(-1)), /committing to an Unlimited membership/));

  // ═══ DAY 12 ══════════════════════════════════════════════════
  travel(24 * 8);
  scenario('D2', 'Day 12 report: what has been forgotten?', 'Nobody followed up on Maya\'s tour. Noor said "not ready" 12 days ago.');
  mark = mails().length;
  await post('test-report', {});
  await settle();
  rep = mails().slice(mark).find((m) => toOf(m).includes(TEAM));
  expect('flags Maya\'s tour hold as stale (over 7 days)', () => has(htmlOf(rep), /Maya Chen \(Unlimited at Williamsburg\) has had a tour hold since/));
  expect('flags Greenpoint Summer Pass: open spot, nobody left to invite', () => has(htmlOf(rep), /Greenpoint · Summer Pass: 1 open spot\(s\) but nobody left on the waitlist/));
  expect('lists "Not ready yet" people due a check-in (Noor)', () => has(htmlOf(rep), /Noor/), 'decision');

  scenario('X1', 'The hourly run starts just as people reply', 'Jack uses Send Now for Jo and Leo. Their replies land in the same second the hourly engine starts — more than Airtable\'s 5 requests/second, so the base locks for 30s.');
  await sendNow(rowOf(at(7), 'Williamsburg', 'Unlimited').id);
  await sendNow(rowOf(at(2), 'Williamsburg', 'Unlimited').id);
  const x1Alerts = inbox(TEAM).filter((m) => m.subject.startsWith('[Waitlist automation]')).length;
  const x1Trips = mock.state.rateViolations;
  const [, joR, leoR] = await Promise.all([
    post('glofox-end-date', {}),
    sleep(150).then(() => confirm(inbox(at(7)).filter(isInvite).at(-1), 'yes', '', { wait: false })),
    sleep(250).then(() => confirm(inbox(at(2)).filter(isInvite).at(-1), 'notnow', 'After the holidays', { wait: false })),
  ]);
  timeline.push(`${dayLabel()} · collision: engine + 2 replies → ${mock.state.rateViolations - x1Trips} lockout(s); pages ${joR.status}, ${leoR.status}`);
  await settle(40000);
  for (const resp of [joR, leoR]) {
    let page = resp.page;
    for (let n = 0; n < 3 && /Try again/.test(page); n++) {
      ({ page } = await tryAgain(page));
      await settle();
    }
  }
  await settle();
  expect('neither person sees a raw error', () => ({ ok: [joR, leoR].every((x) => x.status === 200 || (x.status === 503 && /Try again/.test(x.page))), detail: `${joR.status}, ${leoR.status}` }));
  expect('Jo ends Signed Up with one confirmation; Leo ends Not Right Now with his reason', () => eq([statusOf(at(7), 'Williamsburg', 'Unlimited'), inbox(at(7)).filter(isConfirmation).length, statusOf(at(2), 'Williamsburg', 'Unlimited'), rowOf(at(2), 'Williamsburg', 'Unlimited').fields.Reason], ['Signed Up', 1, 'Not Right Now', 'After the holidays']));
  const x1New = inbox(TEAM).filter((m) => m.subject.startsWith('[Waitlist automation]')).slice(x1Alerts);
  expect('any alert from the collision tells Jack it was a temporary rate limit needing no action', () => ({ ok: x1New.every((m) => /temporary rate limit/.test(m.subject + textOf(m))), detail: x1New.map((m) => m.subject).join(' | ') }));
  const x1 = await engine('Day 12, next hour');
  expect('the next hourly run completes normally', () => ({ ok: !inbox(TEAM).filter((m) => m.subject.startsWith('[Waitlist automation]')).slice(x1Alerts + x1New.length).length, detail: 'another alert fired' }));
  timeline.push(`${dayLabel()} · follow-up run sent ${x1.sent.length} email(s)`);

  // ═══ Whole-run integrity ═════════════════════════════════════
  scenario('I1', 'Data integrity across the whole run', 'What Jack would spot-check in Airtable and the inbox.');
  const badSelects = [];
  for (const [t, fields] of Object.entries(SELECTS)) {
    for (const rec of mock.table(t)) for (const [f, allowed] of Object.entries(fields)) if (rec.fields[f] != null && !allowed.includes(rec.fields[f])) badSelects.push(`${t}.${f}="${rec.fields[f]}"`);
  }
  expect('every dropdown value written is one Airtable already has (no stray options)', () => eq(badSelects, []));
  expect('every Invited row has a 48-character token and a deadline', () => eq(W().filter((x) => x.fields.Status === 'Invited' && !(/^[a-f0-9]{48}$/.test(x.fields['Invite Token'] || '') && x.fields['Invite Expires At'])).map((x) => x.fields.Name), []));
  const holds = {};
  for (const x of W().filter((x) => ['Invited', 'Tour Requested'].includes(x.fields.Status))) holds[x.fields.Email] = (holds[x.fields.Email] || 0) + 1;
  expect('nobody holds two spots at once', () => eq(Object.entries(holds).filter(([, n]) => n > 1), []));
  expect('every Signed Up row has a matching "Signed Up" log', () => eq(W().filter((x) => x.fields.Status === 'Signed Up' && !LOG().some((l) => l.fields.Event === 'Signed Up' && l.fields['Entry ID'] === x.id)).map((x) => x.fields.Name), []));
  const junk = mails().flatMap((m) => [m.subject, textOf(m), htmlOf(m)].filter((s) => /\bundefined\b|\bNaN\b|\[object Object\]|__TOKEN__|\bnull\b/.test(s)).map(() => `${toOf(m)[0]}: ${m.subject}`));
  expect('no email contains "undefined", "NaN", "null", "[object Object]" or a placeholder token', () => eq([...new Set(junk)], []));
  expect('every email has both a plain-text and an HTML version, and a subject', () => eq(mails().filter((m) => !m.subject || !textOf(m) || !htmlOf(m)).length, 0));
  const alerts = inbox(TEAM).filter((m) => m.subject.startsWith('[Waitlist automation]'));
  expect('the only error alerts all week: the deliberately broken form, plus "temporary rate limit" notices', () => eq(alerts.filter((m) => !/missing email, location, membership/.test(m.subject) && !/temporary rate limit/.test(textOf(m))).map((m) => m.subject), []));
  expect('everyone marked Invited actually received an invite email with their current link', () => eq(W().filter((x) => x.fields.Status === 'Invited' && !inbox(x.fields.Email).some((m) => isInvite(m) && tokenIn(m, 'yes') === x.fields['Invite Token'])).map((x) => x.fields.Name), []));
  expect('everyone marked Signed Up who has a signup link was emailed it', () => eq(W().filter((x) => x.fields.Status === 'Signed Up' && x.fields.Location !== 'Lower East Side' && !inbox(x.fields.Email).some(isConfirmation)).map((x) => x.fields.Name), []));
  expect('no rejected Airtable/SendGrid calls (bad formulas, >10-row batches, bad payloads)', () => eq(mock.state.errors, []));
  expect('no Airtable rate-limit hits all week', () => ({ ok: mock.state.rateViolations === 0, detail: `${mock.state.rateViolations} request(s) got HTTP 429` }), 'risk');
} catch (e) {
  if (!cur) scenario('X', 'Harness', '');
  cur.checks.push({ desc: 'run completed', status: 'FAIL', detail: e.stack });
  console.log(`✗ harness: ${e.stack}`);
} finally {
  await stack.stop();
}

// ── Report ──────────────────────────────────────────────────────
const all = scenarios.flatMap((s) => s.checks.map((c) => ({ ...c, s })));
const n = (st) => all.filter((c) => c.status === st).length;
const md = [];
md.push(`# Akari Waitlist · UAT run \`${LABEL}\``, '');
md.push(`Run ${new Date().toISOString()} · n8n ${stack.version} · real workflow JSON, mock Airtable + SendGrid · ${mock.state.requests.length} API calls · ${mails().length} emails`, '');
md.push(`**${n('PASS')} pass · ${n('FAIL')} fail · ${n('RISK')} risk · ${n('OPEN')} open decision** across ${scenarios.length} scenarios`, '');
md.push('Legend: ✅ pass · ❌ fail (defect) · ⚠️ risk (works, residual risk) · ❓ open (needs a product decision)', '');
const flagged = all.filter((c) => c.status !== 'PASS');
if (flagged.length) {
  md.push('## Findings', '', '| | Scenario | Check | Detail |', '|---|---|---|---|');
  for (const c of flagged) md.push(`| ${{ FAIL: '❌', RISK: '⚠️', OPEN: '❓' }[c.status]} | ${c.s.id} | ${c.desc.replace(/\|/g, '\\|')} | ${String(c.detail).replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 300)} |`);
  md.push('');
}
md.push('## Timeline', '', ...timeline.map((t) => `- ${t}`), '');
md.push('## Scenarios', '');
for (const s of scenarios) {
  md.push(`### ${s.id} · ${s.title}  _(${s.when})_`, '', `> ${s.story}`, '');
  for (const c of s.checks) md.push(`- ${{ PASS: '✅', FAIL: '❌', RISK: '⚠️', OPEN: '❓' }[c.status]} ${c.desc}${c.detail ? ` — _${String(c.detail).replace(/\n/g, ' ').slice(0, 300)}_` : ''}`);
  md.push('');
}
md.push('## Final Airtable state (Waitlist)', '', '| Name | Email | Queue | Status | Timeouts | Source |', '|---|---|---|---|---|---|');
for (const x of W()) md.push(`| ${String(x.fields.Name).replace(/[<>|]/g, '')} | ${x.fields.Email} | ${x.fields.Location} · ${x.fields.Membership} | ${x.fields.Status} | ${x.fields['Timeout Count'] ?? 0} | ${x.fields['Invite Source'] || ''} |`);
md.push('', '## Inbox (every email sent, in order)', '');
mails().forEach((m, i) => {
  md.push(`<details><summary>${i + 1}. <b>${m.subject.replace(/</g, '&lt;')}</b> → ${toOf(m).join(', ')}</summary>`, '', '```text', `Preview: ${preheaderOf(m) || '(none)'}`, '', textOf(m), '```', '</details>', '');
});
const out = join(ROOT, 'test/uat/reports', `uat-${LABEL}.md`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, md.join('\n'));
writeFileSync(out.replace(/\.md$/, '.json'), JSON.stringify({ label: LABEL, counts: { pass: n('PASS'), fail: n('FAIL'), risk: n('RISK'), open: n('OPEN') }, scenarios, timeline, rateLimitTrips: mock.state.violations, alerts: inbox(TEAM).filter((m) => m.subject.startsWith('[Waitlist automation]')).map((m) => m.subject) }, null, 1));
console.log(`\n${n('PASS')} pass · ${n('FAIL')} fail · ${n('RISK')} risk · ${n('OPEN')} open → ${out}`);
if (n('FAIL')) {
  console.log('\n--- n8n log (tail) ---\n', stack.log().split('\n').slice(-30).join('\n'));
  process.exitCode = 1;
}
