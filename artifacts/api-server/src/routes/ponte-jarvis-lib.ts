/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * IL PONTE CON JARVIS — parti pure (20/11/2026). Niente express, niente db:
 * si prova con `node --test` (vedi ponte-jarvis-lib.test.ts).
 *
 * Qui NON ci sono regole della roulette: quote ed esiti restano quelli del
 * casinò (gestione-casino-atomic-lib: PAYOUT, betWins, rouletteWinMoves).
 * Qui c'è solo la TRADUZIONE delle puntate del contratto Jarvis
 * (numero/rosso/nero/pari/dispari/manque/passe/dozzina/colonna) nei tipi di
 * puntata del casinò, e il controllo della chiave.
 */

import { timingSafeEqual } from "node:crypto";

export const SECRET_CHIAVE = "JARVIS_PONTE_KEY";
export const SALDO_INIZIALE = 1000;
export const MAX_PUNTATE = 20;
export const MAX_FICHE_PUNTATA = 100_000;
export const ULTIMI_NUMERI = 10;

/** Constant-time string comparison for shared secrets. */
export function sameSecret(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export type EsitoChiave =
  | { ok: true }
  | { ok: false; status: 503 | 401; body: { error: string; secretMancante?: string } };

/** Fail-closed: senza Secret → 503 (con il nome del Secret); chiave sbagliata → 401. */
export function controllaChiave(ricevuta: unknown, configurata: string | undefined): EsitoChiave {
  const attesa = (configurata ?? "").trim();
  if (!attesa) {
    return {
      ok: false,
      status: 503,
      body: { error: "Ponte Jarvis non configurato: manca il Secret sul server.", secretMancante: SECRET_CHIAVE },
    };
  }
  const data = typeof ricevuta === "string" ? ricevuta : Array.isArray(ricevuta) ? String(ricevuta[0] ?? "") : "";
  if (!sameSecret(data, attesa)) return { ok: false, status: 401, body: { error: "Chiave non valida." } };
  return { ok: true };
}

export const TIPI_PUNTATA = ["numero", "rosso", "nero", "pari", "dispari", "manque", "passe", "dozzina", "colonna"] as const;
export type TipoPuntata = (typeof TIPI_PUNTATA)[number];

/** Una puntata del contratto, già tradotta nel tipo del casinò. */
export type PuntataJarvis = {
  tipo: TipoPuntata;
  valore: number | null;
  fiche: number;
  kind: string;        // tipo di puntata del casinò (straight, red, dozen2, col3, …)
  numbers: number[];   // solo per "numero"
};

const SEMPLICI: Record<string, string> = {
  rosso: "red", nero: "black", pari: "even", dispari: "odd", manque: "low", passe: "high",
};

/**
 * Valida e traduce le puntate in arrivo. Tutto o niente: una puntata sbagliata
 * rifiuta il giro intero (meglio un 400 chiaro che un giro giocato a metà).
 */
export function traduciPuntate(grezze: unknown):
  | { ok: true; puntate: PuntataJarvis[] }
  | { ok: false; error: string } {
  if (grezze == null) return { ok: true, puntate: [] };
  if (!Array.isArray(grezze)) return { ok: false, error: "\"puntate\" deve essere una lista." };
  if (grezze.length > MAX_PUNTATE) return { ok: false, error: `Al massimo ${MAX_PUNTATE} puntate per giro.` };
  const out: PuntataJarvis[] = [];
  for (let i = 0; i < grezze.length; i++) {
    const p = grezze[i] as Record<string, unknown> | null;
    const dove = `Puntata ${i + 1}`;
    if (!p || typeof p !== "object") return { ok: false, error: `${dove}: non è un oggetto.` };
    const tipo = String(p["tipo"] ?? "").toLowerCase().trim() as TipoPuntata;
    if (!(TIPI_PUNTATA as readonly string[]).includes(tipo)) {
      return { ok: false, error: `${dove}: tipo "${String(p["tipo"] ?? "")}" sconosciuto (ammessi: ${TIPI_PUNTATA.join(", ")}).` };
    }
    const fiche = Number(p["fiche"]);
    if (!Number.isInteger(fiche) || fiche <= 0 || fiche > MAX_FICHE_PUNTATA) {
      return { ok: false, error: `${dove}: "fiche" deve essere un intero fra 1 e ${MAX_FICHE_PUNTATA}.` };
    }
    const v = p["valore"] == null || p["valore"] === "" ? null : Number(p["valore"]);
    if (tipo === "numero") {
      if (v == null || !Number.isInteger(v) || v < 0 || v > 36) return { ok: false, error: `${dove}: "valore" deve essere un numero da 0 a 36.` };
      out.push({ tipo, valore: v, fiche, kind: "straight", numbers: [v] });
    } else if (tipo === "dozzina" || tipo === "colonna") {
      if (v == null || !Number.isInteger(v) || v < 1 || v > 3) return { ok: false, error: `${dove}: "valore" deve essere 1, 2 o 3.` };
      out.push({ tipo, valore: v, fiche, kind: `${tipo === "dozzina" ? "dozen" : "col"}${v}`, numbers: [] });
    } else {
      out.push({ tipo, valore: null, fiche, kind: SEMPLICI[tipo]!, numbers: [] });
    }
  }
  return { ok: true, puntate: out };
}

/** Colore del casinò → italiano del contratto. */
export function coloreItaliano(c: "red" | "black" | "green"): "rosso" | "nero" | "verde" {
  return c === "red" ? "rosso" : c === "black" ? "nero" : "verde";
}

/** Pari secondo la roulette: lo zero non è né pari né dispari (→ false). */
export const numeroPari = (r: number): boolean => r !== 0 && r % 2 === 0;

/** Catalogo auto-descrittivo (formato del contratto Jarvis). */
export const CATALOGO_JARVIS = {
  sistema: "IDEAgame",
  versione: "2026-11-20",
  azioni: [
    {
      nome: "roulette_giro",
      metodo: "POST",
      percorso: "/api/ponte/jarvis/roulette/giro",
      descrizione:
        "Un giro di roulette europea (0–36) con le regole del casinò di IDEAgame. Senza \"partita\" ne apre una nuova con 1000 fiche; senza puntate fa solo girare la ruota.",
      parametri: {
        partita: "id di una partita precedente (opzionale)",
        puntate: "lista opzionale di { tipo: numero|rosso|nero|pari|dispari|manque|passe|dozzina|colonna, valore (numero 0–36, dozzina/colonna 1–3), fiche }",
      },
      effetti: "scrittura",
    },
    {
      nome: "roulette_stato",
      metodo: "GET",
      percorso: "/api/ponte/jarvis/roulette/:partita",
      descrizione: "Stato di una partita: saldo, giri giocati, ultimi 10 numeri usciti.",
      parametri: { partita: "id della partita (nel percorso)" },
      effetti: "lettura",
    },
    {
      nome: "skill",
      metodo: "GET",
      percorso: "/api/ponte/jarvis/skill",
      descrizione: "Questo catalogo.",
      parametri: {},
      effetti: "lettura",
    },
  ],
} as const;
