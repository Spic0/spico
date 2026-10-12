import { env, openaiLive } from "./env.js";

// One-shot text "converse" used by the SIMULATE test path (not the live audio
// bridge — that is realtimeBridge.ts). When OPENAI_API_KEY is present this makes
// a real OpenAI Chat Completions request so the simulate path exercises the
// actual model with the agent's real composed instructions; otherwise it
// returns a canned reply (clearly labelled) so the pipeline still runs with no
// credentials. The live audio path uses the Realtime API instead.

export interface RealtimeSessionContext {
  agentName: string;
  instructions: string;
  greetingMessage: string | null;
  sampleGuestMessage: string;
}

export interface RealtimeAdapter {
  readonly live: boolean;
  converse(ctx: RealtimeSessionContext): Promise<{ replyText: string; note: string }>;
}

class StubRealtimeAdapter implements RealtimeAdapter {
  readonly live = false;
  async converse(ctx: RealtimeSessionContext) {
    return {
      replyText: ctx.greetingMessage ?? `Hello, this is ${ctx.agentName}. How can I help?`,
      note: "stub: no OpenAI call was made — this is a canned reply, not model output",
    };
  }
}

class OpenAIRealtimeAdapter implements RealtimeAdapter {
  readonly live = true;
  constructor(private readonly apiKey: string) {}

  async converse(ctx: RealtimeSessionContext) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: ctx.instructions },
          { role: "user", content: ctx.sampleGuestMessage },
        ],
        max_tokens: 200,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenAI chat completion failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const replyText = data.choices?.[0]?.message?.content?.trim() || "(no reply)";
    return { replyText, note: "openai: real chat-completion reply (simulate path — not the live audio bridge)" };
  }
}

export function getRealtimeAdapter(): RealtimeAdapter {
  if (openaiLive) return new OpenAIRealtimeAdapter(env.OPENAI_API_KEY as string);
  return new StubRealtimeAdapter();
}
