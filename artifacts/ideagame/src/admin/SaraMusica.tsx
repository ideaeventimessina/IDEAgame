import { useState, useEffect, useCallback } from 'react';
import { PlusCircle, Trash2, Music2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { AdminLayout } from './AdminLayout';
import { JonnyGenerateBanner } from '@/components/JonnyGenerateBanner';

interface SaraMusicaSet {
  id: string; title: string; description: string; isActive: boolean; createdAt: string;
}
interface SaraMusicaTrack {
  id: string; setId: string; title: string; artist: string;
  challengeType: 'indovina' | 'canta' | 'rumore';
  snippetHint: string; audioUrl: string | null;
  durationSeconds: number; points: number; orderIndex: number; isActive: boolean;
}

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, init?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...init });
  if (!r.ok) throw new Error(await r.text().catch(() => r.statusText));
  if (r.status === 204) return null;
  return r.json();
}

const CHALLENGE_LABELS = {
  indovina: '🎵 Indovina',
  canta: '🎤 Canta',
  rumore: '📣 Rumore',
};

export default function AdminSaraMusica() {
  const [sets, setSets] = useState<SaraMusicaSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSetId, setExpandedSetId] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Record<string, SaraMusicaTrack[]>>({});
  const [busy, setBusy] = useState(false);

  const [newSetTitle, setNewSetTitle] = useState('');
  const [newSetDesc, setNewSetDesc] = useState('');
  const [showNewSet, setShowNewSet] = useState(false);

  const [newTrack, setNewTrack] = useState({
    title: '', artist: '', challengeType: 'indovina' as SaraMusicaTrack['challengeType'],
    snippetHint: '', audioUrl: '', durationSeconds: 30, points: 100,
  });

  const loadSets = useCallback(async () => {
    setLoading(true);
    try { setSets(await apiFetch('/saramusica/sets')); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadSets(); }, [loadSets]);

  const loadTracks = async (setId: string) => {
    try {
      const data = await apiFetch(`/saramusica/sets/${setId}/tracks`);
      setTracks(t => ({ ...t, [setId]: data }));
    } catch { /* ignore */ }
  };

  const toggleSet = (id: string) => {
    if (expandedSetId === id) { setExpandedSetId(null); }
    else { setExpandedSetId(id); void loadTracks(id); }
  };

  const createSet = async () => {
    if (!newSetTitle.trim() || busy) return;
    setBusy(true);
    try {
      await apiFetch('/saramusica/sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newSetTitle.trim(), description: newSetDesc.trim() }),
      });
      setNewSetTitle(''); setNewSetDesc(''); setShowNewSet(false);
      await loadSets();
    } catch { /* ignore */ }
    finally { setBusy(false); }
  };

  const deleteSet = async (id: string) => {
    if (!confirm('Eliminare questo set e tutte le sue tracce?')) return;
    await apiFetch(`/saramusica/sets/${id}`, { method: 'DELETE' });
    await loadSets();
  };

  const createTrack = async (setId: string) => {
    if (!newTrack.title.trim() || !newTrack.artist.trim() || busy) return;
    setBusy(true);
    try {
      await apiFetch(`/saramusica/sets/${setId}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newTrack,
          audioUrl: newTrack.audioUrl.trim() || null,
          orderIndex: (tracks[setId]?.length ?? 0),
        }),
      });
      setNewTrack({ title: '', artist: '', challengeType: 'indovina', snippetHint: '', audioUrl: '', durationSeconds: 30, points: 100 });
      await loadTracks(setId);
    } catch { /* ignore */ }
    finally { setBusy(false); }
  };

  const deleteTrack = async (trackId: string, setId: string) => {
    await apiFetch(`/saramusica/tracks/${trackId}`, { method: 'DELETE' });
    await loadTracks(setId);
  };

  return (
    <AdminLayout title="SaraMusica">
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Music2 className="h-6 w-6 text-primary" />
          <h1 className="text-display text-2xl font-black">SaraMusica — Catalogo</h1>
        </div>
        <button onClick={() => setShowNewSet(v => !v)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover-elevate">
          <PlusCircle className="h-4 w-4" /> Nuovo set
        </button>
      </div>

      <JonnyGenerateBanner gameSlug="saramusica" gameLabel="SaraMusica" />

      {/* New set form */}
      {showNewSet && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Nuovo set</div>
          <input value={newSetTitle} onChange={e => setNewSetTitle(e.target.value)}
            placeholder="Nome set (es. Classici italiani)"
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" />
          <input value={newSetDesc} onChange={e => setNewSetDesc(e.target.value)}
            placeholder="Descrizione (opzionale)"
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm" />
          <button onClick={() => void createSet()} disabled={!newSetTitle.trim() || busy}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crea set'}
          </button>
        </div>
      )}

      {/* Sets list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : sets.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
          Nessun set creato. Crea il primo set musicale!
        </div>
      ) : (
        <div className="space-y-4">
          {sets.map(set => (
            <div key={set.id} className="rounded-2xl border border-border bg-card overflow-hidden">
              {/* Set header */}
              <div className="flex items-center gap-4 px-5 py-4">
                <button onClick={() => toggleSet(set.id)} className="flex flex-1 items-center gap-3 text-left">
                  {expandedSetId === set.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  <div>
                    <div className="text-display font-black">{set.title}</div>
                    {set.description && <div className="text-xs text-muted-foreground">{set.description}</div>}
                  </div>
                </button>
                <span className="text-xs text-muted-foreground">{tracks[set.id]?.length ?? '?'} tracce</span>
                <button onClick={() => void deleteSet(set.id)}
                  className="rounded-xl border border-destructive/40 p-2 text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* Tracks */}
              {expandedSetId === set.id && (
                <div className="border-t border-border px-5 pb-5 pt-4 space-y-4">
                  {/* Track list */}
                  <div className="space-y-2">
                    {(tracks[set.id] ?? []).map(track => (
                      <div key={track.id} className="flex items-center gap-3 rounded-xl border border-border bg-background/50 px-4 py-2.5">
                        <span className="text-lg">{track.challengeType === 'indovina' ? '🎵' : track.challengeType === 'canta' ? '🎤' : '📣'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm truncate">{track.title} <span className="text-muted-foreground font-normal">— {track.artist}</span></div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="rounded-full border px-2 py-0.5">{CHALLENGE_LABELS[track.challengeType]}</span>
                            <span>{track.durationSeconds}s</span>
                            <span>+{track.points} pt</span>
                            {track.snippetHint && <span className="italic truncate max-w-[120px]">"{track.snippetHint}"</span>}
                          </div>
                        </div>
                        <button onClick={() => void deleteTrack(track.id, set.id)}
                          className="rounded-xl border border-destructive/40 p-1.5 text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add track form */}
                  <div className="rounded-xl border border-border bg-background/30 p-4 space-y-3">
                    <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Aggiungi traccia</div>
                    <div className="grid grid-cols-2 gap-2">
                      <input value={newTrack.title} onChange={e => setNewTrack(t => ({ ...t, title: e.target.value }))}
                        placeholder="Titolo brano *" className="rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                      <input value={newTrack.artist} onChange={e => setNewTrack(t => ({ ...t, artist: e.target.value }))}
                        placeholder="Artista *" className="rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <select value={newTrack.challengeType} onChange={e => setNewTrack(t => ({ ...t, challengeType: e.target.value as SaraMusicaTrack['challengeType'] }))}
                        className="rounded-xl border border-border bg-background px-3 py-2 text-sm">
                        <option value="indovina">🎵 Indovina</option>
                        <option value="canta">🎤 Canta</option>
                        <option value="rumore">📣 Rumore</option>
                      </select>
                      <input type="number" value={newTrack.durationSeconds} min={10} max={120}
                        onChange={e => setNewTrack(t => ({ ...t, durationSeconds: Number(e.target.value) }))}
                        placeholder="Durata (s)" className="rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                      <input type="number" value={newTrack.points} min={10}
                        onChange={e => setNewTrack(t => ({ ...t, points: Number(e.target.value) }))}
                        placeholder="Punti" className="rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                    </div>
                    <input value={newTrack.snippetHint} onChange={e => setNewTrack(t => ({ ...t, snippetHint: e.target.value }))}
                      placeholder="Hint / strofa (per indovina)" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                    <input value={newTrack.audioUrl} onChange={e => setNewTrack(t => ({ ...t, audioUrl: e.target.value }))}
                      placeholder="URL audio (opzionale)" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                    <button onClick={() => void createTrack(set.id)} disabled={!newTrack.title.trim() || !newTrack.artist.trim() || busy}
                      className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40 flex items-center gap-2">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />} Aggiungi traccia
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
    </AdminLayout>
  );
}
