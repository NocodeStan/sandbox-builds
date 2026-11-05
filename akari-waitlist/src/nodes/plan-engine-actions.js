// @include core
// @include email
// Decides everything for this run; the executor nodes downstream carry it out.
// Each output item = { recordId, fields, email|null, log }.
if (!CFG.engineEnabled) return [];

const localHour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: CFG.timezone }).format(NOW));
const inSendWindow = localHour >= CFG.sendWindow.startHour && localHour < CFG.sendWindow.endHour;

const entries = recordsOf('Get Active Entries').map(normEntry);
const queues = recordsOf('Get Capacity')
  .map((r) => ({
    location: r.fields['Location'],
    membership: r.fields['Membership'],
    min: Number(r.fields['Minimum Members'] || 0),
    active: Number(r.fields['Active Members'] || 0),
    countedAt: toDate(r.fields['Active Updated At']) || new Date(0),
    newOnly: !!r.fields['Prioritise New Only'],
    enabled: !!r.fields['Enabled'],
    hasSignupUrl: !!r.fields['Signup URL'],
  }))
  .filter((q) => q.enabled && q.location && q.membership);

const actions = [];

// 1. Expire holds whose window (holdHours) passed with no reply (runs around the clock).
for (const e of entries) {
  if (e.status === 'Invited' && e.expiresAt && e.expiresAt <= NOW) {
    const timeouts = e.timeoutCount + 1;
    const next = timeouts >= CFG.timeoutsBeforeNoReply ? 'No Reply' : 'Warm';
    actions.push({
      recordId: e.id,
      fields: { Status: next, 'Timeout Count': timeouts },
      email: null,
      log: logRow(e, 'Timed Out', { Source: e.source || 'Auto', Detail: `No reply within ${CFG.holdHours}h → ${next}` }),
    });
    e.status = next;
    e.timeoutCount = timeouts;
  }
}

// 1b. Release a tour hold once the tour is tourReleaseHours past and no sign-up link was sent (that
// would have made them Signed Up). Staff own the follow-up from here, so no automatic re-invite.
for (const e of entries) {
  if (e.status === 'Tour Requested' && e.tourAt && NOW - e.tourAt >= CFG.tourReleaseHours * HOUR) {
    actions.push({
      recordId: e.id,
      fields: { Status: 'Not Right Now', Reason: `Toured ${fmtTime(e.tourAt)}; no sign-up link sent within ${CFG.tourReleaseHours}h` },
      email: null,
      log: logRow(e, 'Tour Released', { Detail: `Tour on ${fmtTime(e.tourAt)}; no sign-up link sent within ${CFG.tourReleaseHours}h, so the spot was released → Not Right Now` }),
    });
    e.status = 'Not Right Now';
  }
}

if (!inSendWindow) return actions.map((a) => ({ json: a }));

// 2. Priority order: manual rank → warm → weighted wait (new members count x newMemberWeight) → joined first.
const weightedWait = (e) => (Math.max(0, NOW - e.joinedAt) / DAY) * (e.memberType === 'Existing' ? 1 : CFG.newMemberWeight);
// The cool-down only applies to people the engine itself moved to Warm after ignoring an invite. Any
// reply since it was sent ('Response At' is cleared on every new invite) means they asked to be first
// in line, and a Warm row that had already reached No Reply was put back by staff, so it goes first now.
function inCooldown(e) {
  if (e.status !== 'Warm' || !e.expiresAt || e.responseAt) return false;
  if (e.timeoutCount >= CFG.timeoutsBeforeNoReply) return false;
  return NOW - e.expiresAt < CFG.warmCooldownHours * HOUR;
}
function lineFor(q, inQueue) {
  return inQueue
    .filter((e) => ['Waiting', 'Primed', 'Warm'].includes(e.status))
    .filter((e) => !q.newOnly || e.memberType !== 'Existing')
    .sort((a, b) => {
      if (a.manualRank !== b.manualRank) {
        if (a.manualRank === null) return 1;
        if (b.manualRank === null) return -1;
        return a.manualRank - b.manualRank;
      }
      const warmA = a.status === 'Warm' ? 0 : 1;
      const warmB = b.status === 'Warm' ? 0 : 1;
      if (warmA !== warmB) return warmA - warmB;
      const byWait = weightedWait(b) - weightedWait(a);
      if (byWait !== 0) return byWait;
      return a.joinedAt - b.joinedAt;
    });
}

// A queue whose open spots look implausible (usually a typo in Minimum/Active) is paused: no invites,
// no heads-ups, and one alert to the team per queue per day (de-duplicated against the Activity Log).
const alertedPauses = new Set(recordsOf('Get Recent Pause Alerts').map((r) => `${r.fields.Location}|${r.fields.Membership}`));
function pauseAlert(q, gap) {
  const label = `${q.membership} queue at Akari ${q.location}`;
  const paras = [
    `The ${label} worked out ${gap} open spots (Minimum Members ${q.min}, Active Members ${q.active}). That's more than ${CFG.pauseIfOpenSpotsOver}, which usually means a typo, so the system has paused this queue. Nobody has been invited or emailed from it.`,
    'If the numbers are wrong, correct them in the Capacity table and invites resume at the next hourly check.',
    `If they're right (for example a new location opening), raise pauseIfOpenSpotsOver in the Config node.`,
    'You\'ll get this reminder at most once a day while the queue stays paused.',
  ];
  return {
    to: CFG.teamEmails,
    subject: `Check Minimum Members: ${q.location} · ${q.membership} is paused`,
    html: emailLayout(`<p>Hi team,</p>${paras.map((p) => `<p>${esc(p)}</p>`).join('')}<p>Thank you,<br>Akari team</p>`, 'A queue has been paused until its numbers are checked'),
    text: ['Hi team,', ...paras, 'Thank you,\nAkari team'].join('\n\n'),
  };
}

// One live invite / tour hold per person across all queues.
const engaged = new Set(entries.filter((e) => HOLD_STATUSES.includes(e.status)).map((e) => e.email));
const primeGroups = new Map();

for (const q of queues) {
  const inQueue = entries.filter((e) => e.location === q.location && e.membership === q.membership);
  const pendingSignups = inQueue.filter((e) => e.status === 'Signed Up' && e.responseAt && e.responseAt > q.countedAt).length;
  const holds = inQueue.filter((e) => HOLD_STATUSES.includes(e.status)).length;
  const gap = q.min - q.active - pendingSignups - holds;
  const line = lineFor(q, inQueue);

  if (gap > CFG.pauseIfOpenSpotsOver) {
    const key = `${q.location}|${q.membership}`;
    if (!alertedPauses.has(key)) {
      actions.push({
        recordId: null,
        fields: null,
        email: pauseAlert(q, gap),
        log: {
          Summary: `Queue Paused · ${q.location} · ${q.membership}`, Timestamp: NOW.toISOString(), Event: 'Queue Paused',
          Location: q.location, Membership: q.membership, Source: 'Auto',
          Detail: `${gap} open spots (Minimum ${q.min}, Active ${q.active}) is more than ${CFG.pauseIfOpenSpotsOver}: no invites sent`,
        },
      });
      alertedPauses.add(key);
    }
    continue;
  }

  // 3. Invite enough people to fill the gap (no signup URL = misconfigured queue, flagged in the daily report).
  let slots = q.hasSignupUrl ? Math.max(0, Math.min(gap, CFG.maxInvitesPerQueuePerRun)) : 0;
  const invitedNow = new Set();
  for (const e of line) {
    if (slots <= 0) break;
    if (inCooldown(e) || engaged.has(e.email)) continue;
    const expires = new Date(NOW.getTime() + CFG.holdHours * HOUR);
    actions.push({
      recordId: e.id,
      fields: {
        Status: 'Invited', 'Invite Token': TOKEN, 'Invited At': NOW.toISOString(),
        'Invite Expires At': expires.toISOString(), 'Invite Source': 'Auto', 'Response At': null,
      },
      email: inviteEmail(e, TOKEN, expires),
      log: logRow(e, 'Invited', { Source: 'Auto', Detail: `${e.status === 'Warm' ? 'Warm re-invite. ' : ''}Held until ${fmtTime(expires)}` }),
    });
    engaged.add(e.email);
    invitedNow.add(e.id);
    slots--;
  }

  // 4. Early heads-up for the next N in line who haven't had one.
  for (const e of line.filter((x) => !invitedNow.has(x.id)).slice(0, CFG.primeCount)) {
    if (e.status !== 'Waiting' || e.primedAt || engaged.has(e.email)) continue;
    if (!primeGroups.has(e.email)) primeGroups.set(e.email, []);
    primeGroups.get(e.email).push(e);
  }
}

// Jack's "heads up" copy (template 3), with two buttons (5 Nov): "still interested" and "remove me".
function primeEmail(list, token) {
  const e = list[0];
  const what = list.map((x) => `the ${x.membership} membership at Akari ${x.location}`).join(' and ');
  const locations = [...new Set(list.map((x) => x.location))];
  const subject = list.length === 1
    ? `You're Almost Up for ${article(e.membership)} ${e.membership} Membership at Akari ${e.location}`
    : locations.length === 1 ? `You're Almost Up for a Membership at Akari ${locations[0]}` : "You're Almost Up for an Akari Membership";
  const paras = [
    `Thank you for your continued patience on the waitlist for ${what}. We wanted to give you a heads up that you're now close to the front of the line, and a spot could open up any day now.`,
    `When it does, we'll send you an email with all the details, and you'll have ${CFG.holdHours} hours to claim your spot.`,
    "If you're still interested, please let us know below so we know you're ready when a spot opens. If your plans have changed, you can remove yourself from the waitlist instead.",
  ];
  const closing = [
    'For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.',
    'We look forward to welcoming you soon!',
  ];
  const html = emailLayout(`
<p>Hi ${esc(firstName(e.name))},</p>
${paras.map((p) => `<p>${esc(p)}</p>`).join('\n')}
${btn(respondLink(token, 'still'), "I'm still interested", true)}
${btn(respondLink(token, 'remove'), 'Remove me from the waitlist')}
${closing.map((p) => `<p>${esc(p)}</p>`).join('\n')}
<p>Warmly,<br>Akari team</p>`, 'A spot could open up any day now');
  const text = [
    `Hi ${firstName(e.name)},`, ...paras,
    `I'm still interested: ${respondLink(token, 'still')}\nRemove me from the waitlist: ${respondLink(token, 'remove')}`,
    ...closing, 'Warmly,\nAkari team',
  ].join('\n\n');
  return { to: e.email, name: e.name, subject, html, text };
}

// One heads-up email per person, even if they're near the front of several queues. Someone invited
// later in this same run (on another queue) gets only the invite, not a heads-up in the same minute.
// The email's buttons use a token on the first row; the rows primed together share one Primed At, which is
// how a click is applied to exactly the lists that email named.
for (const [email, list] of primeGroups) {
  if (engaged.has(email)) continue;
  list.forEach((e, i) =>
    actions.push({
      recordId: e.id,
      fields: { Status: 'Primed', 'Primed At': NOW.toISOString(), ...(i === 0 ? { 'Invite Token': TOKEN } : {}) },
      email: i === 0 ? primeEmail(list, TOKEN) : null,
      log: logRow(e, 'Primed', { Source: 'Auto' }),
    }),
  );
}

return actions.map((a) => ({ json: a }));
