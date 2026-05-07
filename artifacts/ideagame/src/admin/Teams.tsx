import { useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { useT } from '@/i18n';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import {
  useListEvents,
  useListTeams, getListTeamsQueryKey, useCreateTeam, useDeleteTeam,
  useListPlayers, getListPlayersQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

const PALETTE = ['#F5B642', '#E84A8E', '#5BC0EB', '#9B5DE5', '#00F5A0', '#FF1F6D'];

export default function Teams() {
  const t = useT();
  const qc = useQueryClient();
  const { data: events = [] } = useListEvents();
  const [eventId, setEventId] = useState('');
  const activeId = eventId || events[0]?.id || '';
  const { data: teams = [] } = useListTeams(activeId, { query: { queryKey: getListTeamsQueryKey(activeId), enabled: !!activeId } });
  const { data: players = [] } = useListPlayers(activeId, { query: { queryKey: getListPlayersQueryKey(activeId), enabled: !!activeId } });
  const create = useCreateTeam();
  const remove = useDeleteTeam();

  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onCreate = async () => {
    if (!activeId || !newName.trim()) return;
    setError(null);
    try {
      const color = PALETTE[teams.length % PALETTE.length]!;
      await create.mutateAsync({ id: activeId, data: { name: newName.trim(), color } });
      setNewName('');
      await qc.invalidateQueries({ queryKey: getListTeamsQueryKey(activeId) });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore creazione team');
    }
  };

  const onDelete = async (id: string) => {
    setError(null);
    try {
      await remove.mutateAsync({ id });
      await qc.invalidateQueries({ queryKey: getListTeamsQueryKey(activeId) });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore eliminazione team');
    }
  };

  return (
    <AdminLayout title={t('admin.teams')}>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <select
          value={activeId}
          onChange={e => setEventId(e.target.value)}
          className="rounded-xl border border-border bg-background/40 px-4 py-2 text-sm font-bold outline-none"
        >
          {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
        </select>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Nome nuovo team"
          className="flex-1 rounded-xl border border-border bg-background/40 px-4 py-2 text-sm outline-none"
        />
        <button
          disabled={!activeId || !newName.trim() || create.isPending}
          onClick={onCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Crea team
        </button>
      </div>

      {error && <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      {!activeId ? (
        <div className="rounded-2xl border border-border bg-card/40 p-10 text-center text-muted-foreground">Nessun evento disponibile.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {teams.map(tm => {
            const tmPlayers = players.filter(p => p.teamId === tm.id);
            return (
              <div key={tm.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="flex items-center justify-between p-5"
                     style={{ background: `linear-gradient(90deg, ${tm.color}33, transparent)` }}>
                  <div className="flex items-center gap-3">
                    <div className="h-5 w-5 rounded-full" style={{ background: tm.color }} />
                    <div className="text-display text-2xl font-black">{tm.name}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-display text-3xl font-black tabular-nums" style={{ color: tm.color }}>
                      {tm.score.toLocaleString()}
                    </div>
                    <button onClick={() => onDelete(tm.id)} className="rounded-lg p-2 text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 p-4">
                  {tmPlayers.length === 0 && <div className="col-span-2 text-center text-xs text-muted-foreground">Nessun giocatore in questo team</div>}
                  {tmPlayers.map(p => (
                    <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-black text-background" style={{ background: p.avatarColor }}>
                        {p.nickname[0]}
                      </div>
                      <div>
                        <div className="font-bold">{p.nickname}</div>
                        <div className="text-xs text-muted-foreground">{p.isConnected ? t('common.online') : t('common.offline')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {teams.length === 0 && <div className="lg:col-span-2 rounded-2xl border border-border bg-card/40 p-10 text-center text-muted-foreground">Nessun team — crea il primo!</div>}
        </div>
      )}
    </AdminLayout>
  );
}
