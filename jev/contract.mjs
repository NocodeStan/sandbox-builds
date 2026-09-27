// Request/response contract for POST /v1/systemone, mirrored from the official @typesafe-ai/sdk 0.6.0 type
// declarations (SystemOneRequest, NoulQuestion, ChoiceQuestion, ScoreQuestion, SystemOneResult).
import assert from 'node:assert/strict';

const isEntry = (v) => v === null || typeof v === 'string' || Array.isArray(v) || (typeof v === 'object' && v !== undefined);

export function assertValidRequest(req) {
  assert.equal(typeof req.model, 'string', 'model is a string');
  assert.ok(req.state !== undefined && isEntry(req.state), 'state is text, JSON or null');
  const qs = Object.entries(req.questions || {});
  assert.ok(qs.length > 0, 'questions are nonempty');
  for (const [name, q] of qs) {
    assert.ok(['noul', 'choice', 'score'].includes(q.type), `${name}: known type`);
    if (q.instructions !== undefined) assert.ok(isEntry(q.instructions), `${name}: instructions`);
    if (q.type === 'noul' && q.criteria != null) {
      assert.ok(Object.keys(q.criteria).every((k) => k === 'true' || k === 'false'), `${name}: noul criteria keys are true/false`);
    }
    if (q.type === 'choice') {
      assert.ok(q.criteria && typeof q.criteria === 'object' && !Array.isArray(q.criteria), `${name}: choice criteria is an object`);
      assert.ok(Object.keys(q.criteria).length >= 2, `${name}: choice has ≥2 labels`);
    }
    if (q.type === 'score') assert.ok(Array.isArray(q.criteria) && q.criteria.length >= 2, `${name}: score criteria is a list of ≥2`);
  }
  return true;
}

// A deterministic stand-in for the model: answers every question in a request with a valid typed answer.
// `pick(name, question, state)` may return a label / probability / score to steer specific answers.
export function answerRequest(req, pick = () => undefined) {
  assertValidRequest(req);
  const answers = {};
  for (const [name, q] of Object.entries(req.questions)) {
    const want = pick(name, q, req.state);
    if (q.type === 'noul') answers[name] = { type: 'noul', noul: want ?? 0.1 };
    if (q.type === 'choice') {
      const labels = Object.keys(q.criteria);
      const choice = labels.includes(want) ? want : labels[labels.length - 1];
      answers[name] = { type: 'choice', choice, confidence: 0.85, probabilities: Object.fromEntries(labels.map((l) => [l, l === choice ? 0.85 : 0.15 / (labels.length - 1)])) };
    }
    if (q.type === 'score') {
      const s = want ?? 1;
      answers[name] = { type: 'score', score: s, confidence: 0.8, legend: Object.fromEntries(q.criteria.map((c, i) => [i, c])), probabilities: Object.fromEntries(q.criteria.map((_, i) => [i, i === Math.round(s) ? 0.8 : 0.2 / (q.criteria.length - 1)])) };
    }
  }
  return { model: req.model, answers, usage: { input_tokens: JSON.stringify(req).length / 4 | 0, output_tokens: Object.keys(answers).length * 3 } };
}
