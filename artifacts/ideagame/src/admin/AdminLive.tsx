import { useState, useCallback, useEffect } from 'react';
import { useLocation } from 'wouter';
import { AdminLayout } from './AdminLayout';
import { Plus, Trash2, Loader2, Copy, CheckCheck, Radio, Tv2, Mic2 } from 'lucide-react';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body as T;
}

interface LiveSession {
  id: string; title: string; status: string;
  currentGameSlug: string | null; currentPhase: string;
  tvCode: string; presenterCode: string;
  createdAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  draft:  'bg-muted text-muted-foreground',
  active: 'bg-green-500/20 text-green-400 border border-green-500/30',
  paused: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  ended:  'bg-destructive/20 text-destructive border border-destructive/30',
};

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <CheckCheck size={11} className="text-green-400" /> : <Copy size={11} />}
      {label && <span className="text-[10px]">{copied ? 'Copiato!' : label}</span>}
    </button>
  );
}

export default function AdminLive() {
  const [, navigate] = useLocation();
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const data = await apiFetch<LiveSession[]>('/live-sessions');
      setSessions(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore caricamento');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  const createSession = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const sess = await apiFetch<LiveSession>('/live-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() || 'Serata Live' }),
      });
      setSessions(prev => [sess, ...prev]);
      setShowCreate(false);
      setNewTitle('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore creazione');
    } finally {
      setCreating(false);
    }
  };

  const deleteSession = async (id: string) => {
    if (!confirm('Eliminare questa stanza show?')) return;
    setDeleteId(id);
    try {
      await apiFetch(`/live-sessions/${id}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch { /* silent */ } finally { setDeleteId(null); }
  };

  return (
    <AdminLayout title="Show">
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black flex items-center gap-2">
              <Radio size={18} className="text-purple-400" />
              Show
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {loading ? 'Caricamento…' : sessions.length === 0
                ? 'Nessuna stanza attiva'
                : `${sessions.length} stanza${sessions.length > 1 ? 'e' : ''} attiva`}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(v => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-black transition-colors"
          >
            <Plus size={14} /> Crea Stanza Live
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
        )}

        {/* Create form */}
        {showCreate && (
          <div className="flex gap-2 p-4 rounded-xl border border-purple-500/30 bg-purple-500/5">
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void createSession()}
              placeholder="Nome della serata (es. Festa Laurea Sara)"
              autoFocus
              className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-purple-400 placeholder:text-muted-foreground"
            />
            <button
              onClick={createSession}
              disabled={creating}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-black transition-colors min-w-[72px] justify-center"
            >
              {creating ? <Loader2 size={13} className="animate-spin" /> : 'Crea'}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Annulla
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 size={28} className="animate-spin text-purple-400" />
          </div>
        )}

        {/* Empty state */}
        {!loading && sessions.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border py-16 text-center text-muted-foreground">
            <Radio size={32} className="opacity-30" />
            <div className="font-bold">Nessuna stanza live</div>
            <div className="text-sm">Crea una stanza per iniziare lo show.<br />TV, Regia e Presentatore si collegheranno alla stessa sessione.</div>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-2 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-black transition-colors"
            >
              <Plus size={14} /> Crea Stanza Live
            </button>
          </div>
        )}

        {/* Sessions list */}
        <div className="space-y-4">
          {sessions.map(s => (
            <div key={s.id} className="rounded-2xl border border-border bg-card overflow-hidden hover:border-purple-500/40 transition-colors">

              {/* Card header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border/60">
                <div className={`rounded-full px-2 py-0.5 text-xs font-black uppercase tracking-wider ${STATUS_BADGE[s.status] ?? 'bg-muted text-muted-foreground'}`}>
                  {s.status}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-black truncate">{s.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {s.currentGameSlug ? `🎮 ${s.currentGameSlug}` : '🏠 Home runtime'}
                    {' · '}
                    <span className="font-mono">{new Date(s.createdAt).toLocaleDateString('it-IT')}</span>
                  </div>
                </div>
                <button
                  onClick={() => void deleteSession(s.id)}
                  disabled={deleteId === s.id}
                  className="p-1.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-40 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Join codes */}
              <div className="flex items-center gap-3 px-5 py-3 bg-muted/30 border-b border-border/40 text-xs flex-wrap">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="font-mono font-bold text-foreground">{s.tvCode}</span>
                  <CopyBtn text={`${window.location.origin}${BASE}live-tv?s=${s.tvCode}`.replace(/\/\//g, '/')} label="Copia link TV" />
                </div>
                <div className="w-px h-3 bg-border" />
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="font-mono font-bold text-foreground">{s.presenterCode}</span>
                  <CopyBtn text={`${window.location.origin}${BASE}live-presenter?s=${s.presenterCode}`.replace(/\/\//g, '/')} label="Copia link Presenter" />
                </div>
              </div>

              {/* Role buttons */}
              <div className="grid grid-cols-3 gap-3 p-4">

                {/* TV */}
                <a
                  href={`/live-tv?s=${s.tvCode}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-500/8 hover:bg-blue-500/18 px-3 py-4 text-center text-blue-300 transition-colors no-underline"
                >
                  <Tv2 size={22} />
                  <span className="text-xs font-black tracking-wider">TV</span>
                  <span className="text-[10px] text-muted-foreground">Proiettore / schermo</span>
                </a>

                {/* Regia */}
                <button
                  onClick={() => navigate(`/live-control?session=${s.id}`)}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/8 hover:bg-purple-500/18 px-3 py-4 text-center text-purple-300 transition-colors cursor-pointer"
                >
                  <Radio size={22} />
                  <span className="text-xs font-black tracking-wider">REGIA</span>
                  <span className="text-[10px] text-muted-foreground">Pannello controllo</span>
                </button>

                {/* Presenter */}
                <a
                  href={`/live-presenter?s=${s.presenterCode}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-green-500/30 bg-green-500/8 hover:bg-green-500/18 px-3 py-4 text-center text-green-300 transition-colors no-underline"
                >
                  <Mic2 size={22} />
                  <span className="text-xs font-black tracking-wider">PRESENTATORE</span>
                  <span className="text-[10px] text-muted-foreground">Controller mobile</span>
                </a>

              </div>
            </div>
          ))}
        </div>

      </div>
    </AdminLayout>
  );
}
