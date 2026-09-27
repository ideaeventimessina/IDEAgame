/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Lockdown BoardGame (v1, Master + Lock-Euro) — tipi di stato ──────────────
   Gioco di Andrea Gentile digitalizzato: Master sulla TV, giocatori sui telefoni,
   economia in Lock-Euro, spia segreta, 9 stanze/sfide, DPCM e Multe.
   Nessuna tabella: lo stato vive in home_sessions.gameConfig.lockdownState (JSON),
   come RisateState per il Percorso. Contratto condiviso backend↔frontend. */

/** Tipo di sfida di una stanza → decide come il frontend la rende e l'engine la valuta. */
export type LockdownRoomType =
  | "quiz"        // domande a risposta (biblioteca, ufficio, cultura)
  | "adult_quiz"  // 10 sfumature (vietato ai minori / domande sul sesso)
  | "recipes"     // cucina: scrivi ricette con un ingrediente
  | "charades"    // salone: mima il titolo del film
  | "song_word"   // balcone: canta una canzone con una delle parole
  | "story"       // cinema: crea una storia con le parole (voto Master)
  | "objects"     // studio: indovina l'oggetto dall'immagine
  | "lies"        // gabinetto: rispondi con bugie
  | "dice_bet";   // palestra: scommessa sui dadi

export interface LockdownCharacter {
  id: string;
  name: string;          // es. "CUOCO", "PROSTITUTA", "POLITICO"
  emoji: string;
  power: string;         // descrizione del superpotere (mostrata al giocatore)
  startBonus?: number;   // Figlio di Papà: 1000 invece di 500
}

export interface LockdownRoom {
  id: string;
  name: string;          // "CUCINA", "BIBLIOTECA", ...
  emoji: string;
  type: LockdownRoomType;
  team: boolean;         // gara di coppia/squadra?
  prize: number;         // Lock-Euro in palio (o per risposta, vedi engine)
  penalty: number;       // penalità al Master per gli sconfitti
  timeLimit: number;     // secondi
  description: string;
  deckKey?: string;      // quale banco contenuti usare (es. "letteratura", "sesso")
  /** true = sfida a GIUDIZIO (Master + voto del pubblico): mimo, storia, canto, ricette,
   *  bugie, oggetti. false = OGGETTIVA (l'app conosce la risposta → auto-assegna). */
  subjective: boolean;
}

export interface LockdownDpcm { id: string; text: string; }
export interface LockdownMulta { id: string; text: string; amount?: number; }

/** Contenuti del gioco (in lib/lockdown-content.ts). I banchi sono i semi reali
 *  dei mazzi di Andrea; l'IA a contenuti infiniti li estende (anti-ripetizione). */
export interface LockdownContent {
  characters: LockdownCharacter[];
  rooms: LockdownRoom[];
  dpcm: LockdownDpcm[];
  multe: LockdownMulta[];
  banks: {
    ingredienti: string[];
    letteratura: { question: string; answers: string[]; correctIndex: number }[];
    film: string[];
    paroleCanzoni: string[];
    oggettiStudio: { image: string; answer: string }[];
    bugie: string[];        // domande a cui rispondere con bugie
    creaStoria: string[];   // parole per inventare la storia
    sesso: { question: string; answers: string[]; correctIndex: number }[];
    culturaGenerale: { question: string; answers: string[]; correctIndex: number }[];
  };
}

export interface LockdownPlayerState {
  id: string;
  nickname: string;
  avatarColor: string;
  characterId: string | null;
  lockEuro: number;
  /** ANTI-ELIMINAZIONE: nessuno esce mai. A 0 il giocatore è "in rosso" ma continua a
   *  giocare, votare e può risalire. eliminated resta per compatibilità, sempre false. */
  eliminated: boolean;
  isBroke: boolean;         // saldo a 0: "in rosso" (ma ancora in gioco)
  accuseUsed: boolean;      // ha già accusato la spia (1 volta) — ora TUTTI possono accusare
  characterUsed: boolean;   // ha già usato il potere (per la compravendita)
}

export type LockdownPhase = "setup" | "roles" | "room_intro" | "challenge" | "result" | "dpcm" | "accuse" | "ended";

export interface LockdownState {
  version: 1;
  status: "idle" | "running" | "ended";
  phase: LockdownPhase;
  players: LockdownPlayerState[];
  masterBalance: number;
  /** Id del giocatore-spia. Il backend NON lo manda ai client finché non serve. */
  spyPlayerId: string | null;
  roomIndex: number;
  currentRoomId: string | null;
  currentChallenge: {
    prompt: string;
    options?: string[];
    correctIndex?: number;
    imageUrl?: string;
    words?: string[];
    ingredient?: string;
    [key: string]: unknown;
  } | null;
  dpcm: LockdownDpcm | null;
  lastMulta: LockdownMulta | null;
  lastFlash: { text: string; type: string } | null;
  mode: "normal" | "timed";
  endsAt: string | null;      // per la modalità a tempo
  masterWinAt: number;        // soglia vittoria Master+Spia (riequilibrata, default 1500)
  winnerId: string | null;
  spyRevealed: boolean;
  /** Voto del pubblico per la sfida a giudizio corrente: voterId → id del giocatore votato. */
  votes: Record<string, string>;
  /** La spia ha già usato il suo sabotaggio segreto (dirotta parte di un premio al Master). */
  spyPowerUsed: boolean;
}
