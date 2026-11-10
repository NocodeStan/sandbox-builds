// @include core
// A location or membership the team has just added to the Typeform gets its own Capacity row the
// first time someone picks it: switched off, Minimum and Active at 0, price taken from the form
// label when it has one. Staff then fill in the numbers and the Signup URL and tick Enabled.
const p = $('Parse Typeform').first().json;
const have = new Set(recordsOf('Get Capacity (intake)').map((r) => `${r.fields.Location}|${r.fields.Membership}`));
const rows = [];
for (const q of p.queues || []) {
  const key = `${q.location}|${q.membership}`;
  if (have.has(key)) continue;
  have.add(key);
  rows.push({
    fields: {
      Queue: `${q.location} · ${q.membership}`,
      Location: q.location,
      Membership: q.membership,
      'Minimum Members': 0,
      'Active Members': 0,
      Enabled: false,
      ...(q.price != null ? { Price: q.price } : {}),
    },
  });
}
if (!rows.length) return [{ json: { records: [], typecast: true } }];
const out = [];
for (let i = 0; i < rows.length; i += 10) out.push({ json: { records: rows.slice(i, i + 10), typecast: true } });
return out;
