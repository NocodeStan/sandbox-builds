// Runs a Code node's source outside n8n with mocked $, $input and require.
import { createRequire } from 'node:module';
import { loadCode } from '../build/build-workflow.mjs';

const require = createRequire(import.meta.url);

export function runNode(name, { nodes = {}, input = [], pairedItem = {} } = {}) {
  const code = loadCode(name);
  const $ = (n) => {
    const items = nodes[n];
    if (!items) throw new Error(`test: node "${n}" is not mocked`);
    return { all: () => items, first: () => items[0], item: pairedItem[n] || items[0], isExecuted: true };
  };
  const $input = { all: () => input, first: () => input[0], item: input[0] };
  return new Function('$', '$input', '$json', 'require', code)($, $input, input[0]?.json, require);
}

export function baseConfig(overrides = {}) {
  const [{ json }] = runNode('config', { input: [{ json: { route: 'test' } }] });
  return {
    ...json.cfg,
    publicWebhookBase: 'https://n8n.test/webhook/akari-waitlist',
    fromEmail: 'waitlist@akari.test',
    replyToEmail: 'hello@akari.test',
    teamEmails: ['team@akari.test'],
    sendWindow: { startHour: 0, endHour: 24 },
    ...overrides,
  };
}

export const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();
export const daysAgo = (d) => hoursAgo(d * 24);
export const hoursFromNow = (h) => hoursAgo(-h);

let seq = 0;
export function entry(fields = {}, id) {
  seq += 1;
  const rid = id || `rec${String(seq).padStart(14, '0')}`;
  return {
    id: rid,
    createdTime: daysAgo(100),
    fields: {
      Name: `Person ${rid}`,
      Email: `${rid.toLowerCase()}@example.com`,
      Location: 'Williamsburg',
      Membership: 'Unlimited',
      'Member Type': 'New',
      Status: 'Waiting',
      'Joined At': daysAgo(10),
      ...fields,
    },
  };
}

export function capacity(fields = {}) {
  return {
    id: 'recCAP0000000001',
    fields: {
      Location: 'Williamsburg',
      Membership: 'Unlimited',
      'Minimum Members': 10,
      'Active Members': 10,
      Enabled: true,
      'Signup URL': 'https://app.glofox.test/signup/williamsburg-unlimited',
      ...fields,
    },
  };
}

export const records = (list) => [{ json: { records: list } }];
