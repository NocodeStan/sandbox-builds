// Airtable locks a base for 30s after a rate-limit hit, longer than n8n's retry settings can wait
// (max 5 tries × 5s). So a write node continues on error, and this checks which batches were refused:
// those go round a 35s wait and are resent (only those, so log rows are never doubled).
const MAX_ATTEMPTS = 4;
const RETRYABLE = /429|too many requests|rate.?limit|5\d\d|ECONN|ETIMEDOUT|ENOTFOUND|socket hang up|timeout/i;

function checkWrites(pendingNode, what) {
  const sent = $(pendingNode).all();
  const failed = $input.all()
    .map((r, i) => (r.json.error ? { batch: sent[i].json, error: r.json.error } : null))
    .filter(Boolean);
  if (!failed.length) return [{ json: { retry: false } }];
  const detail = JSON.stringify(failed[0].error).slice(0, 300);
  const attempt = Number(failed[0].batch.attempt || 1);
  if (!RETRYABLE.test(detail)) throw new Error(`Airtable refused ${failed.length} ${what} batch(es): ${detail}`);
  if (attempt >= MAX_ATTEMPTS) throw new Error(`Airtable still refusing ${failed.length} ${what} batch(es) after ${attempt} attempts: ${detail}`);
  return failed.map((f) => ({ json: { retry: true, records: f.batch.records, attempt: attempt + 1 } }));
}
