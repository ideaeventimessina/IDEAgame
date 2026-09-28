/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import { useEffect, useState } from 'react';
import { JonnyVoice } from '@/audio/JonnyVoice';

/** Stato reattivo della voce di Jonny: sta parlando + ampiezza (0..1) per la bocca. */
export function useJonnySpeaking(): { speaking: boolean; level: number; key: string | null } {
  const [state, setState] = useState({ speaking: JonnyVoice.speaking, level: JonnyVoice.level, key: null as string | null });
  useEffect(() => JonnyVoice.subscribe(setState), []);
  return state;
}

/** Fai parlare Jonny con una battuta del copione (vedi jonny-voice.ts sul server). */
export function jonnySpeak(key: string): void {
  void JonnyVoice.speak(key);
}
