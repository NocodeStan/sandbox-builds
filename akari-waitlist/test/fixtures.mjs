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
