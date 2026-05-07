import { useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { GAMES } from '@/data/mock';
import { GameIcon } from '@/components/GameIcon';
import { useT } from '@/i18n';

export default function Games() {
  const t = useT();
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(GAMES.map(g => [g.id, g.enabled]))
  );

  return (
    <AdminLayout title={t('admin.games')}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {GAMES.map(g => (
          <div key={g.id} className="relative overflow-hidden rounded-2xl border border-border bg-card p-6">
            <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full opacity-20"
                 style={{ background: `radial-gradient(circle, ${g.accentColor}, transparent)` }} />
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl"
                     style={{ background: `${g.accentColor}22`, color: g.accentColor }}>
                  <GameIcon name={g.icon} className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-display text-xl font-black" style={{ color: g.accentColor }}>{g.name}</div>
                  <div className="text-sm text-muted-foreground">{g.tagline}</div>
                </div>
              </div>
              <button
                onClick={() => setEnabled(s => ({ ...s, [g.id]: !s[g.id] }))}
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                  enabled[g.id] ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {enabled[g.id] ? t('admin.enabled') : t('admin.disabled')}
              </button>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                { l: 'Rounds', v: g.settings.rounds },
                { l: 'Time', v: `${g.settings.timeLimit}s` },
                { l: 'Weight', v: `×${g.settings.scoringWeight}` },
              ].map(s => (
                <div key={s.l} className="rounded-xl border border-border bg-background/40 p-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.l}</div>
                  <div className="text-display text-lg font-black">{s.v}</div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex gap-2">
              <button className="flex-1 rounded-xl border border-border bg-secondary py-2 text-sm font-bold hover-elevate">{t('admin.edit')}</button>
              <button className="flex-1 rounded-xl border border-border py-2 text-sm font-bold hover-elevate">{t('admin.preview')}</button>
            </div>
            {g.adultOnly && <div className="mt-3 inline-block rounded-full border border-destructive/50 bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase text-destructive">18+</div>}
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}
