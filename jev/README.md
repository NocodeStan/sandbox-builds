# Jev use-case kit

A shared pattern for every use case that runs on TypeSafe's Jev. Jev answers narrow **judgments** as typed
probabilities; your code does everything else.

## The split (every use case, no exceptions)

| Layer | Owns | Lives in |
|---|---|---|
| **State** | Facts gathered by code: who said what, known relationships, candidate values, dates | the use case's code |
| **Rubric** | The questions Jev answers: type (`choice` / `noul` / `score`), instructions, criteria | `<use-case>/rubric.json` |
| **Policy** | Thresholds, weights, labels, what to do with an answer | the use case's config |
| **Output** | Selection, ranking and rendering of real items. No generated prose | the use case's code |

Changing a threshold or weight never needs a new Jev call. Changing what a question *means* is a rubric change.

## Add a use case

1. `mkdir <use-case>` and write `rubric.json` (copy `inbox-intelligence/rubric.json` for the shape):
   - `groups.<name>.state` documents the state shape the questions reference (with backticks, e.g. `` `thread` ``).
   - `groups.<name>.questions` holds the questions. Placeholders like `{{owner}}` are filled at call time.
   - Mark questions that code completes at runtime (e.g. options found in the text) with `"optional": "why"`.
2. Build state in code and call Jev:
   ```js
   import { loadRubric, request } from '../jev/rubric.mjs';
   import { systemOne } from '../jev/client.mjs'; // or the official @typesafe-ai/sdk
   const rubric = loadRubric(new URL('./rubric.json', import.meta.url));
   const { answers } = await systemOne(request(rubric, 'thread', state, { owner: 'Stan' }));
   ```
3. Apply policy in code: `answers.x.noul >= threshold`, `answers.y.choice`, `answers.z.score`.
4. Test offline with `jev/contract.mjs`: `assertValidRequest(req)` checks every request against the API
   contract, and `answerRequest(req, steer)` is a deterministic stand-in for Jev.

## Rules of thumb (from the TypeSafe skill)

- One narrow judgment per question, and all independent questions in **one** request.
- *Select, don't generate:* let code find the candidates (dates, amounts, names) and let Jev pick one, with a `none` option.
- A `noul` near 0.5 means "unsure", not "medium". Use `score` for degrees.
- A failed or low-confidence answer goes to a human (a Review bucket), never a guess.
- Keep `TYPESAFE_API_KEY` server-side.

## Files

| File | What |
|---|---|
| `rubric.mjs` | `loadRubric`, `fill`, `questions`, `request` |
| `client.mjs` | Dependency-free `systemOne()` for `POST /v1/systemone` |
| `contract.mjs` | Request validator and deterministic Jev stand-in for tests, mirrored from `@typesafe-ai/sdk` 0.6.0 |
