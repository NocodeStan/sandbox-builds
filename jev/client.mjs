// Minimal TypeSafe System One client (POST /v1/systemone), dependency-free.
// For production code prefer the official SDK (`npm i @typesafe-ai/sdk`: retries, typed answers);
// this mirrors its wire format for scripts, tests and runtimes where you can't add packages.
export async function systemOne(req, { apiKey = process.env.TYPESAFE_API_KEY, baseURL = process.env.TYPESAFE_BASE_URL || 'https://api.typesafe.ai', timeoutMs = 30000 } = {}) {
  if (!apiKey) throw new Error('TYPESAFE_API_KEY is not set');
  const res = await fetch(`${baseURL.replace(/\/+$/, '')}/v1/systemone`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'jev-latest', ...req }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(`TypeSafe ${res.status}: ${JSON.stringify(body)}`), { status: res.status, body });
  return body; // { model, answers: { [name]: { type, noul | choice+confidence+probabilities | score+confidence+legend+probabilities } }, usage }
}
