// @include core
// @include mail
// @include-json rubric
// @include rubric
// Gmail thread → TypeSafe request. Code gathers the facts (who wrote last, known relationships, date
// candidates); TypeSafe answers only the questions that need judgment. All questions go in ONE request per
// thread: they are independent, run in parallel, and code later consumes the ones that apply.
const O = CFG.owner.name;
const vars = { owner: O, role: CFG.owner.role };
const store = $getWorkflowStaticData('global');
store.judged = store.judged || {};
const today = dayKey(NOW);
const out = [];

for (const item of $input.all()) {
  const t = item.json;
  const messages = (t.messages || [])
    .filter((m) => !(m.labelIds || []).some((l) => ['DRAFT', 'SPAM', 'TRASH'].includes(l)))
    .sort((a, b) => Number(a.internalDate) - Number(b.internalDate));
  if (!messages.length) continue;

  const last = messages[messages.length - 1];
  // The 2-hourly sort skips threads with nothing new since they were last judged; the weekly report re-reads everything.
  if (ROUTE === 'sort' && store.judged[t.id] && store.judged[t.id].m === last.id) continue;

  const participants = new Map();
  for (const m of messages) {
    for (const h of ['From', 'To', 'Cc']) {
      for (const a of parseAddressList(header(m, h))) if (!participants.has(a.email)) participants.set(a.email, a);
    }
  }
  const fromOf = (m) => parseAddressList(header(m, 'From'))[0] || { name: 'unknown', email: '' };
  const ownerWrote = messages.some((m) => isOwner(fromOf(m).email) || (m.labelIds || []).includes('SENT'));
  const lastFromOwner = isOwner(fromOf(last).email) || (last.labelIds || []).includes('SENT');
  const others = [...participants.values()].filter((p) => !isOwner(p.email));
  const counterpart = others.find((p) => p.email === fromOf(last).email) || [...messages].reverse().map(fromOf).find((p) => !isOwner(p.email)) || others[0] || { name: '—', email: '' };
  const subject = header(messages[0], 'Subject') || '(no subject)';
  const lastAt = new Date(Number(last.internalDate));
  const bulk = isBulkThread(messages, ownerWrote);
  const recent = messages.slice(-CFG.maxMessagesPerThread);
  const texts = recent.map((m) => ({ m, text: messageText(m) }));

  const base = {
    threadId: t.id,
    lastMessageId: last.id,
    subject,
    counterpart,
    participants: others.map((p) => p.email),
    relationship: relationshipOf(counterpart.email),
    lastMessageAt: lastAt.toISOString(),
    firstMessageAt: new Date(Number(messages[0].internalDate)).toISOString(),
    lastFromOwner,
    ownerWrote,
    messageCount: messages.length,
    inInbox: messages.some((m) => (m.labelIds || []).includes('INBOX')),
    unread: messages.some((m) => (m.labelIds || []).includes('UNREAD')),
    kind: bulk ? 'bulk' : 'conversation',
    candidates: [],
  };

  if (bulk) {
    const text = texts[texts.length - 1].text;
    out.push({ json: { ...base, request: {
      model: CFG.typesafeModel,
      state: {
        reader: { name: O, role: CFG.owner.role, focus_areas: CFG.owner.focus },
        email: { from: `${counterpart.name} <${counterpart.email}>`, subject, text },
      },
      questions: rubricQuestions('bulk', vars),
    } } });
    continue;
  }

  // Deadline candidates: phrases found and resolved to dates by code, limited to the next 60 days.
  const seenDates = new Set();
  const candidates = [];
  for (const { m, text } of texts) {
    for (const c of findDateCandidates(text, new Date(Number(m.internalDate)))) {
      if (c.date < today || c.date > addDays(today, 60) || seenDates.has(c.date)) continue;
      seenDates.add(c.date);
      candidates.push({ key: `d${candidates.length + 1}`, ...c, from: isOwner(fromOf(m).email) ? O : fromOf(m).name });
    }
  }
  candidates.splice(6);

  const state = {
    owner: { name: O, role: CFG.owner.role },
    today: fmtLongDay(NOW),
    thread: {
      subject,
      counterpart: { name: counterpart.name, email: counterpart.email, known_relationship: base.relationship || 'unknown' },
      other_participants: others.filter((p) => p.email !== counterpart.email).slice(0, 8).map((p) => `${p.name} <${p.email}>`),
      message_count: messages.length,
      last_message_from_owner: lastFromOwner,
      days_since_last_message: Math.max(0, daysBetween(lastAt, NOW)),
      recent_messages: texts.map(({ m, text }) => ({
        from: isOwner(fromOf(m).email) ? `${O} (owner)` : `${fromOf(m).name} <${fromOf(m).email}>`,
        sent: fmtDay(Number(m.internalDate)),
        text,
      })),
    },
  };

  const questions = rubricQuestions('thread', vars, ['category', 'needs_owner_action', 'awaiting_others', 'owner_commitment_open', 'relationship_risk', 'urgency', 'strategic_value']);

  if (candidates.length) {
    const { deadline } = rubricQuestions('thread', vars, ['deadline']);
    deadline.criteria = {
      ...Object.fromEntries(candidates.map((c) => [c.key, `"${c.phrase}" → ${fmtLongDay(`${c.date}T12:00:00Z`)} (written by ${c.from}; context: "${c.context}")`])),
      ...deadline.criteria,
    };
    questions.deadline = deadline;
  }

  out.push({ json: { ...base, candidates, request: { model: CFG.typesafeModel, state, questions } } });
}

// The weekly report must still go out when nothing needs judging.
if (!out.length && ROUTE === 'report') return [{ json: { none: true } }];
return out;
