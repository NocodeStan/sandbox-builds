// Batches about to be written. On a retry, only the batches Airtable refused come back through here.
return $input.all().map(({ json }) => ({ json: { records: json.records, typecast: true, attempt: json.attempt || 1 } }));
