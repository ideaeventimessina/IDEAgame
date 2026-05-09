import type { JonnyMood } from '@/contexts/JonnyContext';

interface JonnyAvatarProps {
  mood?: JonnyMood;
  size?: number;
  className?: string;
}

interface FaceProps {
  mood: JonnyMood;
}

function EyeLeft({ mood }: FaceProps) {
  const excited = mood === 'excited' || mood === 'cheering' || mood === 'celebrating';
  const r = excited ? 7.5 : 6.5;
  return (
    <>
      <circle cx="33.5" cy="67" r={r} fill="#1A1A2E"/>
      <circle cx="30" cy="63.5" r="2.2" fill="white"/>
      <circle cx="37" cy="70.5" r="1.4" fill="#D4AF37"/>
      {mood === 'cheering' && <path d="M 27 67 Q 33.5 62 40 67" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>}
    </>
  );
}

function EyeRight({ mood }: FaceProps) {
  const excited = mood === 'excited' || mood === 'cheering' || mood === 'celebrating';
  const r = excited ? 7.5 : 6.5;
  return (
    <>
      <circle cx="66.5" cy="67" r={r} fill="#1A1A2E"/>
      <circle cx="63" cy="63.5" r="2.2" fill="white"/>
      <circle cx="70" cy="70.5" r="1.4" fill="#D4AF37"/>
      {mood === 'cheering' && <path d="M 60 67 Q 66.5 62 73 67" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>}
    </>
  );
}

function Eyebrows({ mood }: FaceProps) {
  const raised = mood === 'excited' || mood === 'celebrating';
  const thinking = mood === 'thinking';
  const yL = raised ? 49 : thinking ? 57 : 56;
  const yLMid = raised ? 45 : thinking ? 52 : 51;
  const yR = raised ? 49 : 56;
  const yRMid = raised ? 45 : thinking ? 49 : 51;
  return (
    <>
      <path d={`M 23 ${yL} Q 33.5 ${yLMid} 44 ${yL}`} stroke="#3D2B1F" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <path d={`M 56 ${yR} Q 66.5 ${yRMid} 77 ${yR}`} stroke="#3D2B1F" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    </>
  );
}

function Mouth({ mood }: FaceProps) {
  if (mood === 'cheering') {
    return (
      <>
        <path d="M 38 85 Q 50 97 62 85" stroke="#8B5E3C" strokeWidth="2.5" fill="#F5C2A7" strokeLinecap="round"/>
        <path d="M 40 87 Q 50 96 60 87" fill="none" stroke="#8B5E3C" strokeWidth="0" />
      </>
    );
  }
  if (mood === 'celebrating') {
    return (
      <>
        <path d="M 37 86 Q 50 98 63 86" stroke="#8B5E3C" strokeWidth="2.5" fill="#F5CBA7" strokeLinecap="round"/>
        <path d="M 42 90 Q 50 95 58 90" stroke="#C0735A" strokeWidth="1.5" fill="none"/>
      </>
    );
  }
  if (mood === 'thinking') {
    return <path d="M 42 88 Q 50 91 58 88" stroke="#8B5E3C" strokeWidth="2" fill="none" strokeLinecap="round"/>;
  }
  if (mood === 'excited') {
    return <path d="M 39 87 Q 50 96 61 87" stroke="#8B5E3C" strokeWidth="2.5" fill="none" strokeLinecap="round"/>;
  }
  return <path d="M 40 87 Q 50 94 60 87" stroke="#8B5E3C" strokeWidth="2.5" fill="none" strokeLinecap="round"/>;
}

function CelebrationSparkles() {
  return (
    <>
      <circle cx="14" cy="28" r="2.5" fill="#D4AF37" opacity="0.9"/>
      <circle cx="86" cy="28" r="2.5" fill="#D4AF37" opacity="0.9"/>
      <circle cx="8"  cy="48" r="1.5" fill="#D4AF37" opacity="0.7"/>
      <circle cx="92" cy="48" r="1.5" fill="#D4AF37" opacity="0.7"/>
      <path d="M 14 22 L 14 34 M 8 28 L 20 28" stroke="#D4AF37" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
      <path d="M 86 22 L 86 34 M 80 28 L 92 28" stroke="#D4AF37" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
    </>
  );
}

export function JonnyAvatar({ mood = 'idle', size = 100, className = '' }: JonnyAvatarProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 110"
      width={size}
      height={size * 1.1}
      className={className}
      role="img"
      aria-label="Jonny co-host"
    >
      {(mood === 'celebrating') && <CelebrationSparkles />}

      {/* Ears */}
      <ellipse cx="18" cy="66" rx="8" ry="9" fill="#F5CBA7"/>
      <ellipse cx="18" cy="66" rx="5" ry="5.5" fill="#EDB894"/>
      <ellipse cx="82" cy="66" rx="8" ry="9" fill="#F5CBA7"/>
      <ellipse cx="82" cy="66" rx="5" ry="5.5" fill="#EDB894"/>

      {/* Face */}
      <ellipse cx="50" cy="68" rx="32" ry="30" fill="#F5CBA7"/>

      {/* Hair — back/sides */}
      <path d="M 19 58 C 19 36, 30 20, 50 18 C 70 20, 81 36, 81 58 L 81 52 C 80 28, 66 14, 50 14 C 34 14, 20 28, 19 52 Z" fill="#0D0D0D"/>

      {/* Pompadour quiff */}
      <path d="
        M 28 54
        C 26 42, 28 28, 38 18
        C 43 10, 50 5, 55 7
        C 63 5, 72 13, 70 27
        C 74 18, 80 22, 76 36
        C 71 24, 62 18, 56 22
        C 50 28, 44 36, 36 44
        C 31 48, 28 52, 28 54 Z
      " fill="#111111"/>

      {/* Gold highlight */}
      <path d="M 55 7 C 63 5, 72 12, 70 25 C 66 16, 59 10, 55 12 Z" fill="#D4AF37" opacity="0.85"/>
      <path d="M 70 25 C 76 20, 80 26, 76 36 C 74 28, 72 23, 70 27 Z" fill="#D4AF37" opacity="0.5"/>

      {/* Beard shadow */}
      <ellipse cx="50" cy="94" rx="16" ry="7" fill="#8B6040" opacity="0.3"/>

      {/* Glasses lenses */}
      <rect x="21" y="57" width="25" height="17" rx="4" fill="white" opacity="0.88"/>
      <rect x="54" y="57" width="25" height="17" rx="4" fill="white" opacity="0.88"/>

      {/* Glasses frames */}
      <rect x="21" y="57" width="25" height="17" rx="4" fill="none" stroke="#0D0D0D" strokeWidth="3"/>
      <rect x="54" y="57" width="25" height="17" rx="4" fill="none" stroke="#0D0D0D" strokeWidth="3"/>

      {/* Bridge + arms */}
      <line x1="46" y1="65" x2="54" y2="65" stroke="#0D0D0D" strokeWidth="2.5"/>
      <line x1="21" y1="65" x2="13" y2="63" stroke="#0D0D0D" strokeWidth="2.5"/>
      <line x1="79" y1="65" x2="87" y2="63" stroke="#0D0D0D" strokeWidth="2.5"/>

      {/* Gold top bar */}
      <rect x="21" y="57" width="25" height="3.5" rx="1" fill="#D4AF37"/>
      <rect x="54" y="57" width="25" height="3.5" rx="1" fill="#D4AF37"/>

      {/* Eyebrows */}
      <Eyebrows mood={mood}/>

      {/* Eyes */}
      <EyeLeft mood={mood}/>
      <EyeRight mood={mood}/>

      {/* Nose */}
      <ellipse cx="50" cy="80" rx="3" ry="2.2" fill="#E0A880"/>

      {/* Mouth */}
      <Mouth mood={mood}/>

      {/* Cheeks */}
      <ellipse cx="24" cy="79" rx="7" ry="5" fill="#FFB3A7" opacity="0.32"/>
      <ellipse cx="76" cy="79" rx="7" ry="5" fill="#FFB3A7" opacity="0.32"/>
    </svg>
  );
}
