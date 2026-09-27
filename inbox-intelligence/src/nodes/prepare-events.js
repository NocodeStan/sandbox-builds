// @include core
// Calendar (last N days + next N days) → normalised events, joined to open email threads by attendee address,
// then batched into TypeSafe requests. Each event gets its own questions, pointing at `events[i]` in shared state.
const O = CFG.owner.name;
const threads = $('Combine Judgments').isExecuted ? $('Combine Judgments').all().map((i) => i.json) : [];
const open = threads.filter((t) => t.needsAction || t.waitingOn || t.commitmentOpen || t.atRisk);

const events = [];
for (const e of $input.first().json.items || []) {
  if (e.status === 'cancelled' || ['workingLocation', 'focusTime'].includes(e.eventType)) continue;
  const me = (e.attendees || []).find((a) => a.self || isOwner(a.email));
  if (me && me.responseStatus === 'declined') continue;
  const allDay = !e.start.dateTime;
  const start = e.start.dateTime || `${e.start.date}T00:00:00Z`;
  const end = (e.end && (e.end.dateTime || `${e.end.date}T00:00:00Z`)) || start;
  const attendees = (e.attendees || []).filter((a) => !a.resource && !a.self && !isOwner(a.email))
    .map((a) => ({ name: a.displayName || a.email.split('@')[0], email: lower(a.email) }));
  const emails = new Set(attendees.map((a) => a.email));
  const related = open.filter((t) => t.participants.some((p) => emails.has(p)))
    .sort((x, y) => y.priority - x.priority).slice(0, 3)
    .map((t) => ({ threadId: t.threadId, subject: t.subject, needsAction: !!t.needsAction, atRisk: !!t.atRisk }));
  events.push({
    id: e.id,
    title: e.summary || '(no title)',
    start,
    end,
    allDay,
    hours: allDay ? 0 : Math.max(0, (new Date(end) - new Date(start)) / HOUR),
    isPast: new Date(end) <= NOW,
    attendees,
    relationship: attendees.map((a) => relationshipOf(a.email)).find(Boolean) || null,
    outOfOffice: e.eventType === 'outOfOffice',
    link: e.htmlLink || '',
    description: String(e.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400),
    related,
    // Solo blocks, all-day markers and out-of-office are classified by rule; only meetings with people are judged.
    judge: !allDay && !e.eventType?.startsWith('outOf') && attendees.length > 0,
  });
}

const toJudge = events.filter((e) => e.judge);
const chunks = [];
for (let i = 0; i < toJudge.length; i += CFG.eventsPerRequest) chunks.push(toJudge.slice(i, i + CFG.eventsPerRequest));
if (!chunks.length) return [{ json: { events, keys: {}, request: null } }];

return chunks.map((chunk) => {
  const questions = {};
  const keys = {};
  chunk.forEach((e, i) => {
    keys[`e${i}`] = e.id;
    questions[`e${i}_type`] = {
      type: 'choice',
      instructions: `What kind of meeting is \`events[${i}]\` for ${O}?`,
      criteria: {
        client: 'Working session, review or check-in with an existing client',
        new_business: 'Sales conversation, discovery call, pitch or proposal meeting with a prospective client',
        partner_network: 'Partner, collaborator, speaking, media, investor or networking meeting',
        internal: `Internal: ${O}'s own associates, contractors or suppliers`,
        personal: 'Personal appointment unrelated to work',
        other: 'None of the above',
      },
    };
    if (!e.isPast) {
      questions[`e${i}_prep`] = {
        type: 'score',
        instructions: `How much preparation does ${O} need before \`events[${i}]\`? Consider its purpose, attendees and \`events[${i}].open_email_threads\`.`,
        criteria: [
          'None: routine or recurring; walk in as is',
          'Light: skim notes or the latest thread beforehand',
          'Moderate: review materials, decide positions, or resolve an open email thread first',
          'Substantial: a deck, proposal, analysis or decision must be ready; senior or high-stakes audience',
        ],
      };
    }
  });
  const state = {
    owner: { name: O, role: CFG.owner.role },
    today: fmtLongDay(NOW),
    events: chunk.map((e) => ({
      title: e.title,
      when: `${fmtDay(e.start)} ${fmtTime(e.start)}–${fmtTime(e.end)}${e.isPast ? ' (past)' : ''}`,
      attendees: e.attendees.slice(0, 12).map((a) => `${a.name} <${a.email}>`),
      known_relationship: e.relationship || 'unknown',
      description: e.description,
      open_email_threads: e.related.map((r) => r.subject),
    })),
  };
  return { json: { events, keys, request: { model: CFG.typesafeModel, state, questions } } };
});
