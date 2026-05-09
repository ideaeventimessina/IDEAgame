import { Router, type IRouter, type Response } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  jonnyGenerationsTable, jonnyGeneratedItemsTable,
  laughingPathSetsTable, laughingPathStepsTable,
  quizPacksTable, adultOnlyDecksTable, adultOnlyCardsTable,
  wordBackSetsTable, wordBackCardsTable, karaokeSetsTable, karaokeTracksTable,
  freestyleSetsTable, freestyleWordsTable,
  saraMusicaSetsTable, saraMusicaTracksTable,
} from "@workspace/db";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildSystemPrompt(params: {
  theme: string;
  targetAudience: string;
  tone: string;
  language: string;
  difficulty: string;
  durationMinutes: string;
  numberOfTeams: string;
  selectedGames: string[];
  notes: string;
  eventTitle?: string;
}): string {
  const { theme, targetAudience, tone, language, difficulty, durationMinutes, numberOfTeams, selectedGames, notes, eventTitle } = params;

  const gameInstructions: Record<string, string> = {
    "percorso-a-risate": `Genera "percorso-a-risate": set di sfide fisico-comiche. Struttura:
{
  "setTitle": "titolo set",
  "description": "descrizione breve animatore",
  "hostIntro": "intro da leggere al microfono",
  "rules": "regole brevi",
  "jonnyIntro": "frase di Jonny per introduzione",
  "jonnyWait": "frase di Jonny durante attesa",
  "jonnyWin": "frase di Jonny a fine vincita",
  "steps": [
    {
      "title": "titolo sfida",
      "description": "descrizione dettagliata per animatore",
      "challengeType": "sfida|domanda|mimo|ballo|veloce|coppia|reazione|fantasia",
      "points": 100,
      "timeLimit": 30,
      "jonnyLine": "microcopy Jonny per questa sfida"
    }
  ]
}
Genera almeno 10 sfide variando tipo e difficoltà. Tema: ${theme}.`,

    "quizzone": `Genera "quizzone": quiz a risposta multipla. Struttura:
{
  "packTitle": "titolo pack",
  "themePrompt": "tema del quiz",
  "hostIntro": "intro animatore",
  "jonnyIntro": "frase di apertura Jonny",
  "jonnyCorrect": "frase Jonny per risposta corretta",
  "jonnyWrong": "frase Jonny per risposta sbagliata",
  "rounds": [
    {
      "questionText": "testo domanda",
      "answers": ["risposta A", "risposta B", "risposta C", "risposta D"],
      "correctAnswer": 0,
      "explanation": "spiegazione breve",
      "difficulty": "easy|medium|hard",
      "type": "multiple_choice",
      "points": 100,
      "timeLimit": 30,
      "jonnyLine": "commento Jonny su questa domanda"
    }
  ]
}
Genera almeno 15 domande. Varia difficoltà. Tema: ${theme}.`,

    "adult-only": `Genera "adult-only": gioco per adulti con carte a livelli. Struttura:
{
  "deckTitle": "titolo deck",
  "description": "descrizione per animatore",
  "hostIntro": "intro animatore",
  "jonnyIntro": "frase apertura Jonny",
  "jonnyWin": "frase Jonny fine round",
  "cards": [
    {
      "title": "titolo carta",
      "body": "testo completo carta (domanda/sfida)",
      "category": "domande-piccanti-leggere|vero-falso|coppie-challenge|imitazioni-vocali-soft|yoga-pose-ironiche|mondo-animale-curioso",
      "level": "soft|spicy",
      "points": 100,
      "timeLimit": 30,
      "jonnyLine": "microcopy Jonny per questa carta"
    }
  ]
}
Genera almeno 12 carte. Livelli soft/spicy solo (mai extreme). Adatto a ${targetAudience}. Tema: ${theme}.`,

    "parola-alle-spalle": `Genera "parola-alle-spalle": indovina la parola sulla schiena. Struttura:
{
  "setTitle": "titolo set",
  "description": "descrizione per animatore",
  "hostIntro": "intro animatore",
  "jonnyIntro": "frase apertura Jonny",
  "cards": [
    {
      "word": "PAROLA DA INDOVINARE",
      "hint": "suggerimento opzionale per aiutare",
      "category": "animali|oggetti|film|personaggi|azioni|mestieri|eventi|parole assurde",
      "difficulty": "easy|medium|hard",
      "points": 150,
      "timeLimit": 45,
      "jonnyLine": "frase Jonny durante il round"
    }
  ]
}
Genera almeno 20 parole legate al tema ${theme}. Varia categorie.`,

    "karaoke-battle": `Genera "karaoke-battle": playlist canzoni. Struttura:
{
  "setTitle": "titolo playlist",
  "description": "descrizione per animatore",
  "hostIntro": "intro animatore",
  "jonnyIntro": "frase apertura Jonny",
  "tracks": [
    {
      "title": "titolo canzone",
      "artist": "artista",
      "lyricSnippet": "primi versi da cantare (3-4 versi)",
      "category": "pop|rock|italiano|anni80|anni90|film-cartoon|dance",
      "difficulty": "easy|medium|hard",
      "points": 150,
      "durationSeconds": 60,
      "jonnyLine": "commento Jonny per questa canzone"
    }
  ]
}
Genera almeno 10 canzoni. Tema/mood: ${theme}. Lingua canzoni: qualsiasi ma legate al tema.`,

    "freestyle-battle": `Genera "freestyle-battle": parole da usare in freestyle rap. Struttura:
{
  "setTitle": "titolo set parole",
  "description": "descrizione per animatore",
  "hostIntro": "intro animatore",
  "jonnyIntro": "frase apertura Jonny",
  "words": ["parola1", "parola2", "parola3", ...]
}
Genera almeno 30 parole strane/divertenti legate al tema ${theme}. Solo parole singole o brevi espressioni.`,

    "sara-musica": `Genera "sara-musica": playlist canzoni da indovinare a tema. Struttura:
{
  "setTitle": "titolo playlist",
  "description": "descrizione per animatore",
  "hostIntro": "intro animatore",
  "jonnyIntro": "frase apertura Jonny",
  "tracks": [
    {
      "title": "titolo canzone",
      "artist": "artista",
      "challengeType": "indovina|canta|rumore",
      "snippetHint": "primo verso o indizio testuale (senza copyright esteso)",
      "durationSeconds": 30,
      "points": 100,
      "jonnyLine": "commento Jonny per questa canzone"
    }
  ]
}
Genera almeno 12 canzoni legate al tema ${theme}. Varia tipi: indovina (indovinare titolo/artista), canta (cantare il ritornello), rumore (imitare strumento/sound). Usa canzoni famose ma descrivi solo titolo+artista.`,

    "gioco-delle-coppie": `Genera "gioco-delle-coppie": coppie di immagini tematiche. Struttura:
{
  "setTitle": "titolo set coppie",
  "description": "descrizione per animatore",
  "hostIntro": "intro animatore",
  "jonnyIntro": "frase apertura Jonny",
  "pairs": [
    {
      "label": "nome coppia (visibile dopo match)",
      "imageDescription": "descrizione dettagliata immagine A (per ricerca manuale)",
      "imageDescriptionB": "descrizione dettagliata immagine B (il match)",
      "hint": "suggerimento opzionale"
    }
  ]
}
Genera almeno 8 coppie tematiche su ${theme}. Le immagini devono essere facilmente trovabili online.`,
  };

  const selectedInstructions = selectedGames
    .filter(slug => gameInstructions[slug])
    .map(slug => gameInstructions[slug])
    .join("\n\n");

  return `Sei Jonny, il co-host AI di IDEAgame — una piattaforma di giochi live per eventi e feste italiane.
Il tuo compito è generare contenuti di qualità per una serata di giochi.

PARAMETRI SERATA:
- Evento: ${eventTitle || "serata IDEAgame"}
- Tema principale: ${theme}
- Pubblico: ${targetAudience}
- Tono: ${tone}
- Lingua output contenuti: ${language === "it" ? "italiano" : language}
- Difficoltà: ${difficulty}
- Durata serata: ${durationMinutes} minuti
- Numero squadre: ${numberOfTeams}
${notes ? `- Note admin: ${notes}` : ""}

REGOLE FONDAMENTALI:
1. Tutti i contenuti devono essere originali e non infrangere copyright
2. Adatta il tono al pubblico: ${targetAudience === "bambini" ? "assolutamente family-friendly, NO adulti" : targetAudience === "famiglie" ? "family-friendly" : "puoi essere più audace ma sempre da intrattenimento pubblico"}
3. ${targetAudience !== "adulti" && targetAudience !== "diciottesimo" ? "NIENTE contenuti sessualmente espliciti, violenza o linguaggio volgare" : "Contenuti per adulti OK ma sempre entro intrattenimento pubblico"}
4. Tutte le domande del quiz devono essere verificabili e corrette
5. Le frasi di Jonny devono essere brevi, energiche e coinvolgenti
6. Rispondi SOLO con JSON valido, nessun testo libero

GIOCHI DA GENERARE:
${selectedInstructions}

Rispondi con un JSON con questa struttura radice:
{
  "theme": "${theme}",
  "audience": "${targetAudience}",
  "tone": "${tone}",
  "games": {
    ${selectedGames.map(slug => `"${slug}": { ... }`).join(",\n    ")}
  }
}`;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// List generations for current tenant
router.get("/jonny/generations", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const user = req.user!;
  const rows = await db.select().from(jonnyGenerationsTable)
    .where(user.tenantId
      ? eq(jonnyGenerationsTable.tenantId, user.tenantId)
      : eq(jonnyGenerationsTable.tenantId, jonnyGenerationsTable.tenantId)
    )
    .orderBy(desc(jonnyGenerationsTable.createdAt))
    .limit(50);
  res.json(rows);
});

// Get single generation with its items
router.get("/jonny/generations/:id", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const id = String(req.params["id"]);
  const [gen] = await db.select().from(jonnyGenerationsTable).where(eq(jonnyGenerationsTable.id, id));
  if (!gen) { res.status(404).json({ error: "Not found" }); return; }
  const items = await db.select().from(jonnyGeneratedItemsTable)
    .where(eq(jonnyGeneratedItemsTable.generationId, id))
    .orderBy(jonnyGeneratedItemsTable.gameSlug);
  res.json({ ...gen, items });
});

// Create + generate
router.post("/jonny/generations", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const {
    title, theme, targetAudience, tone, language, difficulty,
    durationMinutes, numberOfTeams, selectedGames, notes, eventId
  } = req.body as {
    title: string; theme: string; targetAudience: string; tone: string; language: string;
    difficulty: string; durationMinutes: string; numberOfTeams: string;
    selectedGames: string[]; notes: string; eventId?: string;
  };

  if (!title || !theme || !selectedGames?.length) {
    res.status(400).json({ error: "title, theme e selectedGames sono obbligatori" });
    return;
  }

  // Insert generation row with status "generating"
  const [gen] = await db.insert(jonnyGenerationsTable).values({
    tenantId: user.tenantId ?? undefined,
    eventId: eventId ?? undefined,
    title,
    theme,
    targetAudience: targetAudience || "adulti",
    tone: tone || "comico",
    language: language || "it",
    difficulty: difficulty || "medium",
    durationMinutes: durationMinutes || "120",
    numberOfTeams: numberOfTeams || "4",
    selectedGames,
    notes: notes || "",
    status: "generating",
    createdBy: user.id,
  }).returning();

  // Build prompt and call AI
  const systemPrompt = buildSystemPrompt({
    theme, targetAudience, tone, language, difficulty,
    durationMinutes, numberOfTeams, selectedGames, notes,
    eventTitle: title,
  });

  let generatedJson: Record<string, unknown>;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.1",
      max_completion_tokens: 8192,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Genera i contenuti per la serata "${title}" con tema "${theme}". Rispondo solo con JSON valido.` },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    generatedJson = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await db.update(jonnyGenerationsTable)
      .set({ status: "failed", errorMessage: errMsg })
      .where(eq(jonnyGenerationsTable.id, gen!.id));
    res.status(500).json({ error: "Generazione AI fallita", detail: errMsg });
    return;
  }

  // Save generated items per game
  const games = (generatedJson.games ?? {}) as Record<string, unknown>;
  const itemInserts = selectedGames.map((slug) => {
    const payload = (games[slug] ?? {}) as Record<string, unknown>;
    const itemTitle = (payload.setTitle || payload.packTitle || payload.deckTitle || `${slug} — ${title}`) as string;
    return {
      generationId: gen!.id,
      gameSlug: slug,
      itemType: "set",
      title: itemTitle,
      payload,
      status: "draft",
    };
  });

  if (itemInserts.length > 0) {
    await db.insert(jonnyGeneratedItemsTable).values(itemInserts);
  }

  await db.update(jonnyGenerationsTable)
    .set({ status: "generated", generatedJson })
    .where(eq(jonnyGenerationsTable.id, gen!.id));

  // Return updated generation with items
  const [updated] = await db.select().from(jonnyGenerationsTable).where(eq(jonnyGenerationsTable.id, gen!.id));
  const items = await db.select().from(jonnyGeneratedItemsTable)
    .where(eq(jonnyGeneratedItemsTable.generationId, gen!.id));

  res.status(201).json({ ...updated, items });
});

// Update item (edit payload or status)
router.patch("/jonny/items/:id", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const { payload, status, title } = req.body as { payload?: Record<string, unknown>; status?: string; title?: string };
  const patch: Record<string, unknown> = {};
  if (payload !== undefined) patch["payload"] = payload;
  if (status !== undefined) patch["status"] = status;
  if (title !== undefined) patch["title"] = title;
  const [updated] = await db.update(jonnyGeneratedItemsTable).set(patch).where(eq(jonnyGeneratedItemsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// Import a single item into the appropriate game table
router.post("/jonny/items/:id/import", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const itemId = String(req.params["id"]);
  const user = req.user!;
  const [item] = await db.select().from(jonnyGeneratedItemsTable).where(eq(jonnyGeneratedItemsTable.id, itemId));
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }

  const payload = item.payload as Record<string, unknown>;
  let targetEntityId: string | undefined;

  try {
    switch (item.gameSlug) {
      case "percorso-a-risate": {
        const [set] = await db.insert(laughingPathSetsTable).values({
          tenantId: user.tenantId ?? undefined,
          name: payload.setTitle as string || item.title,
          description: (payload.description as string) || "",
        }).returning();
        const steps = (payload.steps as Array<Record<string, unknown>>) || [];
        if (steps.length > 0) {
          await db.insert(laughingPathStepsTable).values(
            steps.map((s, i) => ({
              setId: set!.id,
              title: (s.title as string) || `Sfida ${i + 1}`,
              description: (s.description as string) || "",
              challengeType: (s.challengeType as string) || "sfida",
              points: Number(s.points) || 100,
              timeLimit: Number(s.timeLimit) || 30,
              orderIndex: i,
            }))
          );
        }
        targetEntityId = set!.id;
        break;
      }

      case "quizzone": {
        const rounds = (payload.rounds as Array<Record<string, unknown>>) || [];
        const [pack] = await db.insert(quizPacksTable).values({
          tenantId: user.tenantId ?? undefined,
          title: (payload.packTitle as string) || item.title,
          themePrompt: (payload.themePrompt as string) || item.title,
          language: "it",
          difficulty: "medium",
          targetAudience: "adulti",
          tone: "divertente",
          totalRounds: rounds.length || 15,
          status: "generated",
          generatedJson: rounds,
        }).returning();
        targetEntityId = pack!.id;
        break;
      }

      case "adult-only": {
        const [deck] = await db.insert(adultOnlyDecksTable).values({
          tenantId: user.tenantId ?? undefined,
          name: (payload.deckTitle as string) || item.title,
          description: (payload.description as string) || "",
        }).returning();
        const cards = (payload.cards as Array<Record<string, unknown>>) || [];
        if (cards.length > 0) {
          await db.insert(adultOnlyCardsTable).values(
            cards.map((c, i) => ({
              deckId: deck!.id,
              title: (c.title as string) || `Carta ${i + 1}`,
              body: (c.body as string) || "",
              category: (c.category as string) || "domande-piccanti-leggere",
              level: (c.level as string) || "soft",
              points: Number(c.points) || 100,
              timeLimit: Number(c.timeLimit) || 30,
              orderIndex: i,
            }))
          );
        }
        targetEntityId = deck!.id;
        break;
      }

      case "parola-alle-spalle": {
        const [set] = await db.insert(wordBackSetsTable).values({
          tenantId: user.tenantId ?? undefined,
          title: (payload.setTitle as string) || item.title,
          description: (payload.description as string) || "",
          language: "it",
        }).returning();
        const cards = (payload.cards as Array<Record<string, unknown>>) || [];
        if (cards.length > 0) {
          await db.insert(wordBackCardsTable).values(
            cards.map((c, i) => ({
              setId: set!.id,
              word: (c.word as string) || `parola ${i + 1}`,
              hint: (c.hint as string) || undefined,
              category: (c.category as string) || "oggetti",
              difficulty: (c.difficulty as string) || "medium",
              points: Number(c.points) || 150,
              timeLimit: Number(c.timeLimit) || 45,
              orderIndex: i,
            }))
          );
        }
        targetEntityId = set!.id;
        break;
      }

      case "karaoke-battle": {
        const [set] = await db.insert(karaokeSetsTable).values({
          tenantId: user.tenantId ?? undefined,
          title: (payload.setTitle as string) || item.title,
          description: (payload.description as string) || "",
          language: "it",
        }).returning();
        const tracks = (payload.tracks as Array<Record<string, unknown>>) || [];
        if (tracks.length > 0) {
          await db.insert(karaokeTracksTable).values(
            tracks.map((t, i) => ({
              setId: set!.id,
              title: (t.title as string) || `Canzone ${i + 1}`,
              artist: (t.artist as string) || "Artista",
              lyricSnippet: (t.lyricSnippet as string) || "",
              category: (t.category as string) || "pop",
              difficulty: (t.difficulty as string) || "medium",
              points: Number(t.points) || 150,
              durationSeconds: Number(t.durationSeconds) || 60,
              orderIndex: i,
            }))
          );
        }
        targetEntityId = set!.id;
        break;
      }

      case "freestyle-battle": {
        const [set] = await db.insert(freestyleSetsTable).values({
          tenantId: user.tenantId ?? undefined,
          title: (payload.setTitle as string) || item.title,
          description: (payload.description as string) || "",
          language: "it",
        }).returning();
        const words = (payload.words as string[]) || [];
        if (words.length > 0) {
          await db.insert(freestyleWordsTable).values(
            words.map((w, i) => ({
              setId: set!.id,
              word: w || `parola ${i + 1}`,
              orderIndex: i,
            }))
          );
        }
        targetEntityId = set!.id;
        break;
      }

      case "sara-musica": {
        const [set] = await db.insert(saraMusicaSetsTable).values({
          tenantId: user.tenantId ?? undefined,
          title: (payload.setTitle as string) || item.title,
          description: (payload.description as string) || "",
        }).returning();
        const tracks = (payload.tracks as Array<Record<string, unknown>>) || [];
        if (tracks.length > 0) {
          await db.insert(saraMusicaTracksTable).values(
            tracks.map((t, i) => ({
              setId: set!.id,
              title: (t.title as string) || `Canzone ${i + 1}`,
              artist: (t.artist as string) || "Artista",
              challengeType: (["indovina", "canta", "rumore"].includes(t.challengeType as string) ? t.challengeType as string : "indovina"),
              snippetHint: (t.snippetHint as string) || "",
              durationSeconds: Number(t.durationSeconds) || 30,
              points: Number(t.points) || 100,
              orderIndex: i,
            }))
          );
        }
        targetEntityId = set!.id;
        break;
      }

      case "gioco-delle-coppie": {
        // No automatic import for coppie — images must be uploaded manually
        res.json({ message: "Gioco delle Coppie richiede upload manuale delle immagini. Usa Admin → Deck di carte per creare il set.", item });
        return;
      }

      default:
        res.status(400).json({ error: `Import non supportato per ${item.gameSlug}` });
        return;
    }

    // Mark item as imported
    const [updated] = await db.update(jonnyGeneratedItemsTable)
      .set({ status: "imported", targetEntityId })
      .where(eq(jonnyGeneratedItemsTable.id, itemId))
      .returning();

    res.json({ message: "Importato con successo", item: updated, targetEntityId });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Import fallito", detail: errMsg });
  }
});

// Delete a generation
router.delete("/jonny/generations/:id", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  await db.delete(jonnyGenerationsTable).where(eq(jonnyGenerationsTable.id, id));
  res.status(204).end();
});

export default router;
