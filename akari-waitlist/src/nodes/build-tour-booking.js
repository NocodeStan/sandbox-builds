// @include core
// Records the booked tour time on the waitlist row. The engine releases the hold
// tourReleaseHours after this time unless staff have sent the sign-up link by then.
const b = $('Read Cal.com Booking').first().json;
const done = (msg, actions = []) => [{ json: { status: 200, page: msg, actions } }];
const EVENTS = ['BOOKING_CREATED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED'];
if (!EVENTS.includes(b.event)) return done('ignored'); // e.g. Cal.com's "PING" test

const rows = recordsOf('Find Entry for Tour Booking').map(normEntry);
const e = rows.find((r) => b.entryId && r.id === b.entryId) || rows.find((r) => r.email === b.email && r.status === 'Tour Requested');
if (!e) return done('ignored: no matching waitlist entry'); // a booking from someone not on the waitlist

const ref = b.bookingId ? ` (Cal.com ${b.bookingId})` : '';
if (b.event === 'BOOKING_CANCELLED') {
  return done('ok', [{
    recordId: e.id,
    fields: { 'Tour At': null },
    email: null,
    log: logRow(e, 'Tour Cancelled', { Reason: b.cancellationReason, Detail: `Cancelled the tour${e.tourAt ? ` on ${fmtTime(e.tourAt)}` : ''}${ref}. The spot stays held until a new time is booked.` }),
  }]);
}
const when = new Date(b.startTime);
if (!b.startTime || Number.isNaN(when.getTime())) return done('ignored: no start time');
return done('ok', [{
  recordId: e.id,
  fields: { 'Tour At': when.toISOString() },
  email: null,
  log: logRow(e, 'Tour Booked', { Detail: `${b.event === 'BOOKING_RESCHEDULED' ? 'Moved to' : 'Booked for'} ${fmtTime(when)}${ref}` }),
}]);
