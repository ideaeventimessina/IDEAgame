/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Voce di Jonny ───────────────────────────────────────────────────────────
   Jonny presenta e spiega i giochi con la sua voce. Il testo NON arriva dal
   client: è un catalogo fisso qui sul server (una battuta per gioco), così
   l'endpoint pubblico non può essere usato per generare audio arbitrario a
   pagamento. La prima richiesta genera l'MP3 con OpenAI (textToSpeech) e lo
   mette in cache su game_media_slots (gameSlug "_voicecache", nessuna
   migrazione, stesso schema di image-cache); tutte le successive sono cache HIT.
   Se cambio il copione, l'hash cambia e si rigenera solo quella battuta.
──────────────────────────────────────────────────────────────────────────── */

import { createHash } from "node:crypto";
import { db, gameMediaSlotsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { textToSpeech } from "@workspace/integrations-openai-ai-server/audio";
import { uploadBufferToStorage } from "./objectStorage.js";

const CACHE_SLUG = "_voicecache";
/** Voce del personaggio: showman caldo e sicuro. Override via env JONNY_VOICE. */
type OpenAIVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
const JONNY_VOICE: OpenAIVoice = ((): OpenAIVoice => {
  const v = process.env["JONNY_VOICE"];
  const ok: OpenAIVoice[] = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
  return (v && (ok as string[]).includes(v) ? v : "onyx") as OpenAIVoice;
})();

/**
 * Copione di Jonny, in prima persona, energico, in italiano. Chiavi = gameSlug
 * dei giochi Home + battute di sistema (welcome/intro/podium). Frasi brevi:
 * vanno lette a voce, non lette a schermo.
 */
export const JONNY_SCRIPTS: Record<string, string> = {
  welcome:
    "Ehilà, sono Jonny! Benvenuti a Jonny's World, la festa dove giocate tutti insieme. Prendete i telefoni, si comincia!",
  hub:
    "Scegliete un gioco dalla ruota! Ognuno è una sfida diversa. Io vi spiego tutto, voi pensate solo a divertirvi.",
  quizzone:
    "Questo è il Quizzone! Vi faccio domande su tutto, voi rispondete dal telefono. Più siete veloci, più punti prendete. Chi ne sa di più vince!",
  "sfida-ballo":
    "Sfida Ballo! Guardate il video e imitate i passi con me. Ballano tutti, ogni manche: chi ha più ritmo sale sul podio. Su, muovetevi!",
  "gioco-coppie":
    "Gioco delle Coppie! Gira le carte e trova le coppie uguali prima degli altri. Occhio e memoria: chi ne trova di più conquista i punti.",
  "percorso-a-risate":
    "Percorso a Risate! Prove, mimi e sfide assurde da fare tutti insieme. Ridere è garantito, la figuraccia pure. Pronti a mettervi in gioco?",
  "adult-only":
    "Adult, solo per adulti coraggiosi! Sfide piccanti e domande senza filtri. Se ve la sentite, alzate la posta. Diciotto più, mi raccomando!",
  "karaoke-battle":
    "Karaoke Battle! Si canta, si rappa, si fa spettacolo a turno. Prendete il microfono e fatemi sentire cosa sapete fare. Il palco è vostro!",
  saramusica:
    "SaraMusica! Ascoltate l'indizio e indovinate la canzone. Chi riconosce il pezzo per primo si prende tutto. Orecchie aperte!",
  "parola-alle-spalle":
    "Parola alle Spalle! Hai una parola dietro la schiena e non la vedi: gli altri te la fanno indovinare. Fidati del gruppo… o quasi!",
  "freestyle-battle":
    "Freestyle Battle! Vi do la base, voi buttate giù le rime. Improvvisate, sfidatevi, fate rima con quello che avete. A tempo, mi raccomando!",
  lockdown:
    "Lockdown! C'è un Master, ci sono i Lock-Euro e c'è una spia segreta tra voi. Fate le prove, guadagnate, e scoprite chi tradisce. Che il lockdown abbia inizio!",
  podium:
    "E il momento della verità è arrivato! Ecco il podio. Applausi per tutti, ma i punti… non mentono. Bravissimi!",
};

function normKey(slug: string, text: string): string {
  const h = createHash("sha1").update(text).digest("hex").slice(0, 10);
  return `voice:${slug}:${h}`.slice(0, 220);
}

async function readCache(slotKey: string): Promise<string | undefined> {
  try {
    const [row] = await db.select().from(gameMediaSlotsTable)
      .where(and(eq(gameMediaSlotsTable.gameSlug, CACHE_SLUG), eq(gameMediaSlotsTable.slotKey, slotKey)))
      .limit(1);
    return row?.value || undefined;
  } catch { return undefined; }
}

async function writeCache(slotKey: string, url: string, label: string): Promise<void> {
  try {
    if ((await readCache(slotKey)) !== undefined) return;
    await db.insert(gameMediaSlotsTable).values({
      gameSlug: CACHE_SLUG, slotKey, value: url, valueType: "audio", label: label.slice(0, 120),
    });
  } catch { /* best-effort */ }
}

/** Elenco delle battute disponibili (per il prefetch lato client). */
export function jonnyVoiceKeys(): string[] {
  return Object.keys(JONNY_SCRIPTS);
}

/**
 * URL dell'MP3 con la voce di Jonny per una chiave del copione.
 * Genera+cache alla prima richiesta, poi sempre cache. null se la chiave non
 * esiste o se la generazione fallisce (il gioco continua senza voce).
 */
export async function getJonnyVoiceUrl(key: string): Promise<string | null> {
  const text = JONNY_SCRIPTS[key];
  if (!text) return null;
  const slotKey = normKey(key, text);
  const cached = await readCache(slotKey);
  if (cached) return cached;
  try {
    const buffer = await textToSpeech(text, JONNY_VOICE, "mp3");
    if (!buffer?.length) return null;
    const objectPath = await uploadBufferToStorage(buffer, "audio/mpeg", "mp3");
    const mediaUrl = `/api/storage/objects/uploads/${objectPath.split("/").pop()}`;
    await writeCache(slotKey, mediaUrl, `Jonny voce: ${key}`);
    return mediaUrl;
  } catch (err) {
    console.error("[jonny-voice] generazione fallita", key, err);
    return null;
  }
}
