/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Orchestratore voce di Johhy ─────────────────────────────────────────────
   Decide SE far partire una battuta su QUESTO device. Regole della specifica:
   - audience (public|player|host): la voce pubblica parte solo sul monitor; un
     messaggio 'player' va solo al telefono del destinatario → niente eco da 8 telefoni.
   - un SOLO playback per device: un cue con lo stesso id (ri-arrivato da polling/
     socket/reconnect) non si ripete.
   - performance lock: durante una performance (karaoke/ballo col suo audio) Johhy
     NON interrompe; le spiegazioni vengono scartate finché dura.
   - priorità/interrupt: voce conduttore reale > avvisi indispensabili > spiegazioni
     Johhy > effetti/musica. Un cue a priorità maggiore interrompe; a parità, policy.
   - scadenza: un cue scaduto non parte.
   La riproduzione vera resta in JonnyVoice (provider ElevenLabs/OpenAI); il testo
   esatto del fumetto lo risolve il server per scriptKey (catalogo fisso).
──────────────────────────────────────────────────────────────────────────── */

import { JonnyVoice } from '@/audio/JonnyVoice';

export type JohhyRole = 'public' | 'player' | 'host';
export interface JohhyDevice { role: JohhyRole; playerId?: string }

export interface PlayCue {
  id: string;                 // id univoco per dedup, es. `gs:${sessionId}:${round}:${key}`
  scriptKey: string;          // chiave del catalogo voce (il testo esatto lo dà il server)
  audience: JohhyRole;
  targetPlayerId?: string;    // solo per audience 'player' mirato a un giocatore
  priority?: number;          // 3 spiegazioni (default), 5 avvisi, 6 conduttore
  interruptPolicy?: 'replace' | 'drop-if-busy';
  expiresAt?: number;         // epoch ms
}

export type PlayResult =
  | 'played' | 'skipped-audience' | 'skipped-dup' | 'skipped-expired' | 'skipped-perf' | 'skipped-busy';

export const PRIORITY = { explanation: 3, alert: 5, host: 6 } as const;

const played = new Set<string>();   // dedup per questo device (istanza app)
let perfLock = false;
let currentPriority = 0;

/** Attiva/disattiva il blocco performance (karaoke/ballo col proprio audio). */
export function setPerformanceLock(on: boolean): void {
  perfLock = on;
  if (on && currentPriority <= PRIORITY.explanation) JonnyVoice.stop();
}

/** Reset del dedup (es. a nuova sessione/partita). */
export function resetJohhyCues(): void { played.clear(); currentPriority = 0; }

/** `true` se il cue PARTIREBBE su questo device (senza effetti), per test/log. */
export function wouldPlay(cue: PlayCue, device: JohhyDevice): PlayResult {
  if (cue.expiresAt != null && Date.now() > cue.expiresAt) return 'skipped-expired';
  if (cue.audience !== device.role) return 'skipped-audience';
  if (cue.audience === 'player' && cue.targetPlayerId && cue.targetPlayerId !== device.playerId) return 'skipped-audience';
  if (played.has(cue.id)) return 'skipped-dup';
  const pri = cue.priority ?? PRIORITY.explanation;
  if (perfLock && pri <= PRIORITY.explanation) return 'skipped-perf';
  if (JonnyVoice.speaking) {
    const policy = cue.interruptPolicy ?? 'drop-if-busy';
    if (pri > currentPriority) return 'played';            // priorità maggiore → interrompe
    if (policy === 'drop-if-busy') return 'skipped-busy';
    return 'played';                                       // 'replace' a parità
  }
  return 'played';
}

/** Valuta le regole e, se ammesso, fa partire la voce su questo device. */
export function playCue(cue: PlayCue, device: JohhyDevice): PlayResult {
  const verdict = wouldPlay(cue, device);
  if (verdict !== 'played') return verdict;
  if (JonnyVoice.speaking) JonnyVoice.stop();
  played.add(cue.id);
  currentPriority = cue.priority ?? PRIORITY.explanation;
  void JonnyVoice.speak(cue.scriptKey);
  return 'played';
}
