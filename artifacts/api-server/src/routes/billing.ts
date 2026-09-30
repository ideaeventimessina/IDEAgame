/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * Billing — pagamento Live con Stripe.
 * PUBBLICO (chi non ha ancora un account paga e poi si registra/accede).
 * È GUARDATO: se mancano STRIPE_SECRET_KEY o il prezzo, risponde { configured:false }
 * e il frontend mostra "presto disponibile" — nessuna cassa finta, niente crash.
 *
 * Il LISTINO è nostro (gestito internamente), NON su Stripe: passiamo l'importo al
 * volo con price_data, così non serve creare un "Price" nella dashboard Stripe.
 *
 * ENV richieste per attivarlo:
 *   STRIPE_SECRET_KEY   = sk_test_… / sk_live_…                (obbligatoria)
 *   STRIPE_LIVE_AMOUNT  = importo in CENTESIMI (es. 2000 = 20,00 €)   (obbligatoria)
 *   STRIPE_CURRENCY     = eur (default)                        (opzionale)
 *   STRIPE_LIVE_LABEL   = "IDEAgame — Modalità Live" (default) (opzionale)
 *   PUBLIC_BASE_URL     = https://ideagame.it (default)        (opzionale)
 *
 * NOTA: sbloccare davvero Live dopo il pagamento (entitlement) richiede il webhook
 * Stripe + un account cliente — vedi il TODO in fondo. Questo file avvia il checkout.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { issueLiveCodeForCheckout } from "../lib/live-codes.js";
import { sendLiveCodeEmail } from "../lib/email.js";

const router: IRouter = Router();

type StripeSession = { payment_status?: string; status?: string; customer_email?: string | null; customer_details?: { email?: string | null } | null };

/** Carica il client Stripe a runtime (specifier non letterale → build senza il pacchetto). */
async function getStripe(): Promise<{ checkout: { sessions: { create: (o: Record<string, unknown>) => Promise<{ url: string | null }>; retrieve: (id: string) => Promise<StripeSession> } } } | null> {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) return null;
  const mod = "stripe";
  const StripeLib = (await import(mod)).default as unknown as new (k: string) => never;
  return new StripeLib(key) as never;
}

router.post("/billing/checkout", async (req: Request, res: Response): Promise<void> => {
  const key = process.env["STRIPE_SECRET_KEY"];
  const amount = Number(process.env["STRIPE_LIVE_AMOUNT"]);   // centesimi, listino NOSTRO
  if (!key || !Number.isFinite(amount) || amount <= 0) { res.json({ configured: false }); return; }
  const currency = (process.env["STRIPE_CURRENCY"] || "eur").toLowerCase();
  const label = process.env["STRIPE_LIVE_LABEL"] || "IDEAgame — Modalità Live";

  try {
    const stripe = await getStripe();
    if (!stripe) { res.json({ configured: false }); return; }
    const origin = String(req.headers["origin"] ?? process.env["PUBLIC_BASE_URL"] ?? "https://ideagame.it");
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency,
          unit_amount: Math.round(amount),          // importo deciso da NOI
          product_data: { name: label },
        },
      }],
      // La success page riceve l'id del checkout → da lì emettiamo il codice serata.
      success_url: `${origin}/passa-a-live?paid=1&cs={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/passa-a-live`,
      allow_promotion_codes: true,
    });
    if (!session.url) { res.status(500).json({ error: "Stripe non ha restituito un URL" }); return; }
    res.json({ url: session.url });
  } catch (err) {
    console.error("[billing] checkout", err);
    res.status(500).json({ error: "Checkout non disponibile" });
  }
});

/**
 * POST /billing/code-after-pay { cs } — dopo il ritorno dalla cassa: verifica che
 * il checkout Stripe sia PAGATO e restituisce il CODICE serata (idempotente).
 * È così che il cliente riceve il codice a schermo (l'email arriverà quando
 * collegheremo un provider). Nessun codice se il pagamento non risulta completato.
 */
router.post("/billing/code-after-pay", async (req: Request, res: Response): Promise<void> => {
  const cs = String((req.body as Record<string, unknown>)?.["cs"] ?? "").trim();
  if (!cs.startsWith("cs_")) { res.status(400).json({ error: "checkout non valido" }); return; }
  try {
    const stripe = await getStripe();
    if (!stripe) { res.json({ configured: false }); return; }
    const session = await stripe.checkout.sessions.retrieve(cs);
    const paid = session.payment_status === "paid" || session.status === "complete";
    if (!paid) { res.status(402).json({ error: "Pagamento non risultato completato", paid: false }); return; }
    const code = await issueLiveCodeForCheckout(cs);
    // Manda il codice anche via email (se Resend è configurato + Stripe ha l'email).
    const email = session.customer_details?.email || session.customer_email || "";
    let emailed = false;
    if (email) emailed = await sendLiveCodeEmail(email, code);
    res.json({ ok: true, code, emailed, ...(email ? { email } : {}) });
  } catch (err) {
    console.error("[billing] code-after-pay", err);
    res.status(500).json({ error: "Impossibile emettere il codice" });
  }
});

export default router;

/* TODO (mi servono da te per completare):
 * 1) Chiavi Stripe (test e live) + il price_ del piano Live → nelle Secret di Replit.
 * 2) Cosa sblocca il pagamento: una serata? un abbonamento? crediti/token?
 * 3) Webhook Stripe (/billing/webhook) che, a pagamento riuscito, marca l'utente/
 *    gruppo come "Live" (tier full) — serve decidere il modello account/registrazione,
 *    che oggi NON esiste (Live si sblocca solo via login staff o token ponte). */
