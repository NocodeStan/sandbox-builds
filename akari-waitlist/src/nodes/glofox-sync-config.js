// ─────────────────────────────────────────────────────────────
//  AKARI · GLOFOX MEMBER SYNC · CONFIG
//  Once a day: count active Glofox members per Capacity row and update Active Members.
// ─────────────────────────────────────────────────────────────
const cfg = {
  airtableBaseId: 'appXXXXXXXXXXXXXX', // same base as the waitlist workflow
  airtableApi: 'https://api.airtable.com/v0',
  tables: { capacity: 'Capacity', log: 'Activity Log', waitlist: 'Waitlist' },

  glofoxApi: 'https://YOUR-GLOFOX-PROXY/prod', // Glofox API base (your proxy), no trailing slash
  // Each branch's members are listed with that branch's ID. A member is counted once, however many branches list them.
  branches: [
    { id: '64c9870292e260894f0247a4', name: 'Williamsburg' },
    { id: '67cf4fe8ef346c3817003b8f', name: 'Greenpoint' },
    { id: '6a1741e58f61326070010c0a', name: 'LES' },
  ],

  // Everyone holding a membership counts, so a pause or a failed payment doesn't open a spot (Jack, 11 Nov).
  // Someone drops out of the count only once their membership is cancelled in Glofox.
  countStatuses: ['ACTIVE', 'PAUSED', 'LOCKED', 'FUTURE'],
  maxDropShare: 0.5, // a queue whose count falls by more than this share in one day is not written; it is flagged instead
  minRowsForDropCheck: 20, // ...only for queues with at least this many active members today
};

const base = `${cfg.airtableApi}/${cfg.airtableBaseId}`;
cfg.urls = {
  capacity: `${base}/${encodeURIComponent(cfg.tables.capacity)}`,
  log: `${base}/${encodeURIComponent(cfg.tables.log)}`,
  waitlist: `${base}/${encodeURIComponent(cfg.tables.waitlist)}`,
};

return [{ json: { cfg } }];
