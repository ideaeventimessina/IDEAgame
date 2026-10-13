/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ─── Johhy — contratto unico del personaggio ────────────────────────────────
   Il personaggio confermato si chiama **Johhy** (stesso rig occhiali+microfono+
   abito nero/oro; nei file legacy è "Jonny": ID/route/asset restano, cambia solo
   il nome VISIBILE). Qui vivono il displayName, il tipo SpeechCue e la
   segmentazione del fumetto sul clock dell'audio. Non duplicare il motore voce:
   la riproduzione resta in audio/JonnyVoice.ts, questo è il contratto sopra.
──────────────────────────────────────────────────────────────────────────── */

/** Nome visibile del personaggio (unica fonte). I legacy id/route/asset restano "jonny". */
export const JOHHY_NAME = 'Johhy';

export type JohhyAudience = 'public' | 'player' | 'host';

/** Stato del personaggio (posa/gesto) — separato dallo stato voce. */
export type JohhyState =
  | 'hidden' | 'entering' | 'idle' | 'greeting' | 'explaining' | 'pointing'
  | 'listening' | 'thinking' | 'celebrating' | 'sympathetic' | 'paused' | 'leaving';

/** Contratto unico richiesto dalla specifica Johhy. `exactText` è la fonte SIA della
 *  voce SIA del fumetto; i `segments` coprono in ordine tutto il testo. */
export interface SpeechCue {
  id: string;
  sessionId?: string;
  roundId?: string;
  phaseRevision?: number;
  audience: JohhyAudience;
  targetPlayerId?: string;
  scriptKey: string;
  scriptVersion?: string;
  locale?: string;
  exactText: string;
  audioUrl?: string;
  durationMs?: number;
  segments?: Segment[];
  animationCues?: { startMs: number; endMs: number; state: JohhyState; gesture?: string }[];
  priority?: number;
  interruptPolicy?: 'queue' | 'replace' | 'drop-if-busy';
  expiresAt?: number;
}

export interface Segment { startMs: number; endMs: number; text: string }

/** Spezza il testo in segmenti-frase e li distribuisce sul clock audio in modo
 *  PROPORZIONALE alla lunghezza (allineamento dichiarato APPROSSIMATO: non è
 *  lip-sync parola per parola). Se durMs non è noto, segmenti senza tempo. */
export function segmentText(text: string, durMs = 0): Segment[] {
  const clean = (text ?? '').trim();
  if (!clean) return [];
  // dividi per fine-frase tenendo la punteggiatura; unisci spezzoni troppo corti
  const raw = clean.match(/[^.!?…]+[.!?…]*\s*/g)?.map((s) => s.trim()).filter(Boolean) ?? [clean];
  const parts: string[] = [];
  for (const p of raw) {
    if (parts.length && (parts[parts.length - 1]!.length < 18 || p.length < 14)) parts[parts.length - 1] += ' ' + p;
    else parts.push(p);
  }
  const total = parts.reduce((n, p) => n + p.length, 0) || 1;
  let acc = 0;
  return parts.map((p) => {
    const start = durMs ? (acc / total) * durMs : 0;
    acc += p.length;
    const end = durMs ? (acc / total) * durMs : 0;
    return { startMs: start, endMs: end, text: p };
  });
}

/** Segmento attivo dato il tempo audio corrente (ms). Fuori range → ultimo/primo. */
export function activeSegment(segs: Segment[], timeMs: number): Segment | null {
  if (!segs.length) return null;
  if (segs.length === 1 || !segs[segs.length - 1]!.endMs) return segs[0]!;
  for (const s of segs) if (timeMs >= s.startMs && timeMs < s.endMs) return s;
  return timeMs <= 0 ? segs[0]! : segs[segs.length - 1]!;
}
