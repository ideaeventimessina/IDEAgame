/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* Musica di sottofondo per i tavoli Casinò e per il Burraco (pagine fuori dall'AudioProvider
   della Home). Prima mancava del tutto. Riusa l'AudioManager: sblocca l'autoplay al primo
   tocco/click del monitor (gli 80" sono touch) e tiene un loop di scena. Se il file manca,
   l'AudioManager fa fallback silenzioso: non rompe nulla. */
import { useEffect } from 'react';
import { AudioManager } from './AudioManager';

export function useTableMusic(slug: string, type = 'lobby_loop', enabled = true): void {
  // Ferma la musica quando si lascia la pagina del tavolo.
  useEffect(() => () => { AudioManager.stopLoop(true); }, []);

  useEffect(() => {
    if (!enabled) return;
    let gone = false;
    const play = () => { if (gone) return; try { AudioManager.resumeContext(); } catch { /* */ } void AudioManager.playLoop(slug, type); };
    play(); // tenta subito (se l'audio è già sbloccato in questa scheda)
    // Sblocco autoplay: primo tocco/click/tasto sul monitor touch.
    const onGesture = () => play();
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
    return () => { gone = true; window.removeEventListener('pointerdown', onGesture); window.removeEventListener('keydown', onGesture); };
  }, [slug, type, enabled]);
}
