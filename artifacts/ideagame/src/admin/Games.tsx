import { AdminLayout } from './AdminLayout';
import { GameIcon } from '@/components/GameIcon';
import { useT } from '@/i18n';
import { useListGames } from '@workspace/api-client-react';
import { Loader2 } from 'lucide-react';

type IconName = Parameters<typeof GameIcon>[0]['name'];

export default function Games() {
  const t = useT();
  const { data: games = [], isLoading } = useListGames();

  if (isLoading) return (
    <AdminLayout title={t('admin.games')}>
      <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
    </AdminLayout>
  );

  return (
    <AdminLayout title={t('admin.games')}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {games.map(g => {
          const settings = (g.settings ?? {}) as { rounds?: number; timeLimit?: number; scoringWeight?: number };
          return (
            <div key={g.id} className="relative overflow-hidden rounded-2xl border border-border bg-card p-6">
              <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full opacity-20"
                   style={{ background: `radial-gradient(circle, ${g.accentColor}, transparent)` }} />
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl"
                       style={{ background: `${g.accentColor}22`, color: g.accentColor }}>
                    <GameIcon name={g.icon as IconName} className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-display text-xl font-black" style={{ color: g.accentColor }}>{g.name}</div>
                    <div className="text-sm text-muted-foreground">{g.tagline}</div>
                  </div>
                </div>
                {g.adultOnly && (
                  <div className="rounded-full border border-destructive/60 bg-destructive/10 px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest text-destructive">18+</div>
                )}
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                {[
                  { l: 'Rounds', v: settings.rounds ?? '—' },
                  { l: 'Time', v: settings.timeLimit ? `${settings.timeLimit}s` : '—' },
                  { l: 'Weight', v: settings.scoringWeight ? `×${settings.scoringWeight}` : '—' },
                ].map(s => (
                  <div key={s.l} className="rounded-xl border border-border bg-background/40 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.l}</div>
                    <div className="text-display text-lg font-black">{s.v}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </AdminLayout>
  );
}
