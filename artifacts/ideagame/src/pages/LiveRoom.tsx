/**
 * /live-control — Show Director Control Room
 * Requires authentication. Reads admin settings. Sends commands via API+socket.
 */
import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/roles';
import { getSocket } from '@/hooks/useEventSocket';
import { toast } from 'sonner';
import {
  Loader2, Power, Pause, Play, SkipForward, Eye, MonitorOff, Monitor,
  VolumeX, Users, Radio, Wifi, WifiOff, Link2,
} from 'lucide-react';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body as T;
}

interface LiveSession {
  id: string; title: string; status: string; currentGameSlug: string | null;
  currentPhase: string; tvCode: string; presenterCode: string;
}

type SettingsVal = {
  brandColor?: string; defaultLocale?: string; projectionMode?: boolean;
  offlineFirst?: boolean; voteTimer?: number; revealTimer?: number;
  soundVolume?: number; musicVolume?: number; jonnyEnabled?: boolean;
};
const SETTINGS_DEFAULTS: SettingsVal = {
  brandColor: '#A855F7', projectionMode: true, voteTimer: 10,
  revealTimer: 5, soundVolume: 80, musicVolume: 60, jonnyEnabled: false,
};

const MEDIA_SOUNDS = [
  { id: 'applause', label: 'Applausi', emoji: '👏' },
  { id: 'laugh', label: 'Risate', emoji: '😂' },
  { id: 'suspense', label: 'Suspense', emoji: '😱' },
  { id: 'fail', label: 'Fallimento', emoji: '😬' },
  { id: 'victory', label: 'Vittoria', emoji: '🏆' },
  { id: 'countdown', label: 'Countdown', emoji: '⏳' },
];

const GAME_LABELS: Record<string, string> = {
  'gioco-coppie': '🃏 Coppie Live',
  'percorso-a-risate': '🎲 Percorso',
  'quizzone': '❓ Quizzone',
  'sfida-ballo': '💃 Ballo',
  'sara-musica': '🎵 Sara Musica',
};

export default function LiveRoom() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  const selectedId = new URLSearchParams(window.location.search).get('session');
  const [selected, setSelected]         = useState<LiveSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [settings, setSettings]         = useState<SettingsVal>(SETTINGS_DEFAULTS);
  const [cmdLoading, setCmdLoading]     = useState<string | null>(null);
  const [connected, setConnected]       = useState(false);
  const [homeSessionInput, setHomeSessionInput] = useState('');
  const socketRef = useRef(getSocket());

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) navigate('/login?redirect=/live-dashboard');
  }, [authLoading, user, navigate]);

  // Redirect to dashboard if no session param
  useEffect(() => {
    if (!authLoading && user && !selectedId) navigate('/live-dashboard');
  }, [authLoading, user, selectedId, navigate]);

  // Load single session by ID
  useEffect(() => {
    if (!selectedId) return;
    apiFetch<LiveSession>(`/live-sessions/${selectedId}`)
      .then(setSelected)
      .catch(() => {})
      .finally(() => setSessionLoading(false));
  }, [selectedId]);

  // Load admin settings
  useEffect(() => {
    apiFetch<{ key: string; value: unknown }[]>('/system-settings').then(rows => {
      const row = rows.find(r => r.key === 'tenant.settings');
      if (row?.value && typeof row.value === 'object')
        setSettings({ ...SETTINGS_DEFAULTS, ...(row.value as SettingsVal) });
    }).catch(() => {});
  }, []);

  // Socket connection for live room
  useEffect(() => {
    if (!selectedId) return;
    const socket = socketRef.current;
    socket.emit('live:join', { sessionId: selectedId, code: selected?.tvCode ?? '' });
    const onConnect    = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onSessionUpdated = (data: Partial<LiveSession>) =>
      setSelected(prev => prev ? { ...prev, ...data } : prev);
    if (socket.connected) setConnected(true);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('live:session_updated', onSessionUpdated);
    return () => {
      socket.emit('live:leave', { sessionId: selectedId });
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('live:session_updated', onSessionUpdated);
    };
  }, [selectedId]);

  const sendCommand = async (command: string, payload?: unknown, label?: string) => {
    if (!selectedId) return;
    const key = command + JSON.stringify(payload ?? '');
    setCmdLoading(key);
    try {
      await apiFetch(`/live-sessions/${selectedId}/command`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, payload }),
      });
      if (label) toast.success(label);
      apiFetch<LiveSession>(`/live-sessions/${selectedId}`).then(setSelected).catch(() => {});
    } catch (e: unknown) {
      toast.error('Comando fallito', { description: e instanceof Error ? e.message : '' });
    } finally {
      setCmdLoading(null);
    }
  };

  const PURPLE = '#A855F7';
  const GOLD = '#F5B642';

  if (authLoading) {
    return (
      <div style={{ minHeight: '100dvh', background: '#09050f', display: 'grid', placeItems: 'center' }}>
        <Loader2 className="animate-spin" style={{ color: PURPLE }} size={32} />
      </div>
    );
  }

  const tvUrl = selected ? `/live-tv?s=${selected.tvCode}` : '';
  const presenterUrl = selected ? `/live-presenter?s=${selected.presenterCode}` : '';

  return (
    <div style={{ minHeight: '100dvh', background: '#09050f', fontFamily: "'Outfit','Space Grotesk',sans-serif", color: '#fff' }}>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div style={{ borderBottom: '1px solid rgba(168,85,247,0.2)', background: 'rgba(168,85,247,0.06)', backdropFilter: 'blur(16px)' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Radio size={18} style={{ color: PURPLE }} />
            <span style={{ fontWeight: 900, letterSpacing: '0.08em', fontSize: '0.85rem', color: PURPLE }}>LIVE CONTROL</span>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem' }}>
            {connected
              ? <><Wifi size={13} style={{ color: '#34D399' }} /><span style={{ color: '#34D399' }}>Connesso</span></>
              : <><WifiOff size={13} style={{ color: '#6B7280' }} /><span style={{ color: '#6B7280' }}>Offline</span></>
            }
          </div>
          <button onClick={() => navigate('/mode-select')} style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '4px 12px', cursor: 'pointer' }}>
            ← Menu
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px', display: 'grid', gap: 20 }}>

        {/* ── Session info + quick links ────────────────────────────── */}
        {(sessionLoading || !selected) ? (
          <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 14 }}>
            {sessionLoading
              ? <><Loader2 size={16} className="animate-spin" style={{ color: PURPLE }} /><span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>Caricamento sessione…</span></>
              : <><span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.45)' }}>Sessione non trovata.</span>
                  <a href="/live-dashboard" style={{ fontSize: '0.82rem', color: PURPLE, textDecoration: 'underline' }}>← Vai alla dashboard</a></>
            }
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: 'rgba(168,85,247,0.14)', border: '1px solid rgba(168,85,247,0.40)', borderRadius: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: '1rem' }}>{selected.title}</div>
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
                {selected.currentGameSlug ?? 'standby'} · {selected.status}
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <a href={`/live-dashboard`}
              style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '4px 10px' }}>
              ← Dashboard
            </a>
            <a href={tvUrl} target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 8, color: '#60A5FA', textDecoration: 'none', fontSize: '0.78rem', fontWeight: 700 }}>
              📺 <span>TV</span> <code style={{ fontSize: '0.65rem', background: 'rgba(0,0,0,0.3)', padding: '0 4px', borderRadius: 3 }}>{selected.tvCode}</code>
            </a>
            <a href={presenterUrl} target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 8, color: '#34D399', textDecoration: 'none', fontSize: '0.78rem', fontWeight: 700 }}>
              🎤 <span>PRESENTER</span> <code style={{ fontSize: '0.65rem', background: 'rgba(0,0,0,0.3)', padding: '0 4px', borderRadius: 3 }}>{selected.presenterCode}</code>
            </a>
          </div>
        )}

        {selected && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>

            {/* ── 1. TV REGIA ────────────────────────────────── */}
            <Panel emoji="📺" title="TV REGIA" color={PURPLE}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { cmd: 'start_game', payload: { gameSlug: selected.currentGameSlug ?? 'gioco-coppie' }, label: 'Avvia', icon: <Power size={14} />, color: '#34D399' },
                  { cmd: 'pause', label: 'Pausa', icon: <Pause size={14} />, color: '#F59E0B' },
                  { cmd: 'resume', label: 'Riprendi', icon: <Play size={14} />, color: '#34D399' },
                  { cmd: 'next_phase', label: 'Avanti →', icon: <SkipForward size={14} />, color: PURPLE },
                  { cmd: 'force_reveal', label: 'Force Reveal', icon: <Eye size={14} />, color: '#60A5FA' },
                  { cmd: 'force_ranking', label: 'Classifica', icon: <SkipForward size={14} />, color: '#60A5FA' },
                  { cmd: 'blackout', label: '⬛ Blackout', icon: <MonitorOff size={14} />, color: '#EF4444' },
                  { cmd: 'standby_logo', label: '🏠 Standby', icon: <Monitor size={14} />, color: '#6B7280' },
                  { cmd: 'stop_audio', label: 'Stop Audio', icon: <VolumeX size={14} />, color: '#6B7280' },
                ].map(btn => (
                  <CmdButton key={btn.cmd} label={btn.label} icon={btn.icon} color={btn.color}
                    loading={cmdLoading === btn.cmd + JSON.stringify(btn.payload ?? '')}
                    onClick={() => sendCommand(btn.cmd, btn.payload, btn.label)} />
                ))}
              </div>
              <StatusBadge session={selected} />
            </Panel>

            {/* ── 2. PRESENTER ──────────────────────────────── */}
            <Panel emoji="🎤" title="PRESENTER" color="#34D399">
              <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>Gioco corrente</div>
              <div style={{ fontWeight: 900, fontSize: '1rem', marginBottom: 16, color: '#fff' }}>
                {selected.currentGameSlug ? (GAME_LABELS[selected.currentGameSlug] ?? selected.currentGameSlug) : '— nessun gioco attivo —'}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>Fase corrente</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 100, fontSize: '0.78rem', fontWeight: 700, color: '#34D399', marginBottom: 16 }}>
                {selected.currentPhase}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>Frase suggerita</div>
              <div style={{ padding: '10px 12px', background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)', borderRadius: 8, fontSize: '0.8rem', fontStyle: 'italic', color: 'rgba(255,255,255,0.7)' }}>
                {selected.currentPhase === 'standby' ? '"Benvenuti a tutti, la serata sta per iniziare!"' :
                  selected.currentPhase === 'playing' ? '"Bene, diamoci dentro — avete 10 secondi!"' :
                  '"E ora... il momento più atteso della serata!"'}
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>Settings caricati</div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>
                  Timer voto: {settings.voteTimer}s · Reveal: {settings.revealTimer}s · Vol: {settings.soundVolume}%
                </div>
              </div>
            </Panel>

            {/* ── 3. MEDIA TRIGGERS ─────────────────────────── */}
            <Panel emoji="🔊" title="MEDIA TRIGGERS" color={GOLD}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                {MEDIA_SOUNDS.map(s => (
                  <CmdButton key={s.id} label={`${s.emoji} ${s.label}`} color={GOLD}
                    loading={cmdLoading === 'trigger_media' + JSON.stringify({ soundId: s.id })}
                    onClick={() => sendCommand('trigger_media', { soundId: s.id })} />
                ))}
                <CmdButton label="🔇 Stop tutto" color="#6B7280"
                  loading={cmdLoading === 'stop_audio{}'}
                  onClick={() => sendCommand('stop_audio', undefined, 'Audio fermato')} />
              </div>
            </Panel>

            {/* ── 4. GAME OVERRIDES ─────────────────────────── */}
            <Panel emoji="⚙️" title="GAME OVERRIDES" color="#60A5FA">
              <div style={{ display: 'grid', gap: 8 }}>
                <CmdButton label="▶ Force Next Round" color="#60A5FA"
                  loading={cmdLoading === 'force_next_round{}'}
                  onClick={() => sendCommand('force_next_round', undefined, 'Round avanzato')} />
                <CmdButton label="🗳️ Toggle Voting" color="#A78BFA"
                  loading={cmdLoading === 'toggle_voting{}'}
                  onClick={() => sendCommand('toggle_voting', undefined, 'Voting toggleato')} />
                <CmdButton label="🤖 Toggle AI (Jonny)" color={settings.jonnyEnabled ? '#D4AF37' : '#6B7280'}
                  loading={cmdLoading === 'toggle_ai{}'}
                  onClick={() => sendCommand('toggle_ai', undefined, 'AI toggleata')} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <CmdButton label="+10 pt squadra" color="#34D399"
                    loading={cmdLoading === 'override_score{"delta":10}'}
                    onClick={() => sendCommand('override_score', { delta: 10 }, '+10 punti')} />
                  <CmdButton label="-10 pt squadra" color="#EF4444"
                    loading={cmdLoading === 'override_score{"delta":-10}'}
                    onClick={() => sendCommand('override_score', { delta: -10 }, '-10 punti')} />
                </div>
              </div>
            </Panel>

            {/* ── 5. PLAYERS ────────────────────────────────── */}
            <Panel emoji="👥" title="PLAYERS" color="#A78BFA">
              <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
                Lista giocatori connessi (aggiornata via socket)
              </div>
              <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                <Users size={20} style={{ marginBottom: 4, opacity: 0.4 }} />
                <div>Giocatori connessi tramite</div>
                <code style={{ color: '#A78BFA' }}>/live-join?s={selected.tvCode}</code>
              </div>
              <div style={{ marginTop: 8, fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)' }}>
                Sessione: <code style={{ color: '#A78BFA' }}>{selected.id.slice(0, 8)}…</code>
              </div>
            </Panel>

            {/* ── 6. HOME SESSION (TV = HomeGame.tsx) ───────── */}
            <Panel emoji="🏠" title="HOME SESSION — TV" color="#60A5FA">
              <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', marginBottom: 10, lineHeight: 1.5 }}>
                Collega la TV a una sessione Home per mostrare l'interfaccia HomeGame in fullscreen sul proiettore.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={homeSessionInput}
                  onChange={e => setHomeSessionInput(e.target.value)}
                  placeholder="Home Session ID..."
                  style={{ flex: 1, padding: '8px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: '0.8rem', outline: 'none', fontFamily: 'monospace' }}
                />
                <CmdButton
                  label="Collega"
                  icon={<Link2 size={12} />}
                  color="#60A5FA"
                  loading={cmdLoading === `set_home_session${JSON.stringify({ homeSessionId: homeSessionInput })}`}
                  onClick={() => {
                    if (!homeSessionInput.trim()) return;
                    void sendCommand('set_home_session', { homeSessionId: homeSessionInput.trim() }, 'TV collegata a Home Session');
                    setHomeSessionInput('');
                  }}
                />
                <CmdButton
                  label="Scollega"
                  color="#6B7280"
                  loading={cmdLoading === `set_home_session${JSON.stringify({ homeSessionId: null })}`}
                  onClick={() => sendCommand('set_home_session', { homeSessionId: null }, 'TV scollegata')}
                />
              </div>
              <div style={{ marginTop: 8, fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>
                La TV mostra HomeGame in iframe finché è collegata. Usa "Scollega" per tornare alla schermata default.
              </div>
            </Panel>

          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Panel({ emoji, title, color, children }: { emoji: string; title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 16, border: `1px solid ${color}55`, background: 'rgba(255,255,255,0.11)', overflow: 'hidden' }}>
      <div style={{ padding: '13px 18px', background: `${color}25`, borderBottom: `1px solid ${color}38` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.15rem' }}>{emoji}</span>
          <span style={{ fontWeight: 900, fontSize: '0.78rem', letterSpacing: '0.12em', color }}>{title}</span>
        </div>
      </div>
      <div style={{ padding: '16px 18px' }}>{children}</div>
    </div>
  );
}

function CmdButton({ label, icon, color, loading, onClick }: {
  label: string; icon?: React.ReactNode; color: string; loading?: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} disabled={loading}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 14px', background: `${color}30`, border: `1.5px solid ${color}70`, borderRadius: 10, color, fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s', opacity: loading ? 0.6 : 1, letterSpacing: '0.02em' }}>
      {loading ? <Loader2 size={13} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}

function StatusBadge({ session }: { session: LiveSession }) {
  const STATUS_COLOR: Record<string, string> = { draft: '#6B7280', active: '#34D399', paused: '#F59E0B', ended: '#EF4444' };
  const c = STATUS_COLOR[session.status] ?? '#6B7280';
  return (
    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: c, boxShadow: `0 0 8px ${c}` }} />
      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: c }}>{session.status.toUpperCase()}</span>
      {session.currentGameSlug && (
        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginLeft: 4 }}>· {session.currentGameSlug}</span>
      )}
    </div>
  );
}
