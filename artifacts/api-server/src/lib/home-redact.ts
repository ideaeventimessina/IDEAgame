/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* Spostata qui da routes/home.ts per usarla anche nel socket (join:home mandava la
   sessione NON ripulita: preferiti dell'adult e risposte giuste di SaraMusica). */

/**
 * Toglie i campi SEGRETI dalla sessione prima di mandarla ai client. Oggi:
 * `roundPayload.favorites` = i preferiti dell'adult, che devono restare noti solo
 * al server (li usa per pesare la bottiglia) e MAI visibili agli altri giocatori.
 * La sessione resta intatta sul DB; qui si redige solo la copia inviata.
 */
export function redactHomeSession<T>(session: T): T {
  if (!session || typeof session !== "object") return session;
  const s = session as Record<string, unknown>;
  const rp = s["roundPayload"];
  if (!rp || typeof rp !== "object") return session;
  const rpObj = rp as Record<string, unknown>;
  let rpCopy: Record<string, unknown> | null = null;
  const ensureCopy = (): Record<string, unknown> => {
    if (!rpCopy) rpCopy = { ...rpObj };
    return rpCopy;
  };

  // Preferiti dell'adult: pesano la bottiglia sul server, mai visibili ai client.
  if ("favorites" in rpObj) { delete ensureCopy()["favorites"]; }

  // BUG SARAMUSICA RC2 (Andrea): `correctAnswerIndex` di OGNI domanda veniva spedito a
  // tutti i telefoni dentro `rounds[]`, rendendo il quiz barabile (basta guardare lo
  // stato). Lo rimuoviamo dai round trasmessi: la risposta giusta arriva comunque, ma
  // SOLO al reveal via `revealData.correctAnswerIndex` (il server resta la fonte dei
  // punteggi). Il testo delle risposte resta, serve a disegnare i pulsanti.
  if (rpObj["mode"] === "home-saramusica" && Array.isArray(rpObj["rounds"])) {
    const safeRounds = (rpObj["rounds"] as unknown[]).map(r => {
      if (r && typeof r === "object" && "correctAnswerIndex" in (r as Record<string, unknown>)) {
        const rc = { ...(r as Record<string, unknown>) };
        delete rc["correctAnswerIndex"];
        return rc;
      }
      return r;
    });
    ensureCopy()["rounds"] = safeRounds;
  }

  return rpCopy ? ({ ...s, roundPayload: rpCopy } as T) : session;
}

