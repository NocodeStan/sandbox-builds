// Questions come from rubric.json (inlined at build time as RUBRIC). Same fill rules as jev/rubric.mjs.
const fillRubric = (v, vars) =>
  typeof v === 'string' ? v.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
    : Array.isArray(v) ? v.map((x) => fillRubric(x, vars))
      : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillRubric(x, vars)])) : v;
const rubricQuestions = (group, vars, names) =>
  Object.fromEntries(Object.entries(RUBRIC.groups[group].questions)
    .filter(([n]) => !names || names.includes(n))
    .map(([n, q]) => {
      const { optional, ...api } = q;
      return [n, fillRubric(api, vars)];
    }));
