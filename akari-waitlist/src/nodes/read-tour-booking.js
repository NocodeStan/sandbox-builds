// Reads a Cal.com webhook (booking created / rescheduled / cancelled) and builds the Airtable lookup:
// the row ID we put on the booking link, or failing that their email on a row that's waiting for a tour.
const body = $('Config').first().json.body || {};
const p = body.payload || {};
const entryId = String((p.metadata || {}).entry || '').replace(/[^A-Za-z0-9]/g, '');
const email = String(((p.attendees || [])[0] || {}).email || '').trim().toLowerCase().replace(/["\\]/g, '');
return [{
  json: {
    event: String(body.triggerEvent || ''),
    entryId,
    email,
    startTime: p.startTime || '',
    bookingId: String(p.uid || ''),
    cancellationReason: String(p.cancellationReason || '').slice(0, 500),
    formula: `OR(RECORD_ID()="${entryId || 'NONE'}",AND(LOWER({Email})="${email || 'NONE'}",{Status}="Tour Requested"))`,
  },
}];
