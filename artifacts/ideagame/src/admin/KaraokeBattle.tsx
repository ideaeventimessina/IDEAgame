import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Mic, Music, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

interface KaraokeSet { id: string; title: string; description: string; language: string; isActive: boolean; }
interface KaraokeTrack {
  id: string; setId: string; title: string; artist: string; lyricSnippet: string;
  audioUrl: string | null; durationSeconds: number; points: number;
  category: string; difficulty: string; orderIndex: number; isActive: boolean;
}

const CATEGORIES = ['pop','rock','dance','classica','anni80','anni90','italiana','internazionale'];
const DIFFICULTIES = ['easy','medium','hard'];
const DIFF_POINTS: Record<string, number> = { easy: 100, medium: 150, hard: 200 };
const CAT_EMOJI: Record<string, string> = {
  pop: '🎤', rock: '🎸', dance: '💃', classica: '🎻',
  anni80: '📼', anni90: '💿', italiana: '🇮🇹', internazionale: '🌍',
};

export default function KaraokeBattle() {
  const [sets, setSets] = useState<KaraokeSet[]>([]);
  const [tracks, setTracks] = useState<KaraokeTrack[]>([]);
  const [selectedSet, setSelectedSet] = useState<string | null>(null);
  const [expandedSet, setExpandedSet] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // New set form
  const [newTitle, setNewTitle] = useState('');
  const [showNewSet, setShowNewSet] = useState(false);

  // New track form
  const [newTrack, setNewTrack] = useState({
    title: '', artist: '', lyricSnippet: '', audioUrl: '',
    durationSeconds: 60, points: 150, category: 'pop', difficulty: 'medium', orderIndex: 0,
  });
  const [showTrackForm, setShowTrackForm] = useState<string | null>(null);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  const loadSets = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/karaoke/sets') as KaraokeSet[];
      setSets(data);
    } catch { flash('Errore nel caricamento playlist'); }
    finally { setLoading(false); }
  };

  const loadTracks = async (setId: string) => {
    try {
      const data = await apiFetch(`/karaoke/sets/${setId}/tracks`) as KaraokeTrack[];
      setTracks(prev => [...prev.filter(t => t.setId !== setId), ...data]);
    } catch { flash('Errore nel caricamento brani'); }
  };

  useEffect(() => { void loadSets(); }, []);

  const handleToggleSet = async (setId: string) => {
    if (expandedSet === setId) { setExpandedSet(null); return; }
    setExpandedSet(setId);
    setSelectedSet(setId);
    await loadTracks(setId);
  };

  const handleCreateSet = async () => {
    if (!newTitle.trim()) return;
    try {
      await apiFetch('/karaoke/sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      setNewTitle(''); setShowNewSet(false);
      await loadSets(); flash('✓ Playlist creata!');
    } catch (e) { flash((e as Error).message); }
  };

  const handleDeleteSet = async (id: string) => {
    if (!confirm('Eliminare questa playlist e tutti i suoi brani?')) return;
    try {
      await apiFetch(`/karaoke/sets/${id}`, { method: 'DELETE' });
      setSets(p => p.filter(s => s.id !== id));
      if (expandedSet === id) setExpandedSet(null);
      flash('✓ Playlist eliminata');
    } catch (e) { flash((e as Error).message); }
  };

  const handleAddTrack = async (setId: string) => {
    if (!newTrack.title.trim() || !newTrack.artist.trim()) { flash('Titolo e artista obbligatori'); return; }
    try {
      await apiFetch(`/karaoke/sets/${setId}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newTrack,
          audioUrl: newTrack.audioUrl.trim() || undefined,
        }),
      });
      setNewTrack({ title: '', artist: '', lyricSnippet: '', audioUrl: '', durationSeconds: 60, points: 150, category: 'pop', difficulty: 'medium', orderIndex: 0 });
      setShowTrackForm(null);
      await loadTracks(setId);
      flash('✓ Brano aggiunto!');
    } catch (e) { flash((e as Error).message); }
  };

  const handleDeleteTrack = async (trackId: string, setId: string) => {
    try {
      await apiFetch(`/karaoke/tracks/${trackId}`, { method: 'DELETE' });
      setTracks(prev => prev.filter(t => t.id !== trackId));
      flash('✓ Brano eliminato');
    } catch (e) { flash((e as Error).message); }
  };

  const handleToggleTrack = async (track: KaraokeTrack) => {
    try {
      await apiFetch(`/karaoke/tracks/${track.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !track.isActive }),
      });
      setTracks(prev => prev.map(t => t.id === track.id ? { ...t, isActive: !t.isActive } : t));
    } catch (e) { flash((e as Error).message); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-pink-500/20">
            <Mic className="h-5 w-5 text-pink-400" />
          </div>
          <div>
            <h1 className="text-display text-2xl font-black">Karaoke Battle</h1>
            <p className="text-sm text-muted-foreground">Gestisci playlist e brani</p>
          </div>
        </div>
        <button onClick={() => setShowNewSet(v => !v)}
          className="flex items-center gap-2 rounded-2xl bg-pink-500/20 px-4 py-2 text-sm font-bold text-pink-400 hover:bg-pink-500/30">
          <Plus className="h-4 w-4" /> Nuova playlist
        </button>
      </div>

      {/* Flash */}
      <AnimatePresence>
        {msg && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-bold text-primary">
            {msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* New set form */}
      <AnimatePresence>
        {showNewSet && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-2xl border border-border bg-card/80 p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Nuova playlist</h3>
            <input
              value={newTitle} onChange={e => setNewTitle(e.target.value)}
              placeholder="Nome playlist (es. Classici degli anni 80)"
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="flex gap-2">
              <button onClick={() => void handleCreateSet()}
                className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90">
                Crea
              </button>
              <button onClick={() => setShowNewSet(false)}
                className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted-foreground hover:bg-card">
                Annulla
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sets list */}
      {loading ? (
        <div className="text-sm text-muted-foreground">Caricamento…</div>
      ) : sets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 py-12 text-center">
          <Music className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">Nessuna playlist. Creane una!</div>
        </div>
      ) : (
        <div className="space-y-3">
          {sets.map(set => {
            const setTracks = tracks.filter(t => t.setId === set.id);
            const isOpen = expandedSet === set.id;
            return (
              <div key={set.id} className="rounded-2xl border border-border bg-card/80 overflow-hidden">
                {/* Set header */}
                <div className="flex items-center gap-3 px-5 py-4">
                  <button onClick={() => void handleToggleSet(set.id)} className="flex flex-1 items-center gap-3 text-left">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-500/20">
                      <Mic className="h-4.5 w-4.5 text-pink-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-display font-black">{set.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {isOpen ? `${setTracks.length} brani caricati` : 'Clicca per vedere i brani'}
                      </div>
                    </div>
                    {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  <button onClick={() => window.open(`/karaoke-battle?s=&e=`, '_blank')} title="Apri proiettore"
                    className="rounded-lg border border-border p-2 text-muted-foreground hover:text-primary">
                    <ExternalLink className="h-4 w-4" />
                  </button>
                  <button onClick={() => void handleDeleteSet(set.id)}
                    className="rounded-lg border border-destructive/40 p-2 text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Tracks panel */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="border-t border-border overflow-hidden">
                      <div className="px-5 py-4 space-y-3">

                        {/* Track list */}
                        {setTracks.length === 0 ? (
                          <div className="py-6 text-center text-sm text-muted-foreground">Nessun brano. Aggiungine uno!</div>
                        ) : (
                          <div className="space-y-2">
                            {setTracks.sort((a, b) => a.orderIndex - b.orderIndex).map(track => (
                              <div key={track.id} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${!track.isActive ? 'opacity-40' : ''}`}
                                style={{ borderColor: `${DIFF_POINTS[track.difficulty] ? '#666' : '#333'}55` }}>
                                <span className="text-xl">{CAT_EMOJI[track.category] ?? '🎵'}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-sm truncate">{track.title}</div>
                                  <div className="text-xs text-muted-foreground truncate">{track.artist} · {track.category} · {track.durationSeconds}s</div>
                                  {track.lyricSnippet && (
                                    <div className="mt-1 text-xs text-muted-foreground/70 italic truncate">"{track.lyricSnippet}"</div>
                                  )}
                                </div>
                                <span className="text-xs font-black text-primary">+{track.points}pt</span>
                                <span className="text-xs px-2 py-0.5 rounded-full border font-bold"
                                  style={{ color: track.difficulty === 'easy' ? '#22c55e' : track.difficulty === 'medium' ? '#eab308' : '#ef4444', borderColor: 'currentColor' }}>
                                  {track.difficulty}
                                </span>
                                <button onClick={() => void handleToggleTrack(track)}
                                  className={`rounded-lg px-2.5 py-1 text-xs font-bold border ${track.isActive ? 'border-green-500/40 text-green-400 bg-green-500/10' : 'border-border text-muted-foreground'}`}>
                                  {track.isActive ? 'ON' : 'OFF'}
                                </button>
                                <button onClick={() => void handleDeleteTrack(track.id, track.setId)}
                                  className="text-destructive hover:opacity-70">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add track form toggle */}
                        {showTrackForm === set.id ? (
                          <div className="rounded-xl border border-border bg-background/60 p-4 space-y-3">
                            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Nuovo brano</div>
                            <div className="grid grid-cols-2 gap-3">
                              <input value={newTrack.title} onChange={e => setNewTrack(p => ({ ...p, title: e.target.value }))}
                                placeholder="Titolo *" className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                              <input value={newTrack.artist} onChange={e => setNewTrack(p => ({ ...p, artist: e.target.value }))}
                                placeholder="Artista *" className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                            </div>
                            <textarea value={newTrack.lyricSnippet} onChange={e => setNewTrack(p => ({ ...p, lyricSnippet: e.target.value }))}
                              placeholder="Testo karaoke (snippet)" rows={3}
                              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
                            <input value={newTrack.audioUrl} onChange={e => setNewTrack(p => ({ ...p, audioUrl: e.target.value }))}
                              placeholder="URL audio (opzionale)" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                            <div className="grid grid-cols-3 gap-3">
                              <select value={newTrack.category} onChange={e => setNewTrack(p => ({ ...p, category: e.target.value }))}
                                className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none">
                                {CATEGORIES.map(c => <option key={c} value={c}>{CAT_EMOJI[c]} {c}</option>)}
                              </select>
                              <select value={newTrack.difficulty} onChange={e => {
                                const d = e.target.value;
                                setNewTrack(p => ({ ...p, difficulty: d, points: DIFF_POINTS[d] ?? 150 }));
                              }} className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none">
                                {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                              </select>
                              <input type="number" value={newTrack.durationSeconds} min={15} max={300}
                                onChange={e => setNewTrack(p => ({ ...p, durationSeconds: Number(e.target.value) }))}
                                className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none" placeholder="Durata (s)" />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => void handleAddTrack(set.id)}
                                className="flex-1 rounded-xl bg-pink-500/20 px-4 py-2 text-sm font-bold text-pink-400 hover:bg-pink-500/30">
                                + Aggiungi brano
                              </button>
                              <button onClick={() => setShowTrackForm(null)}
                                className="rounded-xl border border-border px-4 py-2 text-sm text-muted-foreground">
                                Annulla
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setShowTrackForm(set.id)}
                            className="w-full flex items-center gap-2 rounded-xl border border-dashed border-border py-2.5 text-sm text-muted-foreground hover:border-pink-500/50 hover:text-pink-400">
                            <Plus className="h-4 w-4 mx-auto" /> Aggiungi brano
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
