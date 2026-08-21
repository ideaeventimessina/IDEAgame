/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Cache immagini condivisa ────────────────────────────────────────────────
   Riutilizza le immagini già cercate su Wikipedia (e in futuro generate) così da
   non ripetere ricerche/generazioni: risparmia tempo e soldi. Poggia sulla
   tabella esistente game_media_slots (gameSlug "_imgcache"), nessuna migrazione.
   - value = URL trovata  → cache HIT
   - value = "MISS"       → soggetto senza foto su Wikipedia (non riprovare)
   - assente              → mai cercato
   Gli errori di rete NON vengono memorizzati (così un guasto temporaneo riprova).
──────────────────────────────────────────────────────────────────────────── */

import { db, gameMediaSlotsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const CACHE_SLUG = "_imgcache";
const MISS = "MISS";

function normKey(kind: string, subject: string): string {
  return `${kind}:${subject.trim().toLowerCase()}`.slice(0, 220);
}

/** undefined = mai in cache · null = MISS memorizzato · string = URL memorizzata */
async function readCache(slotKey: string): Promise<string | null | undefined> {
  try {
    const [row] = await db.select().from(gameMediaSlotsTable)
      .where(and(eq(gameMediaSlotsTable.gameSlug, CACHE_SLUG), eq(gameMediaSlotsTable.slotKey, slotKey)))
      .limit(1);
    if (!row) return undefined;
    return row.value && row.value !== MISS ? row.value : null;
  } catch { return undefined; }
}

async function writeCache(slotKey: string, url: string | null, label: string): Promise<void> {
  try {
    if ((await readCache(slotKey)) !== undefined) return; // già presente
    await db.insert(gameMediaSlotsTable).values({
      gameSlug: CACHE_SLUG, slotKey, value: url ?? MISS, valueType: "image", label: label.slice(0, 120),
    });
  } catch { /* best-effort: un duplicato non è un problema */ }
}

type WikiResult = { kind: "hit"; url: string } | { kind: "miss" } | { kind: "error" };

async function wikipediaThumb(subject: string): Promise<WikiResult> {
  let sawResponse = false;
  for (const lang of ["it", "en"]) {
    try {
      const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(subject.trim())}`,
        { headers: { accept: "application/json" } });
      if (r.status === 404) { sawResponse = true; continue; }
      if (!r.ok) continue;
      sawResponse = true;
      const d = await r.json() as { thumbnail?: { source?: string }; originalimage?: { source?: string } };
      const url = d.thumbnail?.source ?? d.originalimage?.source;
      if (url) return { kind: "hit", url };
    } catch { /* rete: prova la lingua successiva */ }
  }
  return sawResponse ? { kind: "miss" } : { kind: "error" };
}

/** Immagine Wikipedia per un soggetto, con cache. null se non esiste. */
export async function cachedWikiImage(subject: string): Promise<string | null> {
  if (!subject?.trim()) return null;
  const key = normKey("wiki", subject);
  const cached = await readCache(key);
  if (cached !== undefined) return cached; // HIT o MISS memorizzato
  const res = await wikipediaThumb(subject);
  if (res.kind === "hit")  { await writeCache(key, res.url, subject); return res.url; }
  if (res.kind === "miss") { await writeCache(key, null, subject); return null; }
  return null; // errore di rete: non memorizzare, si riproverà
}
