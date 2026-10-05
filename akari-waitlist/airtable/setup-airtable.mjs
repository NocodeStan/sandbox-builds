// Builds the Airtable side of the waitlist automation: Waitlist, Capacity and Activity Log tables,
// plus one Capacity row per location × membership (all switched off).
//
// Usage (Node 18+), either:
//   New base:       AIRTABLE_TOKEN=pat... AIRTABLE_WORKSPACE_ID=wsp... node airtable/setup-airtable.mjs
//   Existing base:  AIRTABLE_TOKEN=pat... AIRTABLE_BASE_ID=app...      node airtable/setup-airtable.mjs
// Optional: AIRTABLE_BASE_NAME (default "Akari Waitlist").
// Token scopes: data.records:read, data.records:write, schema.bases:read, schema.bases:write,
// with access to that workspace (new base) or that base.
//
// One field can't be created through Airtable's API — add it by hand afterwards (BUILD-GUIDE.md §4.2):
//   Waitlist › "Send Now"  (Button → Open URL)

const TOKEN = process.env.AIRTABLE_TOKEN;
let BASE = process.env.AIRTABLE_BASE_ID;
const WORKSPACE = process.env.AIRTABLE_WORKSPACE_ID;
const BASE_NAME = process.env.AIRTABLE_BASE_NAME || 'Akari Waitlist';
if (!TOKEN || (!BASE && !WORKSPACE)) {
  console.error('Set AIRTABLE_TOKEN and either AIRTABLE_WORKSPACE_ID (new base) or AIRTABLE_BASE_ID (existing base)');
  process.exit(1);
}

const LOCATIONS = ['Williamsburg', 'Greenpoint', 'Lower East Side'];
const MEMBERSHIPS = ['Unlimited', 'Daytime', '4-Visit', 'Summer Pass'];
const STATUSES = ['Waiting', 'Primed', 'Invited', 'Tour Requested', 'Warm', 'Signed Up', 'Not Right Now', 'No Longer Interested', 'No Reply', 'Removed'];
const EVENTS = ['Joined', 'Primed', 'Invited', 'Tour Requested', 'Signed Up', 'Not Right Now', 'No Longer Interested', 'Timed Out', 'Late Reply', 'Removed'];

const select = (names) => ({ type: 'singleSelect', options: { choices: names.map((name) => ({ name })) } });
const dateTime = { type: 'dateTime', options: { timeZone: 'America/New_York', dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' } } };
const integer = { type: 'number', options: { precision: 0 } };
const checkbox = { type: 'checkbox', options: { icon: 'check', color: 'greenBright' } };
const text = { type: 'singleLineText' };
const long = { type: 'multilineText' };

const TABLES = [
  {
    name: 'Waitlist',
    description: 'One row per person per queue (location × membership).',
    fields: [
      ['Name', text], ['Email', { type: 'email' }], ['Phone', { type: 'phoneNumber' }],
      ['Zip Code', text], ['Referral Source', text],
      ['Location', select(LOCATIONS)], ['Membership', select(MEMBERSHIPS)],
      ['Member Type', select(['New', 'Existing'])], ['Entry Source', select(['Typeform', 'Admin'])],
      ['Joined At', dateTime], ['Manual Rank', integer], ['Status', select(STATUSES)],
      ['Invite Token', text], ['Invited At', dateTime], ['Invite Expires At', dateTime],
      ['Invite Source', select(['Auto', 'Send Now'])], ['Timeout Count', integer],
      ['Primed At', dateTime], ['Response At', dateTime],
      ['Reason', long], ['Tour Notes', long], ['Notes', long],
    ],
  },
  {
    name: 'Capacity',
    description: 'Admin controls per queue. The engine invites while Active + pending < Minimum.',
    fields: [
      ['Queue', text], ['Location', select(LOCATIONS)], ['Membership', select(MEMBERSHIPS)],
      ['Minimum Members', integer], ['Active Members', integer],
      ['Prioritise New Only', checkbox], ['Enabled', checkbox], ['Signup URL', { type: 'url' }],
    ],
  },
  {
    name: 'Activity Log',
    description: 'Append-only log written by the automation; feeds the daily report.',
    fields: [
      ['Summary', text], ['Timestamp', dateTime], ['Event', select(EVENTS)],
      ['Email', { type: 'email' }], ['Name', text], ['Location', text], ['Membership', text],
      ['Source', text], ['Reason', long], ['Detail', long], ['Entry ID', text],
    ],
  },
];

async function api(method, path, body) {
  const res = await fetch(`https://api.airtable.com/v0/${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}

const toSpec = (t) => ({ name: t.name, description: t.description, fields: t.fields.map(([name, spec]) => ({ name, ...spec })) });

const who = await api('GET', 'meta/whoami');
if (Array.isArray(who.scopes)) {
  const missing = ['data.records:read', 'data.records:write', 'schema.bases:read', 'schema.bases:write'].filter((x) => !who.scopes.includes(x));
  if (missing.length) throw new Error(`Token is missing scopes: ${missing.join(', ')}`);
}

let createdCapacity = false;
if (!BASE) {
  const created = await api('POST', 'meta/bases', { name: BASE_NAME, workspaceId: WORKSPACE, tables: TABLES.map(toSpec) });
  BASE = created.id;
  createdCapacity = true;
  console.log(`✓ created base "${BASE_NAME}" (${BASE}) with ${TABLES.map((t) => t.name).join(', ')}`);
} else {
  const existing = new Set((await api('GET', `meta/bases/${BASE}/tables`)).tables.map((t) => t.name));
  for (const t of TABLES) {
    if (existing.has(t.name)) {
      console.log(`• ${t.name}: already exists, skipped`);
      continue;
    }
    await api('POST', `meta/bases/${BASE}/tables`, toSpec(t));
    if (t.name === 'Capacity') createdCapacity = true;
    console.log(`✓ created ${t.name}`);
  }
}

// "Active Updated At" stamps whenever staff edit Active Members; the engine uses it to know
// which signups a recount already includes.
const capTable = (await api('GET', `meta/bases/${BASE}/tables`)).tables.find((t) => t.name === 'Capacity');
if (!capTable.fields.some((f) => f.name === 'Active Updated At')) {
  const watched = capTable.fields.find((f) => f.name === 'Active Members').id;
  await api('POST', `meta/bases/${BASE}/tables/${capTable.id}/fields`, { name: 'Active Updated At', type: 'lastModifiedTime', options: { referencedFieldIds: [watched] } });
  console.log('✓ created Capacity › Active Updated At (watches Active Members)');
}

if (createdCapacity) {
  const rows = LOCATIONS.flatMap((Location) => MEMBERSHIPS.map((Membership) => ({
    fields: { Queue: `${Location} · ${Membership}`, Location, Membership, 'Minimum Members': 0, 'Active Members': 0, Enabled: false },
  })));
  for (let i = 0; i < rows.length; i += 10) {
    await api('POST', `${BASE}/Capacity`, { records: rows.slice(i, i + 10) });
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log(`✓ seeded ${rows.length} Capacity rows (all Enabled = off)`);
}

console.log(`\nBase ID for the n8n Config node: ${BASE}`);
console.log('Next: add the "Send Now" button to Waitlist (BUILD-GUIDE.md §4.2).');
