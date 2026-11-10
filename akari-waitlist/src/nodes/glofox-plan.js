// Works out each Capacity row's Active Members from its "Glofox Memberships" names (one per line)
// and prepares the Airtable updates plus one Activity Log row describing what happened.
const { cfg } = $('Config').first().json;
const { counts, members } = $('Count Members').first().json;
const rows = $('Get Capacity').all().flatMap((i) => i.json.records || []);
const NOW = new Date().toISOString();

const used = new Set();
const updated = [];
const held = [];
const missing = [];
let unchanged = 0;
const writes = [];
for (const r of rows) {
  const names = String(r.fields['Glofox Memberships'] || '').split('\n').map((s) => s.trim()).filter(Boolean);
  if (!names.length) continue;
  const label = r.fields.Queue || `${r.fields.Location} · ${r.fields.Membership}`;
  let n = 0;
  for (const name of names) {
    const key = name.toLowerCase();
    used.add(key);
    if (counts[key]) n += counts[key].n;
    else missing.push(`${label}: "${name}"`);
  }
  const current = Number(r.fields['Active Members'] || 0);
  if (current >= cfg.minRowsForDropCheck && n < current * (1 - cfg.maxDropShare)) {
    held.push(`${label} ${current} → ${n}`);
    continue;
  }
  const fields = { 'Active Counted At': NOW };
  if (n !== current) { fields['Active Members'] = n; updated.push(`${label} ${current} → ${n}`); } else unchanged += 1;
  writes.push({ id: r.id, fields });
}
const notCounted = Object.entries(counts).filter(([k]) => !used.has(k)).sort((a, b) => b[1].n - a[1].n).map(([, v]) => `${v.name} (${v.n})`);

const detail = [
  updated.length ? `Updated: ${updated.join('; ')}` : 'No changes to Active Members.',
  `Unchanged: ${unchanged} queue(s). ${members} Glofox members read.`,
  held.length ? `Held back, count fell by more than ${Math.round(cfg.maxDropShare * 100)}% (check Glofox, then type the number in if it's right): ${held.join('; ')}` : '',
  missing.length ? `Glofox Memberships names not found in Glofox (typo, or nobody active on it): ${missing.join('; ')}` : '',
  notCounted.length ? `Active in Glofox but not counted in any queue: ${notCounted.join(', ')}` : '',
].filter(Boolean).join('\n');

const chunks = [];
for (let i = 0; i < writes.length; i += 10) chunks.push({ records: writes.slice(i, i + 10), typecast: true });
return [{
  json: {
    chunks,
    log: { records: [{ fields: { Summary: `Glofox sync · ${updated.length} queue(s) updated`, Timestamp: NOW, Event: 'Active Synced', Source: 'Glofox', Detail: detail } }], typecast: true },
    updated, held, missing, notCounted,
  },
}];
