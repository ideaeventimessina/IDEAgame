import OpenAI from "openai";
import { logger } from "./logger.js";

// ── OpenAI client (Replit proxy) ───────────────────────────────────────────────

function makeClient(): OpenAI | null {
  const base = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  const key  = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  if (!base || !key) return null;
  return new OpenAI({ baseURL: base, apiKey: key });
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GeneratedItem {
  type:        string;
  title:       string;
  payloadJson: Record<string, unknown>;
  sortOrder:   number;
}

export interface GenerateRequest {
  gameSlug:   string;
  themeName:  string;
  difficulty: "easy" | "medium" | "hard";
  count:      number;
  extraHint?: string;
}

// ── Per-game prompt builders ───────────────────────────────────────────────────

function promptFor(req: GenerateRequest): string {
  const { gameSlug, themeName, difficulty, count } = req;

  const diffLabel = { easy: "facile (accessibile a tutti)", medium: "medio (bilanciato)", hard: "difficile (per esperti)" }[difficulty] ?? "medio";

  switch (gameSlug) {
    case "adult-only":
      return `Sei un content creator per giochi di gruppo italiani per adulti.
Genera ${count} sfide per il tema "${themeName}", difficoltà ${diffLabel}.
Crea metà VERITÀ (domande personali) e metà OBBLIGHI (prove fisiche/creative).
Formato JSON array: [{"category":"verita"|"obbligo","text":"...","level":1,"durationSeconds":60}]
Solo JSON valido, nessun testo fuori dall'array.`;

    case "saramusica":
      return `Sei un quiz musicale italiano.
Genera ${count} domande musicali a tema "${themeName}", difficoltà ${diffLabel}.
Ogni domanda: {"type":"guess_song"|"guess_artist"|"complete_lyrics"|"speed_music"|"song_vs_song","question":"...","answers":["A","B","C","D"],"correctAnswerIndex":0,"year":1985,"artist":"...","songTitle":"...","explanation":"..."}
Solo JSON array valido.`;

    case "quizzone":
      return `Sei un quiz show italiano.
Genera ${count} domande a tema "${themeName}", difficoltà ${diffLabel}.
Ogni domanda: {"type":"multiple_choice"|"true_false"|"speed_round","question":"...","answers":["A","B","C","D"],"correctAnswerIndex":0,"points":100,"timeLimit":15}
Solo JSON array valido.`;

    case "parola-alle-spalle":
      return `Sei un creatore di contenuti per un gioco italiano "Parola alle Spalle" (charades).
Genera ${count} schede a tema "${themeName}", difficoltà ${diffLabel}.
Ogni scheda: {"word":"PAROLA","category":"Categoria","tabooWords":["parola1","parola2","parola3"]}
Le tabooWords sono le 3-4 parole che il giocatore NON può usare per descrivere la parola.
Solo JSON array valido.`;

    case "percorso-risate":
      return `Sei un autore di un game show italiano dal vivo "Percorso a Risate".
Genera ${count} sfide a tema "${themeName}", difficoltà ${diffLabel}.
Tipi disponibili: sfida, domanda, mimo, ballo, veloce, coppia, reazione, fantasia.
Ogni sfida: {"type":"sfida","text":"Descrizione sfida divertente...","points":100,"timeLimit":60}
Solo JSON array valido.`;

    case "karaoke-battle":
      return `Sei un DJ per un karaoke italiano.
Genera ${count} canzoni per una battle a tema "${themeName}", difficoltà ${diffLabel}.
Ogni canzone: {"title":"Titolo","artist":"Artista","year":2005,"genre":"pop"}
Includi mix di classici italiani e internazionali.
Solo JSON array valido.`;

    case "card-sets":
      return `Sei un designer di giochi di memoria per adulti italiani.
Genera ${count} coppie di carte a tema "${themeName}".
Ogni coppia: {"pairLabel":"Nome coppia","cardA":"Descrizione carta A (es. foto di...)","cardB":"Descrizione carta B (il suo abbinamento)"}
Solo JSON array valido.`;

    default:
      return `Genera ${count} elementi per un gioco italiano a tema "${themeName}", difficoltà ${diffLabel}.
Ogni elemento: {"title":"...","text":"...","points":100}
Solo JSON array valido.`;
  }
}

// ── Fallback banks per game ───────────────────────────────────────────────────

function fallbackItems(req: GenerateRequest): GeneratedItem[] {
  const { gameSlug, themeName, count } = req;
  const items: GeneratedItem[] = [];

  const templates: Record<string, { type: string; payload: Record<string, unknown> }[]> = {
    "adult-only": [
      { type: "verita",  payload: { category: "verita",  text: `[VERITÀ] Racconta un momento imbarazzante legato a "${themeName}".`, level: 1, durationSeconds: 60 } },
      { type: "obbligo", payload: { category: "obbligo", text: `[OBBLIGO] Fai una cosa divertente legata a "${themeName}".`, level: 1, durationSeconds: 60 } },
    ],
    "saramusica": [
      { type: "guess_song", payload: { type: "guess_song", question: `Indovina la canzone di ${themeName}`, answers: ["A","B","C","D"], correctAnswerIndex: 0, points: 100, timeLimit: 20 } },
    ],
    "quizzone": [
      { type: "multiple_choice", payload: { type: "multiple_choice", question: `Domanda su ${themeName}?`, answers: ["A","B","C","D"], correctAnswerIndex: 0, points: 100, timeLimit: 15 } },
    ],
    "parola-alle-spalle": [
      { type: "word_card", payload: { word: "PAROLA", category: themeName, tabooWords: ["sinonimo1","sinonimo2","sinonimo3"] } },
    ],
    "percorso-risate": [
      { type: "sfida", payload: { type: "sfida", text: `Sfida di ${themeName}`, points: 100, timeLimit: 60 } },
    ],
    "karaoke-battle": [
      { type: "song", payload: { title: "Canzone", artist: "Artista", year: 2000, genre: "pop" } },
    ],
  };

  const tpls = templates[gameSlug] ?? [{ type: "item", payload: { text: `Elemento di ${themeName}` } }];
  for (let i = 0; i < count; i++) {
    const tpl = tpls[i % tpls.length]!;
    items.push({ type: tpl.type, title: `${themeName} #${i + 1}`, payloadJson: tpl.payload, sortOrder: i });
  }
  return items;
}

// ── AI parser per game ────────────────────────────────────────────────────────

function parseAIResponse(gameSlug: string, raw: unknown[]): Omit<GeneratedItem, "sortOrder">[] {
  return raw.map((item) => {
    const obj = item as Record<string, unknown>;
    switch (gameSlug) {
      case "adult-only":
        return {
          type:        String(obj["category"] ?? "verita"),
          title:       String(obj["text"] ?? "").slice(0, 80),
          payloadJson: obj as Record<string, unknown>,
        };
      case "saramusica":
        return {
          type:        String(obj["type"] ?? "guess_song"),
          title:       String(obj["question"] ?? "").slice(0, 80),
          payloadJson: obj as Record<string, unknown>,
        };
      case "parola-alle-spalle":
        return {
          type:        "word_card",
          title:       String(obj["word"] ?? ""),
          payloadJson: obj as Record<string, unknown>,
        };
      case "percorso-risate":
        return {
          type:        String(obj["type"] ?? "sfida"),
          title:       String(obj["text"] ?? "").slice(0, 80),
          payloadJson: obj as Record<string, unknown>,
        };
      case "karaoke-battle":
        return {
          type:        "song",
          title:       `${String(obj["title"] ?? "")} — ${String(obj["artist"] ?? "")}`,
          payloadJson: obj as Record<string, unknown>,
        };
      default:
        return {
          type:        "item",
          title:       String(obj["title"] ?? obj["question"] ?? obj["word"] ?? "").slice(0, 80),
          payloadJson: obj as Record<string, unknown>,
        };
    }
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateContentItems(req: GenerateRequest): Promise<GeneratedItem[]> {
  const client = makeClient();
  if (!client) {
    logger.warn("[CONTENT_GEN] No OpenAI client — using fallback bank");
    return fallbackItems(req);
  }

  const prompt = promptFor(req);
  logger.info({ gameSlug: req.gameSlug, theme: req.themeName }, "[CONTENT_GEN_AI] Generating content");

  try {
    const completion = await Promise.race([
      client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Sei un content creator esperto per giochi italiani. Rispondi SOLO con JSON valido, nessun testo aggiuntivo." },
          { role: "user", content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 3000,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 25000)),
    ]);

    const text = completion.choices[0]?.message?.content ?? "[]";
    const clean = text.trim().replace(/^```json?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(clean) as unknown[];
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("empty array");

    logger.info({ count: parsed.length }, "[CONTENT_GEN_AI] Success");
    const items = parseAIResponse(req.gameSlug, parsed.slice(0, req.count));
    return items.map((item, i) => ({ ...item, sortOrder: i }));
  } catch (err) {
    logger.error({ err }, "[CONTENT_GEN_AI] Failed — fallback");
    return fallbackItems(req);
  }
}
