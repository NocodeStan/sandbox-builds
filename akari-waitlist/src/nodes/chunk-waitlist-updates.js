// One PATCH per 10 rows (Airtable's batch limit) keeps us well under 5 requests/second.
const byId = new Map();
for (const { json: a } of $input.all()) {
  if (!a.recordId || !a.fields) continue;
  byId.set(a.recordId, { ...(byId.get(a.recordId) || {}), ...a.fields });
}
const rows = [...byId].map(([id, fields]) => ({ id, fields }));
const out = [];
for (let i = 0; i < rows.length; i += 10) out.push({ json: { records: rows.slice(i, i + 10), typecast: true } });
return out;
