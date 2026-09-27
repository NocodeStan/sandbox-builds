// @include core
// Assembles the weekly intelligence report from judgments. No generated prose: every line is a real thread or
// event, selected and ranked by code, so nothing in the report can be invented.
const T = CFG.thresholds;
const threads = $('Combine Judgments').isExecuted ? $('Combine Judgments').all().map((i) => i.json) : [];
const prep = $('Prepare Event Requests').all();
const judged = $('TypeSafe: Judge Events').isExecuted ? $('TypeSafe: Judge Events').all() : [];
const events = (prep[0] && prep[0].json.events) || [];

// Event judgments back onto events
const evJ = {};
prep.forEach((p, i) => {
  const a = judged[i] && judged[i].json && judged[i].json.answers;
  if (!a) return;
  for (const [k, id] of Object.entries(p.json.keys || {})) {
    evJ[id] = { type: a[`${k}_type`] && a[`${k}_type`].choice, prep: a[`${k}_prep`] ? a[`${k}_prep`].score : null };
  }
});
for (const e of events) {
  const j = evJ[e.id] || {};
  e.type = e.outOfOffice ? 'out_of_office' : !e.judge ? (e.allDay ? 'all_day' : 'solo') : j.type || 'unjudged';
  e.prep = j.prep ?? null;
}

// ── Selections ──
const conv = threads.filter((t) => t.kind === 'conversation' && t.judged);
const byPriority = (a, b) => b.priority - a.priority || new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
const actions = conv.filter((t) => t.needsAction).sort(byPriority);
const commitments = conv.filter((t) => t.commitmentOpen).sort(byPriority);
const waiting = conv.filter((t) => t.waitingOn).sort((a, b) => b.daysWaiting - a.daysWaiting);
const risks = conv.filter((t) => t.atRisk).sort(byPriority);
const pipeline = conv.filter((t) => t.category === 'new_business').sort(byPriority);
const reading = threads.filter((t) => t.worthReading).sort((a, b) => b.relevance - a.relevance);
const failed = threads.filter((t) => !t.judged);
const review = threads.filter((t) => t.labels.includes(CFG.labels.review));
const today = dayKey(NOW);
const horizon = dayKey(NOW.getTime() + CFG.lookAheadDays * DAY);
const deadlines = conv.filter((t) => t.deadline && t.deadline.date >= today && t.deadline.date <= horizon)
  .sort((a, b) => a.deadline.date.localeCompare(b.deadline.date));
const past = events.filter((e) => e.isPast);
const upcoming = events.filter((e) => !e.isPast).sort((a, b) => new Date(a.start) - new Date(b.start));
const prepList = upcoming.filter((e) => (e.prep ?? 0) >= 2 || e.related.some((r) => r.needsAction || r.atRisk));

const CAT_NAMES = {
  client_delivery: 'Client delivery', new_business: 'New business', partnerships_speaking: 'Partnerships & speaking',
  finance_admin: 'Finance & admin', team_ops: 'Team & ops', personal: 'Personal', automated_notification: 'Notifications', other: 'Other',
};
const TYPE_NAMES = {
  client: 'Client', new_business: 'New business', partner_network: 'Partners & network', internal: 'Internal', personal: 'Personal', other: 'Other',
  solo: 'Solo / focus blocks', all_day: 'All-day', out_of_office: 'Out of office', unjudged: 'Unclassified',
};
const count = (list, key) => list.reduce((m, x) => ((m[x[key]] = (m[x[key]] || 0) + 1), m), {});
const catCounts = Object.entries(count(conv, 'category')).sort((a, b) => b[1] - a[1]);
const hoursByType = Object.entries(past.filter((e) => !e.allDay).reduce((m, e) => ((m[e.type] = (m[e.type] || 0) + e.hours), m), {}))
  .sort((a, b) => b[1] - a[1]);
const meetingHoursPast = past.filter((e) => !e.allDay && e.type !== 'solo').reduce((s, e) => s + e.hours, 0);
const meetingHoursAhead = upcoming.filter((e) => !e.allDay && e.type !== 'solo').reduce((s, e) => s + e.hours, 0);
const tokens = threads.reduce((s, t) => s + (t.usage?.input_tokens || 0) + (t.usage?.output_tokens || 0), 0)
  + judged.reduce((s, j) => s + ((j.json.usage || {}).input_tokens || 0) + ((j.json.usage || {}).output_tokens || 0), 0);

// Each thread is listed once in sections 1–5, in the first section it qualifies for (counts stay totals).
const listed = new Set();
const once = (list) => list.filter((t) => !listed.has(t.threadId) && listed.add(t.threadId));
const show = {};
for (const [k, list] of [['risks', risks], ['actions', actions], ['commitments', commitments], ['waiting', waiting], ['pipeline', pipeline]]) show[k] = once(list);

// ── Rendering ──
const C = { ink: '#1a1a1a', mute: '#6b6b6b', line: '#e6e3dd', accent: '#1f4e79', warn: '#a33b20', soft: '#f6f4f0' };
const h1 = (s) => `<h2 style="font:600 15px/1.3 Georgia,serif;color:${C.ink};margin:28px 0 8px;padding-bottom:6px;border-bottom:1px solid ${C.line}">${s}</h2>`;
const who = (t) => esc(t.counterpart.name || t.counterpart.email);
const ago = (iso) => {
  const d = daysBetween(iso, NOW);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`;
};
const link = (t) => `<a href="${gmailLink(t.threadId)}" style="color:${C.accent};text-decoration:none">${esc(t.subject)}</a>`;
const tags = (t) => [
  t.deadline ? `<span style="color:${C.warn}">due ${esc(fmtDay(`${t.deadline.date}T12:00:00Z`))}</span>` : '',
  t.atRisk ? `<span style="color:${C.warn}">at risk</span>` : '',
  t.relationship ? esc(t.relationship) : '',
].filter(Boolean).join(' · ');
const row = (t, extra = '') =>
  `<tr><td style="padding:7px 0;border-bottom:1px solid ${C.line};vertical-align:top">${link(t)}<div style="color:${C.mute};font-size:12px">${who(t)} · ${ago(t.lastMessageAt)}${tags(t) ? ` · ${tags(t)}` : ''}${extra}</div></td>`
  + `<td style="padding:7px 0 7px 12px;border-bottom:1px solid ${C.line};text-align:right;vertical-align:top;color:${C.mute};font-size:12px;white-space:nowrap">${t.priority}</td></tr>`;
const table = (list, extra) => `<table width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;color:${C.ink}">${list.map((t) => row(t, extra ? extra(t) : '')).join('')}</table>`;
const none = (s) => `<p style="color:${C.mute};font-size:13px;margin:4px 0">${s}</p>`;
const more = (list, n) => (list.length > n ? `<p style="color:${C.mute};font-size:12px;margin:6px 0">+ ${list.length - n} more under the <em>${esc(CFG.labels.root)}</em> labels in Gmail.</p>` : '');
const kpi = (n, label, warn) => `<td style="padding:10px 12px;background:${C.soft};text-align:center;width:16%"><div style="font:600 22px Georgia,serif;color:${warn && n ? C.warn : C.ink}">${n}</div><div style="font-size:11px;color:${C.mute};text-transform:uppercase;letter-spacing:.04em">${label}</div></td>`;
const fmtH = (h) => `${Math.round(h * 10) / 10}h`;

const days = [];
for (const e of upcoming) {
  const k = dayKey(e.start);
  if (!days.length || days[days.length - 1].k !== k) days.push({ k, list: [] });
  days[days.length - 1].list.push(e);
}
const eventLine = (e) => {
  const flags = [
    e.prep >= 2 ? `<span style="color:${C.warn}">${e.prep >= 2.5 ? 'substantial prep' : 'prep'}</span>` : '',
    ...e.related.map((r) => `open thread: <a href="${gmailLink(r.threadId)}" style="color:${C.accent};text-decoration:none">${esc(r.subject)}</a>${r.needsAction ? ' (you owe a reply)' : ''}`),
  ].filter(Boolean).join(' · ');
  return `<tr><td style="padding:5px 0;color:${C.mute};font-size:12px;width:92px;vertical-align:top">${e.allDay ? 'all day' : `${fmtTime(e.start)}–${fmtTime(e.end)}`}</td>`
    + `<td style="padding:5px 0;font-size:14px;vertical-align:top">${esc(e.title)} <span style="color:${C.mute};font-size:12px">${esc(TYPE_NAMES[e.type] || e.type)}${e.attendees.length ? ` · ${e.attendees.length} guest${e.attendees.length > 1 ? 's' : ''}` : ''}</span>${flags ? `<div style="font-size:12px;color:${C.mute}">${flags}</div>` : ''}</td></tr>`;
};

const weekFrom = fmtDay(NOW.getTime() - CFG.lookBackDays * DAY);
const weekTo = fmtDay(NOW.getTime() + CFG.lookAheadDays * DAY);
const subject = `Week ahead · ${fmtDay(NOW)} · ${actions.length} to act on${risks.length ? `, ${risks.length} at risk` : ''}${prepList.length ? `, ${prepList.length} meetings to prep` : ''}`;

const html = `<!doctype html><html><body style="margin:0;background:#fff">
<div style="max-width:680px;margin:0 auto;padding:24px 20px;font:14px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${C.ink}">
<div style="font-size:12px;color:${C.mute};text-transform:uppercase;letter-spacing:.06em">Inbox intelligence · ${esc(weekFrom)} → ${esc(weekTo)}</div>
<h1 style="font:600 24px/1.25 Georgia,serif;margin:6px 0 16px">${esc(CFG.owner.name)}, your week in one page</h1>
<table width="100%" cellspacing="4" cellpadding="0"><tr>
${kpi(actions.length, 'You owe', true)}${kpi(commitments.length, 'You promised', true)}${kpi(waiting.length, 'Waiting on')}${kpi(risks.length, 'At risk', true)}${kpi(prepList.length, 'Meetings to prep', true)}${kpi(conv.length, 'Live threads')}
</tr></table>

${h1('1 · Relationship risk')}
${show.risks.length ? table(show.risks.slice(0, 6)) : none('No dissatisfaction, escalation or churn signals detected.')}

${h1('2 · Decide or reply first')}
${show.actions.length ? table(show.actions.slice(0, 10)) + more(show.actions, 10) : none(actions.length ? 'Everything you owe is listed above.' : 'Nothing outstanding from you. Inbox is clear.')}

${h1('3 · What you promised')}
${show.commitments.length ? table(show.commitments.slice(0, 8)) + more(show.commitments, 8) : none(commitments.length ? 'Your open commitments are listed above.' : 'No open commitments found in last week’s threads.')}

${h1('4 · Waiting on others')}
${show.waiting.length ? table(show.waiting.slice(0, 8), (t) => ` · waiting ${t.daysWaiting}d${t.nudge ? ` · <strong style="color:${C.warn}">chase</strong>` : ''}`) + more(show.waiting, 8) : none(waiting.length ? 'Listed above.' : 'Nobody owes you a reply.')}

${h1('5 · Other pipeline activity')}
${show.pipeline.length ? table(show.pipeline.slice(0, 8)) + more(show.pipeline, 8) : none(pipeline.length ? 'All new-business threads are listed above.' : 'No new-business threads this week.')}

${h1('6 · Week ahead')}
<p style="margin:4px 0 8px;font-size:13px;color:${C.mute}">${upcoming.length} events · ${fmtH(meetingHoursAhead)} in meetings${deadlines.length ? ` · ${deadlines.length} email deadline${deadlines.length > 1 ? 's' : ''}` : ''}</p>
${days.length ? days.map((d) => `<div style="margin-top:10px;font-weight:600;font-size:13px">${esc(fmtDay(`${d.k}T12:00:00Z`))}</div><table width="100%" cellspacing="0" cellpadding="0">${d.list.map(eventLine).join('')}</table>`).join('') : none('Calendar is empty for the next week.')}
${deadlines.length ? `<div style="margin-top:14px;font-weight:600;font-size:13px">Deadlines found in email</div>${table(deadlines.slice(0, 8), (t) => ` · “${esc(t.deadline.phrase)}”`)}` : ''}

${h1('7 · Last week in numbers')}
<table width="100%" cellspacing="0" cellpadding="0" style="font-size:13px"><tr>
<td style="vertical-align:top;width:50%;padding-right:12px"><div style="font-weight:600;margin-bottom:4px">Email by area (${conv.length} threads)</div>
${catCounts.map(([k, n]) => `<div>${esc(CAT_NAMES[k] || k)} <span style="color:${C.mute}">${n}</span></div>`).join('') || none('—')}
<div style="color:${C.mute};margin-top:4px">+ ${threads.filter((t) => t.kind === 'bulk').length} newsletters &amp; notifications</div></td>
<td style="vertical-align:top;width:50%"><div style="font-weight:600;margin-bottom:4px">Time in meetings (${fmtH(meetingHoursPast)})</div>
${hoursByType.filter(([k]) => k !== 'solo').map(([k, h]) => `<div>${esc(TYPE_NAMES[k] || k)} <span style="color:${C.mute}">${fmtH(h)}</span></div>`).join('') || none('—')}</td>
</tr></table>

${h1('8 · Worth reading')}
${reading.length ? `<ul style="padding-left:18px;margin:4px 0">${reading.slice(0, 5).map((t) => `<li style="margin:3px 0">${link(t)} <span style="color:${C.mute};font-size:12px">${who(t)}</span></li>`).join('')}</ul>` : none('Nothing above the relevance bar this week.')}

<p style="margin-top:28px;padding-top:10px;border-top:1px solid ${C.line};font-size:11px;color:${C.mute}">
Ranked by priority (0–100: urgency, business value, open obligation, relationship risk, near deadline). Judgments by TypeSafe ${esc(CFG.typesafeModel)} · ${threads.length} threads, ${events.length} events, ${tokens.toLocaleString('en-GB')} tokens.
${review.length ? ` ${review.length} thread${review.length > 1 ? 's' : ''} labelled <em>${esc(CFG.labels.review)}</em> for a quick human check.` : ''}
${failed.length ? ` <strong style="color:${C.warn}">${failed.length} thread${failed.length > 1 ? 's' : ''} could not be judged</strong> (service error) and will be retried next run.` : ''}
</p></div></body></html>`;

const lines = (title, list, fmt = (t) => `- ${t.subject} (${t.counterpart.name}, ${ago(t.lastMessageAt)})`) => [`${title}`, ...(list.length ? list.slice(0, 10).map(fmt) : ['- none']), ''];
const text = [
  `Inbox intelligence · ${weekFrom} → ${weekTo}`,
  `You owe ${actions.length} · You promised ${commitments.length} · Waiting on ${waiting.length} · At risk ${risks.length} · Meetings to prep ${prepList.length}`,
  '',
  ...lines('1 · Relationship risk', show.risks),
  ...lines('2 · Decide or reply first', show.actions),
  ...lines('3 · What you promised', show.commitments),
  ...lines('4 · Waiting on others', show.waiting, (t) => `- ${t.subject} (${t.counterpart.name}, waiting ${t.daysWaiting}d${t.nudge ? ', chase' : ''})`),
  ...lines('5 · Other pipeline activity', show.pipeline),
  ...lines('6 · Week ahead', upcoming, (e) => `- ${fmtDay(e.start)} ${e.allDay ? 'all day' : fmtTime(e.start)} ${e.title}${e.prep >= 2 ? ' [prep]' : ''}`),
].join('\n');

// RFC 2822 message for gmail users.messages.send
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const boundary = `iq-${NOW.getTime()}`;
const mime = [
  `To: ${CFG.reportTo.join(', ')}`,
  `Subject: =?UTF-8?B?${b64(subject)}?=`,
  'MIME-Version: 1.0',
  `Content-Type: multipart/alternative; boundary="${boundary}"`,
  '',
  `--${boundary}`,
  'Content-Type: text/plain; charset=UTF-8',
  'Content-Transfer-Encoding: base64',
  '',
  b64(text).replace(/.{76}/g, '$&\r\n'),
  `--${boundary}`,
  'Content-Type: text/html; charset=UTF-8',
  'Content-Transfer-Encoding: base64',
  '',
  b64(html).replace(/.{76}/g, '$&\r\n'),
  `--${boundary}--`,
  '',
].join('\r\n');

return [{
  json: {
    raw: Buffer.from(mime, 'utf8').toString('base64url'),
    subject,
    html,
    stats: {
      threads: threads.length, conversations: conv.length, actions: actions.length, commitments: commitments.length,
      waiting: waiting.length, risks: risks.length, pipeline: pipeline.length, reading: reading.length,
      upcoming: upcoming.length, prep: prepList.length, deadlines: deadlines.length, failed: failed.length, review: review.length, tokens,
    },
  },
}];
