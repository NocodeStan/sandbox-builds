// @include core
// One item per thread from the paginated threads.list responses (capped). Always emits at least one item
// so an empty inbox still reaches the weekly report: { none: true } is routed past the judging steps.
const seen = new Set();
const ids = [];
for (const page of $input.all()) {
  for (const t of page.json.threads || []) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      ids.push(t.id);
    }
  }
}
const kept = ids.slice(0, CFG.maxThreadsPerRun);
if (!kept.length) return [{ json: { none: true } }];
return kept.map((threadId) => ({ json: { threadId, truncated: ids.length > kept.length ? ids.length - kept.length : 0 } }));
