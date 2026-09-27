// Runs a Code node's source outside n8n with mocked $, $input, $getWorkflowStaticData.
import { createRequire } from 'node:module';
import { expandIncludes, loadCode } from '../build/build-workflow.mjs';

const require = createRequire(import.meta.url);

// nodes: { 'Node Name': items }  — a node mapped to null counts as "not executed" in this run.
export function runCode(code, { nodes = {}, input = [], staticData = {} } = {}) {
  const $ = (n) => {
    if (!(n in nodes)) throw new Error(`test: node "${n}" is not mocked`);
    const items = nodes[n];
    if (items === null) return { isExecuted: false, all: () => { throw new Error(`"${n}" did not run`); } };
    return { all: () => items, first: () => items[0], isExecuted: true };
  };
  const $input = { all: () => input, first: () => input[0] };
  const $getWorkflowStaticData = () => staticData;
  return new Function('$', '$input', '$getWorkflowStaticData', 'require', code)($, $input, $getWorkflowStaticData, require);
}
export const runNode = (name, ctx) => runCode(loadCode(name), ctx);
export const runHelpers = (body, ctx) => runCode(expandIncludes(`// @include core\n// @include mail\n${body}`), ctx);

export function baseConfig(overrides = {}) {
  const [{ json }] = runNode('config', { input: [{ json: {} }] });
  return {
    ...json.cfg,
    ownerEmails: ['stan@owner.test', 'stan.alias@owner.test'],
    reportTo: ['stan@owner.test'],
    relationships: { client: ['acme.test'], prospect: ['globex.test'], partner: [], team: ['associate@owner.test'] },
    ...overrides,
  };
}
export const configItem = (route = 'report', overrides = {}) => [{ json: { route, cfg: baseConfig(overrides) } }];

export const hoursAgo = (h) => new Date(Date.now() - h * 3600000);
export const daysAgo = (d) => hoursAgo(d * 24);
export const daysFromNow = (d) => daysAgo(-d);
