// @include core
// @include pages
// Shared by both Airtable buttons (Send Now, Send Sign-up Link) and the Cal.com webhook.
return [{ json: { status: 403, page: htmlPage('Not allowed', '<p>This link is missing a valid key or record ID, so nothing was done.</p><p class="muted">If it came from an Airtable button, check the button\'s URL formula: it must include <code>?id=" &amp; RECORD_ID() &amp; "</code> and end with <code>&amp;k=</code> followed by the same secret as <code>sendNowSecret</code> in Config.</p>'), actions: [] } }];
