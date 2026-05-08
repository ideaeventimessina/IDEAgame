import { Router, type IRouter, type Response } from "express";
import { eq, or, isNull } from "drizzle-orm";
import { db, quizPacksTable } from "@workspace/db";
import type { QuizRound } from "@workspace/db";
import { type AuthedRequest, requireAuth, requireRole } from "../middlewares/auth";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (s: string) => UUID_RE.test(s);

/* ─── GET /quiz-packs ─────────────────────────────────────────────────── */
router.get("/quiz-packs", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const me = req.user!;
  const rows = me.role === "super_admin"
    ? await db.select().from(quizPacksTable)
    : await db.select().from(quizPacksTable).where(
        or(isNull(quizPacksTable.tenantId), eq(quizPacksTable.tenantId, me.tenantId!))
      );
  // Strip generatedJson from list to keep payload light
  const light = rows.map(r => ({ ...r, generatedJson: undefined }));
  res.json(light);
});

/* ─── GET /quiz-packs/:id ─────────────────────────────────────────────── */
router.get("/quiz-packs/:id", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const id = String(req.params["id"]);
  if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const [row] = await db.select().from(quizPacksTable).where(eq(quizPacksTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const me = req.user!;
  if (me.role !== "super_admin" && row.tenantId && row.tenantId !== me.tenantId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  res.json(row);
});

/* ─── POST /quiz-packs/generate ────────────────────────────────────────── */
router.post(
  "/quiz-packs/generate",
  requireRole("super_admin", "tenant_owner", "game_manager"),
  async (req: AuthedRequest, res: Response): Promise<void> => {
    const body = req.body as Record<string, unknown>;
    const themePrompt  = String(body["themePrompt"]  ?? "").trim();
    const targetAudience = String(body["targetAudience"] ?? "adulti").trim();
    const tone         = String(body["tone"]         ?? "divertente").trim();
    const difficulty   = String(body["difficulty"]   ?? "medium").trim();
    const language     = String(body["language"]     ?? "it").trim();
    const totalRounds  = Math.min(Math.max(Number(body["totalRounds"]  ?? 20), 5), 40);
    const useMediaLibrary = body["useMediaLibrary"] === true || body["useMediaLibrary"] === "true";
    const eventId      = typeof body["eventId"] === "string" ? body["eventId"] : null;

    if (!themePrompt) { res.status(400).json({ error: "themePrompt obbligatorio" }); return; }

    const me = req.user!;
    const title = `${themePrompt} — ${language.toUpperCase()}`;

    // Insert with status=generating
    const [pack] = await db.insert(quizPacksTable).values({
      tenantId: me.role === "super_admin" ? null : me.tenantId,
      eventId: eventId && isUUID(eventId) ? eventId : null,
      title,
      themePrompt,
      language,
      difficulty,
      targetAudience,
      tone,
      totalRounds,
      useMediaLibrary: useMediaLibrary ? "true" : "false",
      status: "generating",
    }).returning();
    if (!pack) { res.status(500).json({ error: "Errore creazione pack" }); return; }

    const langLabel: Record<string, string> = { it: "italiano", en: "inglese", es: "spagnolo", fr: "francese", de: "tedesco" };
    const diffLabel: Record<string, string> = { easy: "facile", medium: "medio", hard: "difficile" };

    const ROUND_TYPES = ["multiple_choice", "true_false", "image_compare", "guess_who", "fast_answer", "bonus_final"];
    const ROUND_TYPE_NOTES = `
- multiple_choice: 4 risposte, 1 corretta
- true_false: 2 risposte (Vero/Falso), 1 corretta  
- image_compare: descrivi 2 immagini/situazioni, chiedi quale è corretta
- guess_who: descrivi un personaggio/elemento senza nominarlo, chi è?
- fast_answer: domanda veloce senza opzioni (risposte: ["Risposta libera"])
- bonus_final: domanda finale da ${Math.round(totalRounds * 0.15)} punti extra
`;

    const systemPrompt = `Sei un generatore professionale di quiz per eventi live italiani. Sei specializzato in ${tone === "divertente" ? "quiz divertenti e coinvolgenti" : tone === "educativo" ? "quiz educativi" : tone === "nostalgico" ? "quiz nostalgici con riferimenti culturali" : "quiz competitivi"}.

Generi esattamente ${totalRounds} domande sul tema specificato in ${langLabel[language] ?? language}.
Target: ${targetAudience}. Difficoltà: ${diffLabel[difficulty] ?? difficulty}.

Regole:
1. NON usare contenuti volgari, offensivi o inadatti al target
2. Se il tema è protetto da copyright, usa domande culturali/descrittive senza riprodurre testi protetti
3. Varia i tipi di domanda. NON mettere mai due tipi identici consecutivi se puoi evitarlo
4. Distribuisci la difficoltà: le prime domande più facili, le ultime più difficili
5. L'ULTIMA domanda DEVE essere di tipo "bonus_final" con punti alti
6. Ogni correctAnswer è un indice 0-based nell'array answers
7. Per fast_answer usa answers: ["Risposta libera"] e correctAnswer: 0
8. optionalMediaIds: array vuoto (non generare immagini)
9. La spiegazione deve essere breve, massimo 30 parole

Tipi disponibili:${ROUND_TYPE_NOTES}`;

    const userPrompt = `Tema: "${themePrompt}"
Target: ${targetAudience}
Tono: ${tone}
Lingua: ${langLabel[language] ?? language}
Numero domande: ${totalRounds}

Genera un quiz con ${totalRounds} round esattamente. Rispondi SOLO con un array JSON valido (niente testo prima o dopo), dove ogni elemento ha questi campi:
{
  "orderIndex": 0,
  "type": "multiple_choice",
  "questionText": "testo della domanda",
  "answers": ["A", "B", "C", "D"],
  "correctAnswer": 0,
  "explanation": "spiegazione breve",
  "difficulty": "easy",
  "points": 100,
  "timeLimit": 30,
  "optionalMediaIds": []
}

Punti suggeriti: easy=100, medium=200, hard=300, bonus_final=500
timeLimit suggerito: true_false=15, fast_answer=10, multiple_choice=30, guess_who=45, image_compare=30, bonus_final=60`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        max_completion_tokens: 8192,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const raw = completion.choices[0]?.message?.content ?? "[]";
      // Extract JSON array from response (strip any markdown)
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("Risposta AI non contiene JSON array valido");

      let rounds: QuizRound[] = JSON.parse(jsonMatch[0]) as QuizRound[];

      // Validate and sanitize rounds
      rounds = rounds.slice(0, totalRounds).map((r, i) => ({
        orderIndex: i,
        type: ROUND_TYPES.includes(r.type) ? r.type : "multiple_choice",
        questionText: String(r.questionText ?? "").slice(0, 500),
        answers: Array.isArray(r.answers) ? r.answers.map(a => String(a).slice(0, 200)) : ["A", "B", "C", "D"],
        correctAnswer: typeof r.correctAnswer === "number" ? r.correctAnswer : 0,
        explanation: String(r.explanation ?? "").slice(0, 300),
        difficulty: ["easy", "medium", "hard"].includes(String(r.difficulty)) ? r.difficulty : difficulty,
        points: typeof r.points === "number" ? r.points : (i === totalRounds - 1 ? 500 : 100),
        timeLimit: typeof r.timeLimit === "number" ? Math.min(r.timeLimit, 120) : 30,
        optionalMediaIds: [],
      })) as QuizRound[];

      // ─── Smart shuffle ─────────────────────────────────────────────
      // 1. Pull out bonus_final candidates (keep at most one for the end)
      const bonusRounds = rounds.filter(r => r.type === "bonus_final");
      const mainRounds  = rounds.filter(r => r.type !== "bonus_final");

      // 2. Stable-sort by difficulty: easy → medium → hard
      const diffOrder: Record<string, number> = { easy: 0, medium: 1, hard: 2 };
      mainRounds.sort((a, b) => (diffOrder[a.difficulty] ?? 1) - (diffOrder[b.difficulty] ?? 1));

      // 3. Interleave so no two consecutive rounds share the same type
      function interleaveByType(arr: QuizRound[]): QuizRound[] {
        const out: QuizRound[] = [];
        const pool = [...arr];
        while (pool.length) {
          const lastType = out.at(-1)?.type;
          // prefer a round with a different type than the previous
          const idx = pool.findIndex(r => r.type !== lastType);
          const chosen = idx >= 0 ? pool.splice(idx, 1)[0]! : pool.splice(0, 1)[0]!;
          out.push(chosen);
        }
        return out;
      }

      const shuffled = interleaveByType(mainRounds);

      // 4. Append the bonus_final (ensure exactly one, with high points)
      const finalRound: QuizRound = bonusRounds.length > 0
        ? { ...bonusRounds[0]!, type: "bonus_final", points: Math.max(bonusRounds[0]!.points, 500) }
        : shuffled.length > 0
          ? { ...shuffled.at(-1)!, type: "bonus_final", points: 500, timeLimit: 60 }
          : { orderIndex: 0, type: "bonus_final", questionText: "Domanda bonus finale", answers: ["Risposta libera"], correctAnswer: 0, explanation: "", difficulty: "hard", points: 500, timeLimit: 60, optionalMediaIds: [] };

      // Remove the last shuffled element if it was reused as bonus_final
      const body = bonusRounds.length > 0 ? shuffled : shuffled.slice(0, -1);
      rounds = [...body, finalRound].map((r, i) => ({ ...r, orderIndex: i }));

      const [updated] = await db
        .update(quizPacksTable)
        .set({ status: "generated", generatedJson: rounds, updatedAt: new Date() })
        .where(eq(quizPacksTable.id, pack.id))
        .returning();

      res.status(201).json(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      await db.update(quizPacksTable).set({ status: "failed", errorMessage: msg }).where(eq(quizPacksTable.id, pack.id));
      res.status(500).json({ error: `Generazione fallita: ${msg}`, packId: pack.id });
    }
  }
);

/* ─── PATCH /quiz-packs/:id ───────────────────────────────────────────── */
router.patch(
  "/quiz-packs/:id",
  requireRole("super_admin", "tenant_owner", "game_manager"),
  async (req: AuthedRequest, res: Response): Promise<void> => {
    const id = String(req.params["id"]);
    if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
    const [row] = await db.select().from(quizPacksTable).where(eq(quizPacksTable.id, id));
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    const me = req.user!;
    if (me.role !== "super_admin" && row.tenantId && row.tenantId !== me.tenantId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const body = req.body as Record<string, unknown>;
    const allowed: Record<string, unknown> = {};
    if (typeof body["title"] === "string") allowed["title"] = body["title"];
    if (typeof body["status"] === "string" && ["draft","generated","approved","failed"].includes(body["status"] as string)) {
      allowed["status"] = body["status"];
    }
    if (Array.isArray(body["generatedJson"])) allowed["generatedJson"] = body["generatedJson"];

    const [updated] = await db.update(quizPacksTable)
      .set({ ...allowed, updatedAt: new Date() })
      .where(eq(quizPacksTable.id, id))
      .returning();
    res.json(updated);
  }
);

/* ─── PATCH /quiz-packs/:id/rounds/:index ─────────────────────────────── */
router.patch(
  "/quiz-packs/:id/rounds/:index",
  requireRole("super_admin", "tenant_owner", "game_manager"),
  async (req: AuthedRequest, res: Response): Promise<void> => {
    const id = String(req.params["id"]);
    const idx = Number(req.params["index"]);
    if (!isUUID(id) || isNaN(idx)) { res.status(400).json({ error: "parametri non validi" }); return; }

    const [row] = await db.select().from(quizPacksTable).where(eq(quizPacksTable.id, id));
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    const me = req.user!;
    if (me.role !== "super_admin" && row.tenantId && row.tenantId !== me.tenantId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const rounds = (row.generatedJson as QuizRound[] | null) ?? [];
    if (idx < 0 || idx >= rounds.length) { res.status(400).json({ error: "indice round non valido" }); return; }

    const body = req.body as Partial<QuizRound>;
    rounds[idx] = { ...rounds[idx]!, ...body, orderIndex: idx };

    const [updated] = await db.update(quizPacksTable)
      .set({ generatedJson: rounds, updatedAt: new Date() })
      .where(eq(quizPacksTable.id, id))
      .returning();
    res.json(updated);
  }
);

/* ─── DELETE /quiz-packs/:id ──────────────────────────────────────────── */
router.delete(
  "/quiz-packs/:id",
  requireRole("super_admin", "tenant_owner", "game_manager"),
  async (req: AuthedRequest, res): Promise<void> => {
    const id = String(req.params["id"]);
    if (!isUUID(id)) { res.status(400).json({ error: "id non valido" }); return; }
    const [row] = await db.select().from(quizPacksTable).where(eq(quizPacksTable.id, id));
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    const me = req.user!;
    if (me.role !== "super_admin" && row.tenantId && row.tenantId !== me.tenantId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    await db.delete(quizPacksTable).where(eq(quizPacksTable.id, id));
    res.sendStatus(204);
  }
);

export default router;
