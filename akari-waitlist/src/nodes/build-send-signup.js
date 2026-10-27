// @include core
// @include email
// @include pages
// Staff action (Airtable button), usually after a tour: email this person their private sign-up link and
// mark them Signed Up, exactly as if they'd pressed "Sign up" themselves.
const reply = (status, title, body, actions = []) => [{ json: { status, page: htmlPage(title, body), actions } }];
const rec = $('Get Entry for Send Sign-up Link').first().json;
const lookupFailed = ['Find Entries by Email (sign-up link)', 'Find Queue Settings (sign-up link)']
  .some((n) => $(n).all().some((i) => i.json.error));

if ((rec && Array.isArray(rec.errors)) || lookupFailed) {
  return reply(503, 'Airtable is busy', '<p>Airtable is briefly limiting requests. Nothing was sent — wait a minute and press the button again.</p>');
}
if (!rec || !rec.id || !rec.fields) return reply(404, 'Entry not found', '<p>That waitlist entry could not be found. It may have been deleted.</p>');
const e = normEntry(rec);
if (!e.email) return reply(422, 'No email address', `<p>${esc(e.name || e.id)} has no email address, so nothing was sent.</p>`);

const settings = recordsOf('Find Queue Settings (sign-up link)')[0];
const signupUrl = (settings && settings.fields['Signup URL']) || '';
if (!signupUrl) {
  return reply(409, 'No sign-up link for this membership', `<p>The <strong>${esc(e.location)} · ${esc(e.membership)}</strong> row in the Capacity table has no Signup URL, so nothing was sent. Add it there, then press the button again.</p>`);
}
if (e.status === 'Signed Up' && e.responseAt && NOW - e.responseAt < 2 * 60000) {
  return reply(200, 'Already sent', `<p>A sign-up link went to ${esc(e.email)} less than two minutes ago, so this click was ignored.</p>`);
}

const prior = e.status;
const again = prior === 'Signed Up';
const others = recordsOf('Find Entries by Email (sign-up link)')
  .map(normEntry)
  .filter((o) => o.id !== e.id && o.email === e.email && ACTIVE_STATUSES.includes(o.status));
const unlimited = /unlimited/i.test(e.membership);
const removed = unlimited && !again ? others : [];
// Keep their existing token so links in emails they already have keep working; mint one if they never had one.
const withToken = { ...e, token: e.token || TOKEN };

// A repeat send only re-sends the email: moving Response At again would count them as a new, un-recounted
// signup. (The unchanged Status keeps the row update, which the executor needs before it logs and emails.)
const fields = again ? { Status: 'Signed Up' } : { Status: 'Signed Up', 'Response At': NOW.toISOString(), ...(e.token ? {} : { 'Invite Token': TOKEN }) };
const actions = [{
  recordId: e.id,
  fields,
  email: confirmationEmail(withToken, signupUrl, { removedOthers: removed.length > 0, stillOn: !unlimited && others.length > 0 }),
  log: logRow(e, 'Signed Up', { Source: 'Admin', Detail: again ? 'Sign-up link re-sent by staff' : `Sign-up link sent by staff (previous status: ${prior})` }),
}];
for (const o of removed) {
  actions.push({
    recordId: o.id,
    fields: { Status: 'Removed', Reason: `Auto-removed: signed up for ${e.membership} at ${e.location}` },
    email: null,
    log: logRow(o, 'Removed', { Detail: 'Signed up for Unlimited elsewhere' }),
  });
}

const notes = [];
if (again) notes.push('They were already Signed Up, so the link was simply sent again.');
if (['No Longer Interested', 'Removed'].includes(prior)) notes.push(`Their previous status was <strong>${esc(prior)}</strong>.`);
if (removed.length) notes.push(`Because this is Unlimited, they were also taken off ${removed.length} other waitlist${removed.length > 1 ? 's' : ''}.`);
if (CFG.testRecipient) {
  notes.push(isAllowedRecipient(e.email)
    ? 'Test mode: this address is on the allow-list, so the email went to them for real.'
    : `Test mode: the email was redirected to ${esc(CFG.testRecipient)}.`);
}
if (CFG.sandboxMode) notes.push('SendGrid sandbox mode is on, so no email was actually delivered.');

return reply(200, 'Sign-up link sent', `<p>Sent to <strong>${esc(e.name || e.email)}</strong> (${esc(e.email)}) for the <strong>${esc(e.membership)}</strong> membership at <strong>${esc(e.location)}</strong>.${again ? '' : ' Their row is now <strong>Signed Up</strong>.'}</p>
${notes.map((n) => `<p class="note">${n}</p>`).join('')}
<p class="muted">You can close this tab.</p>`, actions);
