// Gmail / Calendar API shaped fixtures and TypeSafe answer builders.
import { daysAgo, daysFromNow, hoursAgo } from './harness.mjs';

const b64u = (s) => Buffer.from(s, 'utf8').toString('base64url');
let seq = 0;

// message({ from: 'Jane <jane@acme.test>', to, subject, body, html, at: Date, labels: [], headers: {} })
export function message({ from, to = 'Stan <stan@owner.test>', cc, subject = 'Hello', body, html, at = hoursAgo(5), labels = ['INBOX'], headers = {} }) {
  seq += 1;
  const hs = [
    { name: 'From', value: from },
    { name: 'To', value: to },
    ...(cc ? [{ name: 'Cc', value: cc }] : []),
    { name: 'Subject', value: subject },
    { name: 'Date', value: at.toUTCString() },
    ...Object.entries(headers).map(([name, value]) => ({ name, value })),
  ];
  const parts = [];
  if (body !== undefined) parts.push({ mimeType: 'text/plain', body: { data: b64u(body) } });
  if (html !== undefined) parts.push({ mimeType: 'text/html', body: { data: b64u(html) } });
  return {
    id: `m${String(seq).padStart(6, '0')}`,
    labelIds: labels,
    snippet: String(body ?? html ?? '').slice(0, 100),
    internalDate: String(at.getTime()),
    payload: { mimeType: 'multipart/alternative', headers: hs, parts },
  };
}

export const thread = (id, messages) => ({ id, historyId: '1', messages });
export const items = (list) => list.map((json) => ({ json }));

// A realistic week for an AI advisor: client, prospect, risk, waiting-on, commitment, newsletters.
export function sampleMailbox() {
  return [
    thread('t-acme-board', [
      message({ from: 'Jane Park <jane.park@acme.test>', subject: 'Board pack: AI operating model', at: hoursAgo(20), body: 'Hi Stan,\nCould you send the revised AI operating model slides by Friday? The CEO wants them in the board pack.\nThanks, Jane' }),
    ]),
    thread('t-globex-proposal', [
      message({ from: 'Stan <stan@owner.test>', to: 'Raj Mehta <raj@globex.test>', subject: 'Proposal: agentic automation pilot', at: daysAgo(5), labels: ['SENT'], body: 'Raj, attached is the proposal for the 8-week pilot. Keen to hear your thoughts.' }),
    ]),
    thread('t-initech-risk', [
      message({ from: 'Tom Reid <tom@initech.test>', subject: 'Workshop follow-up', at: daysAgo(6), body: 'Stan, we still have not received the workshop summary promised last week. The team is frustrated.' }),
      message({ from: 'Stan <stan@owner.test>', to: 'Tom Reid <tom@initech.test>', subject: 'Re: Workshop follow-up', at: daysAgo(2), labels: ['SENT'], body: 'Tom, apologies. I will send the summary tomorrow.\n\nOn Mon, Tom Reid wrote:\n> we still have not received' }),
    ]),
    thread('t-podcast', [
      message({ from: 'Ana Silva <ana@futurework.test>', subject: 'Podcast invitation: AI in the boardroom', at: daysAgo(1), body: 'Hi Stan, would you join our podcast on 14 October to discuss AI governance for boards?' }),
    ]),
    thread('t-invoice', [
      message({ from: 'Accounts <accounts@acme.test>', subject: 'PO number for September invoice', at: daysAgo(4), body: 'Please add PO 4471 to the September invoice and resend.' }),
    ]),
    thread('t-newsletter', [
      message({ from: 'The Batch <news@deeplearning.test>', subject: 'Agents in production: what works', at: daysAgo(2), labels: ['INBOX', 'CATEGORY_UPDATES'], headers: { 'List-Unsubscribe': '<mailto:u@x.test>' }, html: '<p>This week: evaluating agentic systems in enterprise settings.</p>' }),
    ]),
    thread('t-promo', [
      message({ from: 'SaaSCo <marketing@saasco.test>', subject: '50% off annual plans', at: daysAgo(1), labels: ['INBOX', 'CATEGORY_PROMOTIONS'], headers: { 'List-Unsubscribe': '<mailto:u@y.test>' }, body: 'Upgrade today and save.' }),
    ]),
  ];
}

export function calendarEvents() {
  const at = (d, h, dur = 1) => {
    const s = daysFromNow(d);
    s.setUTCHours(h, 0, 0, 0);
    return { start: { dateTime: s.toISOString() }, end: { dateTime: new Date(s.getTime() + dur * 3600000).toISOString() } };
  };
  return {
    items: [
      { id: 'ev-acme-past', summary: 'ACME steering committee', ...at(-3, 10, 2), attendees: [{ email: 'stan@owner.test', self: true, responseStatus: 'accepted' }, { email: 'jane.park@acme.test' }] },
      { id: 'ev-focus', summary: 'Deep work', ...at(-2, 8, 3) },
      { id: 'ev-acme-board', summary: 'ACME board prep', ...at(2, 9), attendees: [{ email: 'stan@owner.test', self: true }, { email: 'jane.park@acme.test', displayName: 'Jane Park' }] },
      { id: 'ev-globex', summary: 'Globex pilot discussion', ...at(3, 14), attendees: [{ email: 'raj@globex.test', displayName: 'Raj Mehta' }] },
      { id: 'ev-declined', summary: 'Vendor demo', ...at(4, 15), attendees: [{ email: 'stan@owner.test', self: true, responseStatus: 'declined' }, { email: 'sales@vendor.test' }] },
      { id: 'ev-cancelled', status: 'cancelled', summary: 'Old sync', ...at(1, 11) },
      { id: 'ev-ooo', summary: 'Out of office', eventType: 'outOfOffice', start: { date: daysFromNow(5).toISOString().slice(0, 10) }, end: { date: daysFromNow(6).toISOString().slice(0, 10) } },
    ],
  };
}

// ── TypeSafe answer builders (shape = POST /v1/systemone response) ──
export const noul = (p) => ({ type: 'noul', noul: p });
export const choice = (label, confidence = 0.9) => ({ type: 'choice', choice: label, confidence, probabilities: { [label]: confidence } });
export const score = (s, confidence = 0.8) => ({ type: 'score', score: s, confidence, legend: {}, probabilities: {} });
export const response = (answers) => ({ model: 'jev-test', answers, usage: { input_tokens: 400, output_tokens: 20 } });

export const conversationAnswers = (o = {}) => ({
  category: choice(o.category || 'client_delivery', o.categoryConfidence ?? 0.9),
  needs_owner_action: noul(o.action ?? 0.1),
  awaiting_others: noul(o.waiting ?? 0.1),
  owner_commitment_open: noul(o.commitment ?? 0.1),
  relationship_risk: noul(o.risk ?? 0.05),
  urgency: score(o.urgency ?? 1),
  strategic_value: score(o.value ?? 1),
  ...(o.deadline ? { deadline: choice(o.deadline, 0.8) } : {}),
});
export const bulkAnswers = (kind = 'newsletter_research', relevance = 2.4) => ({ kind: choice(kind), relevance: score(relevance) });
