/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import { randomBytes, timingSafeEqual } from "node:crypto";
import { pool } from "@workspace/db";

/**
 * ideax, il motore di casa: gira sul PC di Andrea con la scheda video (immagini, video, musica, voce) e costa zero
 * a chiamata, ma da internet non si raggiunge. È ideax che passa da IDEAgame a chiedere «c'è qualcosa per me?»
 * (protocollo: docs/ponte-ideax.md nel repository di ideax, lo stesso di IDEAlab, Jarvis, Bill e IDEAeventi).
 *
 * Qui c'è la coda: chi ha bisogno di ideax mette un lavoro e aspetta che torni fatto. Tutto passa dal database,
 * così funziona anche con più copie del server. Se ideax non si fa vedere da 90 secondi è spento e chi chiede
 * usa il suo fornitore di sempre (OpenAI per le immagini). Chiave: IDEAX_KEY (Secrets di IDEAgame), la stessa
 * incollata in ideax → Collega app.
 */

export type TipoIdeax = "chat" | "json" | "genera" | "musica" | "voce" | "reel" | "scontorna" | "trascrivi";
export type Contatto = { visto: string; capacita: string[]; versione: string | null };

const SPENTO_DOPO_MS = 90_000;
let pronto: Promise<void> | null = null;

function tabelle(): Promise<void> {
  pronto ??= pool.query(`
    create table if not exists ideax_lavori (
      id text primary key, tipo text not null, dati jsonb, stato text not null default 'attesa',
      risultato jsonb, errore text, secondi integer, rif text,
      creato_il timestamptz not null default now(), preso_il timestamptz, finito_il timestamptz);
    create table if not exists ideax_contatto (id integer primary key, valore jsonb not null, aggiornato_il timestamptz not null default now());
  `).then(() => undefined).catch((err) => { pronto = null; throw err; });
  return pronto;
}

export function chiaveIdeax(data: string | undefined): boolean {
  const attesa = process.env.IDEAX_KEY;
  if (!attesa || !data) return false;
  const a = Buffer.from(attesa), b = Buffer.from(data);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function segnaContatto(capacita: string[], versione: string | null): Promise<void> {
  await tabelle();
  const c: Contatto = { visto: new Date().toISOString(), capacita, versione };
  await pool.query("insert into ideax_contatto (id, valore) values (1, $1) on conflict (id) do update set valore = $1, aggiornato_il = now()", [JSON.stringify(c)]);
}

export async function statoIdeax(): Promise<{ acceso: boolean; contatto: Contatto | null; chiave: boolean }> {
  await tabelle();
  const r = await pool.query("select valore from ideax_contatto where id = 1");
  const c: Contatto | null = r.rows[0]?.valore ?? null;
  return { acceso: !!c && Date.now() - Date.parse(c.visto) < SPENTO_DOPO_MS, contatto: c, chiave: !!process.env.IDEAX_KEY };
}

export async function ideaxSa(tipo: TipoIdeax): Promise<boolean> {
  if (!process.env.IDEAX_KEY) return false;
  try {
    const s = await statoIdeax();
    return s.acceso && !!s.contatto?.capacita.includes(tipo);
  } catch {
    return false;
  }
}

/** ideax prende i lavori che sa fare, i più vecchi per primi. Un lavoro preso e mai riportato in 45 minuti si dà per perso. */
export async function prendiLavori(capacita: string[], quanti = 1) {
  await tabelle();
  await pool.query("update ideax_lavori set stato = 'errore', errore = 'ideax non l''ha riportato', finito_il = now() where stato = 'preso' and preso_il < now() - interval '45 minutes'");
  if (!capacita.length) return [];
  const r = await pool.query(`update ideax_lavori set stato = 'preso', preso_il = now()
    where id in (select id from ideax_lavori where stato = 'attesa' and tipo = any($1) order by creato_il limit $2 for update skip locked)
    returning id, tipo, dati`, [capacita, quanti]);
  return r.rows;
}

export async function consegna(id: string, corpo: { ok?: boolean; risultato?: unknown; errore?: string; secondi?: number }): Promise<boolean> {
  await tabelle();
  const r = await pool.query(`update ideax_lavori set stato = $2, risultato = $3, errore = $4, secondi = $5, finito_il = now()
    where id = $1 and stato in ('preso','attesa') returning id`,
    [id, corpo.ok ? "fatto" : "errore", corpo.ok ? JSON.stringify(corpo.risultato ?? null) : null,
      corpo.ok ? null : String(corpo.errore ?? "errore").slice(0, 500), Number.isFinite(corpo.secondi) ? Math.round(corpo.secondi!) : null]);
  return (r.rowCount ?? 0) > 0;
}

const dorme = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** Metti un lavoro e aspetta il risultato. Se ideax non lo prende entro 90 s o non lo finisce entro `attesaMs`, scade e chi chiede usa la sua riserva. */
export async function chiediIdeax<T = unknown>(tipo: TipoIdeax, dati: unknown, o: { attesaMs?: number; rif?: string } = {}): Promise<T> {
  await tabelle();
  const id = randomBytes(12).toString("hex");
  await pool.query("insert into ideax_lavori (id, tipo, dati, rif) values ($1,$2,$3,$4)", [id, tipo, JSON.stringify(dati), o.rif ?? null]);
  const inizio = Date.now(), limite = inizio + (o.attesaMs ?? 4 * 60_000);
  try {
    for (;;) {
      const r = (await pool.query("select stato, risultato, errore from ideax_lavori where id = $1", [id])).rows[0];
      if (r?.stato === "fatto") return r.risultato as T;
      if (r?.stato === "errore") throw new Error(`ideax: ${r.errore ?? "lavoro non riuscito"}`);
      if (r?.stato === "attesa" && Date.now() - inizio > 90_000) throw new Error("ideax non ha preso il lavoro: è spento o occupato?");
      if (Date.now() > limite) throw new Error("ideax ci sta mettendo troppo.");
      await dorme(1500);
    }
  } catch (e) {
    await pool.query("update ideax_lavori set stato = 'scaduto', finito_il = now() where id = $1 and stato in ('attesa','preso')", [id]).catch(() => {});
    throw e;
  }
}

/** Un'immagine da ideax (base64 PNG/JPEG) oppure null: chi chiama passa al suo fornitore di sempre (OpenAI).
 *  STRATEGIA C: ideax è usato SOLO per preparare contenuti a casa (PC acceso). Durante gli eventi live
 *  resta spento e si va diretti su OpenAI, così non si rischia mai il blocco da 90s sul maxi-schermo.
 *  Per riaccenderlo in fase di preparazione: Secret `IDEAX_ABILITATO=1` (e il PC con ideax acceso). */
export async function immagineDaIdeax(prompt: string, aspetto: "1:1" | "9:16" | "16:9" | "4:5"): Promise<string | null> {
  if (process.env.IDEAX_ABILITATO !== "1") return null; // default spento: eventi live su OpenAI
  if (!(await ideaxSa("genera"))) return null;
  try {
    const r = await chiediIdeax<{ risultati?: { tipo: string; base64: string }[] }>("genera", { prompt, task: "image_generate", params: { aspect: aspetto } }, { attesaMs: 150_000 });
    return r?.risultati?.find((x) => x.tipo?.startsWith("image/"))?.base64 ?? null;
  } catch {
    return null;
  }
}
