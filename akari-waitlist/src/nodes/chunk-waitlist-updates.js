// One PATCH per 10 rows (Airtable's batch limit) keeps us well under 5 requests/second.
const byId = new Map();
for (const { json: a } of $input.all()) {
  if (!a.recordId || !a.fields) continue;
  byId.set(a.recordId, { ...(byId.get(a.recordId) || {}), ...a.fields });
}
const rows = [...byId].map(([id, fields]) => ({ id, fields }));
// Nothing to update (e.g. only a team alert): one empty batch, which "Any Rows to Update?" routes past the write.
if (!rows.length) return [{ json: { records: [], typecast: true } }];
const out = [];
for (let i = 0; i < rows.length; i += 10) out.push({ json: { records: rows.slice(i, i + 10), typecast: true } });
return out;
