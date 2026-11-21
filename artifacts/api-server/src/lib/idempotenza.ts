/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Idempotenza delle scritture dei ponti — parte pura ───────────────────────
   Contratto Jarvis v1: «la stessa `idempotenza` ripetuta non deve rifare
   l'operazione (restituisce l'esito della prima)».

   Come funziona:
     1. si PRENOTA la chiave (INSERT … ON CONFLICT DO NOTHING): chi la prenota
        per primo esegue l'operazione;
     2. l'operazione salva il suo esito sulla stessa riga NELLA SUA transazione
        (giro e esito o ci sono tutti e due o nessuno dei due);
     3. chi arriva dopo con la stessa chiave riceve l'esito salvato; se la prima
        richiesta è ancora in corso riceve 409 "in corso" e riprova;
     4. se l'operazione fallisce senza salvare (errore 500, crash) la prenotazione
        si libera, e si libera anche se resta vuota oltre SCADENZA_PRENOTAZIONE_MS
        (la transazione del giro non è mai arrivata in fondo).
──────────────────────────────────────────────────────────────────────────── */

export const SCADENZA_PRENOTAZIONE_MS = 60_000;
export const IDEMPOTENZA_MAX = 200;

export type RigaIdempotenza = { status: number | null; esito: unknown; creatoIl: Date };

export interface ArchivioIdempotenza {
  /** true se la chiave era libera e ora è nostra. */
  prenota(chiave: string): Promise<boolean>;
  leggi(chiave: string): Promise<RigaIdempotenza | null>;
  /** Cancella la prenotazione. Con `soloVuotaPrimaDi`: solo se è ancora senza esito
   *  e più vecchia di quella data (così non si cancella quella appena rifatta da altri). */
  libera(chiave: string, soloVuotaPrimaDi?: Date): Promise<void>;
}

export type EsitoHttp = { status: number; body: unknown };

/** Valida il campo del corpo: assente = nessuna idempotenza; stringa 1–200. */
export function leggiIdempotenza(v: unknown): { ok: true; chiave: string | null } | { ok: false; error: string } {
  if (v === undefined || v === null) return { ok: true, chiave: null };
  if (typeof v !== "string") return { ok: false, error: "\"idempotenza\" deve essere una stringa." };
  const k = v.trim();
  if (!k) return { ok: true, chiave: null };
  if (k.length > IDEMPOTENZA_MAX) return { ok: false, error: `"idempotenza" troppo lunga (max ${IDEMPOTENZA_MAX}).` };
  return { ok: true, chiave: k };
}

export function statoRiga(r: RigaIdempotenza | null, adesso: Date): "libera" | "completata" | "in_corso" | "abbandonata" {
  if (!r) return "libera";
  if (r.status != null) return "completata";
  return adesso.getTime() - r.creatoIl.getTime() > SCADENZA_PRENOTAZIONE_MS ? "abbandonata" : "in_corso";
}

/**
 * Esegue `esegui` una volta sola per chiave. `esegui` deve salvare il proprio
 * esito sulla riga della chiave (nella sua transazione) e dire se l'ha fatto.
 */
export async function conIdempotenza(
  archivio: ArchivioIdempotenza,
  chiave: string,
  esegui: () => Promise<EsitoHttp & { registrato: boolean }>,
  adesso: () => Date = () => new Date(),
): Promise<EsitoHttp & { ripetuta: boolean }> {
  for (let giro = 0; giro < 2; giro++) {
    if (await archivio.prenota(chiave)) {
      let r: EsitoHttp & { registrato: boolean };
      try {
        r = await esegui();
      } catch (e) {
        await archivio.libera(chiave);
        throw e;
      }
      if (!r.registrato) await archivio.libera(chiave);
      return { status: r.status, body: r.body, ripetuta: false };
    }
    const riga = await archivio.leggi(chiave);
    const stato = statoRiga(riga, adesso());
    if (stato === "completata") return { status: riga!.status!, body: riga!.esito, ripetuta: true };
    if (stato === "in_corso") {
      return { status: 409, body: { error: "Una richiesta con la stessa idempotenza è ancora in corso: riprova tra poco." }, ripetuta: true };
    }
    // abbandonata (o sparita nel frattempo): si libera e si riprova a prenotare
    await archivio.libera(chiave, new Date(adesso().getTime() - SCADENZA_PRENOTAZIONE_MS));
  }
  return { status: 409, body: { error: "Idempotenza contesa: riprova tra poco." }, ripetuta: true };
}
