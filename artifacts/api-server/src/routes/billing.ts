/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * Billing — pagamento Live con Stripe.
 * PUBBLICO (chi non ha ancora un account paga e poi si registra/accede).
 * È GUARDATO: se mancano STRIPE_SECRET_KEY o il prezzo, risponde { configured:false }
 * e il frontend mostra "presto disponibile" — nessuna cassa finta, niente crash.
 *
 * ENV richieste per attivarlo:
 *   STRIPE_SECRET_KEY   = sk_test_… / sk_live_…
 *   STRIPE_PRICE_LIVE   = price_…  (il prezzo/piano creato su Stripe)
 *   STRIPE_MODE         = payment | subscription   (default: payment)
 *   PUBLIC_BASE_URL     = https://ideagame.it       (per success/cancel, opzionale)
 *
 * NOTA: sbloccare davvero Live dopo il pagamento (entitlement) richiede il webhook
 * Stripe + un account cliente — vedi il TODO in fondo. Questo file avvia il checkout.
 */

import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

router.post("/billing/checkout", async (req: Request, res: Response): Promise<void> => {
  const key = process.env["STRIPE_SECRET_KEY"];
  const price = process.env["STRIPE_PRICE_LIVE"];
  if (!key || !price) { res.json({ configured: false }); return; }

  try {
    // Specifier non letterale: la dipendenza 'stripe' viene caricata a runtime solo
    // quando è configurata, così build e typecheck non richiedono il pacchetto.
    const mod = "stripe";
    const StripeLib = (await import(mod)).default as unknown as new (k: string) => {
      checkout: { sessions: { create: (o: Record<string, unknown>) => Promise<{ url: string | null }> } };
    };
    const stripe = new StripeLib(key);
    const origin = String(req.headers["origin"] ?? process.env["PUBLIC_BASE_URL"] ?? "https://ideagame.it");
    const mode = (process.env["STRIPE_MODE"] === "subscription" ? "subscription" : "payment");
    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price, quantity: 1 }],
      success_url: `${origin}/home-setup?mode=live&paid=1`,
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

export default router;

/* TODO (mi servono da te per completare):
 * 1) Chiavi Stripe (test e live) + il price_ del piano Live → nelle Secret di Replit.
 * 2) Cosa sblocca il pagamento: una serata? un abbonamento? crediti/token?
 * 3) Webhook Stripe (/billing/webhook) che, a pagamento riuscito, marca l'utente/
 *    gruppo come "Live" (tier full) — serve decidere il modello account/registrazione,
 *    che oggi NON esiste (Live si sblocca solo via login staff o token ponte). */
