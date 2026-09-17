/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * IL PONTE CON IL GESTIONALE IDEAEVENTI — 7/9/2026.
 *
 * Andrea, davanti alla prima versione: «come farai apparire a schermo le
 * funzioni di IDEAgame che atterra direttamente sulla pagina del gioco con i
 * giocatori già loggati, partendo solo dall'URL? senza nessuna lettura di
 * api, mi prendi per il culo?». Aveva ragione: un iframe su un indirizzo nudo
 * atterra sulla home, senza partita e senza nessuno dentro.
 *
 * COSA FA QUESTA ROTTA. Durante un preventivo, quando la regia decide di far
 * provare il gioco alla famiglia, il gestionale chiama qui: nasce una partita
 * VERA, intestata alla festa ("18° di Marta", "Marta e Luca"), già LIVE, e
 * torna il codice. Da quel codice i telefoni che sono già in sala — di cui
 * sappiamo il nome, perché l'hanno scritto entrando — atterrano su
 * /join/<codice>?nome=<il loro> e sono dentro, senza digitare niente.
 *
 * PERCHE' NON SI RIUSA POST /events: quella chiede requireAuth, cioè una
 * persona che ha fatto login con un browser. Qui chi chiama è un programma
 * dall'altro capo di internet. Chiave condivisa, una rotta, una cosa sola.
 *
 * LA PARTITA NASCE GIA' LIVE perché i giocatori possono entrare solo in una
 * partita live (vedi routes/players.ts): crearla "draft" vorrebbe dire far
 * atterrare venti telefoni su un errore.
 *
 * NON NE APRE DUE PER LA STESSA FESTA: richiamata con lo stesso riferimento
 * torna quella che c'è già. Due partite per la stessa serata vuol dire metà
 * famiglia in una e metà nell'altra.
 */

import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { db, eventsTable, tenantsTable } from "@workspace/db";

const router: IRouter = Router();

const CHIAVE = (process.env["PONTE_IDEAEVENTI_KEY"] ?? "").trim();
const TENANT_SLUG = (process.env["PONTE_IDEAEVENTI_TENANT"] ?? "").trim();

/* Confronto della chiave a TEMPO COSTANTE: non fa trapelare, dai tempi di
 * risposta, quanti caratteri iniziali combaciano. Lunghezze diverse = diverso
 * (timingSafeEqual pretende buffer di pari lunghezza). */
function chiaveCombacia(fornita: string): boolean {
  const a = Buffer.from(fornita);
  const b = Buffer.from(CHIAVE);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function codiceNuovo(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

router.post("/ponte/ideaeventi/partita", async (req, res): Promise<void> => {
  if (!CHIAVE) {
    res.status(503).json({ error: "Ponte non configurato: manca PONTE_IDEAEVENTI_KEY." });
    return;
  }
  if (!chiaveCombacia(String(req.headers["x-ponte-key"] ?? ""))) {
    res.status(401).json({ error: "Chiave non valida." });
    return;
  }

  const corpo = (req.body ?? {}) as Record<string, unknown>;
  const festa = String(corpo["festa"] ?? "").trim();
  const riferimento = String(corpo["riferimento"] ?? "").trim();   // "preventivo-410"
  const attesi = Number(corpo["attesi"]) || 20;
  if (!festa || !riferimento) {
    res.status(400).json({ error: "Servono il nome della festa e un riferimento." });
    return;
  }

  try {
    /* Già aperta per questa festa? Si riusa. Il riferimento sta nel campo
     * `venue`, che è testo libero e non serve ad altro in questo caso: non
     * aggiungo una colonna a un database vivo per un legame che è una riga. */
    const [gia] = await db
      .select()
      .from(eventsTable)
      .where(and(eq(eventsTable.venue, riferimento), eq(eventsTable.status, "live")))
      .limit(1);
    if (gia) {
      res.json({ eventoId: gia.id, codice: gia.joinCode, festa: gia.name, giaCera: true });
      return;
    }

    const [tenant] = TENANT_SLUG
      ? await db.select().from(tenantsTable).where(eq(tenantsTable.slug, TENANT_SLUG)).limit(1)
      : await db.select().from(tenantsTable).where(eq(tenantsTable.status, "active")).limit(1);
    if (!tenant) {
      res.status(503).json({ error: "Nessun tenant a cui intestare la partita." });
      return;
    }

    /* Il codice è unico nel database: se per caso capita uguale, si ritenta.
     * Sei giri bastano: la probabilità di sbagliarne sei di fila è nulla. */
    let evento: typeof eventsTable.$inferSelect | null = null;
    for (let giro = 0; giro < 6 && !evento; giro++) {
      try {
        const [riga] = await db
          .insert(eventsTable)
          .values({
            tenantId: tenant.id,
            name: festa.slice(0, 120),
            venue: riferimento.slice(0, 120),
            startsAt: new Date(),
            expectedPlayers: Math.min(Math.max(attesi, 2), 200),
            status: "live",
            joinCode: codiceNuovo(),
            /* SOLO I GIOCHI SENZA AI — 15/9/2026, Andrea: «fargli provare
               direttamente un gioco … bloccando le funzioni ia e quindi i giochi
               che funzionano solo con quella». Senza questo elenco l'Hub mostrava
               tutti e otto, Quizzone e SaraMusica compresi, e l'Adult Only
               davanti a una famiglia in showroom. */
            enabledGames: ["percorso-a-risate", "gioco-delle-coppie", "sfida-di-ballo", "parola-alle-spalle", "karaoke-battle"],
          })
          .returning();
        evento = riga!;
      } catch (e: unknown) {
        if ((e as { code?: string } | null)?.code !== "23505") throw e;
      }
    }
    if (!evento) {
      res.status(500).json({ error: "Non sono riuscito ad allocare un codice." });
      return;
    }

    res.status(201).json({ eventoId: evento.id, codice: evento.joinCode, festa: evento.name, giaCera: false });
  } catch (err) {
    console.error("[ponte ideaeventi]", err);
    res.status(500).json({ error: "Errore nel creare la partita." });
  }
});

/** Chiudere la partita quando la regia torna alla presentazione: una partita
 *  live dimenticata resta a raccogliere telefoni di gente che non gioca. */
router.post("/ponte/ideaeventi/partita/chiudi", async (req, res): Promise<void> => {
  if (!CHIAVE) {
    res.status(503).json({ error: "Ponte non configurato: manca PONTE_IDEAEVENTI_KEY." });
    return;
  }
  if (!chiaveCombacia(String(req.headers["x-ponte-key"] ?? ""))) {
    res.status(401).json({ error: "Chiave non valida." });
    return;
  }
  const riferimento = String((req.body as Record<string, unknown>)?.["riferimento"] ?? "").trim();
  if (!riferimento) {
    res.status(400).json({ error: "Serve il riferimento." });
    return;
  }
  await db
    .update(eventsTable)
    .set({ status: "ended" })
    .where(and(eq(eventsTable.venue, riferimento), eq(eventsTable.status, "live")));
  res.json({ ok: true });
});

export default router;
