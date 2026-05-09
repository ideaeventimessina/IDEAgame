import type { JonnyMood } from '@/contexts/JonnyContext';
import { motion } from 'framer-motion';

interface JonnyAvatarProps {
  mood?: JonnyMood;
  size?: number;
  className?: string;
  background?: 'none' | 'white' | 'dark' | 'gold';
}

const MOOD_FILTER: Record<JonnyMood, { filter?: string; scale?: number; rotate?: number }> = {
  idle:        {},
  waiting:     { filter: 'brightness(0.9) saturate(0.85)' },
  excited:     { filter: 'brightness(1.1) saturate(1.3)', scale: 1.06 },
  your_turn:   { filter: 'brightness(1.15) saturate(1.2)', scale: 1.04 },
  thinking:    { filter: 'brightness(0.85) saturate(0.7)' },
  attention:   { filter: 'brightness(1.05) saturate(1.1)', scale: 1.02 },
  answer_sent: { filter: 'brightness(0.95) saturate(0.9)' },
  correct:     { filter: 'brightness(1.2) saturate(1.4) drop-shadow(0 0 12px rgba(74,222,128,0.8))', scale: 1.08 },
  wrong:       { filter: 'brightness(0.8) saturate(0.6)', rotate: -5 },
  points:      { filter: 'brightness(1.15) saturate(1.3) drop-shadow(0 0 10px rgba(245,182,66,0.7))', scale: 1.06 },
  scoreboard:  { filter: 'brightness(1.05) saturate(1.1)' },
  winner:      { filter: 'brightness(1.25) saturate(1.5) drop-shadow(0 0 18px rgba(245,182,66,0.9))', scale: 1.1 },
  paused:      { filter: 'brightness(0.75) saturate(0.5)' },
  countdown:   { filter: 'brightness(1.1) saturate(1.2) drop-shadow(0 0 8px rgba(251,146,60,0.7))', scale: 1.03 },
  round_done:  { filter: 'brightness(1.15) saturate(1.3) drop-shadow(0 0 12px rgba(74,222,128,0.7))', scale: 1.07 },
  question:    { filter: 'brightness(1.05) saturate(1.1)' },
  challenge:   { filter: 'brightness(1.1) saturate(1.2)', scale: 1.04 },
  bye:         { filter: 'brightness(0.95) saturate(0.9)' },
};

const BG_STYLE: Record<string, React.CSSProperties> = {
  none:  {},
  white: { backgroundColor: 'white', borderRadius: '50%', padding: 4 },
  dark:  { backgroundColor: '#0D0D0D', borderRadius: '50%', padding: 4 },
  gold:  { background: 'radial-gradient(circle, rgba(245,182,66,0.25) 0%, transparent 70%)', borderRadius: '50%' },
};

export function JonnyAvatar({
  mood = 'idle',
  size = 100,
  className = '',
  background = 'none',
}: JonnyAvatarProps) {
  const moodStyle = MOOD_FILTER[mood] ?? {};
  const isCelebrating = mood === 'winner' || mood === 'correct' || mood === 'round_done' || mood === 'points';
  const isWrong = mood === 'wrong';

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        position: 'relative',
        flexShrink: 0,
        ...BG_STYLE[background],
      }}
    >
      {isCelebrating && (
        <div style={{
          position: 'absolute', inset: -8, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(245,182,66,0.45) 0%, transparent 70%)',
          animation: 'pulse 1s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
      )}

      <motion.img
        src="/jonny-master.jpg"
        alt={`Jonny — ${mood}`}
        draggable={false}
        key={mood}
        initial={{ scale: 0.9, opacity: 0.7 }}
        animate={{
          scale: moodStyle.scale ?? 1,
          rotate: moodStyle.rotate ?? 0,
          opacity: 1,
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          objectPosition: 'center bottom',
          filter: moodStyle.filter,
          userSelect: 'none',
        }}
      />

      {isCelebrating && (
        <svg viewBox="0 0 100 100"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          <circle cx="10" cy="18" r="3" fill="#F5B642" opacity="0.9"/>
          <circle cx="90" cy="18" r="3" fill="#F5B642" opacity="0.9"/>
          <circle cx="4"  cy="46" r="1.8" fill="#F5B642" opacity="0.7"/>
          <circle cx="96" cy="46" r="1.8" fill="#F5B642" opacity="0.7"/>
          <path d="M 10 12 L 10 24 M 4 18 L 16 18"  stroke="#F5B642" strokeWidth="1.8" strokeLinecap="round" opacity="0.8"/>
          <path d="M 90 12 L 90 24 M 84 18 L 96 18" stroke="#F5B642" strokeWidth="1.8" strokeLinecap="round" opacity="0.8"/>
        </svg>
      )}

      {isWrong && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(239,68,68,0.25) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
      )}
    </div>
  );
}
