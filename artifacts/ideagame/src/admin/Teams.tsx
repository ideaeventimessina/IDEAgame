import { AdminLayout } from './AdminLayout';
import { TEAMS, PLAYERS } from '@/data/mock';
import { useT } from '@/i18n';

export default function Teams() {
  const t = useT();
  return (
    <AdminLayout title={t('admin.teams')}>
      <div className="grid gap-4 lg:grid-cols-2">
        {TEAMS.map(tm => {
          const players = PLAYERS.filter(p => p.teamId === tm.id);
          return (
            <div key={tm.id} className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between p-5"
                   style={{ background: `linear-gradient(90deg, ${tm.color}33, transparent)` }}>
                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 rounded-full" style={{ background: tm.color }} />
                  <div className="text-display text-2xl font-black">{tm.name}</div>
                </div>
                <div className="text-display text-3xl font-black tabular-nums" style={{ color: tm.color }}>
                  {tm.score.toLocaleString()}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 p-4">
                {players.map(p => (
                  <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-black text-background" style={{ background: p.avatarColor }}>
                      {p.nickname[0]}
                    </div>
                    <div>
                      <div className="font-bold">{p.nickname}</div>
                      <div className="text-xs text-muted-foreground">{p.connected ? t('common.online') : t('common.offline')}</div>
                    </div>
                    <div className="ml-auto text-mono text-sm font-bold">{p.score}</div>
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
