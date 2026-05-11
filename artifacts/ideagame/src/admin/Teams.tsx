import { useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { useT } from '@/i18n';
import { UserPlus, Trash2, Loader2, Pencil, Check, X, Users } from 'lucide-react';
import {
  useListEvents,
  useListTeams, getListTeamsQueryKey,
  useListPlayers, getListPlayersQueryKey,
  useUpdatePlayer, useDeletePlayer, useJoinPlayer,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Player, Team } from '@workspace/api-client-react';

export default function Players() {
  const t = useT();
  const qc = useQueryClient();
  const { data: events = [] } = useListEvents();
  const [eventId, setEventId] = useState('');
  const activeId = eventId || events.find(e => e.status === 'live')?.id || events[0]?.id || '';
  const activeEvent = events.find(e => e.id === activeId);

  const { data: teams = [] } = useListTeams(activeId, { query: { queryKey: getListTeamsQueryKey(activeId), enabled: !!activeId } });
  const { data: players = [], isLoading } = useListPlayers(activeId, { query: { queryKey: getListPlayersQueryKey(activeId), enabled: !!activeId } });

  const updatePlayer = useUpdatePlayer();
  const deletePlayer = useDeletePlayer();
  const joinPlayer = useJoinPlayer();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNick, setEditNick] = useState('');
  const [editTeamId, setEditTeamId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newNick, setNewNick] = useState('');
  const [newTeamId, setNewTeamId] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const refreshPlayers = () => qc.invalidateQueries({ queryKey: getListPlayersQueryKey(activeId) });

  const startEdit = (p: Player) => {
    setEditingId(p.id);
    setEditNick(p.nickname);
    setEditTeamId(p.teamId ?? null);
  };

  const saveEdit = async (p: Player) => {
    try {
      await updatePlayer.mutateAsync({ id: p.id, data: { nickname: editNick.trim() || p.nickname, teamId: editTeamId } });
      setEditingId(null);
      refreshPlayers();
    } catch { /* keep editing */ }
  };

  const handleDelete = async (id: string, nick: string) => {
    if (!confirm(`Rimuovere "${nick}" dall'evento?`)) return;
    await deletePlayer.mutateAsync({ id });
    refreshPlayers();
  };

  const handleAdd = async () => {
    if (!newNick.trim() || !activeId) return;
    setAddError(null);
    try {
      await joinPlayer.mutateAsync({ id: activeId, data: { nickname: newNick.trim(), teamId: newTeamId || null } });
      setNewNick('');
      setNewTeamId('');
      setAddOpen(false);
      refreshPlayers();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Errore aggiunta giocatore');
    }
  };

  const teamName = (id: string | null | undefined) => {
    if (!id) return null;
    return (teams as Team[]).find(t => t.id === id)?.name ?? null;
  };

  const teamColor = (id: string | null | undefined) => {
    if (!id) return '#888';
    return (teams as Team[]).find(t => t.id === id)?.color ?? '#888';
  };

  const online = players.filter(p => p.isConnected).length;

  return (
    <AdminLayout title={t('admin.teams')}>
      {/* Event selector */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select
          value={activeId}
          onChange={e => setEventId(e.target.value)}
          className="rounded-xl border border-border bg-background/40 px-4 py-2 text-sm font-bold outline-none"
        >
          {events.map(ev => (
            <option key={ev.id} value={ev.id}>
              {ev.name} {ev.status === 'live' ? '🔴' : ev.status === 'ended' ? '✓' : ''}
            </option>
          ))}
        </select>
        {activeId && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{players.length} giocatori</span>
            {online > 0 && <span className="text-green-400">· {online} online</span>}
          </div>
        )}
        <div className="flex-1" />
        <button
          disabled={!activeId}
          onClick={() => { setAddOpen(true); setAddError(null); }}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover-elevate disabled:opacity-40"
        >
          <UserPlus className="h-4 w-4" /> Aggiungi manualmente
        </button>
      </div>

      {!activeId ? (
        <div className="rounded-2xl border border-border bg-card/40 p-10 text-center text-muted-foreground">Nessun evento disponibile.</div>
      ) : isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Giocatore</th>
                  <th className="px-5 py-3">Squadra</th>
                  <th className="px-5 py-3">Stato</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {players.map(p => {
                  const isEditing = editingId === p.id;
                  return (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-secondary/10 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black text-background"
                               style={{ background: p.avatarColor }}>
                            {p.nickname[0]?.toUpperCase()}
                          </div>
                          {isEditing ? (
                            <input
                              autoFocus
                              value={editNick}
                              onChange={e => setEditNick(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveEdit(p); if (e.key === 'Escape') setEditingId(null); }}
                              className="rounded-lg border border-primary bg-background px-2 py-1 text-sm font-bold outline-none"
                            />
                          ) : (
                            <span className="font-bold">{p.nickname}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        {isEditing ? (
                          <select
                            value={editTeamId ?? ''}
                            onChange={e => setEditTeamId(e.target.value || null)}
                            className="rounded-lg border border-border bg-background/40 px-2 py-1 text-sm outline-none"
                          >
                            <option value="">— nessuna —</option>
                            {(teams as Team[]).map(tm => (
                              <option key={tm.id} value={tm.id}>{tm.name}</option>
                            ))}
                          </select>
                        ) : p.teamId ? (
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full" style={{ background: teamColor(p.teamId) }} />
                            <span className="text-sm">{teamName(p.teamId) ?? '—'}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${p.isConnected ? 'bg-green-500/15 text-green-400' : 'bg-secondary text-muted-foreground'}`}>
                          {p.isConnected ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {isEditing ? (
                            <>
                              <button onClick={() => saveEdit(p)} disabled={updatePlayer.isPending}
                                className="rounded-lg border border-green-500/50 p-2 text-green-400 hover-elevate disabled:opacity-40">
                                <Check className="h-4 w-4" />
                              </button>
                              <button onClick={() => setEditingId(null)} className="rounded-lg border border-border p-2 hover-elevate">
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <button onClick={() => startEdit(p)} className="rounded-lg border border-border p-2 hover-elevate">
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          <button onClick={() => handleDelete(p.id, p.nickname)}
                            className="rounded-lg border border-border p-2 text-destructive hover-elevate">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {players.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center text-sm text-muted-foreground">
                      Nessun giocatore ancora — condividi il QR code dell'evento!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add player manually */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={() => setAddOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UserPlus className="h-5 w-5" />
              </div>
              <div className="text-display text-xl font-black">Aggiungi giocatore</div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Nickname *</div>
                <input
                  autoFocus
                  value={newNick}
                  onChange={e => setNewNick(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder="es. Marco"
                  className="w-full rounded-xl border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary"
                />
              </div>
              <div>
                <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Squadra</div>
                <select
                  value={newTeamId}
                  onChange={e => setNewTeamId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background/40 px-3 py-2 outline-none"
                >
                  <option value="">— individuale —</option>
                  {(teams as Team[]).map(tm => (
                    <option key={tm.id} value={tm.id}>{tm.name}</option>
                  ))}
                </select>
              </div>
              {addError && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{addError}</div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setAddOpen(false)} className="rounded-xl border border-border px-4 py-2 hover-elevate">Annulla</button>
              <button
                disabled={!newNick.trim() || joinPlayer.isPending}
                onClick={handleAdd}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50"
              >
                {joinPlayer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Aggiungi
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
