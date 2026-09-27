// Runs the whole report lane in-process, node by node, exactly as wired in n8n, with Gmail/Calendar
// fixtures and a deterministic TypeSafe stand-in. Used by tests and by `npm run sample`.
import { calendarEvents, items, sampleMailbox } from './fixtures.mjs';
import { configItem, runNode } from './harness.mjs';
import { answerRequest } from './typesafe-contract.mjs';

// Steering for the sample week: what a well-calibrated model would plausibly say about each fixture.
export const SAMPLE = {
  't-acme-board': { category: 'client_delivery', needs_owner_action: 0.93, urgency: 2.7, strategic_value: 2.9, deadline: 'd1' },
  't-globex-proposal': { category: 'new_business', awaiting_others: 0.88, urgency: 1.4, strategic_value: 2.8 },
  't-initech-risk': { category: 'client_delivery', owner_commitment_open: 0.91, relationship_risk: 0.84, urgency: 2.9, strategic_value: 2.3, deadline: 'd1' },
  't-podcast': { category: 'partnerships_speaking', needs_owner_action: 0.81, urgency: 1.6, strategic_value: 2.1, deadline: 'd1' },
  't-invoice': { category: 'finance_admin', needs_owner_action: 0.77, urgency: 1.8, strategic_value: 1.2 },
  't-newsletter': { kind: 'newsletter_research', relevance: 2.6 },
  't-promo': { kind: 'marketing_promo', relevance: 0.2 },
  events: { 'ACME board prep': { type: 'client', prep: 2.8 }, 'Globex pilot discussion': { type: 'new_business', prep: 2.1 }, 'ACME steering committee': { type: 'client' } },
};

export function runReportLane({ mailbox = sampleMailbox(), calendar = calendarEvents(), steer = SAMPLE, cfg = {}, failThreads = [] } = {}) {
  const Config = configItem('report', cfg);
  const nodes = { Config };
  const split = runNode('split-threads', { nodes, input: items([{ threads: mailbox.map((t) => ({ id: t.id })) }]) });
  const prepared = runNode('prepare-thread', { nodes, input: items(mailbox), staticData: {} });
  nodes['Prepare Thread State'] = prepared;
  const judged = prepared.map(({ json: t }) =>
    failThreads.includes(t.threadId)
      ? { json: { error: { message: 'Service unavailable' } } }
      : { json: answerRequest(t.request, (name) => (steer[t.threadId] || {})[name]) });
  nodes['Combine Judgments'] = runNode('combine-judgments', { nodes, input: judged, staticData: {} });
  const evReqs = runNode('prepare-events', { nodes, input: items([calendar]) });
  nodes['Prepare Event Requests'] = evReqs;
  nodes['TypeSafe: Judge Events'] = evReqs[0].json.request
    ? evReqs.map(({ json: r }) => ({
      json: answerRequest(r.request, (name) => {
        const [, i, kind] = name.match(/^e(\d+)_(type|prep)$/);
        return ((steer.events || {})[r.request.state.events[Number(i)].title] || {})[kind];
      }),
    }))
    : null;
  const [report] = runNode('build-report', { nodes });
  return { split, prepared, nodes, report: report.json };
}
