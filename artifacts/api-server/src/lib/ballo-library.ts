/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * Libreria dance curata per la Sfida di Ballo (Home).
 *
 * Perché una libreria e non la ricerca libera: garantisce velocità (nessuna attesa
 * che qualcuno cerchi) e "sempre pezzi giusti da ballare". Ogni brano è una query
 * risolta a run-time da searchYouTube(query, "song") → videoId reale ed embeddabile
 * (niente ID hardcoded che muoiono). Il secondo di partenza (ritornello/drop) lo
 * stima estimateChorusStart, così si balla subito sulla parte energica.
 *
 * Mix volutamente vario (internazionale + italiano, decenni diversi) così le 3
 * manche di una partita risultano sempre diverse tra loro.
 */

export interface BalloSong {
  title: string;
  artist: string;
  /** Query passata a searchYouTube in modalità "song" (video ufficiale, non karaoke). */
  query: string;
}

function song(title: string, artist: string): BalloSong {
  return { title, artist, query: `${title} ${artist}` };
}

export const BALLO_LIBRARY: BalloSong[] = [
  song("Levitating", "Dua Lipa"),
  song("Blinding Lights", "The Weeknd"),
  song("Uptown Funk", "Bruno Mars"),
  song("Gasolina", "Daddy Yankee"),
  song("Y.M.C.A.", "Village People"),
  song("Dancing Queen", "ABBA"),
  song("Billie Jean", "Michael Jackson"),
  song("Beggin'", "Måneskin"),
  song("Happy", "Pharrell Williams"),
  song("I Gotta Feeling", "Black Eyed Peas"),
  song("Sarà perché ti amo", "Ricchi e Poveri"),
  song("L'Amour Toujours", "Gigi D'Agostino"),
  song("Waka Waka", "Shakira"),
  song("Love Generation", "Bob Sinclar"),
  song("Hey Ya!", "OutKast"),
  song("Just Dance", "Lady Gaga"),
  song("Celebration", "Kool & The Gang"),
  song("Don't Stop the Music", "Rihanna"),
  song("September", "Earth, Wind & Fire"),
  song("On the Floor", "Jennifer Lopez"),
];

/** Restituisce n brani distinti a caso dalla libreria (per le n manche del Ballo). */
export function pickBalloSongs(n: number): BalloSong[] {
  const pool = [...BALLO_LIBRARY];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, Math.max(1, Math.min(n, pool.length)));
}
