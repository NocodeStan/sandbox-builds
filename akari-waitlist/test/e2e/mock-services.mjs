// In-memory stand-ins for the Airtable REST API and SendGrid mail/send, strict enough to catch
// wiring mistakes: auth headers, 10-record batch limit, filterByFormula, pagination, 5 req/s rate limit.
import { createServer } from 'node:http';

export const AIRTABLE_TOKEN = 'patTEST.akari';
export const SENDGRID_KEY = 'SG.test-key';

export function createMockServices({ pageSize = 100 } = {}) {
  const state = { tables: {}, emails: [], requests: [], rateViolations: 0, violations: [], errors: [] };
  const hits = [];
  const table = (name) => (state.tables[name] ||= []);
  const rid = () => `rec${Array.from({ length: 14 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]).join('')}`;

  function compileFormula(src) {
    let js = '';
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (c === '{') {
        const j = src.indexOf('}', i);
        js += `F(${JSON.stringify(src.slice(i + 1, j))})`;
        i = j;
      } else if (c === '"' || c === "'") {
        let j = i + 1;
        while (src[j] !== c) j++;
        js += JSON.stringify(src.slice(i + 1, j));
        i = j;
      } else if (c === '=') js += ['!', '<', '>'].includes(src[i - 1]) ? '=' : '==';
      else if (c === '&') js += '+';
      else js += c;
    }
    const fn = new Function('F', 'AND', 'OR', 'NOT', 'LOWER', 'NOW', 'DATEADD', 'IS_AFTER', 'TRUE', 'FALSE', `return (${js});`);
    const UNIT = { days: 86400000, hours: 3600000, minutes: 60000 };
    return (rec) => fn(
      (name) => rec.fields[name] ?? '',
      (...a) => a.every(Boolean), (...a) => a.some(Boolean), (x) => !x,
      (s) => String(s ?? '').toLowerCase(), () => new Date(),
      (d, n, u) => new Date(new Date(d).getTime() + n * UNIT[u]),
      (a, b) => (a ? new Date(a) > new Date(b) : false), () => true, () => false,
    );
  }

  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const clean = (fields) => Object.fromEntries(Object.entries(fields || {}).filter(([, v]) => v !== null && v !== undefined));

  async function airtable(req, res, url, body) {
    if (req.headers.authorization !== `Bearer ${AIRTABLE_TOKEN}`) return send(res, 401, { error: { type: 'AUTHENTICATION_REQUIRED' } });
    const now = Date.now();
    hits.push({ at: now, what: `${req.method} ${decodeURIComponent(url.pathname.split('/')[3] || '')}` });
    while (hits.length && now - hits[0].at > 1000) hits.shift();
    if (hits.length > 5) {
      state.rateViolations++;
      state.violations.push(hits.map((h) => `+${h.at - hits[0].at}ms ${h.what}`));
      return send(res, 429, { errors: [{ error: 'RATE_LIMIT_REACHED' }] });
    }
    const [, , , tableName, recordId] = url.pathname.split('/').map(decodeURIComponent);
    const rows = table(tableName);

    if (req.method === 'GET' && recordId) {
      const r = rows.find((x) => x.id === recordId);
      return r ? send(res, 200, r) : send(res, 404, { error: { type: 'MODEL_ID_NOT_FOUND', message: 'Could not find record' } });
    }
    if (req.method === 'GET') {
      const formula = url.searchParams.get('filterByFormula');
      let list = rows;
      if (formula) {
        try {
          const test = compileFormula(formula);
          list = rows.filter(test);
        } catch (e) {
          state.errors.push(`Bad formula: ${formula} (${e.message})`);
          return send(res, 422, { error: { type: 'INVALID_FILTER_BY_FORMULA', message: e.message } });
        }
      }
      const size = Math.min(Number(url.searchParams.get('pageSize') || 100), pageSize);
      const start = Number(url.searchParams.get('offset') || 0);
      const page = list.slice(start, start + size);
      return send(res, 200, start + size < list.length ? { records: page, offset: String(start + size) } : { records: page });
    }
    if (req.method === 'POST') {
      if (!Array.isArray(body.records) || body.records.length > 10) {
        state.errors.push(`POST ${tableName} with ${body.records?.length} records`);
        return send(res, 422, { error: { type: 'INVALID_RECORDS', message: 'max 10 records' } });
      }
      const created = body.records.map((r) => ({ id: rid(), createdTime: new Date().toISOString(), fields: clean(r.fields) }));
      rows.push(...created);
      return send(res, 200, { records: created });
    }
    if (req.method === 'PATCH') {
      const updates = recordId ? [{ id: recordId, fields: body.fields }] : body.records;
      if (!Array.isArray(updates) || updates.length > 10) {
        state.errors.push(`PATCH ${tableName} with ${updates?.length} records`);
        return send(res, 422, { error: { type: 'INVALID_RECORDS', message: 'max 10 records' } });
      }
      const missing = updates.find((u) => !rows.some((x) => x.id === u.id));
      if (missing) return send(res, 404, { error: { type: 'MODEL_ID_NOT_FOUND', message: missing.id } });
      const out = updates.map((u) => {
        const r = rows.find((x) => x.id === u.id);
        for (const [k, v] of Object.entries(u.fields || {})) {
          if (v === null) delete r.fields[k];
          else r.fields[k] = v;
        }
        return r;
      });
      return send(res, 200, recordId ? out[0] : { records: out });
    }
    return send(res, 405, {});
  }

  function sendgrid(req, res, body) {
    if (req.headers.authorization !== `Bearer ${SENDGRID_KEY}`) return send(res, 401, { errors: [{ message: 'bad key' }] });
    const ok = body?.personalizations?.[0]?.to?.[0]?.email && body.from?.email && body.subject && body.content?.length;
    if (!ok) {
      state.errors.push(`Bad SendGrid payload: ${JSON.stringify(body).slice(0, 200)}`);
      return send(res, 400, { errors: [{ message: 'invalid payload' }] });
    }
    state.emails.push(body);
    return send(res, 202);
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    state.requests.push({ at: Date.now(), method: req.method, path: url.pathname });
    try {
      if (url.pathname.startsWith('/v0/')) return await airtable(req, res, url, body);
      if (url.pathname === '/v3/mail/send') return sendgrid(req, res, body);
      return send(res, 404, {});
    } catch (e) {
      state.errors.push(String(e.stack || e));
      return send(res, 500, { error: String(e) });
    }
  });

  return {
    state,
    table,
    seed: (name, fieldsList) => fieldsList.map((fields) => {
      const r = { id: rid(), createdTime: new Date().toISOString(), fields: clean(fields) };
      table(name).push(r);
      return r;
    }),
    find: (name, pred) => table(name).filter(pred),
    listen: (port) => new Promise((r) => server.listen(port, '127.0.0.1', r)),
    close: () => new Promise((r) => server.close(r)),
  };
}
