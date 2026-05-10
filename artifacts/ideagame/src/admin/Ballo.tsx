import { useState, useEffect } from 'react';
import { AdminLayout } from './AdminLayout';
import { Trash2, Plus, Loader2, Music, Clock, Zap, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

interface DanceChallenge {
  id: string;
  name: string;
  description: string;
  duration: number;
  difficulty: string;
  musicHint: string;
  createdAt: string;
}

const DIFF_LABELS: Record<string, string> = {
  easy: '🌱 Facile', medium: '🔥 Medio', hard: '💪 Difficile',
};
const DIFF_COLORS: Record<string, string> = {
  easy: 'text-green-400 border-green-400/30 bg-green-400/10',
  medium: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
  hard: 'text-pink-400 border-pink-400/30 bg-pink-400/10',
};

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

export default function AdminBallo() {
  const [challenges, setChallenges] = useState<DanceChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(60);
  const [difficulty, setDifficulty] = useState('medium');
  const [musicHint, setMusicHint] = useState('');

  // AI generation state
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiTheme, setAiTheme] = useState('');
  const [aiCount, setAiCount] = useState(5);
  const [aiDifficulty, setAiDifficulty] = useState('mixed');
  const [aiGenerating, setAiGenerating] = useState(false);

  useEffect(() => {
    loadChallenges();
  }, []);

  const loadChallenges = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/dance-challenges');
      setChallenges(data as DanceChallenge[]);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true); setError(''); setMsg('');
    try {
      await apiFetch('/dance-challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), duration, difficulty, musicHint: musicHint.trim() }),
      });
      setMsg('✓ Sfida creata!');
      setName(''); setDescription(''); setDuration(60); setDifficulty('medium'); setMusicHint('');
      setShowForm(false);
      await loadChallenges();
    } catch (e) { setError((e as Error).message); }
    finally { setSubmitting(false); }
  };

  const handleAiGenerate = async () => {
    setAiGenerating(true); setError(''); setMsg('');
    try {
      const data = await apiFetch('/dance-challenges/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: aiTheme.trim(), count: aiCount, difficulty: aiDifficulty }),
      });
      const created = data as DanceChallenge[];
      setMsg(`✓ ${created.length} sfide generate con AI!`);
      setShowAiPanel(false);
      setAiTheme('');
      await loadChallenges();
    } catch (e) { setError((e as Error).message); }
    finally { setAiGenerating(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminare questa sfida?')) return;
    setDeleting(id); setMsg('');
    try {
      await apiFetch(`/dance-challenges/${id}`, { method: 'DELETE' });
      setChallenges(c => c.filter(x => x.id !== id));
      setMsg('✓ Sfida eliminata');
    } catch (e) { setError((e as Error).message); }
    finally { setDeleting(null); }
  };

  return (
    <AdminLayout title="Sfida di Ballo 💃">
      <div className="space-y-6 p-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-display text-2xl font-black">Catalogo Sfide Ballo</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Crea sfide musicali con timer e difficoltà</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setShowAiPanel(s => !s); setShowForm(false); }}
              className="flex items-center gap-2 rounded-xl border border-primary/50 bg-primary/10 px-4 py-2.5 text-sm font-bold text-primary hover:bg-primary/20 transition-colors">
              <Sparkles className="h-4 w-4" />
              Genera con AI
              {showAiPanel ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            <button onClick={() => { setShowForm(s => !s); setShowAiPanel(false); }}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">
              <Plus className="h-4 w-4" />
              {showForm ? 'Annulla' : 'Nuova sfida'}
            </button>
          </div>
        </div>

        {/* AI Generation panel */}
        {showAiPanel && (
          <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-purple-500/5 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h3 className="font-black text-lg">Genera sfide con AI</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              L'AI crea sfide originali con nome, descrizione, durata e suggerimento musicale — pronte da usare subito.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Tema / Stile (opzionale)</div>
                <input
                  value={aiTheme}
                  onChange={e => setAiTheme(e.target.value)}
                  placeholder="es. anni 80, latino, hip hop, romantico…"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>

              <label className="block">
                <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Numero di sfide</div>
                <select value={aiCount} onChange={e => setAiCount(Number(e.target.value))}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                  {[3, 5, 8, 10].map(n => <option key={n} value={n}>{n} sfide</option>)}
                </select>
              </label>

              <label className="block">
                <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">
                  <Zap className="inline h-3 w-3 mr-1" />Difficoltà
                </div>
                <select value={aiDifficulty} onChange={e => setAiDifficulty(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                  <option value="mixed">🎲 Mista (variata)</option>
                  <option value="easy">🌱 Solo Facile</option>
                  <option value="medium">🔥 Solo Media</option>
                  <option value="hard">💪 Solo Difficile</option>
                </select>
              </label>
            </div>

            <button
              onClick={() => void handleAiGenerate()}
              disabled={aiGenerating}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-40 hover-elevate">
              {aiGenerating
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Generazione in corso…</>
                : <><Sparkles className="h-4 w-4" /> Genera {aiCount} sfide</>
              }
            </button>
          </div>
        )}

        {/* Feedback */}
        {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
        {msg && <div className="rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-400">{msg}</div>}

        {/* Create form */}
        {showForm && (
          <form onSubmit={handleCreate} className="rounded-2xl border border-primary/30 bg-card p-6 space-y-4">
            <h3 className="font-black text-lg">Nuova Sfida</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Nome sfida *</div>
                <input value={name} onChange={e => setName(e.target.value)} required
                  placeholder="es. Latino Fever"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
              </label>
              <label className="block">
                <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">
                  <Music className="inline h-3 w-3 mr-1" />Suggerimento musicale
                </div>
                <input value={musicHint} onChange={e => setMusicHint(e.target.value)}
                  placeholder="es. Shakira — Waka Waka"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
              </label>
            </div>

            <label className="block">
              <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Descrizione</div>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                placeholder="Istruzioni per i giocatori…"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none" />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">
                  <Clock className="inline h-3 w-3 mr-1" />Durata (secondi)
                </div>
                <input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))}
                  min={15} max={300} step={5}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
              </label>
              <label className="block">
                <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">
                  <Zap className="inline h-3 w-3 mr-1" />Difficoltà
                </div>
                <select value={difficulty} onChange={e => setDifficulty(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                  <option value="easy">🌱 Facile</option>
                  <option value="medium">🔥 Medio</option>
                  <option value="hard">💪 Difficile</option>
                </select>
              </label>
            </div>

            <button type="submit" disabled={submitting || !name.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-40">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Crea sfida
            </button>
          </form>
        )}

        {/* Challenge list */}
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : challenges.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center text-muted-foreground">
            <div className="text-4xl mb-3">💃</div>
            <div className="font-bold">Nessuna sfida ancora</div>
            <div className="text-sm mt-1">Crea la prima sfida di ballo per iniziare</div>
          </div>
        ) : (
          <div className="space-y-3">
            {challenges.map(ch => (
              <div key={ch.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-display font-black text-lg truncate">{ch.name}</div>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${DIFF_COLORS[ch.difficulty] ?? ''}`}>
                        {DIFF_LABELS[ch.difficulty] ?? ch.difficulty}
                      </span>
                    </div>
                    {ch.description && <div className="mt-1 text-sm text-muted-foreground line-clamp-2">{ch.description}</div>}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{ch.duration}s</span>
                      {ch.musicHint && <span className="flex items-center gap-1"><Music className="h-3 w-3" />{ch.musicHint}</span>}
                    </div>
                  </div>
                  <button onClick={() => void handleDelete(ch.id)} disabled={deleting === ch.id}
                    className="shrink-0 rounded-lg border border-border p-2 text-muted-foreground hover:border-destructive/50 hover:text-destructive disabled:opacity-40">
                    {deleting === ch.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
