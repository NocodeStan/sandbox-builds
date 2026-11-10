export function typeformPayload({
  email = 'Jane.Doe@Example.com', locations = ['Williamsburg', 'LES'], memberships = ['Unlimited', 'Daytime'],
  existing, first = 'Jane', last = 'Doe', token = 'tok123', zip, referral, submittedAt = '2026-09-20T15:00:00Z',
} = {}) {
  const fields = [
    { id: 'f1', ref: 'first', type: 'short_text', title: 'First name' },
    { id: 'f2', ref: 'last', type: 'short_text', title: 'Last name' },
    { id: 'f3', ref: 'email', type: 'email', title: 'Email' },
    { id: 'f4', ref: 'phone', type: 'phone_number', title: 'Phone' },
    { id: 'f8', ref: 'zip', type: 'short_text', title: 'What is your Zip Code?' },
    { id: 'f6', ref: 'location', type: 'multiple_choice', title: 'Which location are you interested in joining?' },
    { id: 'f5', ref: 'membership', type: 'multiple_choice', title: 'Which membership are you interested in?' },
    { id: 'f9', ref: 'referral', type: 'short_text', title: 'How did you hear about us?' },
    { id: 'f7', ref: 'existing', type: 'yes_no', title: 'Are you an existing Akari member?' },
  ];
  const answers = [
    { type: 'text', text: first, field: { id: 'f1', type: 'short_text', ref: 'first' } },
    { type: 'text', text: last, field: { id: 'f2', type: 'short_text', ref: 'last' } },
    email && { type: 'email', email, field: { id: 'f3', type: 'email', ref: 'email' } },
    { type: 'phone_number', phone_number: '+17185550100', field: { id: 'f4', type: 'phone_number', ref: 'phone' } },
    zip !== undefined && { type: 'text', text: zip, field: { id: 'f8', type: 'short_text', ref: 'zip' } },
    { type: 'choices', choices: { labels: locations }, field: { id: 'f6', type: 'multiple_choice', ref: 'location' } },
    { type: 'choices', choices: { labels: memberships }, field: { id: 'f5', type: 'multiple_choice', ref: 'membership' } },
    referral !== undefined && { type: 'text', text: referral, field: { id: 'f9', type: 'short_text', ref: 'referral' } },
    existing !== undefined && { type: 'boolean', boolean: existing, field: { id: 'f7', type: 'yes_no', ref: 'existing' } },
  ].filter(Boolean);
  return { event_id: `evt-${token}`, event_type: 'form_response', form_response: { form_id: 'abc', token, submitted_at: submittedAt, definition: { id: 'abc', fields }, answers } };
}

// The consolidated form (Nov): one location question, then one membership question per location,
// shown by Typeform logic. Labels are Jack's, as they appear on the live form.
export const FORM_LOCATIONS = {
  'All-Access': 'All-Access (Akari Sauna locations)',
  Williamsburg: 'Williamsburg - Akari Sauna - (202 Grand St.)',
  Greenpoint: 'Greenpoint - Akari Sauna - (149 Franklin St.)',
  LES: 'LES - Akari Sauna - (60 Orchard St.)',
  'Akari Yu': 'Akari Yu (888 Lorimer St) (coming soon!)',
};
export const WB_MEMBERSHIPS = ['Unlimited - $220/month', 'Daytime - $165/month', 'Limited 4-Visit/Month - $140/month', 'Limited 3-Visit/Month - $XXX/month', 'Limited 5-Visit/Month - $XXX/month'];

export function newFormPayload({
  email = 'Jane.Doe@Example.com', first = 'Jane', last = 'Doe', token = 'tok-new', submittedAt = '2026-11-10T15:00:00Z',
  picks = { Williamsburg: ['Unlimited - $220/month'] }, // location key → membership labels chosen
  locations = Object.keys(picks), // location keys ticked
  extraLocations = {}, // key → label, for locations the team adds later
  existing,
} = {}) {
  const LOC = { ...FORM_LOCATIONS, ...extraLocations };
  const fields = [
    { id: 'n1', ref: 'first', type: 'short_text', title: 'First name' },
    { id: 'n2', ref: 'last', type: 'short_text', title: 'Last name' },
    { id: 'n3', ref: 'email', type: 'email', title: 'Email' },
    { id: 'n4', ref: 'phone', type: 'phone_number', title: 'Phone' },
    { id: 'nloc', ref: 'loc', type: 'multiple_choice', title: 'Which location are you interested in joining?', choices: Object.values(LOC).map((label, i) => ({ id: `c${i}`, label })) },
    ...Object.keys(LOC).map((k, i) => ({ id: `nm${i}`, ref: `mem${i}`, type: 'multiple_choice', title: `Which ${k} membership(s) are you interested in?` })),
    { id: 'n7', ref: 'existing', type: 'yes_no', title: 'Are you an existing Akari member?' },
  ];
  const memField = (k) => fields.find((f) => f.title === `Which ${k} membership(s) are you interested in?`);
  const answers = [
    { type: 'text', text: first, field: { id: 'n1', type: 'short_text', ref: 'first' } },
    { type: 'text', text: last, field: { id: 'n2', type: 'short_text', ref: 'last' } },
    email && { type: 'email', email, field: { id: 'n3', type: 'email', ref: 'email' } },
    { type: 'phone_number', phone_number: '+17185550100', field: { id: 'n4', type: 'phone_number', ref: 'phone' } },
    { type: 'choices', choices: { labels: locations.map((k) => LOC[k]) }, field: { id: 'nloc', type: 'multiple_choice', ref: 'loc' } },
    ...Object.entries(picks).map(([k, labels]) => ({ type: 'choices', choices: { labels }, field: { id: memField(k).id, type: 'multiple_choice', ref: memField(k).ref } })),
    existing !== undefined && { type: 'boolean', boolean: existing, field: { id: 'n7', type: 'yes_no', ref: 'existing' } },
  ].filter(Boolean);
  return { event_id: `evt-${token}`, event_type: 'form_response', form_response: { form_id: 'consolidated', token, submitted_at: submittedAt, definition: { id: 'consolidated', fields }, answers } };
}
