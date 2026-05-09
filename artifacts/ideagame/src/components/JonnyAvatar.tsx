import type { JonnyMood } from '@/contexts/JonnyContext';

interface JonnyAvatarProps {
  mood?: JonnyMood;
  size?: number;
  className?: string;
  background?: 'none' | 'white' | 'dark' | 'gold';
}

const BG_STYLE: Record<string, React.CSSProperties> = {
  none:  {},
  white: { backgroundColor: 'white', borderRadius: '50%', padding: 4 },
  dark:  { backgroundColor: '#0D0D0D', borderRadius: '50%', padding: 4 },
  gold:  { background: 'radial-gradient(circle, rgba(245,182,66,0.25) 0%, transparent 70%)', borderRadius: '50%' },
};

export function JonnyAvatar({
  size = 100,
  className = '',
  background = 'none',
}: JonnyAvatarProps) {
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: size * 0.55,
        lineHeight: 1,
        ...BG_STYLE[background],
      }}
    >
      🎤
    </div>
  );
}
