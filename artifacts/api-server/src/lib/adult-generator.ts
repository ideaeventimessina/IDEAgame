import OpenAI from "openai";
import { logger } from "./logger.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AdultLevel = "flirt" | "tension" | "hot" | "extreme" | "after_dark";

export interface AdultMission {
  id: string;
  level: AdultLevel;
  title: string;
  body: string;
  points: number;
  timeLimit: number;
  tag: "solo" | "duo" | "group";
}

export const ADULT_LEVELS: { id: AdultLevel; label: string; emoji: string; color: string; desc: string }[] = [
  { id: "flirt",      label: "Flirt",       emoji: "😊", color: "#FB7185", desc: "Leggero e divertente" },
  { id: "tension",    label: "Tensione",    emoji: "😏", color: "#F97316", desc: "Un po' più audace" },
  { id: "hot",        label: "Hot",         emoji: "🔥", color: "#EF4444", desc: "Per i coraggiosi" },
  { id: "extreme",    label: "Extreme",     emoji: "💣", color: "#A855F7", desc: "Nessun limite" },
  { id: "after_dark", label: "After Dark",  emoji: "🌙", color: "#1E1E2E", desc: "Solo adulti" },
];

// ── Compact builder ───────────────────────────────────────────────────────────

function m(id: string, level: AdultLevel, title: string, body: string, tag: "solo" | "duo" | "group" = "solo", pts = 100, tl = 60): AdultMission {
  return { id, level, title, body, points: pts, timeLimit: tl, tag };
}

// ── Fallback Bank ─────────────────────────────────────────────────────────────

export const ADULT_BANK: AdultMission[] = [

  // ── FLIRT ─────────────────────────────────────────────────────────────────
  m("f1",  "flirt", "Il Complimento",       "Fai un complimento sincero e genuino alla persona alla tua sinistra. Deve essere specifico e non banale!", "duo", 80, 45),
  m("f2",  "flirt", "Il Tipo Ideale",       "Descrivi il tuo tipo ideale in 3 aggettivi. Gli altri devono indovinare se sei serio o ironico!", "solo", 80, 45),
  m("f3",  "flirt", "Ballo a Due",          "Balla per 30 secondi con la persona alla tua destra. Il pubblico giudica con applausi!", "duo", 100, 40),
  m("f4",  "flirt", "Il Segreto Innocente", "Confessa qualcosa che non sa quasi nessuno qui. Deve essere divertente, non imbarazzante!", "solo", 80, 50),
  m("f5",  "flirt", "Il Soprannome",        "Dai un soprannome spiritoso a ogni persona del gruppo. Devi giustificare la scelta!", "group", 100, 60),
  m("f6",  "flirt", "La Prima Impressione", "Di' qual è stata la tua prima impressione di ognuno in questa stanza — onestà assoluta!", "group", 100, 60),
  m("f7",  "flirt", "Il Miglior Sorriso",   "Fai ridere qualcuno nel gruppo entro 30 secondi, senza toccarli e senza dirne una volgarità!", "solo", 80, 35),
  m("f8",  "flirt", "Il Messaggio Dolce",   "Manda un messaggio carino (non romantico) a qualcuno che non senti da almeno un mese. Mostralo prima di inviare!", "solo", 100, 60),
  m("f9",  "flirt", "Lo Showman",           "Recita una battuta che hai inventato al momento. Gli altri votano se fa ridere o no!", "solo", 80, 45),
  m("f10", "flirt", "Il Tutorial",          "Insegna a tutti un gesto di saluto inventato da te. Tutti devono impararlo!", "group", 100, 50),

  // ── TENSION ───────────────────────────────────────────────────────────────
  m("t1",  "tension", "Il Segreto all'Orecchio", "Sussurra un segreto vero all'orecchio della persona di fronte. Gli altri cercano di indovinare cosa hai detto!", "duo", 120, 45),
  m("t2",  "tension", "L'Imitazione",              "Imita per 1 minuto una persona in questa stanza. Tutti devono capire chi è senza che tu lo dica!", "solo", 120, 60),
  m("t3",  "tension", "Il Patto",                  "Fai una promessa imbarazzante a voce alta — e tutti ti tengono a parola per tutta la serata!", "solo", 100, 45),
  m("t4",  "tension", "La Verità Scomoda",         "Rispondi onestamente: chi in questa stanza si abbinerebbe meglio con te? Spiega perché!", "solo", 130, 50),
  m("t5",  "tension", "Il Giudice",                "Classifica gli altri per stile su una scala da 1 a 5. Devi dire i voti ad alta voce!", "group", 130, 55),
  m("t6",  "tension", "La Foto Imbarazzante",      "Mostra agli altri la tua foto più imbarazzante nella galleria (entro la quinta che trovi scrollando)!", "solo", 120, 50),
  m("t7",  "tension", "Il Confessionale",          "Confessa la cosa più stupida che hai mai fatto per ottenere l'attenzione di qualcuno!", "solo", 130, 55),
  m("t8",  "tension", "Il Massaggio",              "Fai un massaggio alle spalle alla persona davanti a te per 30 secondi!", "duo", 120, 35),
  m("t9",  "tension", "La Telefonata",             "Chiama qualcuno a caso dalla tua rubrica e salutalo con un accento diverso dal tuo. Vince chi regge di più!", "solo", 150, 60),
  m("t10", "tension", "Il Doppiogiochista",        "Fai un complimento a due persone diverse — ma in modo che ognuna pensi sia solo per lei!", "duo", 130, 55),

  // ── HOT ───────────────────────────────────────────────────────────────────
  m("h1",  "hot", "Il Primo Bacio",              "Descrivi nei minimi dettagli il tuo primo bacio — dove eri, chi era, come è andata!", "solo", 150, 60),
  m("h2",  "hot", "I Messaggi Scottanti",        "Leggi ad alta voce il messaggio più imbarazzante che hai inviato negli ultimi 30 giorni!", "solo", 160, 55),
  m("h3",  "hot", "La Verità sul Telefono",      "Mostra al gruppo le ultime 5 persone con cui hai avuto una conversazione romantica o flirty. Solo i nomi!", "solo", 150, 45),
  m("h4",  "hot", "Il Quiz Scomodo",             "Il gruppo fa 3 domande imbarazzanti. Puoi rifiutarne solo 1 — le altre devi rispondere onestamente!", "group", 160, 90),
  m("h5",  "hot", "La Confessione Romantica",    "Racconta la storia del tuo flirt più recente — tutti i dettagli che puoi condividere!", "solo", 160, 70),
  m("h6",  "hot", "La Classifica Segreta",       "Scrivi su un foglio la persona in questa stanza con cui passeresti una serata romantica. Poi giri il foglio!", "solo", 160, 45),
  m("h7",  "hot", "Il Personaggio",              "Sei un personaggio di un film romantico per 2 minuti. Tutti interagiscono con te come se fossero nel film!", "group", 150, 120),
  m("h8",  "hot", "Il Profilo Dating",           "Crea in 1 minuto il tuo profilo di una app di dating e leggilo ad alta voce!", "solo", 150, 65),
  m("h9",  "hot", "La Scenata",                  "Recita una scenata di gelosia rivolta a qualcuno nel gruppo — più drammatico è, meglio è!", "duo", 160, 55),
  m("h10", "hot", "Il Confessore",               "Rivela una fantasia (innocente) che non hai mai realizzato. Gli altri votano se ti aiuteranno a realizzarla!", "solo", 160, 55),

  // ── EXTREME ───────────────────────────────────────────────────────────────
  m("e1",  "extreme", "Nudo Emotivo",             "Condividi la tua più grande paura in amore o nelle relazioni. Nessun giudizio — si vince con l'onestà!", "solo", 200, 90),
  m("e2",  "extreme", "Il Doppio Blind Date",     "Due persone vengono scelte a caso. Devono fingere un appuntamento per 2 minuti davanti a tutti!", "duo", 200, 120),
  m("e3",  "extreme", "Il Segreto che non sai",   "Chiedi al gruppo di dirti una cosa che non sapevi di te stesso. Devi accettarla senza protestare!", "group", 200, 90),
  m("e4",  "extreme", "Il Confessionale Estremo", "Rivela il momento più imbarazzante della tua vita romantica. Gli altri non possono ridere (ci proveranno)!", "solo", 220, 90),
  m("e5",  "extreme", "Il Verdetto",              "Il gruppo giudica: quanto sei 'dateable' su una scala 1-10 con motivazione? Devi ascoltare in silenzio!", "group", 200, 80),
  m("e6",  "extreme", "L'Ammissione",             "Ammetti ad alta voce la cosa di cui vai più in colpa nelle relazioni. Tutti votano se è normale o no!", "solo", 200, 70),
  m("e7",  "extreme", "Il Gioco dei Ruoli",       "Sei il tuo ex per 3 minuti — parla, gesticola, rispondi alle domande come se fossi lui/lei!", "group", 220, 180),
  m("e8",  "extreme", "La Lista Nera",            "Elenca 3 cose che farebbero finire immediatamente un appuntamento. Il gruppo le commenta!", "solo", 200, 70),
  m("e9",  "extreme", "Il Karaoke delle Emozioni","Canta un verso di una canzone romantica cambiando il testo per raccontare una tua esperienza vera!", "solo", 210, 60),
  m("e10", "extreme", "Il Giurato",               "Sei il giudice: il gruppo presenta le loro scuse più creative per aver deluso un partner. Scegli il vincitore!", "group", 200, 120),

  // ── AFTER DARK ────────────────────────────────────────────────────────────
  m("a1",  "after_dark", "After Dark: Confessione", "Rivela la cosa più audace che hai fatto in una serata e di cui non hai mai parlato con nessuno qui!", "solo", 250, 90),
  m("a2",  "after_dark", "After Dark: Il Patto",    "Fai una scommessa audace con qualcuno del gruppo — le regole le decidono loro!", "duo", 250, 90),
  m("a3",  "after_dark", "After Dark: Il Limite",   "Di' al gruppo dov'è il tuo limite — cosa non faresti mai? Il gruppo può sfidare solo verbalmente!", "solo", 250, 80),
  m("a4",  "after_dark", "After Dark: La Verità",   "Tre persone fanno domande a cui non puoi rispondere 'non lo so'. Hai 2 minuti!", "group", 260, 120),
  m("a5",  "after_dark", "After Dark: Il Codice",   "Inventa un codice segreto con un'altra persona — una parola che significa 'salvami da questa situazione'!", "duo", 240, 70),
  m("a6",  "after_dark", "After Dark: Il Verdetto", "Il gruppo vota: sei più 'innocente' o 'diabolico'? Poi confessa se hanno ragione!", "group", 250, 80),
  m("a7",  "after_dark", "After Dark: La Notte",    "Racconta cosa farebbe la versione più coraggiosa di te in una serata senza conseguenze!", "solo", 260, 90),
  m("a8",  "after_dark", "After Dark: Il Confine",  "Stabilisci una regola per il resto della serata. Il gruppo deve seguirla (entro i limiti del buon senso)!", "group", 250, 80),
];

// ── Fallback generator ────────────────────────────────────────────────────────

export function getAdultMissions(level: AdultLevel, count: number): AdultMission[] {
  const shuffled = [...ADULT_BANK.filter(m => m.level === level)].sort(() => Math.random() - 0.5);
  const result: AdultMission[] = [];
  while (result.length < count) {
    for (const m of shuffled) {
      if (result.length >= count) break;
      result.push({ ...m, id: `${m.id}_${result.length}` });
    }
  }
  return result;
}

// ── AI mission generator ──────────────────────────────────────────────────────

export async function generateAdultMissionsAI(level: AdultLevel, count: number): Promise<AdultMission[]> {
  const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  const apiKey  = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  if (!baseURL || !apiKey) throw new Error("AI non configurato");

  const lvl = ADULT_LEVELS.find(l => l.id === level);
  const openai = new OpenAI({ baseURL, apiKey });

  const prompt = `Genera ${count} missioni per un gioco di bottiglia per adulti di livello "${lvl?.label}" (${lvl?.desc}).
Rispondi SOLO con JSON array valido:
[{"id":"ai_0","level":"${level}","title":"...","body":"Descrizione missione in italiano (1-2 frasi)","points":100,"timeLimit":60,"tag":"solo|duo|group"}]
- Livello ${level}: ${lvl?.desc}
- tag: solo=1 persona, duo=2 persone, group=tutti
- Missioni creative, divertenti, adatte a feste adulti italiane
- NO contenuti illegali o non consensuali
- Tutto in italiano`;

  const completion = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.9,
    max_tokens: 2000,
  });

  const raw = (completion.choices[0]?.message?.content ?? "").replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
  const parsed = JSON.parse(raw) as AdultMission[];
  return parsed.map((m, i) => ({ ...m, id: `ai_${i}` }));
}

export async function generateAdultMissions(level: AdultLevel, count: number): Promise<AdultMission[]> {
  logger.info({ level, count }, "[JONNY_ADULT_AI] start");
  try {
    const missions = await generateAdultMissionsAI(level, count);
    if (!Array.isArray(missions) || missions.length === 0) throw new Error("empty");
    logger.info({ level, count, generated: missions.length }, "[JONNY_ADULT_AI] success");
    return missions;
  } catch (err) {
    logger.warn({ err, level }, "[JONNY_ADULT_AI] fallback");
    return getAdultMissions(level, count);
  }
}
