/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

// Mission Control — reporter delle chiamate AI in tempo reale (fire-and-forget).
// Ogni chiamata AI viene segnalata alla plancia (POST /api/ai-call) e mostrata
// nello stream live. Non blocca né rompe mai l'app: se la plancia non risponde,
// o manca il token, ignora in silenzio.

interface AiCall {
  provider?: string;
  model?: string;
  costUsd?: number;
  tokensIn?: number;
  tokensOut?: number;
}

const PROJECT = "ideagame"; // id nel registro della plancia
const ENDPOINT =
  (process.env.MISSION_CONTROL_ENDPOINT || "https://lastanza.replit.app").replace(/\/+$/, "") + "/api/ai-call";

let buffer: AiCall[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function inferProvider(model: string): string {
  const m = (model || "").toLowerCase();
  if (m.startsWith("claude")) return "Anthropic";
  if (m.startsWith("gemini")) return "Gemini";
  if (m.includes("flux") || m.includes("fal-")) return "fal.ai";
  if (m.startsWith("gpt") || m.includes("o1") || m.includes("o3") || m.includes("tts") || m.includes("whisper") || m.includes("dall-e"))
    return "OpenAI";
  return "AI";
}

async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const token = process.env.MISSION_CONTROL_TOKEN || "";
  if (!buffer.length || !token) {
    buffer = [];
    return;
  }
  const calls = buffer;
  buffer = [];
  try {
    const f = (globalThis as { fetch?: typeof fetch }).fetch;
    if (!f) return;
    await f(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Mission-Token": token },
      body: JSON.stringify({ p: PROJECT, calls }),
    });
  } catch {
    // il monitoraggio non deve mai rompere l'app
  }
}

export function mcAiReport(call: AiCall): void {
  buffer.push({
    provider: call.provider || inferProvider(call.model || ""),
    model: call.model || "",
    costUsd: Number(call.costUsd) || 0,
    tokensIn: Number(call.tokensIn) || 0,
    tokensOut: Number(call.tokensOut) || 0,
  });
  if (buffer.length >= 25) void flush();
  else if (!timer) timer = setTimeout(() => void flush(), 3000);
}
