// @include core
// @include pages
// GET links from emails only render a confirmation page; the state change happens on POST.
// This stops email link scanners (Outlook Safe Links etc.) from "clicking" a response.
const query = $('Config').first().json.query || {};
const token = String(query.t || '').replace(/[^A-Za-z0-9]/g, '');
const action = String(query.a || '');
const rec = recordsOf('Find Entry by Token (view)')[0];
const reply = (status, title, body) => [{ json: { status, page: htmlPage(title, body), actions: [] } }];

if (!rec || token.length < 16 || rec.fields['Invite Token'] !== token) {
  return reply(410, 'This link has expired', '<p>This link is no longer active — it may have been replaced by a newer email from us.</p><p class="muted">Please use the most recent email, or reply to it and we\'ll help.</p>');
}

const e = normEntry(rec);
const q = `${e.membership} membership at ${e.location}`;
const COPY = {
  yes: { title: 'Claim your spot', lead: `Confirm you'd like the <strong>${esc(q)}</strong>. We'll take you straight to signup and payment.`, button: 'Yes — continue to signup' },
  tour: { title: 'Book a tour first', lead: `We'd love to show you around. Confirm below and we'll hold your <strong>${esc(q)}</strong> spot while we arrange a time.`, button: 'Request a tour', field: ['When suits you? (optional)', 'e.g. weekday evenings, Saturday morning'] },
  notnow: { title: 'Not right now', lead: `No problem — you'll stay on the waitlist for the <strong>${esc(q)}</strong>, and our team will be in touch.`, button: 'Keep me on the list', field: ['Anything we should know? (optional)', ''] },
  no: { title: 'Leave the waitlist', lead: `This removes you from the waitlist for the <strong>${esc(q)}</strong>.`, button: 'Remove me from the waitlist', field: ['Mind telling us why? (optional)', ''] },
  leave: { title: 'Leave your other waitlists', lead: 'This removes you from every other Akari waitlist you are on. Your new membership is not affected.', button: 'Remove me from the other waitlists' },
};
const c = COPY[action];
if (!c) return reply(400, 'Something went wrong', '<p>We couldn\'t read that link. Please use the buttons in your email.</p>');

let note = '';
const lapsed = (e.status === 'Invited' && e.expiresAt && NOW > e.expiresAt) || ['Warm', 'No Reply'].includes(e.status);
if (e.status === 'Signed Up' && action !== 'leave') note = 'You have already claimed this spot.';
else if (e.status === 'Removed') note = 'You are no longer on this waitlist.';
else if (lapsed && (action === 'yes' || action === 'tour')) note = `Your ${CFG.holdHours}-hour hold has passed. If you continue, you'll be first in line for the next spot.`;
else if (e.status === 'Invited' && e.expiresAt) note = `Your spot is held until ${esc(fmtTime(e.expiresAt))}.`;

const field = c.field
  ? `<label for="reason">${esc(c.field[0])}</label><textarea id="reason" name="reason" maxlength="1000" placeholder="${esc(c.field[1])}"></textarea>`
  : '';
const body = `<p>${c.lead}</p>${note ? `<p class="note">${note}</p>` : ''}
<form method="POST" action="${esc(CFG.publicWebhookBase)}/respond-confirm">
<input type="hidden" name="t" value="${esc(token)}"><input type="hidden" name="a" value="${esc(action)}">
${field}<button type="submit">${esc(c.button)}</button></form>`;
return reply(200, c.title, body);
