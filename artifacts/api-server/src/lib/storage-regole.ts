/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Archivio file: regole (parte pura, testata) ──────────────────────────────
   Prima: chiunque (anche senza login) otteneva URL di caricamento senza limiti di
   dimensione o tipo, e /storage/objects/* serviva QUALSIASI percorso della
   cartella privata. Ora:
     - i caricamenti li chiede solo lo staff, con tetto di dimensione e tipi ammessi;
     - si servono solo gli oggetti caricati dall'app (uploads/<uuid>[.ext]); quelli
       con una regola d'accesso privata solo a chi ne ha diritto. */

export const MAX_CARICAMENTO = 50 * 1024 * 1024; // 50 MB
const TIPI = /^(image\/(png|jpe?g|gif|webp|avif)|audio\/(mpeg|mp3|mp4|ogg|wav|x-wav|webm|aac|x-m4a)|video\/(mp4|webm|quicktime))$/i;

export function caricamentoAmmesso(size: unknown, contentType: unknown): { ok: true } | { ok: false; error: string } {
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return { ok: false, error: "Dimensione non valida" };
  if (size > MAX_CARICAMENTO) return { ok: false, error: "File troppo grande (max 50 MB)" };
  if (typeof contentType !== "string" || !TIPI.test(contentType.trim())) return { ok: false, error: "Tipo di file non ammesso" };
  return { ok: true };
}

const OGGETTO = /^uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,5})?$/i;
export const percorsoOggettoAmmesso = (p: string) => OGGETTO.test(p);

/** Audio dei giochi: file GLOBALI (valgono per tutti i tenant) → li cambia solo il super_admin. */
export const puoCambiareAudio = (ruolo: string | undefined) => ruolo === "super_admin";
