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
  const link = signupUrl
    ? btn(signupUrl, 'Complete signup and payment', true)
    : '<p><strong>We\'ll email your signup link shortly.</strong></p>';
  let overlap = '';
  let overlapText = '';
  if (removed.length) {
    overlap = `<p style="font-size:14px;color:#5b544b">As you've chosen Unlimited, we've taken you off your other waitlists (${esc(listOf(removed).join(', '))}).</p>`;
    overlapText = `As you've chosen Unlimited, we've taken you off your other waitlists (${listOf(removed).join(', ')}).`;
  } else if (stillOn.length) {
    overlap = `<p style="font-size:14px;color:#5b544b">You're still on our waitlist for ${esc(listOf(stillOn).join(', '))}. Want to stay on? No action needed. Otherwise:</p>${btn(respondLink(e.token, 'leave'), 'Remove me from my other waitlists')}`;
    overlapText = `You're still on our waitlist for ${listOf(stillOn).join(', ')}. To come off those: ${respondLink(e.token, 'leave')}`;
  }
  const html = emailLayout(`
<p>Hi ${esc(firstName(e.name))},</p>
<p>The <strong>${esc(q)}</strong> is yours. Complete your signup and payment here:</p>
${link}${overlap}
<p style="font-size:14px;color:#5b544b">Questions? Just reply to this email.</p>`);
  const text = `Hi ${firstName(e.name)},

The ${q} is yours. ${signupUrl ? `Complete your signup and payment here: ${signupUrl}` : "We'll email your signup link shortly."}
${overlapText}`;
  return { to: e.email, name: e.name, subject: `Your ${e.membership} spot at ${e.location} — finish signing up`, html, text };
}

function tourAlert(late) {
  const html = emailLayout(`
<p><strong>${esc(e.name || e.email)}</strong> has asked for a tour before joining <strong>${esc(q)}</strong>.</p>
<p>Email: ${esc(e.email)}<br>Phone: ${esc(e.phone || '—')}<br>Preferred times: ${esc(note || '—')}</p>
<p>${late
    ? 'They replied after their hold expired, so the spot was <strong>not</strong> held. They are now first in line (Warm).'
    : 'Their spot is being held (status: Tour Requested) and will not time out. After the tour, press <strong>Send Now</strong> on their Airtable row to send the signup link, or change their status.'}</p>`);
  const text = `${e.name || e.email} has asked for a tour before joining ${q}.
Email: ${e.email} | Phone: ${e.phone || '-'} | Preferred times: ${note || '-'}
${late ? 'Replied after the hold expired: spot NOT held; now first in line (Warm).' : 'Spot held (Tour Requested). After the tour, press Send Now on their Airtable row.'}`;
  return { to: CFG.teamEmails, subject: `Tour request: ${e.name || e.email} — ${e.membership} at ${e.location}${late ? ' (late)' : ''}`, html, text };
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
