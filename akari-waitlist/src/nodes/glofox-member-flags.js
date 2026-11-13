// Two daily jobs on the Waitlist, from the same Glofox read:
// 1) "Glofox Membership" lists what each person already holds (existing members get the upgrade invite).
// 2) Purchase verification for the revenue dashboard. Someone the waitlist invited counts as a verified purchase
//    ("Glofox Verified At") once Glofox shows them, by email, holding one of their queue's memberships (the Capacity
//    row's "Glofox Memberships" names, counted statuses only) that started no earlier than the day before their invite.
//    "Monthly Value" is what the person adds per month: the queue's price, or for an existing member's upgrade the
//    difference from the membership they already hold. Once verified it is fixed at the verified amount (Glofox's
//    monthly plan price when it has one). "Glofox Check" says, for people who signed up or asked for a tour, what
//    Glofox shows, so staff can follow up on sign-ups that never completed.
// Only fields that change are written. Each new verification adds one "Purchase Verified" row to the Activity Log.
const { cfg } = $('Config').first().json;
const { holders, held = {}, accounts = {} } = $('Count Members').first().json;
const rows = $('Get Waitlist').all().flatMap((i) => i.json.records || []);
const caps = $('Get Capacity').all().flatMap((i) => i.json.records || []);
const NOW = new Date().toISOString();
const counted = new Set(cfg.countStatuses.map((s) => String(s).toUpperCase()));
const DAY = 24 * 3600 * 1000;

const lc = (s) => String(s || '').trim().toLowerCase();
const queueKey = (loc, mem) => `${lc(loc)}|${lc(mem)}`;
const queues = {}; // location|membership → { price, names }
for (const c of caps) {
  const k = queueKey(c.fields.Location, c.fields.Membership);
  const q = (queues[k] = queues[k] || { price: 0, names: new Set() });
  if (!q.price && Number(c.fields.Price) > 0) q.price = Number(c.fields.Price);
  for (const n of String(c.fields['Glofox Memberships'] || '').split('\n').map(lc).filter(Boolean)) q.names.add(n);
}
const priceOfMembership = (name) => {
  for (const q of Object.values(queues)) if (q.price && q.names.has(lc(name))) return q.price;
  return 0;
};
const day = (iso) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
const place = (loc) => (/^akari\b/i.test(String(loc || '')) ? loc : `Akari ${loc}`);

const writes = [];
const logs = [];
let verifiedTotal = 0;
for (const r of rows) {
  const f = r.fields;
  const email = lc(f.Email);
  const fields = {};

  const have = String(f['Glofox Membership'] || '').trim();
  const want = (holders[email] || []).slice().sort().join('; ');
  if (want !== have) fields['Glofox Membership'] = want || null;

  const q = queues[queueKey(f.Location, f.Membership)] || { price: 0, names: new Set() };
  const existing = f['Member Type'] === 'Existing';
  // What an upgrade adds is the difference from what they already pay (yesterday's "Glofox Membership").
  const paysNow = have ? Math.max(0, ...have.split(';').map(priceOfMembership)) : 0;
  const addsPerMonth = (price) => (price ? Math.max(price - (existing ? paysNow : 0), 0) : null);

  if (f['Glofox Verified At']) {
    verifiedTotal += 1;
  } else {
    const invitedAt = f['Invited At'] ? Date.parse(f['Invited At']) : NaN;
    const match = (held[email] || []).find((h) => q.names.has(lc(h.name)) && counted.has(h.status)
      && h.start && Date.parse(h.start) >= invitedAt - DAY);
    if (match) {
      const value = addsPerMonth(match.monthly && match.price ? match.price : q.price) || 0;
      const check = `Verified in Glofox: ${match.name} (${match.status.toLowerCase()}) from ${day(match.start)}${match.price ? `, $${match.price}/mo` : ''}`;
      Object.assign(fields, { 'Glofox Verified At': NOW, 'Monthly Value': value, 'Glofox Check': check });
      verifiedTotal += 1;
      logs.push({
        fields: {
          Summary: `Purchase verified: ${f.Name || f.Email} - ${f.Membership} at ${place(f.Location)}`,
          Timestamp: NOW, Event: 'Purchase Verified', Email: f.Email, Name: f.Name, Location: f.Location, Membership: f.Membership, Source: 'Glofox',
          Detail: `${check}. Adds $${value}/month${existing ? ' (upgrade: the difference from their previous membership)' : ''}.`,
          'Entry ID': r.id,
        },
      });
    } else {
      const value = addsPerMonth(q.price);
      if (value !== (f['Monthly Value'] ?? null)) fields['Monthly Value'] = value;
      let check = '';
      if (f.Status === 'Signed Up' || f.Status === 'Tour Requested') {
        const step = f.Status === 'Signed Up' ? 'Signed up' : 'Tour requested';
        const holds = (held[email] || []).filter((h) => counted.has(h.status)).map((h) => h.name);
        check = !accounts[email] ? `${step}; no Glofox account under this email yet`
          : holds.length ? `${step}; Glofox shows ${holds.join(', ')}, not this queue's membership yet`
            : `${step}; Glofox account, no membership yet`;
      }
      if (check !== String(f['Glofox Check'] || '')) fields['Glofox Check'] = check || null;
    }
  }
  if (Object.keys(fields).length) writes.push({ id: r.id, fields });
}
const chunk = (list) => {
  const out = [];
  for (let i = 0; i < list.length; i += 10) out.push({ records: list.slice(i, i + 10), typecast: true });
  return out;
};
return [{
  json: {
    chunks: chunk(writes), logChunks: chunk(logs), changed: writes.length, newlyVerified: logs.length, verifiedTotal,
    flagged: rows.filter((r) => holders[lc(r.fields.Email)]).length,
  },
}];
