// Thin Airtable REST client used by run-simulation.mjs. Paces requests the same way the
// production workflow does (AIRTABLE_PACE in build/build-workflow.mjs) so a live run never
// risks the 5 req/s rate limit, and mirrors n8n's own pagination/batching behaviour exactly.
const PACE_MS = 350;
let lastCall = 0;

async function paced() {
  const wait = PACE_MS - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

export function createAirtableClient({ token, baseId, apiRoot = 'https://api.airtable.com/v0', log = () => {} }) {
  async function call(method, path, body) {
    await paced();
    const res = await fetch(`${apiRoot}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      log(`  ✗ ${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
      throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
    }
    return json;
  }

  async function list(table, formula) {
    const records = [];
    let offset;
    do {
      const qs = new URLSearchParams({ pageSize: '100', ...(formula ? { filterByFormula: formula } : {}), ...(offset ? { offset } : {}) });
      const page = await call('GET', `${baseId}/${encodeURIComponent(table)}?${qs}`);
      records.push(...page.records);
      offset = page.offset;
    } while (offset);
    return records;
  }

  // Mirrors Create Waitlist Entries / Log: Joined (10-record batches, typecast on).
  async function createBatched(table, records) {
    const created = [];
    for (let i = 0; i < records.length; i += 10) {
      const page = await call('POST', `${baseId}/${encodeURIComponent(table)}`, { typecast: true, records: records.slice(i, i + 10) });
      created.push(...page.records);
    }
    return created;
  }

  // Mirrors Update Waitlist Rows / Write Activity Log (10-record batches, typecast on).
  async function updateBatched(table, records) {
    const updated = [];
    for (let i = 0; i < records.length; i += 10) {
      const page = await call('PATCH', `${baseId}/${encodeURIComponent(table)}`, { typecast: true, records: records.slice(i, i + 10) });
      updated.push(...page.records);
    }
    return updated;
  }

  async function get(table, id) {
    return call('GET', `${baseId}/${encodeURIComponent(table)}/${id}`);
  }

  return { list, createBatched, updateBatched, get };
}
