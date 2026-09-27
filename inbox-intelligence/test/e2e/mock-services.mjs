// Strict local stand-ins for Gmail, Google Calendar and TypeSafe, shaped like the real APIs.
// Auth is enforced; every TypeSafe request is validated against the SDK contract before it is answered.
import { createServer } from 'node:http';
import { answerRequest } from '../../../jev/contract.mjs';

export const GOOGLE_TOKEN = 'ya29.e2e-google-token';
export const TYPESAFE_KEY = 'ts-e2e-key';

export function createMockServices({ threads, calendar, steer, failSubjects = [] }) {
  const state = {
    threads: new Map(threads.map((t) => [t.id, t])),
    labels: [{ id: 'INBOX', name: 'INBOX', type: 'system' }, { id: 'SENT', name: 'SENT', type: 'system' }],
    modifications: [],
    sent: [],
    typesafe: [],
    typesafeRejected: [],
    listPages: 0,
    failGmailList: false,
    unauthorized: 0,
  };
  let labelSeq = 0;

  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) => new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => resolve(b ? JSON.parse(b) : {}));
  });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    const auth = req.headers.authorization || '';
    try {
      // ── TypeSafe ──
      if (p === '/v1/systemone' && req.method === 'POST') {
        if (auth !== `Bearer ${TYPESAFE_KEY}`) return state.unauthorized++, json(res, 401, { error: 'unauthorized' });
        const body = await readBody(req);
        state.typesafe.push(body);
        const subject = body.state?.thread?.subject || body.state?.email?.subject || '';
        if (failSubjects.some((s) => subject.includes(s))) return json(res, 503, { error: 'overloaded' });
        let out;
        try {
          out = answerRequest(body, (name) => {
            const ev = name.match(/^e(\d+)_(type|prep)$/);
            if (ev) return ((steer.events || {})[body.state.events[Number(ev[1])].title] || {})[ev[2]];
            const id = [...state.threads.values()].find((t) => t.messages[0].payload.headers.find((h) => h.name === 'Subject').value === subject)?.id;
            return (steer[id] || {})[name];
          });
        } catch (e) {
          state.typesafeRejected.push(e.message);
          return json(res, 422, { error: e.message });
        }
        return json(res, 200, out);
      }

      // ── Google ──
      if (auth !== `Bearer ${GOOGLE_TOKEN}`) return state.unauthorized++, json(res, 401, { error: { code: 401, message: 'Invalid Credentials' } });

      if (p === '/gmail/v1/users/me/threads' && req.method === 'GET') {
        if (state.failGmailList) return json(res, 500, { error: { code: 500, message: 'Backend Error' } });
        state.listPages += 1;
        const all = [...state.threads.values()].map((t) => ({ id: t.id, snippet: t.messages.at(-1).snippet, historyId: '1' }));
        const size = 3; // small pages so pagination is exercised
        const start = Number(url.searchParams.get('pageToken') || 0);
        const page = all.slice(start, start + size);
        return json(res, 200, { threads: page, resultSizeEstimate: all.length, ...(start + size < all.length ? { nextPageToken: String(start + size) } : {}) });
      }
      let m = p.match(/^\/gmail\/v1\/users\/me\/threads\/([^/]+)$/);
      if (m && req.method === 'GET') {
        const t = state.threads.get(m[1]);
        if (!t) return json(res, 404, { error: { code: 404, message: 'Not Found' } });
        if (url.searchParams.get('format') !== 'full') return json(res, 400, { error: { message: 'expected format=full' } });
        return json(res, 200, t);
      }
      m = p.match(/^\/gmail\/v1\/users\/me\/threads\/([^/]+)\/modify$/);
      if (m && req.method === 'POST') {
        const body = await readBody(req);
        const ids = new Set(state.labels.map((l) => l.id));
        const bad = [...(body.addLabelIds || []), ...(body.removeLabelIds || [])].filter((id) => !ids.has(id));
        if (bad.length) return json(res, 400, { error: { message: `Invalid label: ${bad.join(',')}` } });
        state.modifications.push({ threadId: m[1], ...body });
        return json(res, 200, { id: m[1] });
      }
      if (p === '/gmail/v1/users/me/labels' && req.method === 'GET') return json(res, 200, { labels: state.labels });
      if (p === '/gmail/v1/users/me/labels' && req.method === 'POST') {
        const body = await readBody(req);
        if (state.labels.some((l) => l.name.toLowerCase() === String(body.name).toLowerCase())) {
          return json(res, 409, { error: { code: 409, message: 'Label name exists or conflicts' } });
        }
        labelSeq += 1;
        const label = { id: `Label_${labelSeq}`, name: body.name, type: 'user' };
        state.labels.push(label);
        return json(res, 200, label);
      }
      if (p === '/gmail/v1/users/me/messages/send' && req.method === 'POST') {
        const body = await readBody(req);
        if (!/^[A-Za-z0-9_-]+$/.test(body.raw || '')) return json(res, 400, { error: { message: 'raw must be base64url' } });
        state.sent.push(Buffer.from(body.raw, 'base64url').toString('utf8'));
        return json(res, 200, { id: `sent${state.sent.length}`, labelIds: ['SENT'] });
      }
      if (p === '/calendar/v3/calendars/primary/events' && req.method === 'GET') {
        for (const q of ['timeMin', 'timeMax']) if (Number.isNaN(Date.parse(url.searchParams.get(q)))) return json(res, 400, { error: { message: `bad ${q}` } });
        if (url.searchParams.get('singleEvents') !== 'true') return json(res, 400, { error: { message: 'singleEvents required for orderBy' } });
        return json(res, 200, { kind: 'calendar#events', items: calendar.items });
      }
      return json(res, 404, { error: `no route ${req.method} ${p}` });
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  });

  return { state, listen: (port) => new Promise((r) => server.listen(port, '127.0.0.1', r)), close: () => server.close() };
}
