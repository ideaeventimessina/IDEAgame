import type { JonnyMood } from '@/contexts/JonnyContext';

interface JonnyAvatarProps {
  mood?: JonnyMood;
  size?: number;
  className?: string;
  background?: 'none' | 'white' | 'dark' | 'gold';
}

interface FaceProps { mood: JonnyMood }

// ── Dynamic eye left ───────────────────────────────────────────────────────────
function EyeLeft({ mood }: FaceProps) {
  const large = mood === 'excited' || mood === 'cheering' || mood === 'celebrating';
  return (
    <>
      <circle cx="33" cy="64" r={large ? 7.5 : 6.5} fill="#12122A"/>
      <circle cx="29.5" cy="60.5" r="2.2" fill="white"/>
      <circle cx="36.5" cy="67.5" r="1.6" fill="#D4AF37"/>
      {mood === 'cheering' && (
        <path d="M 26.5 64 Q 33 58.5 39.5 64" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      )}
    </>
  );
}

// ── Dynamic eye right ──────────────────────────────────────────────────────────
function EyeRight({ mood }: FaceProps) {
  const large = mood === 'excited' || mood === 'cheering' || mood === 'celebrating';
  return (
    <>
      <circle cx="67" cy="64" r={large ? 7.5 : 6.5} fill="#12122A"/>
      <circle cx="63.5" cy="60.5" r="2.2" fill="white"/>
      <circle cx="70.5" cy="67.5" r="1.6" fill="#D4AF37"/>
      {mood === 'cheering' && (
        <path d="M 60.5 64 Q 67 58.5 73.5 64" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      )}
    </>
  );
}

// ── Dynamic eyebrows ───────────────────────────────────────────────────────────
function Eyebrows({ mood }: FaceProps) {
  const raised = mood === 'excited' || mood === 'celebrating';
  const thinking = mood === 'thinking';
  const yL    = raised ? 46 : thinking ? 54 : 52;
  const yLMid = raised ? 42 : thinking ? 49 : 48;
  const yR    = raised ? 46 : 52;
  const yRMid = raised ? 42 : thinking ? 46 : 48;
  return (
    <>
      <path d={`M 22 ${yL} Q 33 ${yLMid} 44 ${yL}`}
            stroke="#2C1F10" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
      <path d={`M 56 ${yR} Q 67 ${yRMid} 78 ${yR}`}
            stroke="#2C1F10" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
    </>
  );
}

// ── Dynamic mouth ──────────────────────────────────────────────────────────────
function Mouth({ mood }: FaceProps) {
  if (mood === 'cheering') {
    return (
      <path d="M 37 82 Q 50 95 63 82"
            stroke="#8B5E3C" strokeWidth="2.8" fill="#F5CBA7" strokeLinecap="round"/>
    );
  }
  if (mood === 'celebrating') {
    return (
      <>
        <path d="M 37 82 Q 50 95 63 82"
              stroke="#8B5E3C" strokeWidth="2.8" fill="#F5CBA7" strokeLinecap="round"/>
        <path d="M 42 87 Q 50 93 58 87" stroke="#C0735A" strokeWidth="1.2" fill="none"/>
      </>
    );
  }
  if (mood === 'thinking') {
    return (
      <path d="M 42 85 Q 50 89 58 85"
            stroke="#8B5E3C" strokeWidth="2" fill="none" strokeLinecap="round"/>
    );
  }
  if (mood === 'excited') {
    return (
      <path d="M 39 83 Q 50 93 61 83"
            stroke="#8B5E3C" strokeWidth="2.8" fill="none" strokeLinecap="round"/>
    );
  }
  return (
    <path d="M 39 83 Q 50 92 61 83"
          stroke="#8B5E3C" strokeWidth="2.8" fill="none" strokeLinecap="round"/>
  );
}

// ── Celebration sparkles ───────────────────────────────────────────────────────
function Sparkles() {
  return (
    <>
      <circle cx="12" cy="25" r="2.5" fill="#D4AF37" opacity="0.9"/>
      <circle cx="88" cy="25" r="2.5" fill="#D4AF37" opacity="0.9"/>
      <circle cx="6"  cy="44" r="1.5" fill="#D4AF37" opacity="0.7"/>
      <circle cx="94" cy="44" r="1.5" fill="#D4AF37" opacity="0.7"/>
      <path d="M 12 19 L 12 31 M 6 25 L 18 25"  stroke="#D4AF37" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
      <path d="M 88 19 L 88 31 M 82 25 L 94 25" stroke="#D4AF37" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
    </>
  );
}

// ── Background circle ──────────────────────────────────────────────────────────
function Background({ type }: { type: JonnyAvatarProps['background'] }) {
  if (type === 'none' || !type) return null;
  const fills: Record<string, string> = {
    white: 'white',
    dark:  '#0D0D0D',
    gold:  '#D4AF37',
  };
  return <circle cx="50" cy="50" r="50" fill={fills[type] ?? 'white'}/>;
}

// ── Main component ─────────────────────────────────────────────────────────────
export function JonnyAvatar({ mood = 'idle', size = 100, className = '', background = 'none' }: JonnyAvatarProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Jonny co-host"
    >
      <Background type={background}/>
      {mood === 'celebrating' && <Sparkles/>}

      {/* Ears */}
      <ellipse cx="20" cy="65" rx="8" ry="9" fill="#F5CBA7"/>
      <ellipse cx="20" cy="65" rx="4.5" ry="5.5" fill="#E8A882"/>
      <ellipse cx="80" cy="65" rx="8" ry="9" fill="#F5CBA7"/>
      <ellipse cx="80" cy="65" rx="4.5" ry="5.5" fill="#E8A882"/>

      {/* Face */}
      <ellipse cx="50" cy="67" rx="30" ry="29" fill="#F5CBA7"/>

      {/* Pompadour — outer mass */}
      <path d="
        M 20 58
        C 19 38, 25 18, 40 10
        C 44  3, 50  0, 56  4
        C 66  2, 76 14, 79 32
        C 83 20, 84 30, 80 48
        C 76 34, 68 24, 58 22
        C 52 26, 46 34, 38 42
        C 29 49, 22 55, 20 58 Z
      " fill="#0D0D0D"/>

      {/* Pompadour — inner quiff fold (depth) */}
      <path d="
        M 56  4
        C 63  2, 72 10, 72 22
        C 68 14, 62  8, 57  8
        C 53 10, 50 14, 50 18
        C 52 10, 53  5, 56  4 Z
      " fill="#1C1C1C"/>

      {/* Gold hair highlight streak */}
      <path d="M 56 4 C 64 2, 74 12, 72 24 C 68 14, 62 8, 57 10 Z"
            fill="#D4AF37" opacity="0.9"/>

      {/* Beard / chin shadow */}
      <ellipse cx="50" cy="93" rx="14" ry="5.5" fill="#8B6040" opacity="0.22"/>

      {/* Glasses — lenses */}
      <rect x="20" y="54" width="26" height="17" rx="4.5" fill="white" opacity="0.92"/>
      <rect x="54" y="54" width="26" height="17" rx="4.5" fill="white" opacity="0.92"/>

      {/* Glasses — frames */}
      <rect x="20" y="54" width="26" height="17" rx="4.5" fill="none" stroke="#0D0D0D" strokeWidth="3.2"/>
      <rect x="54" y="54" width="26" height="17" rx="4.5" fill="none" stroke="#0D0D0D" strokeWidth="3.2"/>

      {/* Bridge + temples */}
      <line x1="46" y1="62" x2="54" y2="62" stroke="#0D0D0D" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="20" y1="62" x2="12" y2="60" stroke="#0D0D0D" strokeWidth="2.8" strokeLinecap="round"/>
      <line x1="80" y1="62" x2="88" y2="60" stroke="#0D0D0D" strokeWidth="2.8" strokeLinecap="round"/>

      {/* Gold accent bar on top of frames */}
      <rect x="20" y="54" width="26" height="3.5" rx="2" fill="#D4AF37"/>
      <rect x="54" y="54" width="26" height="3.5" rx="2" fill="#D4AF37"/>

      {/* Eyebrows */}
      <Eyebrows mood={mood}/>

      {/* Eyes */}
      <EyeLeft mood={mood}/>
      <EyeRight mood={mood}/>

      {/* Nose */}
      <ellipse cx="50" cy="76" rx="2.8" ry="2.2" fill="#D4956A"/>

      {/* Mouth */}
      <Mouth mood={mood}/>

      {/* Cheeks */}
      <ellipse cx="22" cy="75" rx="6.5" ry="4.5" fill="#FFB3A7" opacity="0.30"/>
      <ellipse cx="78" cy="75" rx="6.5" ry="4.5" fill="#FFB3A7" opacity="0.30"/>
    </svg>
  );
}
