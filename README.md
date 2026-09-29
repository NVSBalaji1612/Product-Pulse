# ProductPulse AI

**The Feedback That Doesn't Get Forgotten.** Remember. Connect. Act. Learn.

ProductPulse receives customer feedback, understands it, remembers it over time with **Hindsight**, groups different wording into recurring issues, tracks business actions, and compares new feedback with that history to produce an outcome insight. The demo business is **AzureNest Hotel**.

## Run it (no Docker, no npm install, no API keys)

Requires **Node.js 18+**.

```bash
npm start
```

Open http://localhost:3000 (dashboard) and http://localhost:3000/azurenest/ (the separate AzureNest hotel site).
Use `npm run dev` for auto-restart while editing. Set `PORT` in `.env` to change the port.

The backend is plain Node (built-in `http`, zero dependencies), so there is nothing to install. The frontend uses Tailwind via CDN plus a small `style.css`; the layout still works offline.

## Architecture

```
AzureNest site -> POST /api/feedback -> ProductPulse API
   -> AI analysis (LLM or rule-based fallback) -> Hindsight retain
   -> Recurring issue update -> Business action (POST /api/actions -> Hindsight retain)
   -> New feedback -> Hindsight recall -> compare history -> Outcome insight
```

```
backend/server.js   API, analysis, memory layer, seed data, static file server
frontend/           index.html, css/style.css, js/app.js (single-page UI, hash routes)
azurenest/          tiny hotel site with a feedback form
data/               feedback.json, issues.json, actions.json, memory.json (created on first run)
```

## Environment variables (`.env`, see `.env.example`)

| Variable | Purpose |
|---|---|
| `HINDSIGHT_BASE_URL` | Your Hindsight API URL, e.g. `http://localhost:8888` (self-hosted) |
| `HINDSIGHT_API_KEY` | Bearer token, if your Hindsight deployment needs one |
| `LLM_API_KEY` | Optional. Anthropic API key for feedback analysis and Ask answers |
| `LLM_MODEL` | Optional. Defaults to `claude-haiku-4-5-20251001` |
| `AZURENEST_BASE_URL` | Reserved for pointing at a separately hosted AzureNest site |

Keys are read only on the server and never sent to the browser.

## Hindsight integration

Memory events (`feedback_received`, `issue_detected`, `pattern_updated`, `business_action`, `outcome_observed`) all go into **one bank**, `azurenest-hotel`.

- **Retain:** `POST {HINDSIGHT_BASE_URL}/v1/default/banks/azurenest-hotel/memories` with `{"items":[{"content","context","timestamp"}]}`
- **Recall:** `POST .../memories/recall` with `{"query"}`
- The five seed history events are retained into Hindsight on first start when it is configured.

If Hindsight is not configured or is unreachable, ProductPulse keeps working with a built-in local memory (`data/memory.json`) using the same retain/recall flow. The UI always says which source answered ("Hindsight" or "local memory fallback"), so it is never faked. The endpoint paths above match Hindsight's REST API as documented at the time of writing; if your version differs, adjust the two paths in `hs()` calls in `backend/server.js`.

Insights use hedged wording ("suggests", "indicates") and never claim causality.

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | `{"status":"ok","service":"ProductPulse"}` |
| POST | `/api/feedback` | `{businessId, businessName, customerName, message, rating, category, source, createdAt}` -> `{success, feedbackId, message}` |
| GET | `/api/feedback`, `/api/feedback/:id` | list (optional `?issueId=`) / single |
| GET | `/api/issues`, `/api/issues/:id` | recurring issues and small signals |
| POST / GET | `/api/actions` | `{businessId, issueId, action, status}`; stored and retained as `business_action` |
| GET | `/api/memory/:businessId` | timeline events, inspector, reflection (`azurenest`) |
| POST | `/api/analyze` | `{message, rating}` -> category, sentiment, issue, summary |
| POST | `/api/simulate-feedback` | runs the full demo flow |
| POST | `/api/ask` | `{question}` |
| GET | `/api/azure-nest/feedback` | feedback received from AzureNest |
| GET | `/api/dashboard`, `/api/businesses` | UI data |
| POST | `/api/reset` | restore demo data (handy between demo runs) |

Errors return friendly JSON `{success:false, message}`; stack traces are never sent to the client.

## AzureNest integration

`azurenest/index.html` posts its form to `/api/feedback`. To run it against another ProductPulse server open `/azurenest/?api=http://host:port`. CORS is enabled. `GET /api/azure-nest/feedback` returns everything received from AzureNest.

## 60-second demo

1. Dashboard shows **Room-Service Delay, 23 mentions, Monitoring**.
2. **View Memory**: January problem, March action, April outcome signal.
3. **Simulate New Feedback**: watch analyze, recall, find issue, compare steps.
4. See **Hindsight Recall** (previous issue, mentions, action) and the **Insight**: "Recent feedback suggests the previously reported room-service delay is improving."
5. **Ask ProductPulse**: "What action did AzureNest take?" -> "AzureNest recorded "Changed kitchen workflow" in March 2026."

Run `POST /api/reset` (or `curl -X POST localhost:3000/api/reset`) to repeat the demo from the start.
