// Reads the raw Typeform webhook payload. Fields are detected by answer type and
// by matching choice labels, so question wording/refs can change without edits here.
const LOCATIONS = [
  ['lowereastside', 'Lower East Side'],
  ['williamsburg', 'Williamsburg'],
  ['greenpoint', 'Greenpoint'],
];
// A choice label can mean more than one location (e.g. "All-Access (both locations)").
// Checked before the single-location dictionary below.
const LOCATION_ALIASES = [
  ['allaccess', ['Williamsburg', 'Greenpoint']],
];
const MEMBERSHIPS = [
  ['unlimited', 'Unlimited'],
  ['daytime', 'Daytime'],
  ['4visit', '4-Visit'],
  ['fourvisit', '4-Visit'],
  ['summerpass', 'Summer Pass'],
];
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const matchLocations = (label) => {
  const n = norm(label);
  if (!n) return [];
  if (n === 'les') return ['Lower East Side'];
  const alias = LOCATION_ALIASES.find(([key]) => n.includes(key));
  if (alias) return alias[1];
  const hit = LOCATIONS.find(([key]) => n.includes(key));
  return hit ? [hit[1]] : [];
};
const matchLabel = (label, dict) => {
  const n = norm(label);
  if (!n) return null;
  const hit = dict.find(([key]) => n.includes(key));
  return hit ? hit[1] : null;
};
const EXISTING_Q = /(existing|current|already).*member|member.*(already|currently)/i;
const ZIP_Q = /zip|postal/i;
const REFERRAL_Q = /how.*(hear|find).*(us|about)/i;

const fr = (($('Config').first().json.body) || {}).form_response;
if (!fr) throw new Error('Intake: payload is not a Typeform form_response');

const titles = Object.fromEntries((fr.definition?.fields || []).map((f) => [f.id, f.title || '']));
let email = '';
let phone = '';
let firstText = '';
let zipCode = '';
let referralSource = '';
let existing = false;
const nameParts = [];
const locations = new Set();
const memberships = new Set();

for (const a of fr.answers || []) {
  // Typeform's "Contact Info" block delivers one answer per sub-field (first/last name, phone,
  // email), each with its own field.id — these usually aren't in definition.fields, so title
  // lookup falls back to field.ref. If a real submission shows ref isn't descriptive either,
  // the /name/i check below may need to key off answer order instead — confirm against one
  // real payload before relying on this for anything beyond name/email/phone.
  const title = titles[a.field?.id] || a.field?.ref || '';
  let labels = [];
  if (a.type === 'email') email = email || a.email;
  else if (a.type === 'phone_number') phone = phone || a.phone_number;
  else if (a.type === 'text') {
    if (/name/i.test(title)) nameParts.push(a.text);
    else if (ZIP_Q.test(title)) zipCode = a.text;
    else if (REFERRAL_Q.test(title)) referralSource = a.text;
    else if (!firstText) firstText = a.text;
  } else if (a.type === 'boolean') {
    if (EXISTING_Q.test(title)) existing = !!a.boolean;
  } else if (a.type === 'choice') labels = [a.choice?.label, a.choice?.other];
  else if (a.type === 'choices') labels = [...(a.choices?.labels || []), a.choices?.other];

  if (labels.length && EXISTING_Q.test(title)) existing = labels.some((l) => /^yes/i.test(String(l || '')));
  if (labels.length && REFERRAL_Q.test(title)) referralSource = referralSource || labels.filter(Boolean).join(', ');
  for (const l of labels) {
    matchLocations(l).forEach((loc) => locations.add(loc));
    const mem = matchLabel(l, MEMBERSHIPS);
    if (mem) memberships.add(mem);
  }
}

if (!email || !locations.size || !memberships.size) {
  throw new Error(
    `Intake: submission ${fr.token} is missing ${[!email && 'email', !locations.size && 'location', !memberships.size && 'membership'].filter(Boolean).join(', ')} — check the Typeform choice labels`,
  );
}

return [{
  json: {
    email: email.trim().toLowerCase(),
    name: nameParts.join(' ').trim() || firstText || '',
    phone,
    zipCode,
    referralSource,
    memberType: existing ? 'Existing' : 'New',
    joinedAt: fr.submitted_at || new Date().toISOString(),
    submissionId: fr.token,
    queues: [...locations].flatMap((location) => [...memberships].map((membership) => ({ location, membership }))),
  },
}];
