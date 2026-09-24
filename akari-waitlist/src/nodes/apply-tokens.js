// Swaps the placeholder for the random token from "Generate Tokens" (48 hex chars, crypto.randomBytes).
return $input.all().map(({ json }) => {
  const { token, ...action } = json;
  return { json: JSON.parse(JSON.stringify(action).split('__TOKEN__').join(token)) };
});
