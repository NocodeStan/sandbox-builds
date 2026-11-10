// One item per 10-row Airtable update.
return $('Plan Active Updates').first().json.chunks.map((c) => ({ json: c }));
