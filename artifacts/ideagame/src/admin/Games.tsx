import { useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { GameIcon } from '@/components/GameIcon';
import { useT } from '@/i18n';
import {
  useListGames, useUpdateGame,
  getListGamesQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Settings2, ToggleLeft, ToggleRight, X } from 'lucide-react';

type IconName = Parameters<typeof GameIcon>[0]['name'];

type GameSettings = { rounds?: number; timeLimit?: number; scoringWeight?: number };
type GameItem = {
  id: string; slug: string; name: string; tagline: string;
  accentColor: string; icon: string; enabled: boolean; adultOnly: boolean;
  settings: GameSettings;
};

export default function Games() {
  const t = useT();
  const qc = useQueryClient();
  const { data: games = [], isLoading } = useListGames(
    { all: true } as Parameters<typeof useListGames>[0],
    { query: { queryKey: getListGamesQueryKey({ all: true } as Parameters<typeof getListGamesQueryKey>[0]) } }
  );
  const update = useUpdateGame();

  const [editOpen, setEditOpen] = useState(false);
  const [editGame, setEditGame] = useState<GameItem | null>(null);
  const [editSettings, setEditSettings] = useState<GameSettings>({});
  const [editBusy, setEditBusy] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListGamesQueryKey() });
    qc.invalidateQueries({ queryKey: getListGamesQueryKey({ all: true } as Parameters<typeof getListGamesQueryKey>[0]) });
  };

  const handleToggle = async (g: GameItem) => {
    await update.mutateAsync({ id: g.id, data: { enabled: !g.enabled } });
    refresh();
  };

  const openEdit = (g: GameItem) => {
    setEditGame(g);
    setEditSettings({ ...g.settings });
    setEditOpen(true);
  };

  const handleSaveSettings = async () => {
    if (!editGame) return;
    setEditBusy(true);
    try {
      await update.mutateAsync({ id: editGame.id, data: { settings: editSettings } });
      setEditOpen(false);
      refresh();
    } catch { /* silent */ }
    finally { setEditBusy(false); }
  };

  if (isLoading) return (
    <AdminLayout title={t('admin.games')}>
      <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
    </AdminLayout>
  );

  return (
    <AdminLayout title={t('admin.games')}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(games as GameItem[]).map(g => {
          const s = (g.settings ?? {}) as GameSettings;
          return (
            <div key={g.id}
              className={`relative overflow-hidden rounded-2xl border bg-card p-6 transition-opacity ${g.enabled ? 'border-border' : 'border-border/40 opacity-50'}`}>
              <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full opacity-20"
                   style={{ background: `radial-gradient(circle, ${g.accentColor}, transparent)` }} />

              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl shrink-0"
                       style={{ background: `${g.accentColor}22`, color: g.accentColor }}>
                    <GameIcon name={g.icon as IconName} className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-display text-xl font-black" style={{ color: g.accentColor }}>{g.name}</div>
                    <div className="text-sm text-muted-foreground">{g.tagline}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {g.adultOnly && (
                    <div className="rounded-full border border-destructive/60 bg-destructive/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-destructive">18+</div>
                  )}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                {[
                  { l: 'Rounds', v: s.rounds ?? '—' },
                  { l: 'Time', v: s.timeLimit ? `${s.timeLimit}s` : '—' },
                  { l: 'Weight', v: s.scoringWeight ? `×${s.scoringWeight}` : '—' },
                ].map(stat => (
                  <div key={stat.l} className="rounded-xl border border-border bg-background/40 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{stat.l}</div>
                    <div className="text-display text-lg font-black">{stat.v}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <button
                  onClick={() => handleToggle(g)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                    g.enabled
                      ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                      : 'bg-secondary text-muted-foreground hover:bg-secondary/60'
                  }`}
                >
                  {g.enabled
                    ? <><ToggleRight className="h-4 w-4" /> Attivo</>
                    : <><ToggleLeft className="h-4 w-4" /> Disattivato</>
                  }
                </button>
                <button
                  onClick={() => openEdit(g)}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover-elevate"
                >
                  <Settings2 className="h-3.5 w-3.5" /> Impostazioni
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Modifica impostazioni gioco ───────────────── */}
      {editOpen && editGame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={() => setEditOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
                     style={{ background: `${editGame.accentColor}22`, color: editGame.accentColor }}>
                  <GameIcon name={editGame.icon as IconName} className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-display text-xl font-black" style={{ color: editGame.accentColor }}>{editGame.name}</div>
                  <div className="text-xs text-muted-foreground">Impostazioni partita</div>
                </div>
              </div>
              <button onClick={() => setEditOpen(false)} className="rounded-lg border border-border p-1.5 hover-elevate">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <NumField label="Rounds" value={editSettings.rounds}
                onChange={v => setEditSettings({ ...editSettings, rounds: v })} />
              <NumField label="Tempo limite (secondi)" value={editSettings.timeLimit}
                onChange={v => setEditSettings({ ...editSettings, timeLimit: v })} />
              <NumField label="Peso punteggio (moltiplicatore)" value={editSettings.scoringWeight} step={0.1}
                onChange={v => setEditSettings({ ...editSettings, scoringWeight: v })} />
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setEditOpen(false)} className="rounded-xl border border-border px-4 py-2 hover-elevate">Annulla</button>
              <button
                disabled={editBusy}
                onClick={handleSaveSettings}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50"
              >
                {editBusy ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</> : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function NumField({ label, value, onChange, step = 1 }: {
  label: string; value?: number; onChange: (v: number | undefined) => void; step?: number;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <input
        type="number" step={step} min={0}
        value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
        className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary"
        placeholder="—"
      />
    </label>
  );
}
