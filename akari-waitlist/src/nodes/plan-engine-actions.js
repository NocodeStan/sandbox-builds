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

if (!inSendWindow) return actions.map((a) => ({ json: a }));

// 2. Priority order: manual rank → warm → weighted wait (new members count x newMemberWeight) → joined first.
const weightedWait = (e) => (Math.max(0, NOW - e.joinedAt) / DAY) * (e.memberType === 'Existing' ? 1 : CFG.newMemberWeight);
// The cool-down only applies to people who ignored their invite. Any reply since it was sent
// ('Response At' is cleared on every new invite) means they asked to be first in line.
function inCooldown(e) {
  if (e.status !== 'Warm' || !e.expiresAt || e.responseAt) return false;
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

// One live invite / tour hold per person across all queues.
const engaged = new Set(entries.filter((e) => HOLD_STATUSES.includes(e.status)).map((e) => e.email));
const primeGroups = new Map();

for (const q of queues) {
  const inQueue = entries.filter((e) => e.location === q.location && e.membership === q.membership);
  const pendingSignups = inQueue.filter((e) => e.status === 'Signed Up' && e.responseAt && e.responseAt > q.countedAt).length;
  const holds = inQueue.filter((e) => HOLD_STATUSES.includes(e.status)).length;
  const gap = q.min - q.active - pendingSignups - holds;
  const line = lineFor(q, inQueue);

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

// Jack's "heads up" copy (template 3). Opting out is by reply until a one-click remove link is agreed.
function primeEmail(list) {
  const e = list[0];
  const what = list.map((x) => `the ${x.membership} membership at Akari ${x.location}`).join(' and ');
  const locations = [...new Set(list.map((x) => x.location))];
  const subject = list.length === 1
    ? `You're Almost Up for ${article(e.membership)} ${e.membership} Membership at Akari ${e.location}`
    : locations.length === 1 ? `You're Almost Up for a Membership at Akari ${locations[0]}` : "You're Almost Up for an Akari Membership";
  const paras = [
    `Thank you for your continued patience on the waitlist for ${what}. We wanted to give you a heads up that you're now close to the front of the line, and a spot could open up any day now.`,
    `When it does, we'll send you an email with all the details, and you'll have ${CFG.holdHours} hours to claim your spot.`,
    "If you're still interested, there's nothing you need to do. If your plans have changed, just reply to this email and we'll remove you from the waitlist.",
    'For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.',
    'We look forward to welcoming you soon!',
  ];
  const html = emailLayout(`
<p>Hi ${esc(firstName(e.name))},</p>
${paras.map((p) => `<p>${esc(p)}</p>`).join('\n')}
<p>Warmly,<br>Akari team</p>`, 'A spot could open up any day now');
  const text = [`Hi ${firstName(e.name)},`, ...paras, 'Warmly,\nAkari team'].join('\n\n');
  return { to: e.email, name: e.name, subject, html, text };
}

// One heads-up email per person, even if they're near the front of several queues. Someone invited
// later in this same run (on another queue) gets only the invite, not a heads-up in the same minute.
for (const [email, list] of primeGroups) {
  if (engaged.has(email)) continue;
  list.forEach((e, i) =>
    actions.push({
      recordId: e.id,
      fields: { Status: 'Primed', 'Primed At': NOW.toISOString() },
      email: i === 0 ? primeEmail(list) : null,
      log: logRow(e, 'Primed', { Source: 'Auto' }),
    }),
  );
}

return actions.map((a) => ({ json: a }));
