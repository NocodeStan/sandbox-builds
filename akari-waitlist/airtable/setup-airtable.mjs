// Creates the Waitlist, Capacity and Activity Log tables in an existing (empty) Airtable base
// and seeds one Capacity row per location × membership (all switched off).
//
// Usage (Node 18+):
//   AIRTABLE_TOKEN=pat... AIRTABLE_BASE_ID=app... node airtable/setup-airtable.mjs
// Token scopes: data.records:read, data.records:write, schema.bases:read, schema.bases:write
//
// Two fields can't be created through Airtable's API — add them by hand afterwards (see BUILD-GUIDE.md):
//   Capacity › "Active Updated At"  (Last modified time → only "Active Members")
//   Waitlist › "Send Now"           (Button → Open URL)

const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE = process.env.AIRTABLE_BASE_ID;
if (!TOKEN || !BASE) {
  console.error('Set AIRTABLE_TOKEN and AIRTABLE_BASE_ID');
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

const existing = new Set((await api('GET', `meta/bases/${BASE}/tables`)).tables.map((t) => t.name));
for (const t of TABLES) {
  if (existing.has(t.name)) {
    console.log(`• ${t.name}: already exists, skipped`);
    continue;
  }
  await api('POST', `meta/bases/${BASE}/tables`, {
    name: t.name,
    description: t.description,
    fields: t.fields.map(([name, spec]) => ({ name, ...spec })),
  });
  console.log(`✓ created ${t.name}`);
}

if (!existing.has('Capacity')) {
  const rows = LOCATIONS.flatMap((Location) => MEMBERSHIPS.map((Membership) => ({
    fields: { Queue: `${Location} · ${Membership}`, Location, Membership, 'Minimum Members': 0, 'Active Members': 0, Enabled: false },
  })));
  for (let i = 0; i < rows.length; i += 10) {
    await api('POST', `${BASE}/Capacity`, { records: rows.slice(i, i + 10) });
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log(`✓ seeded ${rows.length} Capacity rows (all Enabled = off)`);
}

console.log('\nNext: add "Active Updated At" to Capacity and the "Send Now" button to Waitlist (BUILD-GUIDE.md §2).');
