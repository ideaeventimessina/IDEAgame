import type { JonnyMood } from '@/contexts/JonnyContext';

interface JonnyAvatarProps {
  mood?: JonnyMood;
  size?: number;
  className?: string;
  background?: 'none' | 'white' | 'dark' | 'gold';
}

const MOOD_FILTER: Record<JonnyMood, string> = {
  idle:        'none',
  excited:     'brightness(1.08) saturate(1.15)',
  thinking:    'brightness(0.92) saturate(0.85)',
  cheering:    'brightness(1.12) saturate(1.2) hue-rotate(-5deg)',
  celebrating: 'brightness(1.15) saturate(1.25)',
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
  const celebrating = mood === 'celebrating';

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
      {/* Celebration glow ring */}
      {celebrating && (
        <div
          style={{
            position: 'absolute',
            inset: -4,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(212,175,55,0.45) 0%, transparent 70%)',
            animation: 'pulse 1s ease-in-out infinite',
          }}
        />
      )}

      {/* The actual Jonny head PNG */}
      <img
        src="/jonny-head.png"
        alt="Jonny co-host"
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          objectPosition: 'center',
          filter: MOOD_FILTER[mood],
          transition: 'filter 0.4s ease',
          userSelect: 'none',
        }}
      />

      {/* Celebrating sparkles overlay */}
      {celebrating && (
        <svg
          viewBox="0 0 100 100"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          <circle cx="10" cy="20" r="3" fill="#D4AF37" opacity="0.9"/>
          <circle cx="90" cy="20" r="3" fill="#D4AF37" opacity="0.9"/>
          <circle cx="5"  cy="50" r="2" fill="#D4AF37" opacity="0.7"/>
          <circle cx="95" cy="50" r="2" fill="#D4AF37" opacity="0.7"/>
          <path d="M 10 14 L 10 26 M 4 20 L 16 20"  stroke="#D4AF37" strokeWidth="1.8" strokeLinecap="round" opacity="0.7"/>
          <path d="M 90 14 L 90 26 M 84 20 L 96 20" stroke="#D4AF37" strokeWidth="1.8" strokeLinecap="round" opacity="0.7"/>
        </svg>
      )}
    </div>
  );
}
