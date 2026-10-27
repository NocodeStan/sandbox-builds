// End-to-end: imports the real workflow JSON into a real n8n, points it at mock Airtable/SendGrid,
// and drives every lane through its webhooks.
// Usage: NODE24=/path/to/node24 N8N_BIN=/path/to/node_modules/n8n/bin/n8n node test/e2e/run-e2e.mjs
import assert from 'node:assert/strict';
import { typeformPayload } from '../fixtures.mjs';
import { CAL_SECRET, CAL_URL, sleep, startStack, waitFor } from './stack.mjs';

const SECRET = 'e2e-secret-123';
const stack = await startStack({ secret: SECRET });
const { BASE, mock, post, form } = stack;
console.log('• importing credentials + workflow into n8n', stack.version);

// ── Mock services + seed data ─────────────────────────────────
const HOUR = 3600000;
const ago = (days) => new Date(Date.now() - days * 24 * HOUR).toISOString();
const SIGNUP = (slug) => `https://app.glofox.test/signup/${slug}`;
mock.seed('Capacity', [
  { Queue: 'Williamsburg · Unlimited', Location: 'Williamsburg', Membership: 'Unlimited', 'Minimum Members': 12, 'Active Members': 10, Enabled: true, 'Signup URL': SIGNUP('wb-unl') },
  { Queue: 'Williamsburg · Daytime', Location: 'Williamsburg', Membership: 'Daytime', 'Minimum Members': 5, 'Active Members': 5, Enabled: true, 'Signup URL': SIGNUP('wb-day') },
  { Queue: 'Greenpoint · Daytime', Location: 'Greenpoint', Membership: 'Daytime', 'Minimum Members': 0, 'Active Members': 0, Enabled: true, 'Signup URL': SIGNUP('gp-day') },
  { Queue: 'Lower East Side · Unlimited', Location: 'Lower East Side', Membership: 'Unlimited', 'Minimum Members': 50, 'Active Members': 0, Enabled: false },
]);
const person = (name, fields) => ({ Name: name, Email: `${name.toLowerCase()}@example.com`, Location: 'Williamsburg', Membership: 'Unlimited', 'Member Type': 'New', Status: 'Waiting', 'Timeout Count': 0, ...fields });
const [alex, blair, casey, dana, alexDaytime] = mock.seed('Waitlist', [
  person('Alex', { 'Joined At': ago(60) }), // weighted 180
  person('Blair', { 'Joined At': ago(100), 'Member Type': 'Existing' }), // weighted 100
  person('Casey', { 'Joined At': ago(30) }), // weighted 90
  person('Dana', { 'Joined At': ago(1), 'Manual Rank': 1 }), // manual override
  person('Alex', { 'Joined At': ago(60), Membership: 'Daytime', Status: 'Not Right Now' }),
]);
// 250 Greenpoint entries, seeded newest-first: the 10 longest-waiting sit on the LAST page, so a
// pagination failure would prime the wrong people.
const bulk = mock.seed('Waitlist', Array.from({ length: 250 }, (_, i) => person(`Bulk${String(i).padStart(3, '0')}`, { Location: 'Greenpoint', Membership: 'Daytime', 'Joined At': ago(1 + i) })));
const oldestBulk = bulk.slice(-10).map((r) => r.id).sort();

const results = [];
async function step(name, fn) {
  await sleep(1200); // keep executions from overlapping so rate-limit checks measure a single execution
  const t = Date.now();
  try {
    await fn();
    results.push(['PASS', name, Date.now() - t]);
    console.log(`  ✓ ${name}`);
  } catch (e) {
    results.push(['FAIL', name, Date.now() - t, e.message]);
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}
const get = (id) => mock.table('Waitlist').find((r) => r.id === id);
const logs = (event) => mock.table('Activity Log').filter((r) => r.fields.Event === event);
const emailsTo = (addr) => mock.state.emails.filter((m) => m.personalizations[0].to.some((t) => t.email === addr));
const tokenOf = (id) => get(id).fields['Invite Token'];

try {
  await stack.ready();
  console.log('• n8n is up with the workflow published\n');

  await step('Intake: Typeform submission → one row per location × membership, logged', async () => {
    const r = await post('intake', typeformPayload({ locations: ['Williamsburg', 'LES'], memberships: ['Unlimited', 'Daytime'], submittedAt: ago(1) }));
    assert.equal(r.status, 200, await r.text());
    await waitFor(() => logs('Joined').length === 4, 'intake rows + logs');
    const jane = mock.table('Waitlist').filter((x) => x.fields.Email === 'jane.doe@example.com');
    assert.equal(jane.length, 4);
    assert.ok(jane.every((x) => x.fields.Status === 'Waiting' && x.fields.Name === 'Jane Doe' && x.fields['Entry Source'] === 'Typeform'));
    assert.equal(logs('Joined').length, 4);
  });

  await step('Intake: resubmitting the same form creates no duplicates', async () => {
    const r = await post('intake', typeformPayload({ locations: ['Williamsburg'], memberships: ['Unlimited'], token: 'tok-again', submittedAt: ago(1) }));
    assert.equal(r.status, 200, 'duplicates are acknowledged so Typeform does not retry');
    await sleep(1500);
    assert.equal(mock.table('Waitlist').filter((x) => x.fields.Email === 'jane.doe@example.com').length, 4);
  });

  await step('Intake: an unprocessable submission returns an error to Typeform and emails an alert (never silently dropped)', async () => {
    const r = await post('intake', { event_type: 'form_response', form_response: { token: 'broken', answers: [] } });
    assert.ok(r.status >= 500, `expected 5xx, got ${r.status}`);
    assert.equal(logs('Joined').length, 4);
    const alert = await waitFor(() => mock.state.emails.find((m) => m.subject.startsWith('[Waitlist automation]')), 'error alert email');
    assert.match(alert.subject, /missing email, location, membership/);
    assert.match(alert.content[1].value, /Parse Typeform/);
  });

  await step('Engine: fills the gap (manual rank first, then weighted wait), primes the next in line, paginates 250+ rows', async () => {
    const r = await post('glofox-end-date', {});
    assert.equal(r.status, 200, await r.text());
    await waitFor(() => logs('Invited').length === 2 && logs('Primed').length >= 14, 'engine actions');
    assert.deepEqual([get(dana.id).fields.Status, get(alex.id).fields.Status], ['Invited', 'Invited']);
    assert.equal(get(casey.id).fields.Status, 'Primed');
    assert.equal(get(blair.id).fields.Status, 'Primed');
    assert.match(tokenOf(alex.id), /^[a-f0-9]{48}$/);
    const primedBulk = mock.table('Waitlist').filter((x) => x.fields.Location === 'Greenpoint' && x.fields.Status === 'Primed').map((x) => x.id).sort();
    assert.deepEqual(primedBulk, oldestBulk);
    const janePrimed = mock.table('Waitlist').filter((x) => x.fields.Email === 'jane.doe@example.com' && x.fields.Status === 'Primed');
    assert.equal(janePrimed.length, 2, 'Jane primed on both Williamsburg queues');
    await waitFor(() => emailsTo('jane.doe@example.com').length === 1, 'one combined heads-up for Jane');
    assert.equal(emailsTo('alex@example.com').length, 1);
    assert.match(emailsTo('alex@example.com')[0].subject, /Unlimited Membership Now Available at Akari Williamsburg/);
    assert.ok(emailsTo('alex@example.com')[0].content[1].value.includes(`respond?t=${tokenOf(alex.id)}&amp;a=yes`), 'emailed link carries the stored token');
    assert.notEqual(tokenOf(alex.id), tokenOf(dana.id));
    assert.doesNotMatch(JSON.stringify(mock.state.emails), /__TOKEN__/);
    assert.equal(logs('Primed').length, 14, '3 + Jane on Daytime + 10 Greenpoint');
    await waitFor(() => mock.state.emails.length === 16, 'error alert + 2 invites + 13 heads-ups (Jane gets one combined)');
  });

  await step('Engine is idempotent: an immediate second run sends nothing new', async () => {
    const before = mock.state.emails.length;
    const r = await post('glofox-end-date', {});
    assert.equal(r.status, 200);
    await sleep(4000);
    assert.equal(mock.state.emails.length, before);
    assert.equal(logs('Invited').length, 2);
  });

  await step('Response link (GET) only shows a confirmation page — no state change', async () => {
    const r = await fetch(`${BASE}/respond?t=${tokenOf(alex.id)}&a=yes`);
    const html = await r.text();
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.ok(html.includes(`action="${BASE}/respond-confirm"`), 'confirmation form posts to the respond-confirm webhook');
    assert.equal(get(alex.id).fields.Status, 'Invited');
  });

  await step('Yes on Unlimited → Signed Up, sent to Glofox signup, removed from other waitlists, confirmation email', async () => {
    const r = await form({ t: tokenOf(alex.id), a: 'yes' });
    const html = await r.text();
    assert.equal(r.status, 200);
    assert.match(html, /url=https:\/\/app\.glofox\.test\/signup\/wb-unl/);
    await waitFor(() => get(alexDaytime.id).fields.Status === 'Removed', 'Alex removed from Daytime');
    assert.equal(get(alex.id).fields.Status, 'Signed Up');
    await waitFor(() => emailsTo('alex@example.com').length === 2, 'confirmation email');
    const conf = emailsTo('alex@example.com')[1];
    assert.match(conf.content[1].value, /wb-unl/);
    assert.match(conf.content[0].value, /automatically remove you from any other Akari waitlists/);
    assert.equal(logs('Signed Up').length, 1);
  });

  await step('Tour request → spot held (Tour Requested), team alerted with preferred times', async () => {
    const r = await form({ t: tokenOf(dana.id), a: 'tour', reason: 'Saturday 10am' });
    assert.equal(r.status, 200);
    await waitFor(() => get(dana.id).fields.Status === 'Tour Requested', 'Dana tour requested');
    assert.equal(get(dana.id).fields['Tour Notes'], 'Saturday 10am');
    await waitFor(() => emailsTo('team@YOUR-DOMAIN.com').some((m) => /Tour Request: Dana/.test(m.subject)), 'team alert');
  });

  await step('Send Now: wrong key is refused', async () => {
    const r = await fetch(`${BASE}/send-now?id=${casey.id}&k=wrong`);
    assert.equal(r.status, 403);
    assert.equal(get(casey.id).fields.Status, 'Primed');
  });

  await step('Send Now: invites a specific person immediately even though the queue has no gap', async () => {
    const r = await fetch(`${BASE}/send-now?id=${casey.id}&k=${SECRET}`);
    const html = await r.text();
    assert.equal(r.status, 200, html);
    assert.match(html, /Invite sent/);
    await waitFor(() => get(casey.id).fields.Status === 'Invited', 'Casey invited');
    assert.equal(get(casey.id).fields['Invite Source'], 'Send Now');
    await waitFor(() => emailsTo('casey@example.com').length === 2, 'Casey invite email');
  });

  await step('Timeout: expired hold → Warm; staff recount + higher minimum → chain advances to the next person', async () => {
    get(casey.id).fields['Invite Expires At'] = new Date(Date.now() - HOUR).toISOString();
    const cap = mock.table('Capacity')[0];
    Object.assign(cap.fields, { 'Minimum Members': 13, 'Active Members': 11, 'Active Updated At': new Date().toISOString() });
    await post('glofox-end-date', {});
    await waitFor(() => get(casey.id).fields.Status === 'Warm' && get(blair.id).fields.Status === 'Invited', 'Casey warm, Blair invited');
    assert.equal(get(casey.id).fields['Timeout Count'], 1);
    await waitFor(() => logs('Timed Out').length === 1, 'timeout logged (written just after the row update)');
  });

  await step('Late reply after the hold expired → stays Warm with priority, told they are first in line', async () => {
    const r = await form({ t: tokenOf(casey.id), a: 'yes' });
    assert.match(await r.text(), /first in line/);
    await waitFor(() => logs('Late Reply').length === 1, 'late reply logged');
    assert.equal(get(casey.id).fields.Status, 'Warm');
    assert.ok(get(casey.id).fields['Response At']);
  });

  await step('Not right now / No longer interested → buckets with reasons', async () => {
    await form({ t: tokenOf(blair.id), a: 'notnow', reason: 'Travelling until November' });
    await waitFor(() => get(blair.id).fields.Status === 'Not Right Now', 'Blair not right now');
    assert.equal(get(blair.id).fields.Reason, 'Travelling until November');
  });

  await step('Tampered or unknown token → 410, nothing changes', async () => {
    const before = JSON.stringify(mock.table('Waitlist'));
    const r = await form({ t: 'deadbeef'.repeat(6), a: 'yes' });
    assert.equal(r.status, 410);
    await sleep(1200);
    const r2 = await form({ t: '', a: 'yes' });
    assert.equal(r2.status, 410);
    await sleep(1500);
    assert.equal(JSON.stringify(mock.table('Waitlist')), before);
  });

  await step('Daily report → one email to the team with counts, conversion and queue snapshot', async () => {
    const before = mock.state.emails.length;
    const r = await post('test-report', {});
    assert.equal(r.status, 200, await r.text());
    await waitFor(() => mock.state.emails.length === before + 1, 'report email');
    const rep = mock.state.emails.at(-1);
    assert.match(rep.subject, /^Waitlist summary/);
    const html = rep.content[1].value;
    assert.match(html, /Signed up<\/td><td[^>]*>1</);
    assert.match(html, /Williamsburg · Unlimited/);
    assert.match(html, /Travelling until November/);
  });

  await step('Tour first with a Cal.com link → candidate sent to their location\'s booking page, pre-filled and tagged with their row', async () => {
    const r = await form({ t: tokenOf(dana.id), a: 'tour' });
    const html = await r.text();
    assert.equal(r.status, 200);
    assert.ok(html.includes(`url=${CAL_URL}?name=Dana&amp;email=dana%40example.com&amp;metadata%5Bentry%5D=${dana.id}`), html.slice(0, 400));
    const view = await (await fetch(`${BASE}/respond?t=${tokenOf(dana.id)}&a=tour`)).text();
    assert.match(view, /Choose a tour time/);
    assert.doesNotMatch(view, /<textarea/);
  });

  const calHook = (k, body) => fetch(`${BASE}/tour-booking?k=${k}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  await step('Cal.com booking → Tour At recorded on the row; a wrong webhook key is refused', async () => {
    const start = new Date(Date.now() + 26 * HOUR).toISOString();
    const bad = await calHook('wrong', { triggerEvent: 'BOOKING_CREATED', payload: { startTime: start, metadata: { entry: dana.id } } });
    assert.equal(bad.status, 403);
    await sleep(1500);
    const r = await calHook(CAL_SECRET, { triggerEvent: 'BOOKING_CREATED', payload: { uid: 'bk-1', startTime: start, metadata: { entry: dana.id }, attendees: [{ email: 'dana@example.com' }] } });
    assert.equal(r.status, 200);
    await waitFor(() => get(dana.id).fields['Tour At'] === start, 'Tour At written');
    await waitFor(() => logs('Tour Booked').length === 1, 'Tour Booked logged');
  });

  await step('48h after the tour with no sign-up link sent → hold released (Not Right Now)', async () => {
    get(dana.id).fields['Tour At'] = new Date(Date.now() - 49 * HOUR).toISOString();
    await post('glofox-end-date', {});
    await waitFor(() => get(dana.id).fields.Status === 'Not Right Now', 'Dana released');
    assert.match(get(dana.id).fields.Reason, /no sign-up link sent within 48h/);
    await waitFor(() => logs('Tour Released').length === 1, 'Tour Released logged');
  });

  await step('Send Sign-up Link (staff button) → Signed Up, confirmation with the Glofox link; wrong key and missing Signup URL refused', async () => {
    assert.equal((await fetch(`${BASE}/send-signup?id=${dana.id}&k=wrong`)).status, 403);
    await sleep(1500);
    const before = emailsTo('dana@example.com').length;
    const r = await fetch(`${BASE}/send-signup?id=${dana.id}&k=${SECRET}`);
    const html = await r.text();
    assert.equal(r.status, 200, html);
    assert.match(html, /Sign-up link sent/);
    await waitFor(() => get(dana.id).fields.Status === 'Signed Up', 'Dana signed up');
    await waitFor(() => emailsTo('dana@example.com').length === before + 1, 'confirmation email');
    const m = emailsTo('dana@example.com').at(-1);
    assert.equal(m.subject, 'Your Private Sign Up Link for Akari Williamsburg');
    assert.match(m.content[0].value, /wb-unl/);
    await waitFor(() => logs('Signed Up').some((l) => l.fields.Source === 'Admin'), 'admin signup logged');
    await sleep(1500);
    const [les] = mock.seed('Waitlist', [person('Lesley', { Location: 'Lower East Side', 'Joined At': ago(3) })]);
    const noUrl = await fetch(`${BASE}/send-signup?id=${les.id}&k=${SECRET}`);
    assert.equal(noUrl.status, 409);
  });

  await step('Airtable limits respected: no 429s, no >10-record batches, no bad formulas or payloads', async () => {
    assert.equal(mock.state.rateViolations, 0, `${mock.state.rateViolations} rate-limit violations:\n${JSON.stringify(mock.state.violations, null, 1)}`);
    assert.deepEqual(mock.state.errors, []);
  });
} catch (e) {
  results.push(['FAIL', 'harness', 0, e.message]);
  console.log(`✗ ${e.message}`);
} finally {
  await stack.stop();
}

const failed = results.filter((r) => r[0] === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} end-to-end checks passed · ${mock.state.requests.length} API calls · ${mock.state.emails.length} emails`);
if (failed.length) {
  console.log('\n--- n8n log (tail) ---\n', stack.log().split('\n').slice(-60).join('\n'));
  process.exitCode = 1;
}
