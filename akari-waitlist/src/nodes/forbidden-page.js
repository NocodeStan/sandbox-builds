// @include core
// @include pages
return [{ json: { status: 403, page: htmlPage('Not allowed', '<p>This Send Now link is missing a valid key or record ID. Check the button URL in Airtable.</p>'), actions: [] } }];
