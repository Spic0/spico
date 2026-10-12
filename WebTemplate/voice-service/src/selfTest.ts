// Offline self-test for the parts of the voice-service that do NOT need live
// Telnyx/OpenAI credentials: Ed25519 webhook verification (real crypto, with a
// locally generated keypair), the handoff decision heuristic, capability→tool
// gating, and fallback routing (with a fake Telnyx adapter). Run:
//   npm run selftest
//
// The live audio bridge, real Telnyx REST calls, and real OpenAI Realtime
// session are intentionally NOT covered here — they require credentials + a
// public deployment (see README.md activation runbook).

import { generateKeyPairSync, sign as edSign } from "node:crypto";

// env.ts validates required vars at import; give it dummies before we import
// anything that pulls it in.
process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "dummy-service-role-key";
process.env.VOICE_SERVICE_SHARED_SECRET ??= "dummy-secret";
process.env.VOICE_FALLBACK_NUMBER ??= "+15550000000";

let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}`);
  }
}

async function main(): Promise<void> {
  const { verifyTelnyxWebhook } = await import("./telnyxSignature.js");
  const { decideCallOutcome } = await import("./decision.js");
  const { toolsForContext } = await import("./tools.js");
  const { runFallback } = await import("./fallback.js");
  const { getVoiceMode } = await import("./env.js");

  // ---- 1. Telnyx Ed25519 signature verification ----
  console.log("Telnyx Ed25519 signature verification:");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const rawPub = publicKey.export({ format: "der", type: "spki" }).subarray(-32); // last 32 bytes = raw key
  const publicKeyBase64 = Buffer.from(rawPub).toString("base64");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const rawBody = JSON.stringify({ data: { event_type: "call.initiated", payload: { call_control_id: "abc" } } });
  const signature = edSign(null, Buffer.from(`${timestamp}|${rawBody}`, "utf8"), privateKey);
  const sigBase64 = signature.toString("base64");
  const common = { publicKeyBase64, toleranceSeconds: 300 };

  check(
    "valid signature accepted",
    verifyTelnyxWebhook({ rawBody, signatureBase64: sigBase64, timestamp, ...common }).valid === true,
  );
  check(
    "tampered body rejected",
    verifyTelnyxWebhook({ rawBody: rawBody + " ", signatureBase64: sigBase64, timestamp, ...common }).valid === false,
  );
  check(
    "wrong signature rejected",
    verifyTelnyxWebhook({ rawBody, signatureBase64: Buffer.from("nope").toString("base64"), timestamp, ...common })
      .valid === false,
  );
  check(
    "stale timestamp rejected",
    verifyTelnyxWebhook({ rawBody, signatureBase64: sigBase64, timestamp: "1000", ...common }).valid === false,
  );
  check(
    "missing signature rejected",
    verifyTelnyxWebhook({ rawBody, signatureBase64: undefined, timestamp, ...common }).valid === false,
  );

  // ---- 2. Handoff decision heuristic ----
  console.log("Handoff decision heuristic:");
  const baseHandoff = {
    handoff_enabled: true,
    condition_guest_requests_human: true,
    condition_unsupported_language: true,
    condition_emergency: true,
  };
  check(
    "human request → handoff",
    decideCallOutcome({ sampleMessage: "I want a real person", testLanguage: "en", enabledLanguageCodes: ["en"], handoff: baseHandoff }).disposition === "handoff_required",
  );
  check(
    "emergency → handoff",
    decideCallOutcome({ sampleMessage: "there is a fire", testLanguage: "en", enabledLanguageCodes: ["en"], handoff: baseHandoff }).disposition === "handoff_required",
  );
  check(
    "unsupported language → handoff",
    decideCallOutcome({ sampleMessage: "hola", testLanguage: "es", enabledLanguageCodes: ["en"], handoff: baseHandoff }).disposition === "handoff_required",
  );
  check(
    "normal question, handoff disabled → handled_by_ai",
    decideCallOutcome({ sampleMessage: "what time is breakfast", testLanguage: "en", enabledLanguageCodes: ["en"], handoff: { ...baseHandoff, handoff_enabled: false } }).disposition === "handled_by_ai",
  );

  // ---- 3. Capability → tool gating ----
  console.log("Capability → tool gating:");
  const mkCtx = (caps: string[]) =>
    ({
      hotel: { id: "h", organization_id: "o", name: "Test" },
      voiceSettings: { phone_number: "+1", default_agent_id: "a" },
      agent: { id: "a", name: "Aria", greeting_message: null, fallback_message: null, handoff_message: null, default_language: "en", personality_tone: null },
      promptVersion: null,
      enabledLanguageCodes: ["en"],
      handoff: baseHandoff,
      enabledCapabilityKeys: caps,
    }) as Parameters<typeof toolsForContext>[0];

  const noExtra = toolsForContext(mkCtx(["human_handoff"])).map((t) => t.name);
  check("transfer_to_human always present", noExtra.includes("transfer_to_human"));
  check("end_call always present", noExtra.includes("end_call"));
  check("check_availability gated off when capability absent", !noExtra.includes("check_availability"));
  const withCaps = toolsForContext(mkCtx(["availability_inquiry", "reservation_lookup_request"])).map((t) => t.name);
  check("check_availability present when enabled", withCaps.includes("check_availability"));
  check("lookup_reservation present when enabled", withCaps.includes("lookup_reservation"));

  // ---- 4. Fallback routing (fake Telnyx adapter) ----
  console.log("Fallback routing:");
  const calls: string[] = [];
  const fakeTelnyx = {
    live: false,
    answer: async () => ({ note: "answer" }),
    hangup: async () => { calls.push("hangup"); return { note: "hangup" }; },
    transferToHuman: async (_ctx: unknown, dest: string) => { calls.push(`transfer:${dest}`); return { note: "transfer" }; },
    startStreaming: async () => ({ note: "stream" }),
    speak: async () => { calls.push("speak"); return { note: "speak" }; },
  };
  const fb1 = await runFallback({ telnyx: fakeTelnyx as never, ctx: { callControlId: "x", toNumber: "+1" }, reason: "test" });
  check("with fallback number → transferred", fb1.action === "transferred" && calls.includes("transfer:+15550000000"));

  console.log("Voice mode summary:", JSON.stringify(getVoiceMode()));

  if (failures > 0) {
    console.error(`\n${failures} self-test check(s) FAILED`);
    process.exit(1);
  }
  console.log("\nAll self-test checks passed.");
}

void main();
