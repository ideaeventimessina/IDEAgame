/**
 * HomeLobbyPage — /home-lobby/:code
 * Stadium QR redesign: giant scannable QR as hero, code, counter, minimal clutter.
 * Optimised for projectors, LED walls, TVs — readable from 20–30 metres.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { AudioManager } from '@/audio/AudioManager';
import { useLocation, useParams } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Users, Loader2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
function pub(path: string) {
  const b = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;
  return `${b}${path}`;
}

interface HomeSession {
  id: string;
  joinCode: string;
  hostName: string;
  maxPlayers: number;
  status: 'lobby' | 'playing' | 'ended';
  gameConfig: Record<string, unknown>;
}
interface HomePlayer {
  id: string;
  nickname: string;
  avatarColor: string;
  score: number;
  isConnected: boolean;
}

const AVATAR_COLORS = ['#F5B642','#A855F7','#EC4899','#34D399','#60A5FA','#F87171','#FB923C','#22D3EE'];

// ── Background — same SceneBg kept from original ──────────────────────────────
function SceneBg({ pulse }: { pulse: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse 130% 90% at 50% 100%,rgba(245,182,66,0.2) 0%,rgba(60,20,120,0.55) 30%,#030010 70%)',
        transition: 'opacity 0.4s',
      }}/>
      {/* Cinematic light beams */}
      <div className="absolute" style={{
        left: '-8%', top: 0, width: '40%', height: '80%',
        background: 'conic-gradient(from -6deg at 20% 0%,transparent 0deg,rgba(245,182,66,0.08) 16deg,transparent 32deg)',
        filter: 'blur(2px)',
      }}/>
      <div className="absolute" style={{
        right: '-8%', top: 0, width: '40%', height: '80%',
        background: 'conic-gradient(from 6deg at 80% 0%,transparent 0deg,rgba(245,182,66,0.08) 16deg,transparent 32deg)',
        filter: 'blur(2px)',
      }}/>
      {/* Audience silhouette bar */}
      <svg className="absolute bottom-0 left-0 right-0 w-full" viewBox="0 0 1280 120"
        preserveAspectRatio="none" style={{ height: 100, opacity: 0.45 }}>
        {Array.from({ length: 44 }).map((_, i) => {
          const x = i * (1280 / 44);
          const h = 40 + Math.sin(i * 1.5) * 16 + (i % 3) * 10;
          return <ellipse key={i} cx={x + 14} cy={118 - h / 2} rx={8} ry={h / 2} fill="rgba(0,0,0,0.5)"/>;
        })}
      </svg>
      {/* Stage floor glow line */}
      <div className="absolute bottom-0 left-0 right-0" style={{
        height: 3,
        background: 'linear-gradient(90deg,transparent,rgba(245,182,66,0.5),rgba(168,85,247,0.4),rgba(245,182,66,0.5),transparent)',
      }}/>
      {/* Join pulse overlay */}
      <AnimatePresence>
        {pulse && (
          <motion.div
            key="pulse"
            initial={{ opacity: 0.35 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse 60% 60% at 50% 50%,rgba(168,85,247,0.4),transparent)', pointerEvents: 'none' }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

interface LiveSessionMeta {
  id: string;
  tvCode: string;
  presenterCode: string;
}

export default function HomeLobbyPage() {
  const [, navigate] = useLocation();
  const params = useParams<{ code: string }>();
  const code = (params.code ?? '').toUpperCase().trim();

  // Live mode: read ?live=TVCODE from URL
  const liveCode = typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('live') ?? '')
    : '';

  const [session, setSession]         = useState<HomeSession | null>(null);
  const [players, setPlayers]         = useState<HomePlayer[]>([]);
  const [notFound, setNotFound]       = useState(false);
  const [starting, setStarting]       = useState(false);
  const [musicPlaying, setMusicPlaying] = useState(true);
  const [joinPulse, setJoinPulse]     = useState(false);
  const prevPlayerCount = useRef(0);

  // Live session metadata (fetched by tvCode when in live mode)
  const [liveMeta, setLiveMeta]       = useState<LiveSessionMeta | null>(null);
  const [showAccedi, setShowAccedi]   = useState(false);
  const [showPresenterQR, setShowPresenterQR] = useState(false);

  useEffect(() => {
    if (!liveCode) return;
    fetch(`/api/live-sessions/by-code/${liveCode}`)
      .then(r => r.ok ? r.json() as Promise<LiveSessionMeta> : null)
      .then(data => { if (data) setLiveMeta(data); })
      .catch(() => {});
  }, [liveCode]);

  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${BASE.replace(/\/$/, '')}/join/${code}`
    : `/join/${code}`;

  const poll = useCallback(async () => {
    if (!code) return;
    try {
      const r = await fetch(`/api/home/sessions/by-code/${code}`);
      if (r.status === 404) { setNotFound(true); return; }
      if (!r.ok) return;
      const data = await r.json() as { session: HomeSession; players: HomePlayer[] };
      setSession(data.session);
      setPlayers(prev => {
        // Trigger pulse when a new player joins
        if (data.players.length > prevPlayerCount.current) {
          setJoinPulse(true);
          setTimeout(() => setJoinPulse(false), 1300);
        }
        prevPlayerCount.current = data.players.length;
        return data.players;
      });
      if (data.session.status === 'playing') {
        navigate(`/home?s=${data.session.id}${liveCode ? `&live=${liveCode}` : ''}`);
      }
    } catch { /* network hiccup */ }
  }, [code, navigate]);

  useEffect(() => {
    void poll();
    const id = setInterval(() => { void poll(); }, 3000);
    return () => clearInterval(id);
  }, [poll]);

  // ── Lobby music ─────────────────────────────────────────────────────────────
  useEffect(() => {
    AudioManager.stopLoop(true);
    void AudioManager.playLoop('hub', 'lobby_loop');
    return () => { AudioManager.stopLoop(true); };
  }, []);

  const toggleMusic = () => {
    if (musicPlaying) {
      AudioManager.stopLoop(true);
    } else {
      AudioManager.resumeContext();
      void AudioManager.playLoop('hub', 'lobby_loop');
    }
    setMusicPlaying(m => !m);
  };

  const handleStart = async () => {
    if (!session) return;
    setStarting(true);
    try {
      await fetch(`/api/home/sessions/${session.id}/ready`, { method: 'POST' });
      navigate(`/home?s=${session.id}${liveCode ? `&live=${liveCode}` : ''}`);
    } catch {
      setStarting(false);
    }
  };

  // ── Not found ────────────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center"
        style={{ background: '#030010', fontFamily: "'Outfit',sans-serif", gap: 16 }}>
        <SceneBg pulse={false}/>
        <div style={{ position: 'relative', zIndex: 10, textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', marginBottom: 8 }}>
            Stanza non trovata
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>
            Il codice {code} non esiste o è scaduto.
          </div>
          <button onClick={() => navigate('/home-setup')} style={{
            background: 'rgba(245,182,66,0.2)', border: '1.5px solid rgba(245,182,66,0.5)',
            borderRadius: 100, padding: '0.6rem 1.6rem', cursor: 'pointer',
            color: '#F5B642', fontWeight: 700, fontSize: '0.8rem',
          }}>← Crea nuova stanza</button>
        </div>
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (!session) {
    return (
      <div className="fixed inset-0 flex items-center justify-center"
        style={{ background: '#030010' }}>
        <SceneBg pulse={false}/>
        <Loader2 size={36} style={{ color: '#F5B642', animation: 'spin 1s linear infinite', position: 'relative', zIndex: 10 }}/>
      </div>
    );
  }

  const canStart = players.length >= 1;
  const selectedGames = (session.gameConfig?.selectedGames as string[] | undefined) ?? [];
  const matchDuration = String(session.gameConfig?.matchDuration ?? 'normal');

  return (
    <div className="fixed inset-0 overflow-hidden"
      style={{ background: '#030010', fontFamily: "'Outfit','Space Grotesk','Arial Black',sans-serif" }}>
      <SceneBg pulse={joinPulse}/>

      {/* ── TOP BAR — minimal, non-distracting ─────────────────────────────── */}
      <div className="relative z-10 flex items-center justify-between"
        style={{ padding: 'clamp(10px,1.5vh,18px) clamp(16px,2.5vw,32px) 0' }}>

        {/* Left controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <motion.button
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            onClick={() => navigate('/home-setup')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0.45rem 1.1rem',
              background: 'rgba(255,255,255,0.05)',
              border: '1.5px solid rgba(255,255,255,0.12)',
              borderRadius: 100, color: 'rgba(255,255,255,0.45)',
              fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em', cursor: 'pointer',
              backdropFilter: 'blur(8px)',
            }}
            whileHover={{ borderColor: 'rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.8)' }}
            whileTap={{ scale: 0.97 }}>
            <ChevronLeft size={13}/> MODIFICA
          </motion.button>
          <motion.button
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            onClick={toggleMusic}
            style={{
              padding: '0.45rem 0.85rem',
              background: musicPlaying ? 'rgba(245,182,66,0.1)' : 'rgba(255,255,255,0.04)',
              border: musicPlaying ? '1.5px solid rgba(245,182,66,0.4)' : '1.5px solid rgba(255,255,255,0.1)',
              borderRadius: 100,
              color: musicPlaying ? '#F5B642' : 'rgba(255,255,255,0.35)',
              fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.05em', cursor: 'pointer',
              backdropFilter: 'blur(8px)',
            }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}>
            {musicPlaying ? '♪ Stop' : '♪ Play'}
          </motion.button>
        </div>

        {/* Logo — centred */}
        <motion.img src={pub('/jonny-world-logo.png')} alt="Jonny's World"
          initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.05, duration: 0.5 }}
          style={{ width: 'clamp(7rem,10vw,9rem)', objectFit: 'contain',
            filter: 'drop-shadow(0 0 20px rgba(245,182,66,0.6))' }}/>

        {/* Right side: host pill + Accedi (live only) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Host pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 100, padding: '6px 14px',
            fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.45)',
            letterSpacing: '0.06em',
          }}>
            🎤 {session.hostName}
          </div>

          {/* 🔑 Accedi — shown only in live mode */}
          {liveCode && (
            <div style={{ position: 'relative' }}>
              {/* Click-outside backdrop */}
              {showAccedi && (
                <div onClick={() => setShowAccedi(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 48 }}/>
              )}

              {/* Action panel — 3 real buttons */}
              {showAccedi && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.16 }}
                  style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                    background: 'rgba(8,4,24,0.97)',
                    border: '1.5px solid rgba(255,255,255,0.14)',
                    borderRadius: 18,
                    backdropFilter: 'blur(28px)',
                    boxShadow: '0 16px 60px rgba(0,0,0,0.75)',
                    padding: '14px 14px 12px',
                    display: 'flex', flexDirection: 'column', gap: 8,
                    minWidth: 230, zIndex: 50,
                  }}>
                  {/* Header */}
                  <div style={{
                    fontSize: '0.58rem', fontWeight: 900, letterSpacing: '0.2em',
                    color: 'rgba(245,182,66,0.65)', textTransform: 'uppercase',
                    textAlign: 'center', paddingBottom: 4,
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                    marginBottom: 2,
                  }}>
                    🔴 Modalità Live
                  </div>

                  {/* BTN 1 — ADMIN */}
                  <button
                    onClick={() => window.open('/admin', '_blank')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '11px 16px',
                      background: 'rgba(99,102,241,0.15)',
                      border: '1.5px solid rgba(99,102,241,0.4)',
                      borderRadius: 12,
                      color: '#a5b4fc',
                      fontSize: '0.85rem', fontWeight: 800,
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.28)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.7)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.15)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'; }}>
                    🛠 <span>Admin</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.6rem', opacity: 0.45 }}>↗ nuova tab</span>
                  </button>

                  {/* BTN 2 — REGIA */}
                  <button
                    onClick={() => liveMeta && window.open(`/live-control?session=${liveMeta.id}`, '_blank')}
                    disabled={!liveMeta}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '11px 16px',
                      background: liveMeta ? 'rgba(245,182,66,0.13)' : 'rgba(255,255,255,0.04)',
                      border: liveMeta ? '1.5px solid rgba(245,182,66,0.4)' : '1.5px solid rgba(255,255,255,0.08)',
                      borderRadius: 12,
                      color: liveMeta ? '#F5B642' : 'rgba(255,255,255,0.25)',
                      fontSize: '0.85rem', fontWeight: 800,
                      cursor: liveMeta ? 'pointer' : 'default', textAlign: 'left', width: '100%',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { if (liveMeta) { e.currentTarget.style.background = 'rgba(245,182,66,0.25)'; e.currentTarget.style.borderColor = 'rgba(245,182,66,0.7)'; }}}
                    onMouseLeave={e => { if (liveMeta) { e.currentTarget.style.background = 'rgba(245,182,66,0.13)'; e.currentTarget.style.borderColor = 'rgba(245,182,66,0.4)'; }}}>
                    🎛 <span>Regia</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.6rem', opacity: 0.45 }}>{liveMeta ? '↗ nuova tab' : '…'}</span>
                  </button>

                  {/* BTN 3 — PRESENTATORE */}
                  <button
                    onClick={() => liveMeta && window.open(`/live-presenter?s=${liveMeta.presenterCode}`, '_blank')}
                    disabled={!liveMeta}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '11px 16px',
                      background: liveMeta ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)',
                      border: liveMeta ? '1.5px solid rgba(52,211,153,0.4)' : '1.5px solid rgba(255,255,255,0.08)',
                      borderRadius: 12,
                      color: liveMeta ? '#6ee7b7' : 'rgba(255,255,255,0.25)',
                      fontSize: '0.85rem', fontWeight: 800,
                      cursor: liveMeta ? 'pointer' : 'default', textAlign: 'left', width: '100%',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { if (liveMeta) { e.currentTarget.style.background = 'rgba(52,211,153,0.24)'; e.currentTarget.style.borderColor = 'rgba(52,211,153,0.7)'; }}}
                    onMouseLeave={e => { if (liveMeta) { e.currentTarget.style.background = 'rgba(52,211,153,0.12)'; e.currentTarget.style.borderColor = 'rgba(52,211,153,0.4)'; }}}>
                    🎤 <span>Presentatore</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.6rem', opacity: 0.45 }}>{liveMeta ? '↗ nuova tab' : '…'}</span>
                  </button>

                  {/* QR Presentatore — always shown when liveMeta available */}
                  {liveMeta && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: 4 }}>
                      <div style={{ background: '#fff', borderRadius: 10, padding: 7, lineHeight: 0, boxShadow: '0 0 20px rgba(52,211,153,0.25)' }}>
                        <QRCodeSVG
                          value={`${typeof window !== 'undefined' ? window.location.origin : ''}/live-presenter?s=${liveMeta.presenterCode}`}
                          size={110} bgColor="#ffffff" fgColor="#03000f" level="M"
                        />
                      </div>
                      <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>
                        /live-presenter?s={liveMeta.presenterCode}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Pill trigger */}
              <motion.button
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                onClick={() => setShowAccedi(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '0.45rem 1.1rem',
                  background: showAccedi ? 'rgba(245,182,66,0.2)' : 'rgba(245,182,66,0.1)',
                  border: showAccedi ? '1.5px solid rgba(245,182,66,0.7)' : '1.5px solid rgba(245,182,66,0.45)',
                  borderRadius: 100,
                  color: '#F5B642',
                  fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em',
                  cursor: 'pointer', backdropFilter: 'blur(16px)',
                  boxShadow: '0 0 16px rgba(245,182,66,0.2)',
                }}>
                🔑 Accedi
              </motion.button>
            </div>
          )}
        </div>
      </div>

      {/* ── HERO SECTION ────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col items-center"
        style={{
          paddingTop: 'clamp(6px,1vh,12px)',
          paddingBottom: 'clamp(60px,8vh,90px)',
          height: 'calc(100% - clamp(50px,8vh,76px))',
          justifyContent: 'center',
          gap: 'clamp(6px,1.2vh,14px)',
        }}>

        {/* CTA headline — pulsing glow */}
        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          style={{ textAlign: 'center' }}>
          <motion.div
            animate={{ textShadow: ['0 0 24px rgba(245,182,66,0.5)','0 0 48px rgba(245,182,66,0.9)','0 0 24px rgba(245,182,66,0.5)'] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              fontWeight: 900,
              fontSize: 'clamp(0.9rem,2.2vw,1.55rem)',
              letterSpacing: 'clamp(0.12em,0.4vw,0.28em)',
              color: '#F5B642',
              textTransform: 'uppercase',
            }}>
            ↓ SCANSIONA IL QR PER ENTRARE ↓
          </motion.div>
        </motion.div>

        {/* ── GIANT QR ─────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.18, type: 'spring', stiffness: 180, damping: 22 }}
          style={{ position: 'relative', flexShrink: 0 }}>

          {/* Outer glow ring — animated */}
          <motion.div
            animate={{
              boxShadow: joinPulse
                ? ['0 0 0px 0px rgba(168,85,247,0)','0 0 80px 40px rgba(168,85,247,0.6)','0 0 0px 0px rgba(168,85,247,0)']
                : ['0 0 40px 8px rgba(245,182,66,0.35)','0 0 70px 20px rgba(245,182,66,0.6)','0 0 40px 8px rgba(245,182,66,0.35)'],
            }}
            transition={joinPulse
              ? { duration: 1.2, ease: 'easeOut' }
              : { duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              borderRadius: 24,
              // Outer frame: thick gold/white border for projector visibility
              padding: 'clamp(10px,1.4vw,20px)',
              background: '#ffffff',
              border: 'clamp(6px,1vw,14px) solid #ffffff',
              outline: 'clamp(3px,0.5vw,6px) solid rgba(245,182,66,0.8)',
              outlineOffset: 'clamp(2px,0.4vw,5px)',
              lineHeight: 0,
            }}>
            {/* QR — no transparency, no overlay. Sharp and white-backed. */}
            <QRCodeSVG
              value={joinUrl}
              size={Math.round(Math.min(
                typeof window !== 'undefined' ? window.innerHeight * 0.42 : 400,
                typeof window !== 'undefined' ? window.innerWidth  * 0.35 : 400,
              ))}
              bgColor="#ffffff"
              fgColor="#03000f"
              level="H"
              includeMargin={false}
            />
          </motion.div>
        </motion.div>

        {/* ── ROOM CODE — enormous typography ─────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          style={{ textAlign: 'center', lineHeight: 1 }}>
          <motion.div
            animate={{ scale: [1, 1.025, 1] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              fontFamily: "'Outfit','Arial Black',monospace",
              fontWeight: 900,
              fontSize: 'clamp(2.8rem,7.5vw,6.5rem)',
              letterSpacing: 'clamp(0.22em,0.8vw,0.4em)',
              color: '#ffffff',
              textShadow: '0 0 32px rgba(245,182,66,0.7), 0 2px 0 rgba(0,0,0,0.5)',
            }}>
            {session.joinCode}
          </motion.div>
          {/* Secondary URL */}
          <div style={{
            marginTop: 'clamp(2px,0.4vh,6px)',
            fontSize: 'clamp(0.62rem,1.1vw,0.88rem)',
            fontWeight: 600, letterSpacing: '0.12em',
            color: 'rgba(255,255,255,0.3)',
          }}>
            ideagame.it/join
          </div>
        </motion.div>

        {/* ── PLAYER COUNTER — large live number ───────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ delay: 0.32 }}
          style={{ display: 'flex', alignItems: 'center', gap: 'clamp(8px,1.5vw,18px)' }}>
          <motion.div
            animate={joinPulse ? { scale: [1, 1.22, 1] } : { scale: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 'clamp(4px,0.6vw,8px)',
              background: 'rgba(168,85,247,0.12)',
              border: '2px solid rgba(168,85,247,0.4)',
              borderRadius: 'clamp(12px,1.5vw,20px)',
              padding: 'clamp(6px,0.8vh,12px) clamp(16px,2.5vw,36px)',
              boxShadow: '0 0 30px rgba(168,85,247,0.2)',
            }}>
            <Users size={22} style={{ color: '#A855F7', flexShrink: 0 }}/>
            <span style={{
              fontFamily: "'Outfit',monospace",
              fontWeight: 900,
              fontSize: 'clamp(1.6rem,4vw,3.2rem)',
              color: '#A855F7',
              letterSpacing: '0.04em',
              lineHeight: 1,
            }}>
              {players.length}
            </span>
            <span style={{
              fontWeight: 700,
              fontSize: 'clamp(0.9rem,2vw,1.6rem)',
              color: 'rgba(255,255,255,0.35)',
              letterSpacing: '0.04em',
              lineHeight: 1,
            }}>
              / {session.maxPlayers}
            </span>
            <span style={{
              fontWeight: 800,
              fontSize: 'clamp(0.65rem,1.4vw,1rem)',
              color: 'rgba(255,255,255,0.4)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              lineHeight: 1,
              marginLeft: 2,
            }}>
              GIOCATORI
            </span>
          </motion.div>
        </motion.div>

        {/* ── PLAYER AVATARS — compact row ─────────────────────────────────── */}
        <AnimatePresence>
          {players.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexWrap: 'wrap', gap: 'clamp(4px,0.6vw,8px)',
                maxWidth: 'clamp(300px,70vw,900px)',
              }}>
              {players.map((p, i) => {
                const color = p.avatarColor || AVATAR_COLORS[i % AVATAR_COLORS.length]!;
                return (
                  <motion.div key={p.id}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 'clamp(4px,0.5vw,7px)',
                      background: 'rgba(255,255,255,0.06)',
                      border: `1.5px solid ${color}55`,
                      borderRadius: 100,
                      padding: 'clamp(4px,0.5vh,6px) clamp(10px,1.2vw,14px) clamp(4px,0.5vh,6px) clamp(4px,0.5vw,6px)',
                      boxShadow: `0 0 12px ${color}22`,
                    }}>
                    <div style={{
                      width: 'clamp(22px,2.2vw,30px)', height: 'clamp(22px,2.2vw,30px)',
                      borderRadius: '50%',
                      background: `radial-gradient(circle,${color}55,${color}22)`,
                      border: `2px solid ${color}88`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 900, fontSize: 'clamp(0.6rem,0.9vw,0.75rem)', color: '#fff', flexShrink: 0,
                    }}>{p.nickname[0]?.toUpperCase()}</div>
                    <span style={{
                      fontWeight: 700, fontSize: 'clamp(0.65rem,1vw,0.82rem)',
                      color: 'rgba(255,255,255,0.85)',
                      letterSpacing: '0.02em', whiteSpace: 'nowrap',
                    }}>
                      {p.nickname}
                    </span>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Camera helper */}
        <div style={{
          fontSize: 'clamp(0.6rem,1.1vw,0.82rem)',
          fontWeight: 600,
          letterSpacing: '0.1em',
          color: 'rgba(255,255,255,0.22)',
          textTransform: 'uppercase',
          textAlign: 'center',
        }}>
          📷 Apri la fotocamera e inquadra il QR
        </div>
      </div>

      {/* ── FOOTER — room metadata pills + CTA ──────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'clamp(10px,1.6vh,18px) clamp(16px,2.5vw,32px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        background: 'linear-gradient(0deg,rgba(3,0,16,0.92) 0%,transparent 100%)',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        {/* Left: metadata pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Pill label="Host" value={session.hostName} color="rgba(245,182,66,0.5)"/>
          <Pill label="Durata" value={matchDuration} color="rgba(168,85,247,0.5)"/>
          <Pill label="Max" value={`${session.maxPlayers} giocatori`} color="rgba(168,85,247,0.5)"/>
          {selectedGames.slice(0,4).map(g => (
            <Pill key={g} label="" value={g.replace(/-/g,' ')} color="rgba(255,255,255,0.2)"/>
          ))}
          {selectedGames.length > 4 && (
            <Pill label="" value={`+${selectedGames.length - 4}`} color="rgba(255,255,255,0.2)"/>
          )}
        </div>

        {/* Right: Avvia CTA */}
        <motion.button
          whileHover={canStart ? { scale: 1.04 } : {}}
          whileTap={canStart ? { scale: 0.96 } : {}}
          onClick={canStart ? handleStart : undefined}
          disabled={!canStart || starting}
          style={{
            background: canStart ? 'linear-gradient(135deg,#F5B642,#E09020)' : 'rgba(255,255,255,0.07)',
            border: canStart ? 'none' : '1.5px solid rgba(255,255,255,0.13)',
            borderRadius: 100,
            padding: 'clamp(0.6rem,1.2vh,0.9rem) clamp(1.6rem,3vw,3rem)',
            fontSize: 'clamp(0.8rem,1.4vw,1rem)',
            fontWeight: 900, letterSpacing: '0.1em',
            color: canStart ? '#fff' : 'rgba(255,255,255,0.25)',
            boxShadow: canStart ? '0 0 40px rgba(245,182,66,0.5)' : 'none',
            cursor: canStart ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.3s',
            flexShrink: 0,
          }}>
          {starting ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }}/> : '⚡'}
          {starting ? 'AVVIO...' : canStart ? 'AVVIA LA PARTITA' : 'IN ATTESA…'}
        </motion.button>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Pill helper ───────────────────────────────────────────────────────────────
function Pill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${color}`,
      borderRadius: 100, padding: '4px 10px',
      fontSize: 'clamp(0.58rem,0.9vw,0.72rem)',
      fontWeight: 700, letterSpacing: '0.06em',
      color: 'rgba(255,255,255,0.5)',
      whiteSpace: 'nowrap',
    }}>
      {label && <span style={{ color: 'rgba(255,255,255,0.28)', marginRight: 2 }}>{label}:</span>}
      <span style={{ color: 'rgba(255,255,255,0.65)' }}>{value}</span>
    </div>
  );
}
