// @include core
// @include email
// Jack's template 4 on top (Needs attention / Last 24 hours / By location / dashboard link), with the
// detailed tables underneath.
const logs = recordsOf('Get Log (30 days)').map((r) => r.fields || {});
const live = recordsOf('Get Queue Snapshot').map(normEntry);
const caps = recordsOf('Get Capacity (report)').map((r) => r.fields || {});
const notReady = recordsOf('Get Not Right Now (report)').map(normEntry);
const within = (f, ms) => f.Timestamp && NOW - new Date(f.Timestamp) <= ms;
const today = logs.filter((f) => within(f, DAY));
// One per waitlist entry, so a double-click or repeated event can't inflate the numbers.
const count = (list, events, source) => new Set(list
  .filter((f) => [].concat(events).includes(f.Event) && (!source || f.Source === source))
  .map((f, i) => `${f.Event}|${f['Entry ID'] || `row${i}`}`)).size;
const cell = 'padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;text-align:left';
const table = (head, rows) => `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:8px 0 20px">
<tr>${head.map((h) => `<th style="${cell};color:#8a7f72;font-weight:normal">${esc(h)}</th>`).join('')}</tr>
${rows.map((r) => `<tr>${r.map((v) => `<td style="${cell}">${esc(v)}</td>`).join('')}</tr>`).join('')}</table>`;
const heading = (t) => `<p style="margin:16px 0 0"><strong>${esc(t)}</strong></p>`;

// ── Queues now (same gap maths as the engine) ───────────────────
const attention = [];
const queues = caps.filter((c) => c.Location && c.Membership).map((c) => {
  const inQ = live.filter((e) => e.location === c.Location && e.membership === c.Membership);
  const countedAt = toDate(c['Active Updated At']) || new Date(0);
  const pending = inQ.filter((e) => e.status === 'Signed Up' && e.responseAt && e.responseAt > countedAt).length;
  const holds = inQ.filter((e) => HOLD_STATUSES.includes(e.status)).length;
  const waiting = inQ.filter((e) => ['Waiting', 'Primed'].includes(e.status)).length;
  const warm = inQ.filter((e) => e.status === 'Warm').length;
  const gap = Number(c['Minimum Members'] || 0) - Number(c['Active Members'] || 0) - pending - holds;
  const label = `${c.Location} · ${c.Membership}`;
  if (c.Enabled && !c['Signup URL']) attention.push(`${label}: no Signup URL, so no invites are being sent.`);
  if (c.Enabled && gap > CFG.pauseIfOpenSpotsOver) attention.push(`${label}: paused — ${gap} open spots is more than ${CFG.pauseIfOpenSpotsOver}, so no invites are being sent. Check Minimum Members.`);
  else if (c.Enabled && gap > 0 && waiting + warm === 0) attention.push(`${label}: ${gap} open spot(s) but nobody left on the waitlist.`);
  return { c, label, location: c.Location, enabled: !!c.Enabled, pending, holds, waiting, warm, open: c.Enabled ? Math.max(gap, 0) : 0, gap };
});

// ── Needs attention (Jack's three lines, plus the 60-day "not ready yet" check-ins) ──
const expiring = live.filter((e) => e.status === 'Invited' && e.expiresAt && e.expiresAt > NOW && e.expiresAt - NOW <= DAY);
const unbooked = live.filter((e) => e.status === 'Tour Requested' && !e.tourAt);
const unfilled = queues.reduce((n, q) => n + q.open, 0);
const followUpMs = CFG.notReadyFollowUpDays * DAY;
const dueCheckIn = notReady.filter((e) => NOW - (e.responseAt || e.joinedAt) >= followUpMs);
const needs = [
  ['Invites expiring in the next 24 hours', expiring.length],
  ['Tour requests not yet booked', unbooked.length],
  ['Open spots with no invite sent', unfilled],
  [`"Not ready yet" people due a check-in (${CFG.notReadyFollowUpDays}+ days)`, dueCheckIn.length],
];

// ── Last 24 hours (Jack's six columns) ──────────────────────────
const last24 = [
  ['New sign-ups', count(today, 'Joined')],
  ['Invites sent', count(today, 'Invited')],
  ['Accepted', count(today, 'Signed Up')],
  ['Passed', count(today, ['Not Right Now', 'No Longer Interested'])],
  ['Expired', count(today, 'Timed Out')],
  ['Tour requests', count(today, 'Tour Requested')],
];

// ── By location ─────────────────────────────────────────────────
const LOC_ORDER = ['Greenpoint', 'Williamsburg', 'Lower East Side'];
const locs = [...new Set([...LOC_ORDER, ...caps.map((c) => c.Location), ...live.map((e) => e.location)].filter(Boolean))];
const byLoc = locs.map((loc) => [
  loc,
  live.filter((e) => e.location === loc && ['Waiting', 'Primed', 'Warm'].includes(e.status)).length,
  queues.filter((q) => q.location === loc).reduce((n, q) => n + q.open, 0),
  live.filter((e) => e.location === loc && e.status === 'Invited').length,
]);

// ── Detail ──────────────────────────────────────────────────────
const detail = [
  ['Invited (auto)', count(today, 'Invited', 'Auto')],
  ['Invited (Send Now)', count(today, 'Invited', 'Send Now')],
  ['Signed up', count(today, 'Signed Up')],
  ['Signed up via staff link', count(today, 'Signed Up', 'Admin')],
  ['Tour requested', count(today, 'Tour Requested')],
  ['Tours booked', count(today, 'Tour Booked')],
  ['Tour holds released', count(today, 'Tour Released')],
  ['Not right now', count(today, 'Not Right Now')],
  ['No longer interested', count(today, 'No Longer Interested')],
  ['Timed out', count(today, 'Timed Out')],
  ['Late replies', count(today, 'Late Reply')],
  ['Heads-ups sent', count(today, 'Primed')],
  ['Confirmed still interested', count(today, 'Still Interested')],
  ['Joined waitlist', count(today, 'Joined')],
];
const conversionLocs = [...new Set([...caps.map((c) => c.Location), ...logs.map((f) => f.Location)].filter(Boolean))].sort();
const uniq = (list, event, loc) => new Set(list.filter((f) => f.Event === event && f.Location === loc).map((f) => f['Entry ID'])).size;
const conversion = conversionLocs.map((loc) => {
  const inv30 = uniq(logs, 'Invited', loc);
  const sign30 = uniq(logs, 'Signed Up', loc);
  return [loc, uniq(today, 'Invited', loc), uniq(today, 'Signed Up', loc), inv30, sign30, inv30 ? `${Math.round((sign30 / inv30) * 100)}%` : '—'];
});
const reasons = today
  .filter((f) => ['Not Right Now', 'No Longer Interested'].includes(f.Event) && f.Reason)
  .map((f) => [f.Event, `${f.Membership || ''} at ${f.Location || ''}`, f.Reason]);
const checkIns = dueCheckIn
  .sort((a, b) => (a.responseAt || a.joinedAt) - (b.responseAt || b.joinedAt))
  .map((e) => [e.name || '—', e.email, `${e.membership} at ${e.location}`, fmtTime(e.responseAt || e.joinedAt), e.reason || '']);

for (const e of unbooked.filter((x) => x.responseAt && NOW - x.responseAt > DAY)) {
  attention.push(`${e.name || e.email} (${e.membership} at ${e.location}) asked for a tour on ${fmtTime(e.responseAt)} and has no tour time booked yet. Their spot is still held.`);
}
for (const f of today.filter((x) => x.Event === 'Tour Released')) {
  attention.push(`${f.Name || f.Email} (${f.Membership} at ${f.Location}) toured, but no sign-up link was sent, so their spot was released. Follow up, or press Send Sign-up Link if they want to join.`);
}
for (const f of today.filter((x) => String(x.Detail || '').includes('SIGNUP URL MISSING'))) {
  attention.push(`${f.Email} signed up for ${f.Membership} at ${f.Location} but no signup link was configured — send it manually.`);
}
if (!CFG.engineEnabled) attention.push('The engine is switched OFF in Config.');
if (CFG.sandboxMode) attention.push('SendGrid sandbox mode is ON — no emails are being delivered.');
if (CFG.testRecipient) attention.push(`Test mode is ON — emails go to ${CFG.testRecipient}${(CFG.allowedRecipients || []).length ? `, except ${CFG.allowedRecipients.join(', ')}, who receive theirs for real (with a copy to ${CFG.testRecipient})` : ''}.`);

const dashboard = CFG.dashboardUrl || `https://airtable.com/${CFG.airtableBaseId}`;
const dateLabel = NOW.toLocaleDateString('en-US', { timeZone: CFG.timezone, weekday: 'long', month: 'long', day: 'numeric' });
const intro = `Here is today's waitlist summary. Anything that needs attention is listed first, so if all ${needs.length} lines below read zero, there's nothing to action today.`;
const html = emailLayout(`
<p>Hi team,</p>
<p>${esc(intro)}</p>
${heading('Needs attention')}
${table(['', 'Count'], needs)}
${heading('Last 24 hours')}
${table(last24.map(([k]) => k), [last24.map(([, v]) => v)])}
${heading('By location')}
${table(['Location', 'On waitlist', 'Open spots', 'Invites out'], byLoc)}
<p>The full waitlist and history can be found <a href="${esc(dashboard)}" style="color:#1f1d1a">here</a>.</p>
<p>Thank you,<br>Akari team</p>
<hr style="border:0;border-top:1px solid #eee;margin:24px 0 8px">
<p style="margin:0;color:#8a7f72;font-size:13px">More detail</p>
${attention.length ? `<div style="background:#fbf3e4;border-radius:6px;padding:10px 12px;margin:12px 0 16px;font-size:14px"><strong>Details to check</strong><ul style="margin:6px 0 0 18px;padding:0">${attention.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
${checkIns.length ? `${heading(`"Not ready yet" for ${CFG.notReadyFollowUpDays}+ days — due a check-in`)}${table(['Name', 'Email', 'Queue', 'Since', 'Reason'], checkIns)}` : ''}
${heading('Activity (last 24 hours)')}
${table(['Activity', 'Count'], detail)}
${heading('Conversion by location')}
${table(['Location', 'Invited 24h', 'Signed up 24h', 'Invited 30d', 'Signed up 30d', 'Conversion 30d'], conversion)}
${heading('Queues now')}
${table(['Queue', 'Auto', 'Min', 'Active', 'Pending', 'Held', 'Waiting', 'Warm', 'Open'], queues.map((q) => [q.label, q.enabled ? 'On' : 'Off', q.c['Minimum Members'] ?? 0, q.c['Active Members'] ?? 0, q.pending, q.holds, q.waiting, q.warm, Math.max(q.gap, 0)]))}
${reasons.length ? `${heading('Reasons given')}${table(['Response', 'Queue', 'Reason'], reasons)}` : ''}`, "Today's waitlist activity and action items");

const text = [
  'Hi team,', '', intro, '',
  'Needs attention', ...needs.map(([k, v]) => `${k}: ${v}`), '',
  'Last 24 hours', ...last24.map(([k, v]) => `${k}: ${v}`), '',
  'By location (on waitlist / open spots / invites out)', ...byLoc.map(([l, w, o, i]) => `${l}: ${w} / ${o} / ${i}`), '',
  `The full waitlist and history: ${dashboard}`, '',
  ...(attention.length ? ['Details to check', ...attention.map((a) => `- ${a}`), ''] : []),
  ...(checkIns.length ? [`"Not ready yet" for ${CFG.notReadyFollowUpDays}+ days`, ...checkIns.map((r) => `- ${r[0]} (${r[1]}), ${r[2]}, since ${r[3]}`), ''] : []),
  'Thank you,', 'Akari team',
].join('\n');
return [{ json: { payload: sendgridPayload({ to: CFG.teamEmails, subject: `Akari Waitlist Daily Summary: ${dateLabel}`, html, text }) } }];
