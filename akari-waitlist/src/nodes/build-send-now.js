// @include core
// @include email
// @include pages
// Staff override: invites this person now, whatever their queue position or the queue's count.
const rec = $('Get Entry for Send Now').first().json;
const reply = (status, title, body, actions = []) => [{ json: { status, page: htmlPage(title, body), actions } }];

if (!rec || !rec.id || !rec.fields) return reply(404, 'Entry not found', '<p>That waitlist entry could not be found. It may have been deleted.</p>');
const e = normEntry(rec);
if (!e.email) return reply(422, 'No email address', `<p>${esc(e.name || e.id)} has no email address, so nothing was sent.</p>`);
if (e.status === 'Invited' && e.source === 'Send Now' && e.invitedAt && NOW - e.invitedAt < 2 * 60000) {
  return reply(200, 'Already sent', `<p>An invite went to ${esc(e.email)} less than two minutes ago, so this click was ignored.</p>`);
}

const expires = new Date(NOW.getTime() + CFG.holdHours * HOUR);
const prior = e.status;
const actions = [{
  recordId: e.id,
  fields: {
    Status: 'Invited', 'Invite Token': TOKEN, 'Invited At': NOW.toISOString(),
    'Invite Expires At': expires.toISOString(), 'Invite Source': 'Send Now', 'Response At': null,
  },
  email: inviteEmail(e, TOKEN, expires),
  log: logRow(e, 'Invited', { Source: 'Send Now', Detail: `Manual Send Now (previous status: ${prior}). Held until ${fmtTime(expires)}` }),
}];

const warnings = [];
if (['Signed Up', 'No Longer Interested', 'Removed'].includes(prior)) warnings.push(`Their previous status was <strong>${esc(prior)}</strong>.`);
if (prior === 'Invited' && e.token) warnings.push('They already had an open invite; the old links no longer work.');
if (CFG.testRecipient) warnings.push(`Test mode: the email was redirected to ${esc(CFG.testRecipient)}.`);
if (CFG.sandboxMode) warnings.push('SendGrid sandbox mode is on, so no email was actually delivered.');

return reply(200, 'Invite sent', `<p>Sent to <strong>${esc(e.name || e.email)}</strong> (${esc(e.email)}) for the <strong>${esc(e.membership)}</strong> membership at <strong>${esc(e.location)}</strong>.</p>
<p>Their spot is held until ${esc(fmtTime(expires))}.</p>${warnings.map((w) => `<p class="note">${w}</p>`).join('')}
<p class="muted">You can close this tab.</p>`, actions);
