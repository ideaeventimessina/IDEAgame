/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Stato dei giochi Home: mutazioni SERIALIZZATE ────────────────────────────
   Percorso a Risate e Karaoke tenevano il loro stato dentro game_config e lo
   aggiornavano così: leggi la sessione → calcola → riscrivi TUTTO game_config.
   Due richieste sovrapposte (due voti, un voto e il timer, tanti tocchi su
   /react) leggevano la stessa copia e l'ultima a scrivere cancellava l'altra:
   un voto perso, oppure una fase che tornava indietro.

   Qui ogni mutazione:
     1. blocca la riga della sessione (SELECT … FOR UPDATE, in transazione);
     2. rilegge lo stato FRESCO;
     3. applica la funzione del gioco;
     4. riscrive SOLO la sua chiave (jsonb_set), non tutto game_config.
   Così le mutazioni sulla stessa partita vanno in fila, come nel casinò
   (mutateSession), e non cancellano gli altri campi di game_config.

   Questo file è puro (niente DB): il backend vero è in stato-home-db.ts, nei
   test se ne usa uno in memoria con la stessa semantica di lock.
──────────────────────────────────────────────────────────────────────────── */

export type Cfg = Record<string, unknown>;

export interface BackendStatoHome {
  /** Esegue `fn` con la riga della sessione bloccata fino alla fine. `cfg` è null
   *  se la sessione non esiste. `scriviChiave` aggiorna solo game_config[chiave]. */
  conRigaBloccata<T>(
    sessionId: string,
    fn: (cfg: Cfg | null, scriviChiave: (chiave: string, valore: unknown) => Promise<void>) => Promise<T>,
  ): Promise<T>;
}

export type EsitoMutazione<S, R> = { salva?: S; risultato: R };

export type Mutato<R> = { trovata: false } | { trovata: true; risultato: R };

export async function mutaStatoHome<S, R>(
  backend: BackendStatoHome,
  sessionId: string,
  chiave: string,
  leggi: (valore: unknown) => S | null,
  fn: (stato: S | null, cfg: Cfg) => EsitoMutazione<S, R> | Promise<EsitoMutazione<S, R>>,
): Promise<Mutato<R>> {
  return backend.conRigaBloccata(sessionId, async (cfg, scriviChiave) => {
    if (!cfg) return { trovata: false } as const;
    const esito = await fn(leggi(cfg[chiave]), cfg);
    if (esito.salva !== undefined) await scriviChiave(chiave, esito.salva);
    return { trovata: true, risultato: esito.risultato } as const;
  });
}
