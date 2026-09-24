// @include core
// @include email
const logs = recordsOf('Get Log (30 days)').map((r) => r.fields || {});
const live = recordsOf('Get Queue Snapshot').map(normEntry);
const caps = recordsOf('Get Capacity (report)').map((r) => r.fields || {});
const within = (f, ms) => f.Timestamp && NOW - new Date(f.Timestamp) <= ms;
const today = logs.filter((f) => within(f, DAY));
const count = (list, event, source) => list.filter((f) => f.Event === event && (!source || f.Source === source)).length;
const cell = 'padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;text-align:left';
const table = (head, rows) => `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:8px 0 20px">
<tr>${head.map((h) => `<th style="${cell};color:#8a7f72;font-weight:normal">${esc(h)}</th>`).join('')}</tr>
${rows.map((r) => `<tr>${r.map((v) => `<td style="${cell}">${esc(v)}</td>`).join('')}</tr>`).join('')}</table>`;

// Headline counts (last 24h)
const headline = [
  ['Invited (auto)', count(today, 'Invited', 'Auto')],
  ['Invited (Send Now)', count(today, 'Invited', 'Send Now')],
  ['Signed up', count(today, 'Signed Up')],
  ['Tour requested', count(today, 'Tour Requested')],
  ['Not right now', count(today, 'Not Right Now')],
  ['No longer interested', count(today, 'No Longer Interested')],
  ['Timed out', count(today, 'Timed Out')],
  ['Late replies', count(today, 'Late Reply')],
  ['Heads-ups sent', count(today, 'Primed')],
  ['Joined waitlist', count(today, 'Joined')],
];

// Conversion by location (30 days): unique people invited vs signed up
const locations = [...new Set([...caps.map((c) => c.Location), ...logs.map((f) => f.Location)].filter(Boolean))].sort();
const uniq = (list, event, loc) => new Set(list.filter((f) => f.Event === event && f.Location === loc).map((f) => f['Entry ID'])).size;
const byLocation = locations.map((loc) => {
  const inv30 = uniq(logs, 'Invited', loc);
  const sign30 = uniq(logs, 'Signed Up', loc);
  return [loc, uniq(today, 'Invited', loc), uniq(today, 'Signed Up', loc), inv30, sign30, inv30 ? `${Math.round((sign30 / inv30) * 100)}%` : '—'];
});

// Reasons given today
const reasons = today
  .filter((f) => ['Not Right Now', 'No Longer Interested'].includes(f.Event) && f.Reason)
  .map((f) => [f.Event, `${f.Membership || ''} at ${f.Location || ''}`, f.Reason]);

// Queue snapshot (same gap maths as the engine)
const attention = [];
const queueRows = caps
  .filter((c) => c.Location && c.Membership)
  .map((c) => {
    const inQ = live.filter((e) => e.location === c.Location && e.membership === c.Membership);
    const countedAt = toDate(c['Active Updated At']) || new Date(0);
    const pending = inQ.filter((e) => e.status === 'Signed Up' && e.responseAt && e.responseAt > countedAt).length;
    const holds = inQ.filter((e) => HOLD_STATUSES.includes(e.status)).length;
    const waiting = inQ.filter((e) => ['Waiting', 'Primed'].includes(e.status)).length;
    const warm = inQ.filter((e) => e.status === 'Warm').length;
    const gap = Number(c['Minimum Members'] || 0) - Number(c['Active Members'] || 0) - pending - holds;
    const label = `${c.Location} · ${c.Membership}`;
    if (c.Enabled && !c['Signup URL']) attention.push(`${label}: no Signup URL, so no invites are being sent.`);
    if (c.Enabled && gap > 0 && waiting + warm === 0) attention.push(`${label}: ${gap} open spot(s) but nobody left on the waitlist.`);
    return [label, c.Enabled ? 'On' : 'Off', c['Minimum Members'] ?? 0, c['Active Members'] ?? 0, pending, holds, waiting, warm, Math.max(gap, 0)];
  });

for (const e of live.filter((x) => x.status === 'Tour Requested' && x.responseAt && NOW - x.responseAt > CFG.tourStaleDays * DAY)) {
  attention.push(`${e.name || e.email} (${e.membership} at ${e.location}) has had a tour hold since ${fmtTime(e.responseAt)}.`);
}
for (const f of today.filter((x) => String(x.Detail || '').includes('SIGNUP URL MISSING'))) {
  attention.push(`${f.Email} signed up for ${f.Membership} at ${f.Location} but no signup link was configured — send it manually.`);
}
if (!CFG.engineEnabled) attention.push('The engine is switched OFF in Config.');
if (CFG.sandboxMode) attention.push('SendGrid sandbox mode is ON — no emails are being delivered.');
if (CFG.testRecipient) attention.push(`Test mode is ON — all emails go to ${CFG.testRecipient}.`);

const dateLabel = NOW.toLocaleDateString('en-US', { timeZone: CFG.timezone, weekday: 'long', month: 'long', day: 'numeric' });
const html = emailLayout(`
<p style="font-size:20px;margin:0 0 4px"><strong>Waitlist daily summary</strong></p>
<p style="margin:0 0 16px;color:#8a7f72">${esc(dateLabel)} · last 24 hours</p>
${attention.length ? `<div style="background:#fbf3e4;border-radius:6px;padding:10px 12px;margin-bottom:16px;font-size:14px"><strong>Needs attention</strong><ul style="margin:6px 0 0 18px;padding:0">${attention.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
${table(['Activity', 'Count'], headline)}
<p style="margin:0"><strong>By location</strong></p>
${table(['Location', 'Invited 24h', 'Signed up 24h', 'Invited 30d', 'Signed up 30d', 'Conversion 30d'], byLocation)}
<p style="margin:0"><strong>Queues now</strong></p>
${table(['Queue', 'Auto', 'Min', 'Active', 'Pending', 'Held', 'Waiting', 'Warm', 'Open'], queueRows)}
${reasons.length ? `<p style="margin:0"><strong>Reasons given</strong></p>${table(['Response', 'Queue', 'Reason'], reasons)}` : ''}`);

const text = [`Waitlist daily summary — ${dateLabel}`, ...attention.map((a) => `! ${a}`), ...headline.map(([k, v]) => `${k}: ${v}`)].join('\n');
return [{ json: { payload: sendgridPayload({ to: CFG.teamEmails, subject: `Waitlist summary — ${dateLabel}`, html, text }) } }];
