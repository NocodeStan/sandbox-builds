// Reads the raw Typeform webhook payload. Nothing here lists Akari's locations or memberships:
// names come from the form's own choice labels, so the team can add a location or a membership
// in Typeform and it flows through without a workflow change.
//
// How the form is read:
//  · The location question is the choice question whose title mentions "location".
//    A label's name is the text before " - " or "(":  "Williamsburg - Akari Sauna - (202 Grand St.)" → Williamsburg,
//    "All-Access (Akari Sauna locations)" → All-Access, "Akari Yu (888 Lorimer St) (coming soon!)" → Akari Yu.
//  · Membership questions are choice questions whose title mentions "membership". Each belongs to the
//    location named in its title ("Which Williamsburg membership(s)…"). A label's name is the text before
//    " - " or "(", and a "$" amount in it is kept as the price: "Unlimited - $220/month" → Unlimited, $220.
//  · A single membership question that names no location applies to every chosen location (older forms).
const EXISTING_Q = /(existing|current|already).*member|member.*(already|currently)/i;
const ZIP_Q = /zip|postal/i;
const REFERRAL_Q = /how.*(hear|find).*(us|about)/i;
const LOCATION_Q = /\blocations?\b/i;
const MEMBERSHIP_Q = /\bmemberships?\b/i;

const cleanName = (label) => String(label || '').split(/\s+[-–—]\s+|\s*\(/)[0].replace(/\s+/g, ' ').trim();
const priceOf = (label) => {
  const m = String(label || '').match(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
};
const words = (s) => ` ${String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
// The longest location name that appears as whole words in the question title.
const locationIn = (title, names) => names
  .filter((n) => words(n).trim() && words(title).includes(words(n)))
  .sort((a, b) => b.length - a.length)[0] || null;

const fr = (($('Config').first().json.body) || {}).form_response;
if (!fr) throw new Error('Intake: payload is not a Typeform form_response');

const defs = Object.fromEntries((fr.definition?.fields || []).map((f) => [f.id, f]));
let email = '';
let phone = '';
let firstText = '';
let zipCode = '';
let referralSource = '';
let existing = false;
const nameParts = [];
const chosenLocations = [];
const membershipAnswers = []; // { title, labels }

for (const a of fr.answers || []) {
  // Typeform's "Contact Info" block delivers one answer per sub-field (first/last name, phone,
  // email), each with its own field.id — these usually aren't in definition.fields, so title
  // lookup falls back to field.ref.
  const title = defs[a.field?.id]?.title || a.field?.ref || '';
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
  } else if (a.type === 'choice') labels = [a.choice?.label].filter(Boolean);
  else if (a.type === 'choices') labels = (a.choices?.labels || []).filter(Boolean);
  if (!labels.length) continue;

  // "Other" free text is never turned into a location or membership.
  if (EXISTING_Q.test(title)) existing = labels.some((l) => /^yes/i.test(String(l)));
  else if (REFERRAL_Q.test(title)) referralSource = referralSource || labels.join(', ');
  else if (MEMBERSHIP_Q.test(title)) membershipAnswers.push({ title, labels });
  else if (LOCATION_Q.test(title)) labels.map(cleanName).filter(Boolean).forEach((n) => { if (!chosenLocations.includes(n)) chosenLocations.push(n); });
}

// Every location the form offers (from its definition), so a membership question still finds its
// location by title even if the person somehow didn't tick that location.
const offered = Object.values(defs)
  .filter((f) => LOCATION_Q.test(f.title || '') && !MEMBERSHIP_Q.test(f.title || ''))
  .flatMap((f) => (f.properties?.choices || f.choices || []).map((c) => cleanName(c.label)))
  .filter(Boolean);
const knownLocations = [...new Set([...chosenLocations, ...offered])];

const queues = [];
const warnings = [];
const add = (location, label) => {
  const membership = cleanName(label);
  if (!membership || queues.some((q) => q.location === location && q.membership === membership)) return;
  queues.push({ location, membership, price: priceOf(label) });
};
const unnamed = [];
for (const m of membershipAnswers) {
  const loc = locationIn(m.title, knownLocations);
  if (loc) m.labels.forEach((l) => add(loc, l));
  else unnamed.push(m);
}
if (unnamed.length) {
  const covered = new Set(queues.map((q) => q.location));
  const targets = chosenLocations.filter((l) => !covered.has(l));
  if (unnamed.length === 1 || targets.length === 1) {
    for (const m of unnamed) for (const loc of targets) m.labels.forEach((l) => add(loc, l));
  } else {
    warnings.push(`Could not tell which location these membership questions belong to: ${unnamed.map((m) => `"${m.title}"`).join(', ')}. Put the location's name in each membership question's title.`);
  }
}
for (const loc of chosenLocations) {
  if (!queues.some((q) => q.location === loc)) warnings.push(`Chose ${loc} but no membership for it.`);
}

if (!email || !queues.length) {
  const missing = [!email && 'email', !chosenLocations.length && 'location', !queues.length && 'membership'].filter(Boolean);
  throw new Error(`Intake: submission ${fr.token} is missing ${missing.join(', ')} — check the Typeform questions${warnings.length ? `. ${warnings.join(' ')}` : ''}`);
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
    queues,
    warnings,
  },
}];
