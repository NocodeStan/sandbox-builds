import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseConfig, entry, hoursFromNow, records, runNode } from './harness.mjs';

const TOKEN = 'a1b2c3d4'.repeat(6);
const cfgNode = (extra = {}) => [{ json: { cfg: baseConfig(), ...extra } }];
const batch = (n, attempt) => ({ json: { records: [{ id: `rec${n}`, fields: { Status: 'Invited' } }], typecast: true, ...(attempt ? { attempt } : {}) } });
const lockout = { json: { error: { message: 'The service is receiving too many requests from you', httpCode: '429' } } };
const check = (sent, results) => runNode('check-waitlist-writes', { nodes: { Config: cfgNode(), 'Pending Waitlist Writes': sent }, input: results }).map((i) => i.json);

test('writes: all batches saved → carry on, once', () => {
  assert.deepEqual(check([batch(1), batch(2)], [{ json: { records: [] } }, { json: { records: [] } }]), [{ retry: false }]);
});

test('writes: a batch refused by the rate-limit lockout is resent alone, attempt counted', () => {
  const out = check([batch(1), batch(2), batch(3)], [{ json: { records: [] } }, lockout, lockout]);
  assert.deepEqual(out.map((o) => [o.retry, o.records[0].id, o.attempt]), [[true, 'rec2', 2], [true, 'rec3', 2]]);
});

test('writes: gives up loudly after 4 attempts so the error alert fires', () => {
  assert.throws(() => check([batch(1, 4)], [lockout]), /still refusing 1 waitlist update batch\(es\) after 4 attempts/);
});

test('writes: a non-retryable refusal (bad payload) fails immediately instead of looping', () => {
  assert.throws(() => check([batch(1)], [{ json: { error: { message: 'Unknown field name: "Stauts"', httpCode: '422' } } }]), /refused 1 waitlist update/);
});

test('pending writes: only records + typecast are sent, attempt carried for counting', () => {
  const out = runNode('pending-writes', { input: [batch(1), batch(2, 3)] }).map((i) => i.json);
  assert.deepEqual(out.map((o) => [Object.keys(o).sort().join(','), o.attempt]), [['attempt,records,typecast', 1], ['attempt,records,typecast', 3]]);
});

test('confirm (POST) during a lockout → 503 "try again" with a one-click resend of the same answer, nothing changes', () => {
  const e = entry({ Status: 'Invited', 'Invite Token': TOKEN, 'Invite Expires At': hoursFromNow(5) });
  const [{ json }] = runNode('decide-response', {
    nodes: {
      Config: cfgNode({ body: { t: TOKEN, a: 'tour', reason: 'Sat <am>' } }),
      'Find Entry by Token (commit)': records([e]),
      'Find Entries by Email': [lockout],
      'Find Queue Settings': records([]),
    },
  });
  assert.equal(json.status, 503);
  assert.deepEqual(json.actions, []);
  assert.match(json.page, /name="t" value="a1b2c3d4/);
  assert.match(json.page, /name="a" value="tour"/);
  assert.match(json.page, /name="reason" value="Sat &lt;am&gt;"/);
  assert.match(json.page, /Try again/);
  assert.match(json.page, /setTimeout\([\s\S]*35000\+Math\.floor\(Math\.random\(\)\*20000\)/);
});

test('opening a link during a lockout → 503 "refresh in a minute", not "link expired"', () => {
  const [{ json }] = runNode('render-confirm-page', { nodes: { Config: cfgNode({ query: { t: TOKEN, a: 'yes' } }), 'Find Entry by Token (view)': [lockout] } });
  assert.equal(json.status, 503);
  assert.match(json.page, /refresh this page in a minute/);
});

test('Send Now during a lockout → 503, nothing sent (not "entry not found")', () => {
  const [{ json }] = runNode('build-send-now', {
    nodes: { Config: cfgNode({ query: { id: 'recX' } }), 'Get Entry for Send Now': [{ json: { errors: [{ error: 'RATE_LIMIT_REACHED' }] } }] },
  });
  assert.equal(json.status, 503);
  assert.deepEqual(json.actions, []);
});
