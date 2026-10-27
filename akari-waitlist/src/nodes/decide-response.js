// @include core
// @include email
// @include pages
const req = $('Config').first().json.body || {};
const token = String(req.t || '').replace(/[^A-Za-z0-9]/g, '');
const action = String(req.a || '');
const note = String(req.reason || '').trim().slice(0, 1000);
const rec = recordsOf('Find Entry by Token (commit)')[0];
const reply = (status, title, body, actions = []) => [{ json: { status, page: htmlPage(title, body), actions } }];

// A lookup refused by Airtable (usually its 30s lockout after a burst of replies): change nothing and
// resend the exact same answer — automatically after a random 35–55s (so everyone caught in the same
// burst doesn't retry in the same second and trip the lockout again), or now via the button.
if (['Find Entry by Token (commit)', 'Find Entries by Email', 'Find Queue Settings'].some((n) => $(n).all().some((i) => i.json.error))) {
  return reply(503, 'Please try again in a minute', `<p>Lots of people are replying right now and we couldn't save your answer yet. Nothing has changed — if your spot was being held, it still is.</p>
<p class="muted" id="auto">We'll try again automatically in about a minute. Please keep this page open.</p>
<form id="retry" method="POST" action="${esc(CFG.publicWebhookBase)}/respond-confirm" onsubmit="this.querySelector('button').disabled=true">
<input type="hidden" name="t" value="${esc(token)}"><input type="hidden" name="a" value="${esc(action)}"><input type="hidden" name="reason" value="${esc(note)}">
<button type="submit">Try again</button></form>
<script>setTimeout(function(){var f=document.getElementById('retry');f.querySelector('button').disabled=true;f.submit();},35000+Math.floor(Math.random()*20000));</script>`);
}

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
// They already answered "not ready" / "no longer interested" on this invite, which released the spot.
const declined = ['Not Right Now', 'No Longer Interested'].includes(e.status);
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

const calUrl = tourBookingUrl(e);

function tourAlert(late) {
  const signupDate = fmtTime(e.joinedAt);
  const why = declined ? 'they had already told us they weren\'t ready' : 'they replied after their original hold expired';
  const holdUntil = late
    ? `Not held — ${why}`
    : `${CFG.tourReleaseHours} hours after their tour, unless you send the sign-up link first`;
  const booking = calUrl
    ? 'They\'ve been taken to our Cal.com page to pick a tour time. The booking shows up in Cal.com as usual, and the tour time is added to their row in Airtable.'
    : 'Please reach out within 1 business day to schedule a time. When possible, we recommend booking during a quieter hour so they can get a real feel for the space. Once it\'s booked, add the time to the Tour At field on their row in Airtable.';
  const hold = late
    ? `Because ${why}, the spot was <strong>not</strong> held for them — they're now first in line (Warm) for the next opening.`
    : `Their spot stays held until ${CFG.tourReleaseHours} hours after the tour. If nothing has been sent by then, the spot is released and they move to Not Right Now.`;
  const next = `If they decide to join${late ? '' : ' after the tour'}, press <strong>Send Sign-up Link</strong> on their row in Airtable. That emails their private sign-up link and marks them Signed Up.`;
  const html = emailLayout(`
<p>Hi team,</p>
<p><strong>${esc(e.name || e.email)}</strong> would like to tour Akari ${esc(e.location)} before committing to ${article(e.membership)} ${esc(e.membership)} membership. Their details are below:</p>
<p>Email: ${esc(e.email)}<br>Phone: ${esc(e.phone || '—')}<br>On the waitlist since: ${esc(signupDate)}<br>Spot held until: ${esc(holdUntil)}${note ? `<br>Preferred times: ${esc(note)}` : ''}</p>
<p>${esc(booking)}</p>
<p>${hold}</p>
<p>${next}</p>
<p>Thank you,<br>Akari team</p>`, calUrl ? 'They\'re picking a tour time on Cal.com' : 'Please reach out within 1 business day to schedule');
  const strip = (h) => h.replace(/<\/?strong>/g, '');
  const text = `Hi team,

${e.name || e.email} would like to tour Akari ${e.location} before committing to ${article(e.membership)} ${e.membership} membership. Their details are below:
Email: ${e.email} | Phone: ${e.phone || '-'} | On the waitlist since: ${signupDate} | Spot held until: ${holdUntil}${note ? ` | Preferred times: ${note}` : ''}

${booking}

${strip(hold)}

${strip(next)}

Thank you,
Akari team`;
  return { to: CFG.teamEmails, subject: `Tour Request: ${e.name || e.email} at Akari ${e.location}${late ? ' (late reply)' : ''}`, html, text };
}

const toCalendar = (title, message, actions = acts) =>
  [{ json: { status: 200, page: redirectPage(calUrl, title, message, 'Choose a tour time'), actions } }];

switch (action) {
  case 'yes': {
    if (!onTime) {
      update(e, { Status: 'Warm', 'Response At': nowIso }, null, logRow(e, 'Late Reply', {
        Detail: declined ? `Changed their mind after answering "${e.status}" → Warm (first in line next time)` : 'Tried to claim after the hold expired → Warm (first in line next time)',
      }));
      if (declined) return reply(200, 'You\'re back in line', `<p>Thanks for letting us know! Because you'd told us you weren't ready, we released your ${esc(q)} spot to the next person.</p><p>The good news: you're now <strong>first in line</strong> for the next spot, and we'll email you as soon as it opens.</p>`, acts);
      return reply(200, 'Your hold has lapsed', `<p>Your ${CFG.holdHours}-hour hold on the ${esc(q)} passed before we heard back, so it has gone to the next person.</p><p>The good news: you're now <strong>first in line</strong> for the next spot, and we'll email you as soon as it opens.</p>`, acts);
    }
    const unlimited = /unlimited/i.test(e.membership);
    const removed = unlimited ? others : [];
    const stillOn = unlimited ? [] : others;
    update(e, { Status: 'Signed Up', 'Response At': nowIso }, confirmationEmail(e, signupUrl, { removedOthers: removed.length > 0, stillOn: stillOn.length > 0 }),
      logRow(e, 'Signed Up', { Source: e.source || 'Auto', Detail: signupUrl ? '' : 'SIGNUP URL MISSING — send the link manually' }));
    for (const o of removed) {
      update(o, { Status: 'Removed', Reason: `Auto-removed: signed up for ${e.membership} at ${e.location}` }, null, logRow(o, 'Removed', { Detail: 'Signed up for Unlimited elsewhere' }));
    }
    if (!signupUrl) return reply(200, 'Your spot is confirmed', '<p>Thank you — your spot is confirmed. We\'ll email your signup link shortly.</p>', acts);
    return [{ json: { status: 200, page: redirectPage(signupUrl, 'Taking you to signup', 'Your spot is confirmed — taking you to signup and payment.'), actions: acts } }];
  }
  case 'tour': {
    if (e.status === 'Tour Requested') {
      if (calUrl) return toCalendar('Pick your tour time', 'Your spot is still held. Taking you to pick or change your tour time.', []);
      return reply(200, 'Tour already requested', '<p>We already have your tour request and your spot is held. We\'ll be in touch shortly.</p>');
    }
    if (onTime) {
      update(e, { Status: 'Tour Requested', 'Response At': nowIso, 'Tour Notes': note }, tourAlert(false), logRow(e, 'Tour Requested', { Reason: note }));
      if (calUrl) return toCalendar('Pick your tour time', `Your ${q} spot is held for you. Taking you to pick a tour time.`);
      return reply(200, 'Tour requested', `<p>Thanks — we'll be in touch to arrange your tour. Your ${esc(q)} spot is held for you in the meantime.</p>`, acts);
    }
    update(e, { Status: 'Warm', 'Response At': nowIso, 'Tour Notes': note }, tourAlert(true), logRow(e, 'Late Reply', { Reason: note, Detail: declined ? `Asked for a tour after answering "${e.status}" → Warm` : 'Asked for a tour after the hold expired → Warm' }));
    const lead = declined ? `Because you'd told us you weren't ready, your ${esc(q)} spot went to the next person.` : `Your hold on the ${esc(q)} passed before we heard back, so it has gone to the next person.`;
    if (calUrl) return reply(200, 'You can still book a tour', `<p>${lead} You're now <strong>first in line</strong> for the next spot.</p><p>You're still welcome to come and see the space:</p><a class="button" href="${esc(calUrl)}">Choose a tour time</a>`, acts);
    return reply(200, 'Thanks — we\'ll be in touch', `<p>${lead} You're now <strong>first in line</strong> for the next spot, and our team will reach out about a tour.</p>`, acts);
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
