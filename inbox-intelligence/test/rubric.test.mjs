import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertValidRequest } from '../../jev/contract.mjs';
import { fill, loadRubric, questions, request } from '../../jev/rubric.mjs';
import { calendarEvents, items, sampleMailbox } from './fixtures.mjs';
import { configItem, runNode } from './harness.mjs';

const rubric = loadRubric(new URL('../rubric.json', import.meta.url));
const cfg = configItem()[0].json.cfg;
const vars = { owner: cfg.owner.name, role: cfg.owner.role };

test('rubric: every group builds a valid TypeSafe request with no unfilled placeholders', () => {
  for (const [group, v] of [['thread', vars], ['bulk', vars], ['event', { ...vars, i: 0 }]]) {
    // Optional questions (e.g. deadline) only become valid once code adds their options.
    const always = Object.entries(rubric.groups[group].questions).filter(([, q]) => !q.optional).map(([n]) => n);
    const req = request(rubric, group, { x: 1 }, v, always);
    assertValidRequest(req);
    assert.doesNotMatch(JSON.stringify(req.questions), /\{\{\w+\}\}/, group);
    assert.ok(!JSON.stringify(req.questions).includes('"optional"'), 'doc keys dropped');
  }
  assert.equal(fill('{{owner}} / {{unknown}}', { owner: 'Stan' }), 'Stan / {{unknown}}');
});

test('rubric is the single source: the n8n nodes send exactly the rubric questions', () => {
  const [conv, bulk] = runNode('prepare-thread', { nodes: { Config: configItem() }, input: items([sampleMailbox()[0], sampleMailbox()[5]]) }).map((i) => i.json);
  const { deadline, ...rest } = conv.request.questions;
  assert.deepEqual(rest, questions(rubric, 'thread', vars, Object.keys(rest)));
  const rubricDeadline = questions(rubric, 'thread', vars, ['deadline']).deadline;
  assert.equal(deadline.instructions, rubricDeadline.instructions);
  assert.equal(deadline.criteria.none, rubricDeadline.criteria.none);
  assert.deepEqual(bulk.request.questions, questions(rubric, 'bulk', vars));

  const [ev] = runNode('prepare-events', { nodes: { Config: configItem(), 'Combine Judgments': null }, input: items([calendarEvents()]) }).map((i) => i.json);
  const i = ev.request.state.events.findIndex((e) => e.title === 'ACME board prep');
  const q = questions(rubric, 'event', { owner: vars.owner, i });
  assert.deepEqual(ev.request.questions[`e${i}_type`], q.type);
  assert.deepEqual(ev.request.questions[`e${i}_prep`], q.prep);
});
