// @include core
// @include email
return $('Apply Tokens').all()
  .map((i) => i.json.email)
  .filter(Boolean)
  .map((m) => ({ json: { payload: sendgridPayload(m) } }));
