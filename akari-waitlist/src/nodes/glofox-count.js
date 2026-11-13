// Counts members per Glofox membership name, for the statuses in countStatuses.
// Refuses to continue on an error page or an incomplete list, so a partial read never overwrites Active Members.
const { cfg } = $('Config').first().json;
const statuses = new Set(cfg.countStatuses.map((s) => String(s).toUpperCase()));
const pages = $input.all().map((i) => i.json);

const problems = [];
const seen = new Set();
const perBranch = {}; // branch id → { expected, got }
const counts = {}; // lower-case membership name → { name, n }
const holders = {}; // lower-case email → membership names held (same statuses), for the waitlist's existing-member flag
for (const p of pages) {
  if (!p || p.success === false || p.message || !Array.isArray(p.data)) {
    problems.push(String((p && (p.message || p.error)) || 'unreadable page').slice(0, 200));
    continue;
  }
  for (const m of p.data) {
    const b = m.branch_id || '?';
    perBranch[b] = perBranch[b] || { expected: Number(p.total_count) || 0, got: 0 };
    perBranch[b].got += 1;
    if (seen.has(m._id)) continue;
    seen.add(m._id);
    const ms = m.membership || {};
    if (!ms.membership_name || !statuses.has(String(ms.status || '').toUpperCase())) continue;
    const key = ms.membership_name.trim().toLowerCase();
    counts[key] = counts[key] || { name: ms.membership_name.trim(), n: 0 };
    counts[key].n += 1;
    for (const raw of [m.email, m.account_email, m.contact_email]) {
      const email = String(raw || '').trim().toLowerCase();
      if (!email) continue;
      holders[email] = holders[email] || [];
      if (!holders[email].includes(ms.membership_name.trim())) holders[email].push(ms.membership_name.trim());
    }
  }
}
for (const b of cfg.branches) {
  const r = perBranch[b.id];
  if (!r) problems.push(`${b.name}: no members returned`);
  else if (Math.abs(r.got - r.expected) > Math.max(5, r.expected * 0.01)) problems.push(`${b.name}: read ${r.got} of ${r.expected} members`);
}
if (problems.length) throw new Error(`Glofox sync stopped, nothing was changed: ${[...new Set(problems)].join('; ')}`);

return [{ json: { counts, holders, members: seen.size, perBranch } }];
