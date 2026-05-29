/**
 * /live-tv?s=CODE — Live TV Projector View
 * No auth required — access by TV code only.
 * Shows standby logo, current game phase, or Coppie Live memory board.
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { getSocket } from '@/hooks/useEventSocket';
import { Loader2 } from 'lucide-react';

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

// Real couple deck card: partner A and B have DIFFERENT images, same pairId (= coupleId)
interface DeckCard {
  id: string;
  pairId: string;       // = coupleId, same for both cards of a couple
  partner?: 'A' | 'B';
  coupleName?: string;
  partnerName?: string;
  label: string | null;
  imageData?: string;
  url?: string | null;
  flipped: boolean;
  matched: boolean;
}
interface CoppiePayload {
  cards: DeckCard[];
  totalPairs: number;
  matchedPairs: number;
  gameOver: boolean;
  scores: Record<string, number>;
  completeCouplesCount?: number;
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
  const [completeCouplesCount, setCompleteCouplesCount] = useState(0);
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
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (['coppie_deck_ready', 'coppie_match', 'coppie_flip', 'coppie_mismatch'].includes(data.command)) {
        void fetchState(session.id);
      }
    };
    const onSessionUpdated = (data: Partial<LiveSession>) => {
      setSession(prev => prev ? { ...prev, ...data } : prev);
    };
    const onCouplesUpdated = (data: { completeCouplesCount?: number }) => {
      if (data.completeCouplesCount !== undefined) {
        setCompleteCouplesCount(data.completeCouplesCount);
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('live:command', onCommand);
    socket.on('live:session_updated', onSessionUpdated);
    socket.on('live:couples_updated', onCouplesUpdated);

    // Polling fallback every 4s
    pollRef.current = setInterval(() => fetchState(session.id), 4000);

    return () => {
      socket.emit('live:leave', { sessionId: session.id });
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('live:command', onCommand);
      socket.off('live:session_updated', onSessionUpdated);
      socket.off('live:couples_updated', onCouplesUpdated);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [session, code]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Home Session (renders HomeGame.tsx fullscreen via iframe) ───────────
  const homeSessionId = state?.payload?.homeSessionId as string | null | undefined;
  if (homeSessionId && session?.currentGameSlug !== 'gioco-coppie') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#09050f' }}>
        <iframe
          src={`${BASE}home?session=${homeSessionId}`}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          allow="autoplay"
        />
        <ConnectionDot connected={connected} />
      </div>
    );
  }

  // ── Coppie Live ─────────────────────────────────────────────────────────
  const coppie = state?.payload?.coppie as CoppiePayload | undefined;
  if (session?.currentGameSlug === 'gioco-coppie') {
    return (
      <CoppieLiveBoard
        coppie={coppie}
        session={session}
        connected={connected}
        code={code}
        sessionId={session.id}
        completeCouplesCount={completeCouplesCount}
        onStateRefresh={() => fetchState(session.id)}
      />
    );
  }

  // ── Standby ─────────────────────────────────────────────────────────────
  if (!session?.currentGameSlug || session.currentPhase === 'standby') {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        background: 'radial-gradient(ellipse 110% 70% at 50% 15%, #2d0d5c 0%, #1a0535 40%, #09050f 72%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Outfit','Space Grotesk',sans-serif", color: '#fff', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: '-12%', left: '50%', transform: 'translateX(-50%)', width: '75%', height: '55%', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(168,85,247,0.28) 0%, transparent 70%)', filter: 'blur(70px)' }} />
          <div style={{ position: 'absolute', bottom: '-8%', left: '8%', width: '42%', height: '38%', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(168,85,247,0.13) 0%, transparent 70%)', filter: 'blur(45px)' }} />
          <div style={{ position: 'absolute', bottom: '-8%', right: '8%', width: '42%', height: '38%', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(168,85,247,0.13) 0%, transparent 70%)', filter: 'blur(45px)' }} />
        </div>
        <div style={{ position: 'relative', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
          <div style={{ fontWeight: 900, fontSize: 'clamp(3.5rem,9vw,8rem)', letterSpacing: '0.14em', color: '#A855F7', textShadow: '0 0 50px rgba(168,85,247,0.75), 0 0 100px rgba(168,85,247,0.35)', lineHeight: 1 }}>
            LIVE SHOW
          </div>
          {session?.title && (
            <div style={{ fontWeight: 700, fontSize: 'clamp(1.1rem,3vw,2.2rem)', color: 'rgba(255,255,255,0.78)', letterSpacing: '0.04em', maxWidth: '80vw', textAlign: 'center' }}>
              {session.title}
            </div>
          )}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 30px', background: 'rgba(168,85,247,0.14)', border: '1px solid rgba(168,85,247,0.38)', borderRadius: 100, fontSize: 'clamp(0.85rem,2vw,1.15rem)', fontWeight: 700, color: 'rgba(255,255,255,0.58)', letterSpacing: '0.07em' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#A855F7', boxShadow: '0 0 12px rgba(168,85,247,0.9)', display: 'inline-block', flexShrink: 0 }} />
            In attesa della regia
          </div>
        </div>
        <ConnectionDot connected={connected} />
      </div>
    );
  }

  // ── Other game (playing) ─────────────────────────────────────────────────
  const GAME_NAME: Record<string, string> = {
    'gioco-coppie': 'COPPIE LIVE', 'percorso-a-risate': 'PERCORSO A RISATE',
    'quizzone': 'QUIZZONE', 'sfida-ballo': 'SFIDA DI BALLO', 'sara-musica': "SARA'MUSICA",
  };
  const GAME_COLOR: Record<string, string> = {
    'gioco-coppie': '#A855F7', 'percorso-a-risate': '#F59E0B',
    'quizzone': '#60A5FA', 'sfida-ballo': '#EC4899', 'sara-musica': '#34D399',
  };
  const slug  = session.currentGameSlug;
  const name  = GAME_NAME[slug]  ?? slug.toUpperCase();
  const color = GAME_COLOR[slug] ?? '#A855F7';
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: `radial-gradient(ellipse 110% 70% at 50% 15%, ${color}40 0%, #1a0535 45%, #09050f 75%)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Outfit','Space Grotesk',sans-serif", color: '#fff', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '-12%', left: '50%', transform: 'translateX(-50%)', width: '75%', height: '55%', borderRadius: '50%', background: `radial-gradient(ellipse, ${color}30 0%, transparent 70%)`, filter: 'blur(70px)' }} />
      </div>
      <div style={{ position: 'relative', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
        <div style={{ fontWeight: 900, fontSize: 'clamp(3rem,8vw,7rem)', letterSpacing: '0.13em', color, textShadow: `0 0 50px ${color}BB, 0 0 100px ${color}44`, lineHeight: 1 }}>
          {name}
        </div>
        {session?.title && (
          <div style={{ fontWeight: 700, fontSize: 'clamp(0.95rem,2.5vw,1.8rem)', color: 'rgba(255,255,255,0.65)', letterSpacing: '0.04em' }}>
            {session.title}
          </div>
        )}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 30px', background: `${color}18`, border: `1px solid ${color}50`, borderRadius: 100, fontSize: 'clamp(0.8rem,1.8vw,1.05rem)', fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.07em' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, boxShadow: `0 0 12px ${color}`, display: 'inline-block', flexShrink: 0 }} />
          {session.currentPhase}
        </div>
      </div>
      <ConnectionDot connected={connected} />
    </div>
  );
}

// ── Coppie Live Memory Board ──────────────────────────────────────────────

function CoppieLiveBoard({
  coppie, session, connected, code, sessionId, completeCouplesCount, onStateRefresh,
}: {
  coppie: CoppiePayload | undefined;
  session: LiveSession;
  connected: boolean;
  code: string;
  sessionId: string;
  completeCouplesCount: number;
  onStateRefresh: () => void;
}) {
  const [flipping, setFlipping] = useState<string | null>(null);
  const [mismatchIds, setMismatchIds] = useState<string[]>([]);
  const [matchFlash, setMatchFlash] = useState<{ pairId: string; coupleName?: string } | null>(null);

  const handleFlip = async (card: DeckCard) => {
    if (card.flipped || card.matched || flipping) return;
    setFlipping(card.id);
    try {
      const res = await apiFetch<{ matched: boolean; gameOver: boolean }>(
        `/live-sessions/${sessionId}/coppie-flip?s=${code}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardId: card.id }),
        },
      );
      if (res.matched) {
        setMatchFlash({ pairId: card.pairId, coupleName: card.coupleName });
        setTimeout(() => setMatchFlash(null), 2500);
      }
      // Refresh state after any flip to keep cards in sync
      onStateRefresh();
    } catch { /* noop */ } finally {
      setFlipping(null);
    }
  };

  // Deck not ready yet
  if (!coppie?.cards || coppie.cards.length === 0) {
    const known = completeCouplesCount || 0;
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#09050f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ fontSize: '4rem', marginBottom: 20, filter: 'drop-shadow(0 0 24px rgba(168,85,247,0.5))' }}>📷</div>
        <div style={{ fontWeight: 900, fontSize: '1.8rem', color: '#A855F7', marginBottom: 12, textAlign: 'center' }}>
          {session.title}
        </div>
        <div style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.6)', marginBottom: 24, textAlign: 'center' }}>
          Il presentatore sta creando le coppie…
        </div>
        {/* Couple progress */}
        <div style={{ padding: '16px 32px', background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: 16, textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#F5B642', marginBottom: 4 }}>
            {known}/10
          </div>
          <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)' }}>Coppie complete</div>
          <div style={{ marginTop: 12, width: 200, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 100, overflow: 'hidden' }}>
            <div style={{ height: 6, borderRadius: 100, width: `${known * 10}%`, background: known === 10 ? '#34D399' : 'linear-gradient(90deg,#A855F7,#F5B642)', transition: 'width 0.4s' }} />
          </div>
        </div>
        <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.3)' }}>In attesa che il mazzo venga creato…</div>
        <ConnectionDot connected={connected} />
      </div>
    );
  }

  // 5×4 grid for 20 cards (or smaller for fewer couples)
  const numCards = coppie.cards.length;
  const COLS = numCards <= 12 ? 4 : 5;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#09050f', display: 'flex', flexDirection: 'column' }}>
      {/* Header bar */}
      <div style={{ height: 52, flexShrink: 0, background: 'rgba(168,85,247,0.08)', borderBottom: '1px solid rgba(168,85,247,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
        <div style={{ fontWeight: 900, fontSize: '0.9rem', letterSpacing: '0.1em', color: '#A855F7' }}>🃏 COPPIE LIVE</div>
        <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>
          {coppie.matchedPairs}/{coppie.totalPairs} coppie trovate
        </div>
        <ConnectionDot connected={connected} inline />
      </div>

      {/* Game over */}
      {coppie.gameOver ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: '5rem', marginBottom: 20 }}>🏆</div>
          <div style={{ fontWeight: 900, fontSize: '3rem', color: '#F5B642', marginBottom: 24, letterSpacing: '0.05em' }}>FINE GIOCO!</div>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            {Object.entries(coppie.scores).sort((a, b) => b[1] - a[1]).map(([team, pts]) => (
              <div key={team} style={{ padding: '12px 28px', background: 'rgba(245,182,66,0.15)', border: '1px solid rgba(245,182,66,0.4)', borderRadius: 14, fontSize: '1.2rem', fontWeight: 900, color: '#F5B642' }}>
                {team}: {pts} pt
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Card grid */
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 16px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gap: 10,
            width: '100%',
            maxWidth: COLS === 5 ? 980 : 800,
          }}>
            {coppie.cards.map(card => {
              const isMismatch = mismatchIds.includes(card.id);
              return (
                <MemoryCard
                  key={card.id}
                  card={card}
                  isMismatch={isMismatch}
                  isFlipping={flipping === card.id}
                  onClick={() => handleFlip(card)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Match flash overlay */}
      {matchFlash && (
        <div style={{
          position: 'fixed', inset: 0, pointerEvents: 'none',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          zIndex: 100,
        }}>
          <div style={{
            padding: '20px 48px', borderRadius: 24,
            background: 'linear-gradient(135deg,rgba(52,211,153,0.92),rgba(16,185,129,0.92))',
            border: '2px solid rgba(52,211,153,0.8)',
            boxShadow: '0 0 60px rgba(52,211,153,0.6)',
            textAlign: 'center', animation: 'fadeInUp 0.3s ease',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 6 }}>💑</div>
            <div style={{ fontWeight: 900, fontSize: '1.8rem', color: '#fff', marginBottom: matchFlash.coupleName ? 6 : 0 }}>
              Coppia trovata!
            </div>
            {matchFlash.coupleName && (
              <div style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>
                {matchFlash.coupleName}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MemoryCard({ card, isMismatch, isFlipping, onClick }: {
  card: DeckCard; isMismatch: boolean; isFlipping: boolean; onClick: () => void;
}) {
  const img = card.imageData ?? card.url;
  const isRevealed = card.flipped || card.matched;
  const partnerColor = card.partner === 'A' ? '#60A5FA' : '#F472B6';

  return (
    <div
      onClick={onClick}
      style={{
        aspectRatio: '3/4',
        borderRadius: 10,
        cursor: card.matched ? 'default' : isFlipping ? 'wait' : 'pointer',
        border: `2px solid ${
          card.matched ? 'rgba(52,211,153,0.6)'
            : card.flipped ? 'rgba(168,85,247,0.7)'
            : isMismatch ? 'rgba(239,68,68,0.6)'
            : 'rgba(255,255,255,0.08)'
        }`,
        background: card.matched
          ? 'rgba(52,211,153,0.06)'
          : 'rgba(15,8,30,0.85)',
        overflow: 'hidden',
        position: 'relative',
        transition: 'transform 0.15s, border-color 0.2s',
        transform: isMismatch ? 'scale(0.94)' : isFlipping ? 'scale(0.97)' : 'scale(1)',
        boxShadow: card.flipped && !card.matched ? '0 0 16px rgba(168,85,247,0.4)' : 'none',
      }}
    >
      {/* Front: photo */}
      {isRevealed && img ? (
        <>
          <img
            src={img}
            alt={card.coupleName ?? card.label ?? ''}
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: card.matched ? 0.75 : 1 }}
          />
          {/* Partner badge */}
          {card.partner && (
            <div style={{
              position: 'absolute', top: 5, left: 5,
              width: 22, height: 22, borderRadius: '50%',
              background: partnerColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.6rem', fontWeight: 900, color: '#000',
            }}>
              {card.partner}
            </div>
          )}
          {/* Name overlay on matched cards */}
          {card.matched && (card.partnerName ?? card.coupleName) && (
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)',
              padding: '16px 6px 5px',
            }}>
              <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {card.partnerName ?? card.coupleName}
              </div>
            </div>
          )}
          {/* Matched overlay */}
          {card.matched && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'rgba(52,211,153,0.18)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
              paddingBottom: 4,
            }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(52,211,153,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 900, color: '#000' }}>✓</div>
            </div>
          )}
        </>
      ) : (
        /* Back: card back */
        <div style={{
          width: '100%', height: '100%', display: 'grid', placeItems: 'center',
          background: 'radial-gradient(ellipse at center, rgba(168,85,247,0.18) 0%, transparent 70%)',
        }}>
          <div style={{ fontSize: '1.8rem', opacity: 0.35 }}>🃏</div>
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
