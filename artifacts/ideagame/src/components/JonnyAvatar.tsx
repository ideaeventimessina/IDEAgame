/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* ADATTATORE LEGACY → motore unico. Questo componente ora DELEGA a JohhyAvatar: i
   chiamanti esistenti (`<JonnyAvatar mood=…>`) continuano a funzionare, ma il
   rendering è UNO SOLO (src/jonny/JohhyAvatar). Niente logica duplicata qui. */

import type { JonnyMood } from '@/contexts/JonnyContext';
import { JohhyAvatar, moodToState } from '@/jonny/JohhyAvatar';

interface JonnyAvatarProps {
  mood?: JonnyMood;
  size?: number;
  className?: string;
  background?: 'none' | 'white' | 'dark' | 'gold';
  /** false = disattiva il micro-movimento continuo (raro; default ON). */
  alive?: boolean;
}

const BG_STYLE: Record<string, React.CSSProperties> = {
  none:  {},
  white: { backgroundColor: 'white', borderRadius: '50%', padding: 4 },
  dark:  { backgroundColor: '#0D0D0D', borderRadius: '50%', padding: 4 },
  gold:  { background: 'radial-gradient(circle, rgba(245,182,66,0.25) 0%, transparent 70%)', borderRadius: '50%' },
};

export function JonnyAvatar({ mood = 'idle', size = 100, className = '', background = 'none', alive = true }: JonnyAvatarProps) {
  return (
    <JohhyAvatar
      state={moodToState(mood)}
      size={size}
      alive={alive}
      className={className}
      style={BG_STYLE[background]}
    />
  );
}
