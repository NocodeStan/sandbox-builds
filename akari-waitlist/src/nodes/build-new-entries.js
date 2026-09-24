// @include core
const p = $('Parse Typeform').first().json;
const already = new Set(
  recordsOf('Find Existing Entries')
    .map(normEntry)
    .filter((e) => ACTIVE_STATUSES.includes(e.status))
    .map((e) => `${e.location}|${e.membership}`),
);

const rows = p.queues
  .filter((q) => !already.has(`${q.location}|${q.membership}`))
  .map((q) => ({
    fields: {
      Name: p.name,
      Email: p.email,
      Phone: p.phone,
      Location: q.location,
      Membership: q.membership,
      'Member Type': p.memberType,
      'Entry Source': 'Typeform',
      'Joined At': p.joinedAt,
      Status: 'Waiting',
      'Timeout Count': 0,
    },
  }));

// Airtable accepts at most 10 records per create request. An empty batch means "nothing new".
if (!rows.length) return [{ json: { records: [], typecast: true } }];
const out = [];
for (let i = 0; i < rows.length; i += 10) out.push({ json: { records: rows.slice(i, i + 10), typecast: true } });
return out;
