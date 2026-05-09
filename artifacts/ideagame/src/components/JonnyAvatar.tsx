import type { JonnyMood } from '@/contexts/JonnyContext';

interface JonnyAvatarProps {
  mood?: JonnyMood;
  size?: number;
  className?: string;
  background?: 'none' | 'white' | 'dark' | 'gold';
}

/** Maps every JonnyMood to its pre-generated PNG in /public/jonny/ */
const MOOD_TO_IMAGE: Record<JonnyMood, string> = {
  idle:        '/jonny/benvenuto.png',
  waiting:     '/jonny/attesa.png',
  excited:     '/jonny/via.png',
  your_turn:   '/jonny/tocca_a_te.png',
  thinking:    '/jonny/pensa.png',
  attention:   '/jonny/attenzione.png',
  answer_sent: '/jonny/risposta_inviata.png',
  correct:     '/jonny/risposta_corretta.png',
  wrong:       '/jonny/risposta_sbagliata.png',
  points:      '/jonny/punti.png',
  scoreboard:  '/jonny/classifica.png',
  winner:      '/jonny/vincitore.png',
  paused:      '/jonny/pausa.png',
  countdown:   '/jonny/ultimi_secondi.png',
  round_done:  '/jonny/round_ok.png',
  question:    '/jonny/domanda.png',
  challenge:   '/jonny/sfida.png',
  bye:         '/jonny/saluti.png',
};

const BG_STYLE: Record<string, React.CSSProperties> = {
  none:  {},
  white: { backgroundColor: 'white', borderRadius: '50%' },
  dark:  { backgroundColor: '#0D0D0D', borderRadius: '50%' },
  gold:  { backgroundColor: '#D4AF37', borderRadius: '50%' },
};

export function JonnyAvatar({
  mood = 'idle',
  size = 100,
  className = '',
  background = 'none',
}: JonnyAvatarProps) {
  const src = MOOD_TO_IMAGE[mood] ?? MOOD_TO_IMAGE.idle;
  const isCelebrating = mood === 'winner' || mood === 'correct' || mood === 'round_done';

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
      {/* Gold celebration glow */}
      {isCelebrating && (
        <div
          style={{
            position: 'absolute',
            inset: -6,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(212,175,55,0.5) 0%, transparent 70%)',
            animation: 'pulse 1s ease-in-out infinite',
            pointerEvents: 'none',
          }}
        />
      )}

      <img
        src={src}
        alt={`Jonny — ${mood}`}
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          objectPosition: 'center bottom',
          transition: 'opacity 0.25s ease',
          userSelect: 'none',
        }}
      />

      {/* Sparkle overlay for winner/correct */}
      {isCelebrating && (
        <svg
          viewBox="0 0 100 100"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          <circle cx="10" cy="18" r="3" fill="#D4AF37" opacity="0.9"/>
          <circle cx="90" cy="18" r="3" fill="#D4AF37" opacity="0.9"/>
          <circle cx="4"  cy="46" r="1.8" fill="#D4AF37" opacity="0.7"/>
          <circle cx="96" cy="46" r="1.8" fill="#D4AF37" opacity="0.7"/>
          <path d="M 10 12 L 10 24 M 4 18 L 16 18"  stroke="#D4AF37" strokeWidth="1.8" strokeLinecap="round" opacity="0.8"/>
          <path d="M 90 12 L 90 24 M 84 18 L 96 18" stroke="#D4AF37" strokeWidth="1.8" strokeLinecap="round" opacity="0.8"/>
        </svg>
      )}
    </div>
  );
}
