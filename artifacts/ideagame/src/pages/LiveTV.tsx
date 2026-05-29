/**
 * /live-tv?s=CODE — Live TV Projector View
 * No auth required — access by TV code only.
 * Shows standby logo, current game phase, or Coppie Live memory board.
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { getSocket } from '@/hooks/useEventSocket';
import { Loader2, Wifi, WifiOff } from 'lucide-react';

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
  currentGameSlug: string | null; currentPhase: string; tvCode: string; role?: string;
}
interface LiveState {
  liveSessionId: string; currentGameSlug: string | null; currentPhase: string | null;
  payload: Record<string, unknown>;
}
interface DeckCard {
  id: string; pairId: string; label: string | null;
  imageData?: string; url?: string; flipped: boolean; matched: boolean;
}
interface CoppiePayload {
  cards: DeckCard[]; totalPairs: number; matchedPairs: number;
  gameOver: boolean; scores: Record<string, number>;
}

function getCode() {
  return new URLSearchParams(window.location.search).get('s') ?? '';
}

export default function LiveTV() {
  const code = useRef(getCode()).current;
  const [session, setSession] = useState<LiveSession | null>(null);
  const [state, setState] = useState<LiveState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blackout, setBlackout] = useState(false);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(getSocket());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchState = useCallback(async (sessionId: string) => {
    try {
      const s = await apiFetch<LiveState>(`/live-sessions/${sessionId}/state?s=${code}`);
      setState(s);
    } catch { /* noop */ }
  }, [code]);

  useEffect(() => {
    if (!code) { setError('Codice sessione mancante (?s=CODE)'); setLoading(false); return; }

    apiFetch<LiveSession>(`/live-sessions/by-code/${code}`).then(sess => {
      setSession(sess);
      return fetchState(sess.id);
    }).catch(() => setError('Sessione non trovata o codice non valido'))
      .finally(() => setLoading(false));
  }, [code]);

  // Socket + polling
  useEffect(() => {
    if (!session) return;
    const socket = socketRef.current;
    socket.emit('live:join', { sessionId: session.id, code });

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    if (socket.connected) setConnected(true);

    const onCommand = (data: { command: string; payload: unknown }) => {
      if (data.command === 'blackout') { setBlackout(true); return; }
      if (data.command === 'standby_logo') { setBlackout(false); }
      if (data.command === 'coppie_deck_ready' || data.command === 'coppie_match' || data.command === 'coppie_flip' || data.command === 'coppie_mismatch') {
        void fetchState(session.id);
      }
    };
    const onSessionUpdated = (data: Partial<LiveSession>) => {
      setSession(prev => prev ? { ...prev, ...data } : prev);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('live:command', onCommand);
    socket.on('live:session_updated', onSessionUpdated);

    // Polling fallback every 4s
    pollRef.current = setInterval(() => fetchState(session.id), 4000);

    return () => {
      socket.emit('live:leave', { sessionId: session.id });
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('live:command', onCommand);
      socket.off('live:session_updated', onSessionUpdated);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [session, code]);

  if (loading) {
    return <FullScreen><Loader2 className="animate-spin" size={40} style={{ color: '#A855F7' }} /></FullScreen>;
  }
  if (error) {
    return <FullScreen><div style={{ textAlign: 'center' }}><div style={{ fontSize: '3rem', marginBottom: 16 }}>📡</div><div style={{ fontWeight: 900, color: '#EF4444' }}>{error}</div></div></FullScreen>;
  }

  // ── Blackout ────────────────────────────────────────────────────────────
  if (blackout || state?.currentPhase === 'blackout') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', cursor: 'pointer' }}
        onClick={() => setBlackout(false)} />
    );
  }

  // ── Coppie Live ─────────────────────────────────────────────────────────
  const coppie = state?.payload?.coppie as CoppiePayload | undefined;
  if (session?.currentGameSlug === 'gioco-coppie' && coppie?.cards) {
    return <CoppieLiveBoard coppie={coppie} session={session} connected={connected} code={code} sessionId={session.id} />;
  }

  // ── Standby ─────────────────────────────────────────────────────────────
  if (!session?.currentGameSlug || session.currentPhase === 'standby') {
    return (
      <FullScreen>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '5rem', marginBottom: 24, filter: 'drop-shadow(0 0 30px rgba(168,85,247,0.6))' }}>🎤</div>
          <div style={{ fontWeight: 900, fontSize: '2rem', letterSpacing: '0.1em', color: '#A855F7', marginBottom: 8 }}>
            {session?.title ?? 'SERATA LIVE'}
          </div>
          <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.4)', marginBottom: 32 }}>
            In attesa del presentatore…
          </div>
          <div style={{ display: 'inline-flex', gap: 12 }}>
            <CodeBadge label="CODICE TV" code={code} color="#A855F7" />
          </div>
          <ConnectionDot connected={connected} />
        </div>
      </FullScreen>
    );
  }

  // ── Other game placeholder ───────────────────────────────────────────────
  return (
    <FullScreen>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.8rem', letterSpacing: '0.2em', color: '#A855F7', marginBottom: 12 }}>LIVE</div>
        <div style={{ fontWeight: 900, fontSize: '2.5rem', marginBottom: 8 }}>
          {session.currentGameSlug}
        </div>
        <div style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.5)' }}>{session.currentPhase}</div>
        <ConnectionDot connected={connected} />
      </div>
    </FullScreen>
  );
}

// ── Coppie Live Memory Board ──────────────────────────────────────────────

function CoppieLiveBoard({ coppie, session, connected, code, sessionId }: {
  coppie: CoppiePayload; session: LiveSession; connected: boolean; code: string; sessionId: string;
}) {
  const [flipping, setFlipping] = useState<string | null>(null);
  const [mismatchIds, setMismatchIds] = useState<string[]>([]);

  const handleFlip = async (card: DeckCard) => {
    if (card.flipped || card.matched || flipping) return;
    setFlipping(card.id);
    try {
      const res = await apiFetch<{ matched: boolean; gameOver: boolean }>
        (`/live-sessions/${sessionId}/coppie-flip?s=${code}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardId: card.id }),
        });
      if (!res.matched) {
        setMismatchIds([]);
      }
    } catch { /* noop */ } finally {
      setFlipping(null);
    }
  };

  const COLS = Math.min(5, coppie.cards.length);
  const needMore = coppie.totalPairs < 2;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#09050f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      {/* Header */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 52, background: 'rgba(168,85,247,0.08)', borderBottom: '1px solid rgba(168,85,247,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
        <div style={{ fontWeight: 900, fontSize: '0.85rem', letterSpacing: '0.1em', color: '#A855F7' }}>🃏 COPPIE LIVE</div>
        <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)' }}>{coppie.matchedPairs}/{coppie.totalPairs} coppie trovate</div>
        <ConnectionDot connected={connected} inline />
      </div>

      {needMore ? (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>📷</div>
          <div style={{ fontWeight: 900, color: '#F59E0B', fontSize: '1.2rem' }}>
            Servono ancora {2 - coppie.totalPairs} foto ospiti
          </div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', marginTop: 8 }}>
            Il presentatore sta caricando le foto dal telefono…
          </div>
        </div>
      ) : coppie.gameOver ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '5rem', marginBottom: 16 }}>🏆</div>
          <div style={{ fontWeight: 900, fontSize: '2.5rem', color: '#F5B642' }}>FINE GIOCO!</div>
          <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {Object.entries(coppie.scores).sort((a, b) => b[1] - a[1]).map(([team, pts]) => (
              <div key={team} style={{ padding: '8px 20px', background: 'rgba(245,182,66,0.15)', border: '1px solid rgba(245,182,66,0.4)', borderRadius: 12, fontSize: '1rem', fontWeight: 900, color: '#F5B642' }}>
                {team}: {pts} pt
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS},1fr)`, gap: 8, maxWidth: 900, width: '100%', marginTop: 52 }}>
          {coppie.cards.map(card => {
            const isMismatch = mismatchIds.includes(card.id);
            return (
              <MemoryCard key={card.id} card={card} isMismatch={isMismatch} onClick={() => handleFlip(card)} />
            );
          })}
        </div>
      )}
    </div>
  );
}

function MemoryCard({ card, isMismatch, onClick }: { card: DeckCard; isMismatch: boolean; onClick: () => void }) {
  const img = card.imageData ?? card.url;
  return (
    <div onClick={onClick} style={{
      aspectRatio: '3/4', borderRadius: 10, cursor: card.matched ? 'default' : 'pointer',
      border: `2px solid ${card.matched ? 'rgba(52,211,153,0.5)' : card.flipped ? 'rgba(168,85,247,0.6)' : isMismatch ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`,
      background: card.matched ? 'rgba(52,211,153,0.08)' : 'rgba(20,10,40,0.8)',
      overflow: 'hidden', position: 'relative', transition: 'all 0.2s',
      transform: isMismatch ? 'scale(0.96)' : 'scale(1)',
    }}>
      {(card.flipped || card.matched) && img ? (
        <img src={img} alt={card.label ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: card.matched ? 0.7 : 1 }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center',
          background: 'radial-gradient(ellipse at center,rgba(168,85,247,0.15) 0%,transparent 70%)' }}>
          <div style={{ fontSize: '1.5rem', opacity: 0.4 }}>🃏</div>
        </div>
      )}
      {card.matched && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(52,211,153,0.2)', display: 'grid', placeItems: 'center' }}>
          <div style={{ fontSize: '1.5rem' }}>✓</div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#09050f', display: 'grid', placeItems: 'center', fontFamily: "'Outfit','Space Grotesk',sans-serif", color: '#fff' }}>
      {children}
    </div>
  );
}

function CodeBadge({ label, code, color }: { label: string; code: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '0.65rem', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'monospace', fontSize: '1.6rem', fontWeight: 900, letterSpacing: '0.15em', color, textShadow: `0 0 20px ${color}80` }}>{code}</div>
    </div>
  );
}

function ConnectionDot({ connected, inline }: { connected: boolean; inline?: boolean }) {
  const dot = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? '#34D399' : '#6B7280', boxShadow: connected ? '0 0 8px #34D399' : 'none' }} />
      <span style={{ fontSize: '0.65rem', color: connected ? '#34D399' : '#6B7280' }}>{connected ? 'live' : 'offline'}</span>
    </div>
  );
  if (inline) return dot;
  return <div style={{ position: 'absolute', bottom: 20, right: 20 }}>{dot}</div>;
}
