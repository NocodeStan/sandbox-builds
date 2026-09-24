// ─────────────────────────────────────────────────────────────
//  AKARI WAITLIST · CONFIG — the only node you should need to edit
// ─────────────────────────────────────────────────────────────
const cfg = {
  // Connections
  airtableBaseId: 'appXXXXXXXXXXXXXX', // from the base URL: airtable.com/appXXXX/...
  publicWebhookBase: 'https://YOUR-N8N-HOST/webhook/akari-waitlist', // production webhook URL prefix, no trailing slash
  airtableApi: 'https://api.airtable.com/v0',
  sendgridApi: 'https://api.sendgrid.com/v3/mail/send',
  tables: { waitlist: 'Waitlist', capacity: 'Capacity', log: 'Activity Log' },

  // Email identity (fromEmail must be a verified SendGrid sender / domain)
  brandName: 'Akari Sauna',
  fromEmail: 'waitlist@YOUR-DOMAIN.com',
  fromName: 'Akari Sauna',
  replyToEmail: 'hello@YOUR-DOMAIN.com',
  teamEmails: ['team@YOUR-DOMAIN.com'], // daily report + tour-request alerts

  // Safety switches — leave as-is until testing is signed off
  engineEnabled: true, // false = the hourly engine does nothing (webhooks still work)
  sandboxMode: true, // true = SendGrid accepts but delivers nothing
  testRecipient: '', // e.g. 'you@yourdomain.com' → every email is redirected here
  sendNowSecret: 'CHANGE-ME', // long random string; also goes in the Airtable button URL

  // Business rules
  timezone: 'America/New_York',
  sendWindow: { startHour: 8, endHour: 20 }, // invites + heads-ups only go out 08:00–19:59 local
  holdHours: 24, // claim window that holds the spot
  primeCount: 10, // "next ~10 in line" get the early heads-up
  newMemberWeight: 3, // 1 new signup ≈ 3 existing-member upgrades
  warmCooldownHours: 72, // a timed-out person is first in line again after this
  timeoutsBeforeNoReply: 2, // 1st timeout → Warm, 2nd → No Reply bucket
  maxInvitesPerQueuePerRun: 10, // guardrail against a mistyped minimum
  tourStaleDays: 7, // tour holds older than this are flagged in the daily report
};

const base = `${cfg.airtableApi}/${cfg.airtableBaseId}`;
cfg.urls = {
  waitlist: `${base}/${encodeURIComponent(cfg.tables.waitlist)}`,
  capacity: `${base}/${encodeURIComponent(cfg.tables.capacity)}`,
  log: `${base}/${encodeURIComponent(cfg.tables.log)}`,
};

return $input.all().map((item) => ({ json: { ...item.json, cfg } }));
