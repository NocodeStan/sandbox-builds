// @include core
// @include email
// @include pages
const req = $('Config').first().json.body || {};
const token = String(req.t || '').replace(/[^A-Za-z0-9]/g, '');
const action = String(req.a || '');
const note = String(req.reason || '').trim().slice(0, 1000);
const rec = recordsOf('Find Entry by Token (commit)')[0];
const reply = (status, title, body, actions = []) => [{ json: { status, page: htmlPage(title, body), actions } }];

if (!rec || token.length < 16 || rec.fields['Invite Token'] !== token) {
  return reply(410, 'This link has expired', '<p>This link is no longer active — it may have been replaced by a newer email from us.</p><p class="muted">Please use the most recent email, or reply to it and we\'ll help.</p>');
}

const e = normEntry(rec);
const others = recordsOf('Find Entries by Email')
  .map(normEntry)
  .filter((o) => o.id !== e.id && o.email === e.email && ACTIVE_STATUSES.includes(o.status));
const settings = recordsOf('Find Queue Settings')[0];
const signupUrl = (settings && settings.fields['Signup URL']) || '';
const q = `${e.membership} membership at ${e.location}`;
const onTime = (e.status === 'Invited' && e.expiresAt && NOW <= e.expiresAt) || e.status === 'Tour Requested';
const nowIso = NOW.toISOString();
const acts = [];
const update = (entry, fields, email, log) => acts.push({ recordId: entry.id, fields, email, log });
const listOf = (xs) => xs.map((x) => `${x.membership} at ${x.location}`);

if (e.status === 'Removed' && action !== 'leave') {
  return reply(200, 'You\'re no longer on this waitlist', '<p>This waitlist entry has already been closed. If that\'s a mistake, just reply to any of our emails.</p>');
}
if (e.status === 'Signed Up' && action !== 'leave') {
  if (action === 'yes' && signupUrl) return [{ json: { status: 200, page: redirectPage(signupUrl, 'Taking you to signup', 'Your spot is confirmed — taking you to signup and payment.'), actions: [] } }];
  return reply(200, 'You\'ve already claimed this spot', '<p>If you need your signup link again or want to change anything, just reply to our email.</p>');
}

function confirmationEmail(removed, stillOn) {
  const linkText = signupUrl || '(signup link pending — we\'ll send it shortly)';
  const linkHtml = signupUrl ? `<a href="${esc(signupUrl)}" style="color:#1f1d1a">${esc(signupUrl)}</a>` : esc(linkText);
  const unlimited = removed.length > 0;
  const overlap = unlimited
    ? `<p>Once you sign up for your Unlimited membership, we'll automatically remove you from any other Akari waitlists you've joined.</p>`
    : stillOn.length
      ? `<p>You'll stay on any other Akari waitlists you've joined. If you'd rather come off them, you can remove yourself here: <a href="${esc(respondLink(e.token, 'leave'))}" style="color:#1f1d1a">${esc(respondLink(e.token, 'leave'))}</a></p>`
      : '';
  const html = emailLayout(`
<p>Hi ${esc(firstName(e.name))},</p>
<p>Thank you for your interest in joining Akari! Here is your private sign up link for your ${esc(e.membership)} membership at Akari ${esc(e.location)}: ${linkHtml}</p>
${overlap}
<p>Please let us know if you have any issues signing up!</p>
<p>Warmly,<br>Akari team</p>`, `Your ${e.membership} membership is ready for you`);
  const text = `Hi ${firstName(e.name)},

Thank you for your interest in joining Akari! Here is your private sign up link for your ${e.membership} membership at Akari ${e.location}: ${linkText}

${unlimited
    ? 'Once you sign up for your Unlimited membership, we\'ll automatically remove you from any other Akari waitlists you\'ve joined.'
    : stillOn.length ? `You'll stay on any other Akari waitlists you've joined. If you'd rather come off them, you can remove yourself here: ${respondLink(e.token, 'leave')}` : ''}

Please let us know if you have any issues signing up!

Warmly,
Akari team`;
  return { to: e.email, name: e.name, subject: `Your Private Sign Up Link for Akari ${e.location}`, html, text };
}

function tourAlert(late) {
  const signupDate = fmtTime(e.joinedAt);
  // Tour Requested holds never expire on their own once set (unlike a plain Invited hold) — say so
  // plainly rather than echoing the original 24h deadline, which no longer applies once held this way.
  const holdUntil = late ? 'Not held — the original window passed before they replied' : 'No deadline — held until your team follows up';
  const html = emailLayout(`
<p>Hi team,</p>
<p><strong>${esc(e.name || e.email)}</strong> would like to tour Akari ${esc(e.location)} before committing to a ${esc(e.membership)} membership. Their details are below:</p>
<p>Email: ${esc(e.email)}<br>Phone: ${esc(e.phone || '—')}<br>On the waitlist since: ${esc(signupDate)}<br>Spot held until: ${esc(holdUntil)}${note ? `<br>Preferred times: ${esc(note)}` : ''}</p>
<p>Please reach out within 1 business day to schedule a time. When possible, we recommend booking during a quieter hour so they can get a real feel for the space.</p>
<p>${late
    ? 'Because they replied after their original hold expired, the spot was <strong>not</strong> held for them — they\'re now first in line (Warm) for the next opening.'
    : 'Once the tour is booked, there\'s nothing further to do to protect the hold — it stays open until you act on it.'}</p>
<p>If they decide to join${late ? '' : ' after the tour'}, press <strong>Send Now</strong> on their row in Airtable — that sends them a fresh invite with their private sign up link.</p>
<p>Thank you,<br>Akari team</p>`, 'Please reach out within 1 business day to schedule');
  const text = `Hi team,

${e.name || e.email} would like to tour Akari ${e.location} before committing to a ${e.membership} membership. Their details are below:
Email: ${e.email} | Phone: ${e.phone || '-'} | On the waitlist since: ${signupDate} | Spot held until: ${holdUntil}${note ? ` | Preferred times: ${note}` : ''}

Please reach out within 1 business day to schedule a time. When possible, we recommend booking during a quieter hour so they can get a real feel for the space.

${late
    ? 'Because they replied after their original hold expired, the spot was NOT held for them — they\'re now first in line (Warm) for the next opening.'
    : 'Once the tour is booked, there\'s nothing further to do to protect the hold — it stays open until you act on it.'}

If they decide to join${late ? '' : ' after the tour'}, press Send Now on their row in Airtable — that sends them a fresh invite with their private sign up link.

Thank you,
Akari team`;
  return { to: CFG.teamEmails, subject: `Tour Request: ${e.name || e.email} at Akari ${e.location}${late ? ' (late reply)' : ''}`, html, text };
}

switch (action) {
  case 'yes': {
    if (!onTime) {
      update(e, { Status: 'Warm', 'Response At': nowIso }, null, logRow(e, 'Late Reply', { Detail: 'Tried to claim after the hold expired → Warm (first in line next time)' }));
      return reply(200, 'Your hold has lapsed', `<p>Your ${CFG.holdHours}-hour hold on the ${esc(q)} passed before we heard back, so it has gone to the next person.</p><p>The good news: you're now <strong>first in line</strong> for the next spot, and we'll email you as soon as it opens.</p>`, acts);
    }
    const unlimited = /unlimited/i.test(e.membership);
    const removed = unlimited ? others : [];
    const stillOn = unlimited ? [] : others;
    update(e, { Status: 'Signed Up', 'Response At': nowIso }, confirmationEmail(removed, stillOn),
      logRow(e, 'Signed Up', { Source: e.source || 'Auto', Detail: signupUrl ? '' : 'SIGNUP URL MISSING — send the link manually' }));
    for (const o of removed) {
      update(o, { Status: 'Removed', Reason: `Auto-removed: signed up for ${e.membership} at ${e.location}` }, null, logRow(o, 'Removed', { Detail: 'Signed up for Unlimited elsewhere' }));
    }
    if (!signupUrl) return reply(200, 'Your spot is confirmed', '<p>Thank you — your spot is confirmed. We\'ll email your signup link shortly.</p>', acts);
    return [{ json: { status: 200, page: redirectPage(signupUrl, 'Taking you to signup', 'Your spot is confirmed — taking you to signup and payment.'), actions: acts } }];
  }
  case 'tour': {
    if (e.status === 'Tour Requested') return reply(200, 'Tour already requested', '<p>We already have your tour request and your spot is held. We\'ll be in touch shortly.</p>');
    if (onTime) {
      update(e, { Status: 'Tour Requested', 'Response At': nowIso, 'Tour Notes': note }, tourAlert(false), logRow(e, 'Tour Requested', { Reason: note }));
      return reply(200, 'Tour requested', `<p>Thanks — we'll be in touch to arrange your tour. Your ${esc(q)} spot is held for you in the meantime.</p>`, acts);
    }
    update(e, { Status: 'Warm', 'Response At': nowIso, 'Tour Notes': note }, tourAlert(true), logRow(e, 'Late Reply', { Reason: note, Detail: 'Asked for a tour after the hold expired → Warm' }));
    return reply(200, 'Thanks — we\'ll be in touch', `<p>Your hold on the ${esc(q)} passed before we heard back, so it has gone to the next person. You're now <strong>first in line</strong> for the next spot, and our team will reach out about a tour.</p>`, acts);
  }
  case 'notnow':
    update(e, { Status: 'Not Right Now', 'Response At': nowIso, Reason: note }, null, logRow(e, 'Not Right Now', { Reason: note }));
    return reply(200, 'You\'re still on the list', '<p>Thanks for letting us know. You\'re still on the waitlist and our team will be in touch.</p>', acts);
  case 'no':
    update(e, { Status: 'No Longer Interested', 'Response At': nowIso, Reason: note }, null, logRow(e, 'No Longer Interested', { Reason: note }));
    return reply(200, 'You\'ve been removed', '<p>Thanks for letting us know — we won\'t contact you about this waitlist again.</p>', acts);
  case 'leave': {
    if (!others.length) return reply(200, 'All done', '<p>You\'re not on any other Akari waitlists.</p>');
    for (const o of others) {
      update(o, { Status: 'Removed', Reason: 'Asked to leave other waitlists' }, null, logRow(o, 'Removed', { Detail: `Asked to leave after signing up for ${q}` }));
    }
    return reply(200, 'Removed from your other waitlists', `<p>Done — you've been taken off: ${esc(listOf(others).join(', '))}.</p>`, acts);
  }
  default:
    return reply(400, 'Something went wrong', '<p>We couldn\'t read that response. Please use the buttons in your email.</p>');
}
