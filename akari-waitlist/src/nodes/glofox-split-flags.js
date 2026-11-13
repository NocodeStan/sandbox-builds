// One item per 10-row Airtable update.
return $('Plan Member Flags').first().json.chunks.map((c) => ({ json: c }));
