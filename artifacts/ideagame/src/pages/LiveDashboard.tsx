/**
 * /live-dashboard — Live Mode Entry Point
 * Auth required. Shows session list + "Nuova Sessione". Each card opens REGIA/TV/PRESENTER.
 */
import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/roles';
import { Loader2, Plus, Trash2, Radio, ExternalLink, Copy, CheckCheck } from 'lucide-react';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body as T;
}

const PURPLE = '#A855F7';
const GREEN  = '#34D399';
const BLUE   = '#60A5FA';

interface LiveSession {
  id: string; title: string; status: string;
  currentGameSlug: string | null; currentPhase: string;
  tvCode: string; presenterCode: string;
  createdAt: string;
}

const STATUS_COLOR: Record<string, string> = {
  draft: '#6B7280', active: '#34D399', paused: '#F59E0B', ended: '#EF4444',
};

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', padding: '0 2px', display: 'flex', alignItems: 'center' }}>
      {copied ? <CheckCheck size={11} style={{ color: GREEN }} /> : <Copy size={11} />}
    </button>
  );
}

export default function LiveDashboard() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  const [sessions, setSessions]   = useState<LiveSession[]>([]);
  const [loading, setLoading]     = useState(true);
  const [creating, setCreating]   = useState(false);
  const [newTitle, setNewTitle]   = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId]   = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate('/login?redirect=/live-dashboard');
  }, [authLoading, user, navigate]);

  const loadSessions = useCallback(async () => {
    try {
      const data = await apiFetch<LiveSession[]>('/live-sessions');
      setSessions(data);
    } catch { /* noop */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  const createSession = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const sess = await apiFetch<LiveSession>('/live-sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() || 'Serata Live' }),
      });
      setSessions(prev => [sess, ...prev]);
      setShowCreate(false);
      setNewTitle('');
    } catch { /* noop */ } finally { setCreating(false); }
  };

  const deleteSession = async (id: string) => {
    if (!confirm('Eliminare questa sessione live?')) return;
    setDeleteId(id);
    try {
      await apiFetch(`/live-sessions/${id}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch { /* noop */ } finally { setDeleteId(null); }
  };

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100dvh', background: '#09050f', display: 'grid', placeItems: 'center' }}>
        <Loader2 className="animate-spin" size={32} style={{ color: PURPLE }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#09050f', fontFamily: "'Outfit','Space Grotesk',sans-serif", color: '#fff' }}>
      <div style={{ position: 'fixed', inset: 0, background: `radial-gradient(ellipse 70% 40% at 50% 0%, ${PURPLE}0a 0%, transparent 60%)`, pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ borderBottom: '1px solid rgba(168,85,247,0.2)', background: 'rgba(168,85,247,0.06)', backdropFilter: 'blur(16px)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', gap: 14 }}>
          <Radio size={17} style={{ color: PURPLE }} />
          <span style={{ fontWeight: 900, letterSpacing: '0.09em', fontSize: '0.88rem', color: PURPLE }}>LIVE MODE</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)' }}>{user?.email}</span>
          <button onClick={() => navigate('/mode-select')}
            style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '4px 12px', cursor: 'pointer' }}>
            ← Menu
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 980, margin: '0 auto', padding: '32px 24px', position: 'relative' }}>

        {/* Title bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 26 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.55rem' }}>🎛️ Sessioni Live</div>
            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              {sessions.length > 0
                ? `${sessions.length} sessione${sessions.length > 1 ? 'i' : 'e'}`
                : 'Nessuna sessione ancora'}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={() => setShowCreate(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: `linear-gradient(135deg,${PURPLE},#7C3AED)`, border: 'none', borderRadius: 12, color: '#fff', fontSize: '0.85rem', fontWeight: 900, cursor: 'pointer', boxShadow: `0 0 24px ${PURPLE}44` }}>
            <Plus size={14} /> Nuova Sessione
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div style={{ display: 'flex', gap: 10, padding: '16px 18px', background: `${PURPLE}0a`, border: `1px solid ${PURPLE}30`, borderRadius: 14, marginBottom: 22 }}>
            <input
              value={newTitle} onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void createSession()}
              placeholder="Nome della serata (es. Festa Laurea Sara)" autoFocus
              style={{ flex: 1, padding: '10px 14px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, color: '#fff', fontSize: '0.88rem', outline: 'none' }}
            />
            <button onClick={createSession} disabled={creating}
              style={{ padding: '10px 20px', background: PURPLE, border: 'none', borderRadius: 10, color: '#fff', fontWeight: 900, fontSize: '0.85rem', cursor: 'pointer', minWidth: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {creating ? <Loader2 size={14} className="animate-spin" /> : 'Crea'}
            </button>
            <button onClick={() => setShowCreate(false)}
              style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', cursor: 'pointer' }}>
              Annulla
            </button>
          </div>
        )}

        {/* Empty state */}
        {sessions.length === 0 && (
          <div style={{ padding: '64px 24px', textAlign: 'center', border: '2px dashed rgba(168,85,247,0.2)', borderRadius: 20, color: 'rgba(255,255,255,0.3)' }}>
            <Radio size={36} style={{ marginBottom: 16, opacity: 0.35 }} />
            <div style={{ fontWeight: 900, fontSize: '1rem' }}>Nessuna sessione live</div>
            <div style={{ fontSize: '0.8rem', marginTop: 6 }}>Crea una nuova sessione per iniziare lo show.</div>
          </div>
        )}

        {/* Sessions grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sessions.map(s => {
            const sc = STATUS_COLOR[s.status] ?? '#6B7280';
            const presenterLink = `${window.location.origin}${BASE}live-presenter?s=${s.presenterCode}`.replace(/\/\//g, '/');
            return (
              <div key={s.id}
                style={{ borderRadius: 18, border: `1px solid rgba(168,85,247,0.2)`, background: 'rgba(255,255,255,0.04)', overflow: 'hidden', transition: 'border-color 0.2s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = `${PURPLE}45`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(168,85,247,0.2)'; }}>

                {/* Card header */}
                <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(168,85,247,0.1)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: sc, boxShadow: `0 0 8px ${sc}`, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 900, fontSize: '1rem' }}>{s.title}</div>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.38)', marginTop: 1 }}>
                      {s.currentGameSlug ? `🎮 ${s.currentGameSlug}` : '🎤 standby'} · {s.status.toUpperCase()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.64rem', color: PURPLE, background: `${PURPLE}15`, padding: '2px 8px', borderRadius: 6 }}>
                      <span>📺 {s.tvCode}</span><CopyBtn text={s.tvCode} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.64rem', color: GREEN, background: `${GREEN}12`, padding: '2px 8px', borderRadius: 6 }}>
                      <span>🎤 {s.presenterCode}</span><CopyBtn text={presenterLink} />
                    </div>
                    <button onClick={() => void deleteSession(s.id)} disabled={deleteId === s.id}
                      style={{ padding: '5px 8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, color: '#EF4444', cursor: 'pointer', opacity: deleteId === s.id ? 0.5 : 1, display: 'flex', alignItems: 'center' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Launch buttons */}
                <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                  <a href={`/live-control?session=${s.id}`} target="_blank" rel="noreferrer"
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '16px 8px', background: `${PURPLE}10`, border: `1.5px solid ${PURPLE}33`, borderRadius: 14, color: PURPLE, textDecoration: 'none', textAlign: 'center', transition: 'background 0.15s' }}>
                    <span style={{ fontSize: '1.7rem' }}>🎛️</span>
                    <span style={{ fontWeight: 900, fontSize: '0.8rem', letterSpacing: '0.06em' }}>REGIA</span>
                    <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.32)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <ExternalLink size={9} /> Apri in nuovo tab
                    </span>
                  </a>
                  <a href={`/live-tv?s=${s.tvCode}`} target="_blank" rel="noreferrer"
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '16px 8px', background: 'rgba(96,165,250,0.07)', border: '1.5px solid rgba(96,165,250,0.28)', borderRadius: 14, color: BLUE, textDecoration: 'none', textAlign: 'center' }}>
                    <span style={{ fontSize: '1.7rem' }}>📺</span>
                    <span style={{ fontWeight: 900, fontSize: '0.8rem', letterSpacing: '0.06em' }}>TV</span>
                    <code style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.32)', background: 'rgba(0,0,0,0.3)', padding: '1px 5px', borderRadius: 4 }}>{s.tvCode}</code>
                  </a>
                  <a href={`/live-presenter?s=${s.presenterCode}`} target="_blank" rel="noreferrer"
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '16px 8px', background: 'rgba(52,211,153,0.06)', border: '1.5px solid rgba(52,211,153,0.22)', borderRadius: 14, color: GREEN, textDecoration: 'none', textAlign: 'center' }}>
                    <span style={{ fontSize: '1.7rem' }}>🎤</span>
                    <span style={{ fontWeight: 900, fontSize: '0.8rem', letterSpacing: '0.06em' }}>PRESENTER</span>
                    <code style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.32)', background: 'rgba(0,0,0,0.3)', padding: '1px 5px', borderRadius: 4 }}>{s.presenterCode}</code>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
