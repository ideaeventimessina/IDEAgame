import { Router, type IRouter, type Response } from "express";
import { db, translationsTable } from "@workspace/db";
import {
  ListTranslationsResponse, UpsertTranslationBody, UpsertTranslationResponse,
} from "@workspace/api-zod";
import { type AuthedRequest, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/translations", async (_req, res): Promise<void> => {
  const rows = await db.select().from(translationsTable);
  res.json(ListTranslationsResponse.parse(rows));
});

router.put("/translations", requireRole("super_admin", "tenant_owner", "game_manager"), async (req: AuthedRequest, res: Response): Promise<void> => {
  const parsed = UpsertTranslationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(translationsTable)
    .values(parsed.data)
    .onConflictDoUpdate({
      target: [translationsTable.key, translationsTable.locale],
      set: { value: parsed.data.value },
    })
    .returning();
  res.json(UpsertTranslationResponse.parse(row));
});

export default router;
