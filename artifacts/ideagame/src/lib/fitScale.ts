/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* Logica PURA del "fit-to-screen" dei tabelloni HOME (vedi AutoFitBoard in HomeGame).
 *
 * BUG TV SMART (Andrea "dal browser della TV spariscono i tasti in basso"): il tabellone
 * veniva ingrandito con un fattore calcolato SOLO sulla larghezza (fino a 1.5x su 1920px),
 * così su una TV diventava più alto dello schermo e i pulsanti in fondo finivano fuori
 * dall'area visibile. Qui il fattore si calcola sul MINIMO fra rapporto di larghezza E di
 * altezza: il contenuto RIENTRA sempre in entrambe le dimensioni, quindi i tasti in basso
 * restano visibili. È estratta per essere testabile senza DOM. */

export interface FitScaleOpts {
  /** Non scendere sotto (leggibilità). Default 0.3. */
  minScale?: number;
  /** Non ingrandire oltre (riempire le TV, non sgranare). Default 1.5. */
  maxScale?: number;
}

export function computeFitScale(
  boxW: number, boxH: number,
  natW: number, natH: number,
  opts: FitScaleOpts = {},
): number {
  const minScale = opts.minScale ?? 0.3;
  const maxScale = opts.maxScale ?? 1.5;
  if (!boxW || !boxH || !natW || !natH) return 1;
  const fit = Math.min(boxW / natW, boxH / natH);
  return Math.max(minScale, Math.min(maxScale, fit));
}
