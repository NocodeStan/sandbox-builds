// Loads a use case's rubric.json and turns it into TypeSafe questions / requests.
// A rubric holds the judgments only (what to ask Jev). State comes from code; policy lives in config.
import { readFileSync } from 'node:fs';

export const loadRubric = (path) => JSON.parse(readFileSync(path, 'utf8'));

// Replaces {{name}} placeholders in every string of a JSON value. Unknown placeholders are left as is.
export function fill(value, vars = {}) {
  if (typeof value === 'string') return value.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  if (Array.isArray(value)) return value.map((v) => fill(v, vars));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, vars)]));
  return value;
}

// Questions of one group, ready for the API. `names` picks a subset; documentation keys (optional) are dropped.
export function questions(rubric, group, vars = {}, names) {
  const g = rubric.groups[group];
  if (!g) throw new Error(`rubric ${rubric.useCase}: no group "${group}"`);
  return Object.fromEntries(Object.entries(g.questions)
    .filter(([n]) => !names || names.includes(n))
    .map(([n, q]) => {
      const { optional, ...api } = q;
      return [n, fill(api, vars)];
    }));
}

export const request = (rubric, group, state, vars, names) => ({ model: rubric.model, state, questions: questions(rubric, group, vars, names) });
