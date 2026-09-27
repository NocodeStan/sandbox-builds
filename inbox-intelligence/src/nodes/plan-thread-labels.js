// @include core
// Label names → Gmail label IDs, one modify request per thread. Every IQ label a thread no longer earns is
// removed, so labels always reflect the latest judgment (e.g. Action clears once you've replied).
const byName = new Map(($input.first().json.labels || []).map((l) => [l.name, l.id]));
const iqIds = CFG.allLabels.filter((n) => n !== CFG.labels.root).map((n) => byName.get(n)).filter(Boolean);
const missing = CFG.allLabels.filter((n) => !byName.has(n));
if (missing.length) throw new Error(`Gmail labels missing after create: ${missing.join(', ')}`);

return $('Combine Judgments').all().map(({ json: t }) => {
  const add = t.labels.map((n) => byName.get(n));
  const remove = iqIds.filter((id) => !add.includes(id));
  if (t.archive) remove.push('INBOX');
  return { json: { threadId: t.threadId, body: { addLabelIds: add, removeLabelIds: remove } } };
});
