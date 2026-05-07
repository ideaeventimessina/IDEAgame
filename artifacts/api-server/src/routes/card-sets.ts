import { Router, type IRouter, type Response } from "express";
import { eq, or, isNull } from "drizzle-orm";
import { db, cardSetsTable, cardsTable } from "@workspace/db";
import { ListCardSetsResponse, CreateCardSetBody, ListCardsResponse, CreateCardBody } from "@workspace/api-zod";
import { type AuthedRequest, requireAuth } from "../middlewares/auth";
import { audit } from "../lib/audit";

const router: IRouter = Router();

router.get("/card-sets", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const me = req.user!;
  const rows = me.role === "super_admin"
    ? await db.select().from(cardSetsTable)
    : await db.select().from(cardSetsTable).where(or(eq(cardSetsTable.tenantId, me.tenantId!), isNull(cardSetsTable.tenantId)));
  res.json(ListCardSetsResponse.parse(rows));
});

router.post("/card-sets", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const parsed = CreateCardSetBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const me = req.user!;
  const [s] = await db.insert(cardSetsTable).values({
    tenantId: me.role === "super_admin" ? null : me.tenantId,
    slug: parsed.data.slug,
    name: parsed.data.name,
    description: parsed.data.description ?? "",
    adultOnly: parsed.data.adultOnly ?? "false",
  }).returning();
  await audit(req, "card_set.create", "card_set", s!.id, { slug: s!.slug });
  res.status(201).json(s);
});

router.delete("/card-sets/:id", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const id = String(req.params["id"]);
  const [s] = await db.select().from(cardSetsTable).where(eq(cardSetsTable.id, id));
  if (!s) { res.status(404).json({ error: "Not found" }); return; }
  if (req.user!.role !== "super_admin" && s.tenantId !== req.user!.tenantId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  await db.delete(cardSetsTable).where(eq(cardSetsTable.id, id));
  await audit(req, "card_set.delete", "card_set", id);
  res.sendStatus(204);
});

router.get("/card-sets/:id/cards", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const id = String(req.params["id"]);
  const rows = await db.select().from(cardsTable).where(eq(cardsTable.cardSetId, id));
  res.json(ListCardsResponse.parse(rows));
});

router.post("/card-sets/:id/cards", requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const id = String(req.params["id"]);
  const parsed = CreateCardBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [s] = await db.select().from(cardSetsTable).where(eq(cardSetsTable.id, id));
  if (!s) { res.status(404).json({ error: "Not found" }); return; }
  if (req.user!.role !== "super_admin" && s.tenantId && s.tenantId !== req.user!.tenantId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const [c] = await db.insert(cardsTable).values({
    cardSetId: id,
    kind: parsed.data.kind,
    prompts: parsed.data.prompts,
  }).returning();
  res.status(201).json(c);
});

export default router;
