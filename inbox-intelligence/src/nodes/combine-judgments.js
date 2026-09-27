// @include core
// TypeSafe answers + thread facts → policy decisions, priority and Gmail labels.
// Policy lives here, not in the model: thresholds and weights come from Config and can change without
// re-running any judgment. A failed or missing judgment never guesses; the thread goes to Review.
const T = CFG.thresholds;
const W = CFG.weights;
const L = CFG.labels;
const threads = $('Prepare Thread State').all();
const responses = $input.all();
const store = $getWorkflowStaticData('global');
store.judged = store.judged || {};

const out = threads.map((item, i) => {
  const t = item.json;
  const res = (responses[i] || {}).json || {};
  const a = res.answers || null;
  const usage = res.usage || { input_tokens: 0, output_tokens: 0 };
  const r = { ...t, judged: !!a, error: a ? null : String((res.error && (res.error.message || res.error)) || 'no answer'), usage, labels: [], archive: false };
  delete r.request;

  if (!a) {
    r.labels.push(L.review);
    return { json: r };
  }

  if (t.kind === 'bulk') {
    r.bulkKind = a.kind.choice;
    r.relevance = a.relevance.score;
    r.worthReading = a.relevance.score >= T.reading;
    r.priority = Math.round((a.relevance.score / 3) * 40);
    if (r.worthReading) r.labels.push(L.reading);
    else if (['marketing_promo', 'product_notification'].includes(a.kind.choice) || a.relevance.score < 1) {
      r.labels.push(L.lowValue);
      r.archive = CFG.archiveLowValueBulk && t.inInbox;
    }
    r.labels.push(L.category.automated_notification);
  } else {
    r.category = a.category.choice;
    r.categoryConfidence = a.category.confidence;
    r.pAction = a.needs_owner_action.noul;
    r.pWaiting = a.awaiting_others.noul;
    r.pCommitment = a.owner_commitment_open.noul;
    r.pRisk = a.relationship_risk.noul;
    r.urgency = a.urgency.score;
    r.value = a.strategic_value.score;

    // Direction of the conversation is an observed fact: you can't owe a reply to your own last message,
    // and you can't be waiting on others if they wrote last.
    r.needsAction = r.pAction >= T.action && !t.lastFromOwner;
    r.waitingOn = r.pWaiting >= T.waiting && t.lastFromOwner;
    r.commitmentOpen = r.pCommitment >= T.commitment;
    r.atRisk = r.pRisk >= T.risk;
    r.daysWaiting = r.waitingOn ? Math.max(0, daysBetween(t.lastMessageAt, NOW)) : 0;
    r.nudge = r.waitingOn && r.daysWaiting >= T.nudgeAfterDays;

    const pick = a.deadline && a.deadline.choice !== 'none' ? t.candidates.find((c) => c.key === a.deadline.choice) : null;
    r.deadline = pick ? { date: pick.date, phrase: pick.phrase, confidence: a.deadline.confidence } : null;
    const dueSoon = r.deadline && daysBetween(NOW, `${r.deadline.date}T12:00:00Z`) <= 3;

    r.priority = Math.round(
      W.urgency * (r.urgency / 3) +
      W.value * (r.value / 3) +
      W.action * (r.needsAction || r.commitmentOpen ? 1 : 0) +
      W.risk * r.pRisk +
      W.deadlineSoon * (dueSoon ? 1 : 0),
    );

    r.labels.push(L.category[r.category] || L.category.other);
    if (r.needsAction) r.labels.push(L.action);
    if (r.waitingOn) r.labels.push(L.waiting);
    if (r.commitmentOpen) r.labels.push(L.commitment);
    if (r.atRisk) r.labels.push(L.risk);
    if (r.categoryConfidence < T.minCategoryConfidence) r.labels.push(L.review);
  }

  store.judged[t.threadId] = { m: t.lastMessageId, at: NOW.toISOString() };
  return { json: r };
});

// Forget threads not seen for 21 days so static data stays small.
for (const [id, v] of Object.entries(store.judged)) if (NOW - new Date(v.at) > 21 * DAY) delete store.judged[id];

return out;
