// @include core
// @include mail
// Gmail thread → TypeSafe request. Code gathers the facts (who wrote last, known relationships, date
// candidates); TypeSafe answers only the questions that need judgment. All questions go in ONE request per
// thread: they are independent, run in parallel, and code later consumes the ones that apply.
const O = CFG.owner.name;
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
      questions: {
        kind: {
          type: 'choice',
          instructions: 'What kind of automated or bulk email is `email`?',
          criteria: {
            newsletter_research: 'Editorial newsletter, research digest, analysis or industry news',
            event_invitation: 'Invitation to a conference, webinar, meetup or other event',
            marketing_promo: 'Product marketing, promotion, sale or sales outreach sent in bulk',
            product_notification: 'Automated notice from a tool or service: activity, alerts, reminders, digests of app activity',
            billing_receipt: 'Invoice, receipt, payment, subscription or billing notice',
            security_account: 'Security alert, sign-in notice, password or account change',
            other: 'None of the above',
          },
        },
        relevance: {
          type: 'score',
          instructions: `How useful is \`email\` to \`reader\`, given their role and \`reader.focus_areas\`?`,
          criteria: [
            'No use: unrelated to their work or interests, or pure promotion',
            'Marginal: loosely related; safe to skip',
            'Useful: substantive content on one of their focus areas worth a skim this week',
            'High value: insight, data, opportunity or event directly relevant to their advisory work that they would regret missing',
          ],
        },
      },
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

  const questions = {
    category: {
      type: 'choice',
      instructions: `Which area of ${O}'s work is \`thread\` mainly about? ${O} is the owner of this inbox.`,
      criteria: {
        client_delivery: `Work for an existing client: engagements, deliverables, workshops, feedback, scheduling client sessions`,
        new_business: `Winning new work: enquiries, prospects, proposals, pricing, introductions to potential clients`,
        partnerships_speaking: 'Partnerships, collaborations, speaking, media, podcasts, advisory boards, community',
        finance_admin: 'Invoices, payments, contracts, legal, tax, insurance, accounts, suppliers',
        team_ops: `Running ${O}'s own business: associates, contractors, tools, internal planning`,
        personal: 'Personal or family matters unrelated to work',
        automated_notification: 'Machine-generated message from a system or service, with no person expecting a reply',
        other: 'None of the above',
      },
    },
    needs_owner_action: {
      type: 'noul',
      instructions: `Considering the whole of \`thread\`, is someone waiting on ${O} (the owner) for a reply, decision, approval, information or deliverable that the thread does not show ${O} has already given?`,
      criteria: {
        true: `Yes: a question, request or proposal is addressed to ${O} and is still unanswered or undelivered`,
        false: `No: nothing is outstanding from ${O}; the thread is informational, already answered, or closed with thanks`,
      },
    },
    awaiting_others: {
      type: 'noul',
      instructions: `Considering the whole of \`thread\`, is ${O} (the owner) waiting on someone else for a reply, decision, document or action that has not yet arrived in the thread?`,
    },
    owner_commitment_open: {
      type: 'noul',
      instructions: `Did ${O} (the owner) personally commit in \`thread\` to do something (send, review, introduce, call, deliver) that later messages do not show as done?`,
    },
    relationship_risk: {
      type: 'noul',
      instructions: `Does \`thread\` show a risk to ${O}'s relationship with the other party: dissatisfaction, complaint, escalation, frustration at slow response, a dispute, or a threat to cancel?`,
    },
    urgency: {
      type: 'score',
      instructions: `How time-critical is \`thread\` for ${O} as of \`today\`?`,
      criteria: [
        'No time pressure: informational, or no action needed',
        'Weeks: something to handle this month',
        'This week: needs handling within the next few working days',
        'Immediate: due within 48 hours, overdue, or explicitly marked urgent',
      ],
    },
    strategic_value: {
      type: 'score',
      instructions: `How much does \`thread\` matter to ${O}'s business, given their role as ${CFG.owner.role}?`,
      criteria: [
        'None: no business relevance',
        'Routine: ordinary operations or logistics',
        'Significant: active client work, revenue, or a relationship that matters',
        'Material: new revenue opportunity, senior executive stakeholder, or contractual, financial or reputational stakes',
      ],
    },
  };

  if (candidates.length) {
    questions.deadline = {
      type: 'choice',
      instructions: `Each option is a date mentioned in \`thread\`, already resolved to a calendar date. Which one is a deadline or scheduled commitment that ${O} (the owner) must act on or attend? A date that is only background, in the past, or someone else's commitment is not.`,
      criteria: {
        ...Object.fromEntries(candidates.map((c) => [c.key, `"${c.phrase}" → ${fmtLongDay(`${c.date}T12:00:00Z`)} (written by ${c.from}; context: "${c.context}")`])),
        none: `None of these is a deadline or commitment for ${O}`,
      },
    };
  }

  out.push({ json: { ...base, candidates, request: { model: CFG.typesafeModel, state, questions } } });
}

// The weekly report must still go out when nothing needs judging.
if (!out.length && ROUTE === 'report') return [{ json: { none: true } }];
return out;
