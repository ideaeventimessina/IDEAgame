/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import { useEffect, useState } from 'react';
import { JonnyVoice, type JohhyVoiceState } from '@/audio/JonnyVoice';

const INITIAL: JohhyVoiceState = { speaking: false, level: 0, key: null, text: null, timeMs: 0, durMs: 0 };

/** Stato reattivo della voce di Johhy: sta parlando, ampiezza (0..1) per la bocca,
 *  testo ESATTO pronunciato e clock audio (per il fumetto sincronizzato). */
export function useJonnySpeaking(): JohhyVoiceState {
  const [state, setState] = useState<JohhyVoiceState>(INITIAL);
  useEffect(() => JonnyVoice.subscribe(setState), []);
  return state;
}

/** Fai parlare Johhy con una battuta del copione (vedi jonny-voice.ts sul server). */
export function jonnySpeak(key: string): void {
  void JonnyVoice.speak(key);
}
