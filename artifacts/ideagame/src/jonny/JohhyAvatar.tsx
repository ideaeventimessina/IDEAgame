/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* Avatar UNICO di Johhy. Consolida JonnyAvatar + JonnyWaitingScreen + WinPodium (il
   renderer personaggio): un solo componente, pilotato dallo stato Johhy + dall'ampiezza
   della voce. ONESTO: con l'asset attuale (jonny-master.jpg) il volto NON è segmentato,
   quindi NON disegniamo una bocca finta sopra (lo vieta la specifica) — mentre parla si
   muove tutto il corpo in sincrono con l'ampiezza (squash/bob/aura). Quando ci sarà un
   rig a bocca/occhi separati basterà passarlo via `src`/slot senza cambiare i consumatori. */

import { motion } from 'framer-motion';
import { useJonnySpeaking } from '@/hooks/useJonnyVoice';
import type { JohhyState } from './johhy';
import { JOHHY_NAME } from './johhy';

export interface JohhyAvatarProps {
  state?: JohhyState;
  size?: number;
  /** Asset del personaggio (default = master legacy). Slot per un futuro rig segmentato. */
  src?: string;
  /** Micro-movimento continuo (respiro/ondeggio). Default ON. */
  alive?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

type Preset = { filter?: string; scale?: number; rotate?: number; glow?: string };
const STATE: Record<JohhyState, Preset> = {
  hidden:      { },
  entering:    { },
  idle:        { },
  greeting:    { filter: 'brightness(1.08) saturate(1.15)', scale: 1.03, glow: 'rgba(245,182,66,.4)' },
  explaining:  { filter: 'brightness(1.04) saturate(1.08)', glow: 'rgba(96,165,250,.35)' },
  pointing:    { filter: 'brightness(1.06) saturate(1.1)', scale: 1.02, rotate: 2 },
  listening:   { filter: 'brightness(0.95) saturate(0.9)' },
  thinking:    { filter: 'brightness(0.85) saturate(0.72)' },
  celebrating: { filter: 'brightness(1.22) saturate(1.45) drop-shadow(0 0 16px rgba(245,182,66,.85))', scale: 1.08, glow: 'rgba(245,182,66,.55)' },
  sympathetic: { filter: 'brightness(0.9) saturate(0.8)', rotate: -3 },
  paused:      { filter: 'brightness(0.72) saturate(0.5)' },
  leaving:     { },
};

export function JohhyAvatar({ state = 'idle', size = 120, src = '/jonny-master.jpg', alive = true, className, style }: JohhyAvatarProps) {
  const voice = useJonnySpeaking();
  const speaking = voice.speaking;
  const level = voice.level;
  const p = STATE[state] ?? {};
  const celebrating = state === 'celebrating';
  const hidden = state === 'hidden';

  // "Parla" = tutto il corpo (niente bocca disegnata): squash sincrono all'ampiezza.
  const talkPunch = speaking ? 1 + level * 0.06 : 1;
  const anim = speaking
    ? { y: [0, -3, 0], scaleY: [1, 1.015, 1], rotate: [-1.2, 1.2, -1.2], transition: { duration: 0.5, repeat: Infinity, ease: 'easeInOut' as const } }
    : { y: [0, -4, 0], scaleY: [1, 1.02, 1], rotate: [-1, 1.4, -1], transition: { duration: 3.4, repeat: Infinity, ease: 'easeInOut' as const } };

  const aura = speaking ? `rgba(96,165,250,${0.3 + level * 0.35})` : p.glow;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: hidden ? 0 : 1, scale: hidden ? 0.9 : 1 }}
      transition={{ duration: 0.3 }}
      style={{ width: size, height: size, position: 'relative', flexShrink: 0, ...style }}
    >
      {aura && (
        <div style={{ position: 'absolute', inset: -size * 0.08, borderRadius: '50%', background: `radial-gradient(circle, ${aura} 0%, transparent 70%)`, animation: 'johhyPulse 1.1s ease-in-out infinite', pointerEvents: 'none' }} />
      )}
      <style>{`@keyframes johhyPulse{0%,100%{opacity:.6;transform:scale(1)}50%{opacity:1;transform:scale(1.06)}}`}</style>
      <motion.div animate={alive ? anim : undefined} style={{ width: '100%', height: '100%', transformOrigin: 'center bottom' }}>
        <motion.img
          src={src}
          alt={`${JOHHY_NAME} — ${state}`}
          draggable={false}
          animate={{ scale: (p.scale ?? 1) * talkPunch, rotate: p.rotate ?? 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 18 }}
          style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center bottom', filter: p.filter, userSelect: 'none' }}
        />
      </motion.div>
      {celebrating && (
        <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          <circle cx="10" cy="18" r="3" fill="#F5B642" opacity="0.9" />
          <circle cx="90" cy="18" r="3" fill="#F5B642" opacity="0.9" />
          <path d="M 10 12 L 10 24 M 4 18 L 16 18" stroke="#F5B642" strokeWidth="1.8" strokeLinecap="round" opacity="0.8" />
          <path d="M 90 12 L 90 24 M 84 18 L 96 18" stroke="#F5B642" strokeWidth="1.8" strokeLinecap="round" opacity="0.8" />
        </svg>
      )}
    </motion.div>
  );
}

/** Mappa legacy JonnyMood → JohhyState, per migrare i chiamanti senza rotture. */
export function moodToState(mood: string): JohhyState {
  switch (mood) {
    case 'idle': return 'idle';
    case 'waiting': return 'listening';
    case 'excited': case 'challenge': return 'greeting';
    case 'your_turn': case 'attention': case 'countdown': return 'pointing';
    case 'thinking': case 'question': return 'thinking';
    case 'answer_sent': return 'listening';
    case 'correct': case 'winner': case 'points': case 'round_done': case 'scoreboard': return 'celebrating';
    case 'wrong': return 'sympathetic';
    case 'paused': return 'paused';
    case 'bye': return 'leaving';
    default: return 'idle';
  }
}
