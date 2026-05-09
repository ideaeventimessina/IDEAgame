import { Sparkles } from 'lucide-react';
import { useLocation } from 'wouter';
import { JonnyAvatar } from '@/components/JonnyAvatar';

interface Props {
  gameSlug: string;
  gameLabel: string;
}

export function JonnyGenerateBanner({ gameSlug, gameLabel }: Props) {
  const [, navigate] = useLocation();

  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-accent/5 to-primary/10 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          <JonnyAvatar mood="excited" size={48} />
        </div>
        <div>
          <div className="text-sm font-black text-foreground">Genera con Jonny AI</div>
          <div className="text-xs text-muted-foreground">
            Crea sfide per{' '}
            <span className="font-semibold text-primary">{gameLabel}</span>{' '}
            in un clic con l'AI
          </div>
        </div>
      </div>
      <button
        onClick={() => navigate(`/admin/jonny-creator?game=${gameSlug}`)}
        className="flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground shadow-lg shadow-primary/20 transition-opacity hover:opacity-90"
      >
        <Sparkles className="h-4 w-4" />
        Genera con Jonny
      </button>
    </div>
  );
}
