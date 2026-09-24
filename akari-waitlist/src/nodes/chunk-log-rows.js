const rows = $('Apply Tokens').all().map((i) => i.json.log).filter(Boolean).map((fields) => ({ fields }));
const out = [];
for (let i = 0; i < rows.length; i += 10) out.push({ json: { records: rows.slice(i, i + 10), typecast: true } });
return out;
