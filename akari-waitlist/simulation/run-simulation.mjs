// Agentic end-to-end simulation of the wait-and-assignment loop, run against a real Airtable
// base (live or mocked) using the EXACT production node code (via test/harness.mjs's runNode —
// the same function the unit and e2e suites use), not a reimplementation. Every write goes
// through the same chunking/pacing the n8n Executor uses (see airtable-client.mjs).
//
// Usage:
//   MODE=mock  node simulation/run-simulation.mjs        # against the in-memory mock (safe, default)
//   MODE=live AIRTABLE_TOKEN=pat... AIRTABLE_BASE_ID=app... node simulation/run-simulation.mjs
//
// Writes a markdown log to simulation/log-<timestamp>.md as it goes. Stops immediately (and
// leaves whatever was already written) the moment a check fails, with the record that disagrees
// printed in full — that's the "detect errors" half; fixing them is a human-in-the-loop step
// (read the log, patch src/, rebuild, re-run the unit+e2e suites, re-run this script).
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { F_ACTIVE } from '../build/build-workflow.mjs';
import { typeformPayload } from '../test/fixtures.mjs';
import { runNode } from '../test/harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODE = process.env.MODE || 'mock';
const lines = [];
const log = (s = '') => { lines.push(s); console.log(s); };
const genToken = () => randomBytes(48).toString('hex').slice(0, 48); // matches the Crypto node's config (encodingType hex, stringLength 48)

// ── Airtable access: live client, or an in-memory mock with the same surface ──
let at;
if (MODE === 'live') {
  const { createAirtableClient } = await import('./airtable-client.mjs');
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!token || !baseId) throw new Error('MODE=live needs AIRTABLE_TOKEN and AIRTABLE_BASE_ID');
  at = createAirtableClient({ token, baseId, log });
} else {
  at = createMockClient();
}

const CFG = {
  brandName: 'Akari Sauna',
  timezone: 'America/New_York', holdHours: 24, primeCount: 10, newMemberWeight: 3,
  warmCooldownHours: 72, timeoutsBeforeNoReply: 2, maxInvitesPerQueuePerRun: 10, tourStaleDays: 7,
  sendWindow: { startHour: 0, endHour: 24 }, engineEnabled: true,
  fromEmail: 'waitlist@akarisauna.com', fromName: 'Akari Sauna', replyToEmail: 'hello@akarisauna.com',
  teamEmails: ['team@akarisauna.com'], sandboxMode: true, testRecipient: '',
};
const ctx = { at, cfg: CFG };

// ── Executor, replayed exactly: tokens → waitlist rows → activity log → (log, never send) email ──
async function applyActions(actions) {
  if (!actions.length) return [];
  const withTokens = actions.map((a) => ({ json: { ...a, token: genToken() } }));
  const tokenApplied = runNode('apply-tokens', { input: withTokens });
  for (const chunk of runNode('chunk-waitlist-updates', { input: tokenApplied }).map((i) => i.json)) {
    if (chunk.records.length) await at.updateBatched('Waitlist', chunk.records);
  }
  for (const chunk of runNode('chunk-log-rows', { nodes: { 'Apply Tokens': tokenApplied } }).map((i) => i.json)) {
    if (chunk.records.length) await at.createBatched('Activity Log', chunk.records);
  }
  for (const { json } of runNode('build-emails', { nodes: { Config: [{ json: { cfg: CFG } }], 'Apply Tokens': tokenApplied } })) {
    const p = json.payload;
    log(`    ✉ would send (no SendGrid connected): "${p.subject}" → ${p.personalizations[0].to.map((t) => t.email).join(', ')}`);
  }
  return tokenApplied.map((i) => i.json);
}

async function intake(payload) {
  const parsed = runNode('parse-typeform', { nodes: { Config: [{ json: { cfg: CFG, body: payload } }] } })[0].json;
  const existing = parsed.email ? await at.list('Waitlist', `LOWER({Email})="${parsed.email}"`) : [];
  const created = [];
  for (const batch of runNode('build-new-entries', { nodes: { Config: [{ json: { cfg: CFG } }], 'Parse Typeform': [{ json: parsed }], 'Find Existing Entries': [{ json: { records: existing } }] } }).map((i) => i.json)) {
    if (batch.records.length) created.push(...await at.createBatched('Waitlist', batch.records));
  }
  if (created.length) {
    await at.createBatched('Activity Log', created.map((r) => ({ fields: { Summary: `Joined · ${r.fields.Email}`, Timestamp: new Date().toISOString(), Event: 'Joined', Email: r.fields.Email, Name: r.fields.Name, Location: r.fields.Location, Membership: r.fields.Membership, Source: 'Simulation', 'Entry ID': r.id } })));
  }
  log(`  Created ${created.length} row(s) for ${parsed.email}: ${created.map((r) => `${r.fields.Location}|${r.fields.Membership}`).join(', ') || '(none — all queues already joined)'}`);
  return created;
}

async function seed({ email, name, location, membership, memberType, joinedDaysAgo, manualRank }) {
  const already = await at.list('Waitlist', `AND(LOWER({Email})="${email}",{Location}="${location}",{Membership}="${membership}",{Entry Source}="Simulation")`);
  if (already.length) { log(`  Skipped seeding ${email} on ${location}|${membership} — already present from a prior run`); return already[0]; }
  const fields = {
    Name: name, Email: email, Location: location, Membership: membership, 'Member Type': memberType,
    'Entry Source': 'Simulation', 'Joined At': new Date(Date.now() - joinedDaysAgo * 86400000).toISOString(),
    Status: 'Waiting', 'Timeout Count': 0,
  };
  if (manualRank !== undefined) fields['Manual Rank'] = manualRank;
  const [row] = await at.createBatched('Waitlist', [{ fields }]);
  await at.createBatched('Activity Log', [{ fields: { Summary: `Joined · ${email}`, Timestamp: new Date().toISOString(), Event: 'Joined', Email: email, Name: name, Location: location, Membership: membership, Source: 'Simulation', 'Entry ID': row.id } }]);
  log(`  Seeded ${email} on ${location}|${membership} (joined ${joinedDaysAgo}d ago${manualRank !== undefined ? `, Manual Rank ${manualRank}` : ''})`);
  return row;
}

async function configureCapacity(location, membership, patch) {
  const rows = await at.list('Capacity', `AND({Location}="${location}",{Membership}="${membership}")`);
  assert.ok(rows.length, `No Capacity row for ${location}|${membership} — did setup-airtable.mjs run?`);
  const fields = {};
  if (patch.minimum !== undefined) fields['Minimum Members'] = patch.minimum;
  if (patch.active !== undefined) fields['Active Members'] = patch.active;
  if (patch.enabled !== undefined) fields.Enabled = patch.enabled;
  if (patch.signupUrl !== undefined) fields['Signup URL'] = patch.signupUrl;
  await at.updateBatched('Capacity', [{ id: rows[0].id, fields }]);
  log(`  Capacity ${location}|${membership} → ${JSON.stringify(fields)}`);
  return rows[0].id;
}

async function engineRound(label) {
  log(`\n### ${label}`);
  const capacity = await at.list('Capacity', '{Enabled}');
  const active = await at.list('Waitlist', F_ACTIVE);
  const actions = runNode('plan-engine-actions', { nodes: { Config: [{ json: { cfg: CFG } }], 'Get Capacity': [{ json: { records: capacity } }], 'Get Active Entries': [{ json: { records: active } }] } }).map((i) => i.json);
  log(`  Engine planned ${actions.length} action(s): ${actions.map((a) => `${a.log.Event}/${a.log.Email.split('@')[0]}`).join(', ') || '(none)'}`);
  await applyActions(actions);
  return actions;
}

async function respond(token, action, reason = '') {
  log(`\n### Response: a=${action}${reason ? ` ("${reason}")` : ''}`);
  const rows = await at.list('Waitlist', `{Invite Token}="${token}"`);
  const entry = rows[0];
  const email = (entry?.fields?.Email || '').toLowerCase();
  const others = email ? await at.list('Waitlist', `LOWER({Email})="${email}"`) : [];
  const { Location: loc, Membership: mem } = entry?.fields || {};
  const qsettings = loc && mem ? await at.list('Capacity', `AND({Location}="${loc}",{Membership}="${mem}")`) : [];
  const out = runNode('decide-response', { nodes: { Config: [{ json: { cfg: CFG, body: { t: token, a: action, reason } } }], 'Find Entry by Token (commit)': [{ json: { records: rows } }], 'Find Entries by Email': [{ json: { records: others } }], 'Find Queue Settings': [{ json: { records: qsettings } }] } })[0].json;
  log(`  HTTP ${out.status}`);
  await applyActions(out.actions);
  return out;
}

async function sendNowOverride(recordId) {
  log(`\n### Send Now override on ${recordId}`);
  const rec = await at.get('Waitlist', recordId);
  const out = runNode('build-send-now', { nodes: { Config: [{ json: { cfg: CFG, query: { id: recordId } } }], 'Get Entry for Send Now': [{ json: rec }] } })[0].json;
  log(`  HTTP ${out.status}`);
  await applyActions(out.actions);
  return out;
}

async function expireHold(recordId) {
  await at.updateBatched('Waitlist', [{ id: recordId, fields: { 'Invite Expires At': new Date(Date.now() - 3600000).toISOString() } }]);
}

async function byEmail(email) {
  const [row] = await at.list('Waitlist', `LOWER({Email})="${email.toLowerCase()}"`);
  return row;
}
async function fieldOf(recordId, field) {
  const rec = await at.get('Waitlist', recordId);
  return rec.fields[field];
}

function check(label, cond, detail) {
  if (cond) { log(`  ✓ ${label}`); return; }
  log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  throw new Error(`Check failed: ${label}${detail ? ` (${detail})` : ''}`);
}

// ═══════════════════════════════════════════════════════════════
const PEOPLE = ['stan', 'stan+1', 'stan+2', 'stan+3', 'stan+4', 'stan+5', 'stan+6', 'stan+7'].map((l) => `${l}@optimizewise.org`);
const [eStan, e1, e2, e3, e4, e5, e6, e7] = PEOPLE;

log('# Waitlist automation — live simulation log');
log(`\nMode: **${MODE}** · Started: ${new Date().toISOString()}\n`);
log('Runs the real node code from src/ (via the same runNode harness the test suite uses) against Airtable, round by round, exercising the full wait-and-assignment loop with 8 real-looking candidates. Every status check below either passes or the script stops right there.');

try {
  log('\n## Setup');
  await configureCapacity('Williamsburg', 'Unlimited', { minimum: 2, active: 0, enabled: true, signupUrl: 'https://PLACEHOLDER-glofox-signup.example/williamsburg-unlimited' });

  log('\n## Round 0 — Intake (real Typeform parser)');
  log(`${eStan} submits, choosing "All-Access (both locations)" + "Unlimited" — exercises today's location-alias fix live:`);
  const rowsStan = await intake(typeformPayload({ email: eStan, first: 'Stan', last: 'A', locations: ['All-Access (both locations)'], memberships: ['Unlimited'], submittedAt: new Date().toISOString() }));
  check('All-Access enrolled both real locations', new Set(rowsStan.map((r) => r.fields.Location)).size === 2 && rowsStan.some((r) => r.fields.Location === 'Williamsburg') && rowsStan.some((r) => r.fields.Location === 'Greenpoint'));

  log(`${e1} submits, choosing "Williamsburg (202 Grand St.)" + "Daytime" — a queue we leave disabled, to prove queue isolation:`);
  await intake(typeformPayload({ email: e1, first: 'Stan', last: 'B', locations: ['Williamsburg (202 Grand St.)'], memberships: ['Daytime (weekdays 8 - 4:30pm)'], submittedAt: new Date().toISOString() }));

  log('\nSeeding the rest directly onto Williamsburg · Unlimited, staggered so priority order is unambiguous:');
  await seed({ email: e2, name: 'Stan C', location: 'Williamsburg', membership: 'Unlimited', memberType: 'Existing', joinedDaysAgo: 20 });
  await seed({ email: e3, name: 'Stan D', location: 'Williamsburg', membership: 'Unlimited', memberType: 'New', joinedDaysAgo: 10 });
  await seed({ email: e4, name: 'Stan E', location: 'Williamsburg', membership: 'Unlimited', memberType: 'New', joinedDaysAgo: 8 });
  await seed({ email: e5, name: 'Stan F', location: 'Williamsburg', membership: 'Unlimited', memberType: 'New', joinedDaysAgo: 5 });
  await seed({ email: e6, name: 'Stan G', location: 'Williamsburg', membership: 'Unlimited', memberType: 'New', joinedDaysAgo: 2 });
  await seed({ email: e7, name: 'Stan H', location: 'Williamsburg', membership: 'Unlimited', memberType: 'New', joinedDaysAgo: 0, manualRank: 1 });

  log('\nExpected priority on Williamsburg·Unlimited: Manual Rank first (stan+7), then by weighted wait — stan+3 (10d×3) > stan+4 (8d×3) > stan+2 (20d×1, existing) > stan+5 (5d×3) > stan+6 (2d×3) > stan (~0d).');

  const r1 = await engineRound('Round 1 — fill the 2-spot gap');
  check('exactly 2 invited', r1.filter((a) => a.log.Event === 'Invited').length === 2);
  check('stan+7 invited first (Manual Rank)', await fieldOf((await byEmail(e7)).id, 'Status') === 'Invited');
  check('stan+3 invited second (longest weighted wait)', await fieldOf((await byEmail(e3)).id, 'Status') === 'Invited');
  check('stan+4/stan+2/stan+5/stan+6/stan primed, not invited', (await Promise.all([e4, e2, e5, e6, eStan].map(byEmail))).every((r) => r.fields.Status === 'Primed'));
  check('stan+1 (disabled Daytime queue) untouched', (await byEmail(e1)).fields.Status === 'Waiting');

  log('\n## Round 2 — stan+3 claims the spot; stan+7’s hold is left to expire');
  const tok3 = await fieldOf((await byEmail(e3)).id, 'Invite Token');
  const resp3 = await respond(tok3, 'yes');
  check('redirected to the Glofox signup page', /refresh/.test(resp3.page) && /PLACEHOLDER-glofox-signup/.test(resp3.page));
  check('stan+3 → Signed Up', await fieldOf((await byEmail(e3)).id, 'Status') === 'Signed Up');
  await expireHold((await byEmail(e7)).id);

  const r3 = await engineRound('Round 3 — expire stan+7’s hold, advance the chain (pending-signup aware, no recount yet)');
  check('stan+7 → Warm after timeout', await fieldOf((await byEmail(e7)).id, 'Status') === 'Warm');
  check('stan+4 invited next (gap still correctly accounts for stan+3’s un-recounted signup)', await fieldOf((await byEmail(e4)).id, 'Status') === 'Invited');
  check('engine did not double-invite', r3.filter((a) => a.log.Event === 'Invited').length === 1);

  log('\n## Round 4 — stan+4 asks for a tour first');
  const tok4 = await fieldOf((await byEmail(e4)).id, 'Invite Token');
  await respond(tok4, 'tour', 'Saturday morning');
  check('stan+4 → Tour Requested, holds the spot', await fieldOf((await byEmail(e4)).id, 'Status') === 'Tour Requested');

  log('\n## Round 5 — staff presses Send Now on stan+6 (queue otherwise has no open gap)');
  const row6 = await byEmail(e6);
  await sendNowOverride(row6.id);
  check('stan+6 → Invited via Send Now, bypassing the gap check', await fieldOf(row6.id, 'Status') === 'Invited');
  check('Invite Source = Send Now', await fieldOf(row6.id, 'Invite Source') === 'Send Now');

  log('\n## Round 6 — stan+6 declines');
  const tok6 = await fieldOf(row6.id, 'Invite Token');
  await respond(tok6, 'no', 'Moved out of the neighborhood');
  check('stan+6 → No Longer Interested, reason saved', (await at.get('Waitlist', row6.id)).fields.Status === 'No Longer Interested' && (await at.get('Waitlist', row6.id)).fields.Reason === 'Moved out of the neighborhood');

  log('\n## Round 7 — staff recounts (stan+3’s signup now reflected in Active Members) and opens one more spot');
  await configureCapacity('Williamsburg', 'Unlimited', { minimum: 3, active: 1 });
  const r8 = await engineRound('Round 8 — engine after recount');
  check('stan+2 invited next (highest remaining weighted wait: existing member, 20d)', await fieldOf((await byEmail(e2)).id, 'Status') === 'Invited');
  check('exactly 1 invited this round', r8.filter((a) => a.log.Event === 'Invited').length === 1);

  log('\n## Round 9 — stan+2 says not right now');
  const tok2 = await fieldOf((await byEmail(e2)).id, 'Invite Token');
  await respond(tok2, 'notnow', 'Traveling for work this month');
  check('stan+2 → Not Right Now, reason saved', (await byEmail(e2)).fields.Status === 'Not Right Now');

  log('\n## Final state');
  const final = [];
  for (const email of PEOPLE) {
    const rows = email === eStan ? (await at.list('Waitlist', `LOWER({Email})="${eStan}"`)) : [await byEmail(email)];
    for (const r of rows) final.push(`| ${email} | ${r.fields.Location} · ${r.fields.Membership} | **${r.fields.Status}** | ${r.fields.Reason || r.fields['Tour Notes'] || ''} |`);
  }
  log('\n| Email | Queue | Final status | Note |');
  log('|---|---|---|---|');
  final.forEach((l) => log(l));

  log('\n---\n**Result: every check passed. No bugs found this run.**');
} catch (e) {
  log(`\n---\n**STOPPED — a check failed or a call errored:**\n\n\`\`\`\n${e.stack || e.message}\n\`\`\`\n`);
  log('Nothing after this point ran. Whatever Airtable writes happened above this line are real — safe to leave (Entry Source = Simulation) or clean up by hand before re-running.');
  process.exitCode = 1;
} finally {
  const outDir = join(ROOT, 'simulation');
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `log-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
  writeFileSync(file, lines.join('\n') + '\n');
  console.log(`\nLog written to ${file}`);
}

// ── Mock Airtable client (MODE=mock, the default) — same surface as airtable-client.mjs ──
function createMockClient() {
  const tables = {};
  const rid = () => `rec${Array.from({ length: 14 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]).join('')}`;
  const SEED_CAPACITY = [
    ['Williamsburg', 'Unlimited'], ['Williamsburg', 'Daytime'], ['Williamsburg', '4-Visit'], ['Williamsburg', 'Summer Pass'],
    ['Greenpoint', 'Unlimited'], ['Greenpoint', 'Daytime'], ['Greenpoint', '4-Visit'], ['Greenpoint', 'Summer Pass'],
    ['Lower East Side', 'Unlimited'], ['Lower East Side', 'Daytime'], ['Lower East Side', '4-Visit'], ['Lower East Side', 'Summer Pass'],
  ];
  tables.Capacity = SEED_CAPACITY.map(([Location, Membership]) => ({ id: rid(), fields: { Queue: `${Location} · ${Membership}`, Location, Membership, 'Minimum Members': 0, 'Active Members': 0, Enabled: false } }));
  tables.Waitlist = [];
  tables['Activity Log'] = [];

  function evalFormula(formula, rec) {
    if (!formula) return true;
    let js = '';
    for (let i = 0; i < formula.length; i++) {
      const c = formula[i];
      if (c === '{') { const j = formula.indexOf('}', i); js += `F(${JSON.stringify(formula.slice(i + 1, j))})`; i = j; }
      else if (c === '"' || c === "'") { let j = i + 1; while (formula[j] !== c) j++; js += JSON.stringify(formula.slice(i + 1, j)); i = j; }
      else if (c === '=') js += ['!', '<', '>'].includes(formula[i - 1]) ? '=' : '==';
      else if (c === '&') js += '+';
      else js += c;
    }
    const UNIT = { days: 86400000, hours: 3600000, minutes: 60000 };
    // eslint-disable-next-line no-new-func
    return new Function('F', 'AND', 'OR', 'DATEADD', 'IS_AFTER', 'NOW', 'LOWER', `return (${js});`)(
      (n) => rec.fields[n] ?? '', (...a) => a.every(Boolean), (...a) => a.some(Boolean),
      (d, n, u) => new Date(new Date(d).getTime() + n * UNIT[u]), (a, b) => (a ? new Date(a) > new Date(b) : false), () => new Date(),
      (s) => String(s ?? '').toLowerCase(),
    );
  }
  return {
    async list(table, formula) { return tables[table].filter((r) => evalFormula(formula, r)); },
    async createBatched(table, records) {
      const created = records.map((r) => ({ id: rid(), createdTime: new Date().toISOString(), fields: r.fields }));
      tables[table].push(...created);
      return created;
    },
    async updateBatched(table, records) {
      return records.map((u) => {
        const r = tables[table].find((x) => x.id === u.id);
        for (const [k, v] of Object.entries(u.fields)) { if (v === null) delete r.fields[k]; else r.fields[k] = v; }
        // Mirrors the real Airtable base's "Active Updated At" — a lastModifiedTime field
        // watching only Active Members, computed server-side there, so it isn't user-writable
        // in live mode (updateBatched never sets it directly, live or mock).
        if (table === 'Capacity' && 'Active Members' in u.fields) r.fields['Active Updated At'] = new Date().toISOString();
        return r;
      });
    },
    async get(table, id) { return tables[table].find((r) => r.id === id); },
  };
}
