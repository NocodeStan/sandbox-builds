// Marks waitlist people who already hold a Glofox membership: "Glofox Membership" lists what they hold.
// Their invite becomes the upgrade version (staff change the membership; the sign-up link can't).
// Only rows whose value changes are written; someone who no longer holds a membership is cleared.
const { holders } = $('Count Members').first().json;
const rows = $('Get Waitlist').all().flatMap((i) => i.json.records || []);
const writes = [];
for (const r of rows) {
  const email = String(r.fields.Email || '').trim().toLowerCase();
  const want = (holders[email] || []).slice().sort().join('; ');
  const have = String(r.fields['Glofox Membership'] || '').trim();
  if (want !== have) writes.push({ id: r.id, fields: { 'Glofox Membership': want || null } });
}
const chunks = [];
for (let i = 0; i < writes.length; i += 10) chunks.push({ records: writes.slice(i, i + 10), typecast: true });
return [{ json: { chunks, changed: writes.length, flagged: rows.filter((r) => holders[String(r.fields.Email || '').trim().toLowerCase()]).length } }];
