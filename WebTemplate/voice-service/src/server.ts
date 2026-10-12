import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer } from "ws";
import { env, telnyxLive, openaiLive, getVoiceMode } from "./env.js";
import { verifyTelnyxWebhook } from "./telnyxSignature.js";
import { simulateInboundCall, handleTelnyxEvent } from "./callHandler.js";
import { getCall } from "./callRegistry.js";
import { getTelnyxAdapter } from "./telnyxAdapter.js";
import { startRealtimeBridge } from "./realtimeBridge.js";

// Separate persistent Node.js service for voice (M8 foundation, M15 live path).
// Does not run inside Next.js — Vercel's serverless functions cannot hold a
// long-lived WebSocket for a call's duration, which is exactly what the Telnyx
// media stream <-> OpenAI Realtime bridge needs. See README.md.
//
// Provider calls go real ONLY when the matching credentials are present
// (telnyxLive / openaiLive); otherwise the same code paths use stub adapters.

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
  res.end(payload);
}

async function readRawBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function requireSharedSecret(req: IncomingMessage): void {
  const auth = req.headers.authorization ?? "";
  if (auth !== `Bearer ${env.VOICE_SERVICE_SHARED_SECRET}`) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
}

const server = createServer((req, res) => {
  void handleRequest(req, res).catch((err: unknown) => {
    const statusCode = (err as { statusCode?: number })?.statusCode ?? 500;
    const message = err instanceof Error ? err.message : "Internal error";
    json(res, statusCode, { error: message });
  });
});

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, { status: "ok", service: "spico-voice-service", mode: getVoiceMode() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/webhooks/telnyx") {
    await handleTelnyxWebhook(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/calls/simulate") {
    requireSharedSecret(req);
    const raw = await readRawBody(req);
    const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const hotelSlug = String(body.hotelSlug ?? "");
    if (!hotelSlug) {
      json(res, 400, { error: "hotelSlug is required" });
      return;
    }
    const result = await simulateInboundCall({
      hotelSlug,
      fromNumber: String(body.fromNumber ?? "+10000000000"),
      sampleMessage: String(body.sampleMessage ?? "Hello, I have a question."),
      testLanguage: String(body.testLanguage ?? "en"),
    });
    json(res, 200, result);
    return;
  }

  json(res, 404, { error: "Not found" });
}

async function handleTelnyxWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readRawBody(req);

  // Verify the Ed25519 signature when a public key is configured. Without it we
  // CANNOT trust the payload, so we acknowledge but refuse to process — never
  // drive call control from an unverified request.
  if (env.TELNYX_PUBLIC_KEY) {
    const result = verifyTelnyxWebhook({
      rawBody: raw,
      signatureBase64: req.headers["telnyx-signature-ed25519"] as string | undefined,
      timestamp: req.headers["telnyx-timestamp"] as string | undefined,
      publicKeyBase64: env.TELNYX_PUBLIC_KEY,
      toleranceSeconds: env.TELNYX_WEBHOOK_TOLERANCE_SECONDS,
    });
    if (!result.valid) {
      json(res, 401, { error: `Invalid Telnyx signature: ${result.reason}` });
      return;
    }
  } else {
    json(res, 200, {
      received: true,
      note: "TELNYX_PUBLIC_KEY not set — signature cannot be verified, event NOT processed",
    });
    return;
  }

  let parsed: { data?: { event_type?: string; payload?: Record<string, unknown> } };
  try {
    parsed = JSON.parse(raw);
  } catch {
    json(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const eventType = parsed.data?.event_type ?? "";
  const payload = (parsed.data?.payload ?? {}) as Record<string, unknown>;

  // Always ack 200 quickly; process async errors are logged, not surfaced as
  // non-2xx (which would make Telnyx retry-storm the endpoint).
  let note = "ack";
  try {
    note = await handleTelnyxEvent(eventType, {
      call_control_id: payload.call_control_id as string | undefined,
      from: payload.from as string | undefined,
      to: payload.to as string | undefined,
      direction: payload.direction as string | undefined,
      state: payload.state as string | undefined,
    });
  } catch (err) {
    note = `error handling ${eventType}: ${(err as Error).message}`;
    console.error(note);
  }
  json(res, 200, { received: true, event: eventType, note });
}

// ---- Live media bridge endpoint ----
// Telnyx connects here (streaming_start stream_url) once a call is answered. We
// correlate via the call_control_id query param the webhook path put on the URL,
// then bridge the media stream to an OpenAI Realtime session.
const wss = new WebSocketServer({ server, path: "/realtime" });
wss.on("connection", (socket, request) => {
  const url = new URL(request.url ?? "/realtime", `http://${request.headers.host ?? "localhost"}`);
  const callControlId = url.searchParams.get("call_control_id");

  if (!callControlId) {
    socket.send(JSON.stringify({ error: "missing call_control_id" }));
    socket.close(1008, "missing call_control_id");
    return;
  }
  const active = getCall(callControlId);
  if (!active) {
    socket.send(JSON.stringify({ error: "no active call for call_control_id" }));
    socket.close(1008, "unknown call");
    return;
  }
  if (!openaiLive) {
    socket.send(JSON.stringify({ note: "OpenAI Realtime not configured — closing" }));
    socket.close(1011, "openai not configured");
    return;
  }

  void startRealtimeBridge({
    telnyxSocket: socket,
    ctx: active.ctx,
    telnyx: getTelnyxAdapter(),
    callId: active.callId,
    callControlId,
    fromNumber: active.fromNumber,
    toNumber: active.toNumber,
  }).catch((err) => {
    console.error(`bridge error: ${(err as Error).message}`);
    try {
      socket.close();
    } catch {
      /* noop */
    }
  });
});

const port = Number(env.PORT);
server.listen(port, () => {
  const mode = getVoiceMode();
  console.log(
    `spico-voice-service on :${port} — telnyx=${mode.telnyx} openai=${mode.openai} ` +
      `${mode.fullyLive ? "(FULLY LIVE)" : "(stub/partial — see /health)"}`,
  );
});
