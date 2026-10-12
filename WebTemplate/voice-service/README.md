# spico-voice-service

A separate, persistent Node.js service for voice — Telnyx Call Control + an
OpenAI Realtime bridge. It is **not** part of the Next.js app in `../app`, has
its own `package.json`/`node_modules`/`tsconfig.json`, and is excluded from the
main app's `tsc`/`eslint`/`next build`.

## Why a separate service

A real inbound call needs a long-lived connection: Telnyx streams call audio in
over a WebSocket for the call's duration, and the bridge relays that to an
OpenAI Realtime session and streams synthesized audio back. Vercel's serverless
functions (what the Next.js app runs on) cannot hold a connection open like
that — hence a persistent process, deployed and scaled independently.

## Status (M15): real code, credential-gated

The provider integrations are **implemented for real** and switch on
automatically based on which credentials are present — no mode flag:

| Capability | Real when… | Stub when… |
|---|---|---|
| Telnyx call control (answer/hangup/transfer/streaming/speak) | `TELNYX_API_KEY` + `TELNYX_PUBLIC_KEY` set | otherwise |
| Telnyx webhook signature verification (Ed25519) | `TELNYX_PUBLIC_KEY` set | if unset, webhooks are acked but **not processed** |
| OpenAI Realtime audio bridge | `OPENAI_API_KEY` set | otherwise (media WS closes, call fallback-routes) |
| Fully-live inbound call | also needs `PUBLIC_BASE_URL` | — |

So with **no** credentials the service still boots and the simulate/stub path
still works exactly as in M8; with real credentials the exact same code paths
make real provider calls.

### What is verified locally vs. what needs live activation

**Verified locally (see `npm run selftest` and the boot smoke test):**
- Telnyx Ed25519 webhook signature verification — valid accepted; tampered
  body, wrong signature, stale timestamp, missing header all rejected.
- Verified-webhook event routing (`call.initiated`/`answered`/`hangup`) through
  to a real Supabase DB lookup and stub call-control + fallback dispatch.
- Unsigned/tampered webhooks rejected with 401; `/health` reports live/stub mode.
- Handoff decision heuristic, capability→tool gating, fallback routing, and the
  `calls`/`call_events` writes.
- `npm run typecheck` and `npm run build` clean.

**NOT verifiable here — needs your credentials + a public deployment:**
- Real Telnyx REST call-control calls (no Telnyx account/number in this env).
- The real OpenAI Realtime audio bridge (`src/realtimeBridge.ts`) — real WS
  session, μ-law audio relay, live tool calls, live transfer/hangup.
- An actual inbound PSTN call answered and handled by the AI end-to-end.

These are written to be correct and typecheck cleanly, but only a live call
proves them. Follow the runbook below to activate and test.

## Running locally (stub / simulate)

```bash
cd voice-service
npm install
cp .env.example .env.local   # fill SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
                              # VOICE_SERVICE_SHARED_SECRET
npm run dev                   # tsx watch — http://localhost:4001
npm run selftest              # offline checks (no credentials needed)
```

## Testing a simulated inbound call (no credentials needed)

Prerequisite: in the dashboard, under a hotel's **Calls → Voice Settings**,
enable voice and pick an `active` AI agent.

```bash
curl -X POST http://localhost:4001/calls/simulate \
  -H "Authorization: Bearer <VOICE_SERVICE_SHARED_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"hotelSlug":"grand-demo","fromNumber":"+15550101","sampleMessage":"I would like to speak to a real person","testLanguage":"en"}'
```

The response includes `callId`, computed `disposition`, `providerMode`
(telnyx/openai live vs stub), and per-step notes. Open the call in the dashboard
(**Calls**) to see the record + event timeline.

## Routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/health` | GET | none | Liveness + live/stub mode (`getVoiceMode()`) |
| `/webhooks/telnyx` | POST | Ed25519 signature (when `TELNYX_PUBLIC_KEY` set) | Verifies + routes real Telnyx call-control events |
| `/calls/simulate` | POST | `Bearer VOICE_SERVICE_SHARED_SECRET` | Credential-free test harness |
| `/realtime` | WS | correlated by `call_control_id` | Telnyx media stream ⇄ OpenAI Realtime bridge |

## Call flow (live)

1. Telnyx `call.initiated` (inbound) → verify signature → map dialed number to a
   hotel (`hotel_voice_settings.phone_number`) → resolve the default agent +
   prompt + capabilities → create a `calls` row → **answer**.
2. Telnyx `call.answered` → **streaming_start** to
   `${PUBLIC_BASE_URL→wss}/realtime?call_control_id=…` (bidirectional PCMU).
3. Telnyx connects that media WS → `startRealtimeBridge` opens an OpenAI Realtime
   session (agent instructions incl. platform-protected rules, `g711_ulaw` in/out,
   server-VAD, tools) and relays audio both ways.
4. Model tool calls execute against the DB (`check_availability`,
   `lookup_reservation`) or trigger control actions (`transfer_to_human`,
   `end_call`) → real Telnyx transfer/hangup.
5. Telnyx `call.hangup` → finalize the `calls` row.
6. **Any failure** at any step → `runFallback`: transfer to `VOICE_FALLBACK_NUMBER`
   if set, else speak an apology and hang up. The caller is never left on dead air.

## Activating live Telnyx + OpenAI Realtime — runbook

1. **OpenAI:** create an API key with Realtime access → `OPENAI_API_KEY`. Keep
   `OPENAI_REALTIME_MODEL` (default `gpt-realtime`) and `OPENAI_REALTIME_VOICE`.
2. **Telnyx:** create a Call Control Application and buy a number assigned to it.
   - API key → `TELNYX_API_KEY`; portal Public Key → `TELNYX_PUBLIC_KEY`.
   - Set the number's dialed value as a hotel's phone number in **Calls → Voice
     Settings** (this is how a call maps to a hotel), and enable voice + an
     `active` agent.
3. **Public URL:** expose this service publicly (e.g. `ngrok http 4001`) and set
   `PUBLIC_BASE_URL` to that https URL. Point the Telnyx application's webhook URL
   to `${PUBLIC_BASE_URL}/webhooks/telnyx`.
4. **Fallback:** set `VOICE_FALLBACK_NUMBER` to a real staffed number.
5. `npm run build && npm start` (or `npm run dev`). `GET /health` should show
   `telnyx=live openai=live` and `fullyLive:true`.
6. **Test call:** dial the Telnyx number. Watch the service logs and the
   dashboard **Calls** screen for the live event timeline. Ask for "a real
   person" to exercise transfer.
7. **Deploy** (beyond a test): host somewhere that holds long-lived connections
   (small VM, Fly.io, Railway — not Vercel).

### Hardening notes (not blockers for a first live test)
- Active-call correlation is in-memory (`src/callRegistry.ts`), so a process
  restart mid-call loses the mapping. Adding a `provider_call_id` column to
  `calls` would make it durable and allow horizontal scaling.
- `duration_seconds` for live calls is left at 0 (finalized on hangup without a
  computed duration); compute from `answered_at`/`ended_at` when hardening.
- No recording is written yet (the `call_recordings` table exists from M8).
