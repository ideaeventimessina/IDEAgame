/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Email via Resend (REST, niente dipendenze) ───────────────────────────────
   Invio email attraverso l'API HTTP di Resend: nessun pacchetto da installare,
   solo fetch. GUARDATO: se manca RESEND_API_KEY non invia (ritorna false) e il
   chiamante mostra comunque il codice a schermo. Fire-and-forget: non rompe mai il flusso.

   ENV:
     RESEND_API_KEY = re_...                      (obbligatoria per inviare)
     RESEND_FROM    = "IDEAgame <noreply@tuodominio>"  (mittente verificato su Resend)
──────────────────────────────────────────────────────────────────────────── */

export function emailConfigured(): boolean {
  return !!process.env["RESEND_API_KEY"];
}

/** Invia un'email HTML. Ritorna true se accettata da Resend, false altrimenti. */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env["RESEND_API_KEY"];
  const from = process.env["RESEND_FROM"] || "IDEAgame <onboarding@resend.dev>";
  if (!key || !to) return false;
  const f = (globalThis as { fetch?: typeof fetch }).fetch;
  if (!f) return false;
  try {
    const r = await f("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!r.ok) { console.error("[email] resend", r.status, (await r.text().catch(() => "")).slice(0, 200)); return false; }
    return true;
  } catch (err) {
    console.error("[email] invio fallito", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Email col codice serata Live (dopo il pagamento). */
export async function sendLiveCodeEmail(to: string, code: string): Promise<boolean> {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#111">
      <h2 style="color:#7c3aed">🎉 Grazie! Ecco il tuo codice serata Live</h2>
      <p>Usa questo codice per sbloccare una serata in <b>modalità Live</b> di Jonny's World
      (tutto sbloccato: IA, Adult, Karaoke Live, Lockdown, musica e la voce di Jonny).</p>
      <div style="font-size:26px;font-weight:900;letter-spacing:3px;background:#f3e8ff;
        border:2px solid #a855f7;border-radius:12px;padding:16px;text-align:center;margin:18px 0">${code}</div>
      <p style="color:#555">Vale per una serata, è monouso e scade tra 48 ore.
      Su <b>ideagame.it</b> scegli <b>Live</b> → crea la stanza → incolla il codice.</p>
      <p style="color:#999;font-size:12px">Jonny's World · IDEAeventi</p>
    </div>`;
  return sendEmail(to, "Il tuo codice serata Live — Jonny's World", html);
}
