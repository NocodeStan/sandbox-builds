// ─────────────────────────────────────────────────────────────
//  INBOX INTELLIGENCE · CONFIG — the only node you should need to edit
// ─────────────────────────────────────────────────────────────
const cfg = {
  // Who the inbox belongs to (used in every judgment and to tell your messages from everyone else's)
  owner: {
    name: 'Stan',
    role: 'Senior AI architect and advisor to C-suite and executive leadership',
    focus: ['AI strategy', 'automation', 'agentic systems', 'digital transformation', 'executive advisory'],
  },
  ownerEmails: ['you@YOUR-DOMAIN.com'], // every address you send from (aliases too), lower-case
  reportTo: ['you@YOUR-DOMAIN.com'], // weekly report recipients
  timezone: 'Europe/London',
  gmailAccountIndex: 0, // the /u/N/ in your Gmail URL, for links in the report

  // Known relationships — exact lookups stay in code; the model is told the fact, not asked to guess it.
  // Entries are domains (acme.com) or full addresses (jane@acme.com).
  relationships: {
    client: [],
    prospect: [],
    partner: [],
    team: [],
  },

  // Safety switches
  applyLabels: true, // false = judge and report only, never touch Gmail labels
  archiveLowValueBulk: false, // true = low-value newsletters/promotions also leave the inbox (still searchable)
  sortEnabled: true, // false = the 2-hourly sort does nothing (weekly report still runs)

  // Scope
  sortQuery: 'in:inbox newer_than:2d -in:chats', // what the 2-hourly sort looks at
  reportQuery: 'newer_than:7d -in:chats -in:spam -in:trash -in:draft', // what the weekly report reads
  maxThreadsPerRun: 400, // hard cap on threads judged per run (cost guardrail)
  maxMessagesPerThread: 4, // latest N messages of each thread are sent for judgment
  maxCharsPerMessage: 1200,
  lookBackDays: 7,
  lookAheadDays: 7,
  eventsPerRequest: 12, // calendar events judged per TypeSafe request

  // Decision policy — thresholds on TypeSafe probabilities / scores. Tune on your own mail.
  thresholds: {
    action: 0.6, // P(you owe a reply/decision/deliverable)
    waiting: 0.6, // P(you are waiting on someone else)
    commitment: 0.6, // P(you promised something not yet done)
    risk: 0.5, // P(dissatisfaction / escalation / relationship risk)
    reading: 1.8, // bulk relevance score (0–3) that earns "Worth reading"
    minCategoryConfidence: 0.55, // below this the thread also gets the Review label
    nudgeAfterDays: 3, // "waiting on" items older than this are flagged to chase
  },
  // Priority = weighted blend of judgments (0–100). Change weights without re-running any judgment.
  weights: { urgency: 30, value: 30, action: 15, risk: 15, deadlineSoon: 10 },

  // Labels (Gmail nests anything after "/")
  labels: {
    root: 'IQ',
    action: 'IQ/1-Action',
    waiting: 'IQ/2-Waiting On',
    commitment: 'IQ/3-My Commitments',
    risk: 'IQ/Risk',
    review: 'IQ/Review',
    reading: 'IQ/Reading',
    lowValue: 'IQ/Low Value',
    category: {
      client_delivery: 'IQ/Client',
      new_business: 'IQ/New Business',
      partnerships_speaking: 'IQ/Partnerships',
      finance_admin: 'IQ/Finance-Admin',
      team_ops: 'IQ/Team-Ops',
      personal: 'IQ/Personal',
      automated_notification: 'IQ/Notifications',
      other: 'IQ/Other',
    },
  },

  // APIs
  typesafeApi: 'https://api.typesafe.ai',
  typesafeModel: 'jev-latest',
  gmailApi: 'https://gmail.googleapis.com/gmail/v1/users/me',
  calendarApi: 'https://www.googleapis.com/calendar/v3/calendars/primary',
};

cfg.allLabels = [
  cfg.labels.root, cfg.labels.action, cfg.labels.waiting, cfg.labels.commitment, cfg.labels.risk,
  cfg.labels.review, cfg.labels.reading, cfg.labels.lowValue, ...Object.values(cfg.labels.category),
];

return $input.all().map((item) => ({ json: { ...item.json, cfg } }));
