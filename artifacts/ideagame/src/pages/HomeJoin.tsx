/**
 * HomeJoin — pagina per i telefoni in modalità HOME
 *
 * URL: /home/join?s=CODE  (code = join code, non session ID)
 *
 * Flusso:
 * 1. Inserisci codice (se non nell'URL)
 * 2. Inserisci nickname
 * 3. Sala d'attesa → controller di gioco (aggiornato via socket)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, Check, ChevronRight, Timer, SkipForward,
  Home, Zap, Music, Laugh, Star, Sparkles
} from 'lucide-react';
import { useEventSocket } from '@/hooks/useEventSocket';

// ── Types ─────────────────────────────────────────────────────────────────────

interface HomeSession {
  id: string;
  joinCode: string;
  gameSlug: string | null;
  status: 'lobby' | 'playing' | 'ended';
  currentRound: number;
  totalRounds: number;
  roundPayload: Record<string, unknown>;
}

interface HomePlayer {
  id: string;
  nickname: string;
  avatarColor: string;
  score: number;
  isConnected: boolean;
}

const AVATAR_COLORS = ['#F5B642','#FF69B4','#60A5FA','#A78BFA','#34D399','#F87171','#F472B6','#FB923C','#22D3EE','#4ADE80'];

const GAME_ICONS: Record<string, React.ReactNode> = {
  'quizzone': <Star className="h-6 w-6" />,
  'sfida-ballo': <Music className="h-6 w-6" />,
  'sfida-di-ballo': <Music className="h-6 w-6" />,
  'percorso-a-risate': <Laugh className="h-6 w-6" />,
  'gioco-coppie': <Zap className="h-6 w-6" />,
};

// ── Main ──────────────────────────────────────────────────────────────────────

// ── localStorage persistence ────────────────────────────────────────────────
const STORAGE_KEY = 'ideagame:home:player';
function saveJoin(sessionId: string, joinCode: string, playerId: string, nick: string) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId, joinCode, playerId, nickname: nick })); } catch { /* ignore */ }
}
function clearJoin() { try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ } }
function getSavedJoin(): { sessionId: string; joinCode: string; playerId: string; nickname: string } | null {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) as { sessionId: string; joinCode: string; playerId: string; nickname: string } : null; } catch { return null; }
}

export default function HomeJoin() {
  const [, navigate] = useLocation();
  const urlParams = new URLSearchParams(window.location.search);
  const urlCode = urlParams.get('s')?.toUpperCase().trim() ?? null;

  const [phase, setPhase] = useState<'code' | 'nickname' | 'lobby' | 'playing' | 'ended'>(urlCode ? 'nickname' : 'code');
  const [code, setCode] = useState(urlCode ?? '');
  const [nickname, setNickname] = useState('');
  const [session, setSession] = useState<HomeSession | null>(null);
  const [player, setPlayer] = useState<HomePlayer | null>(null);
  const [players, setPlayers] = useState<HomePlayer[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [answered, setAnswered] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { on, emit } = useEventSocket(null);

  // Restore saved session on mount (e.g. after page refresh)
  // Priority: URL code > localStorage > code entry screen
  useEffect(() => {
    if (urlCode) {
      lookupSession(urlCode);
      return;
    }
    const saved = getSavedJoin();
    if (!saved) return;
    fetch(`/api/home/sessions/${saved.sessionId}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { session: HomeSession; players: HomePlayer[] } | null) => {
        if (!d || d.session.status === 'ended') { clearJoin(); return; }
        const p = d.players.find(pl => pl.id === saved.playerId);
        if (!p) { clearJoin(); return; }
        setSession(d.session);
        setPlayers(d.players);
        setPlayer(p);
        setNickname(saved.nickname);
        if (d.session.status === 'playing') {
          setPhase('playing');
          setAnswered(null);
          setRevealed(false);
          startTimer(Number(d.session.roundPayload?.timeLimit ?? 15));
        } else {
          setPhase('lobby');
        }
      })
      .catch(() => clearJoin());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Join home socket room when we have a session
  useEffect(() => {
    if (!session?.id) return;
    emit('join:home', session.id);
    return () => { emit('leave:home', session.id); };
  }, [session?.id, emit]);

  // Polling fallback: every 2s in lobby, refresh state AND detect when game starts
  // (socket may drop on mobile/PS networks — this ensures the transition always fires)
  useEffect(() => {
    if (phase !== 'lobby' || !session?.id) return;
    const sid = session.id;
    const interval = setInterval(() => {
      fetch(`/api/home/sessions/${sid}`)
        .then(r => r.ok ? r.json() : null)
        .then((data: { session: HomeSession; players: HomePlayer[] } | null) => {
          if (!data) return;
          setPlayers(data.players);
          if (data.session.status === 'playing') {
            setSession(data.session);
            setPhase('playing');
            setAnswered(null);
            setRevealed(false);
            startTimer(Number(data.session.roundPayload?.timeLimit ?? 15));
          } else if (data.session.status === 'ended') {
            setSession(data.session);
            setPhase('ended');
            clearJoin();
          }
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, session?.id]);

  // Socket listeners
  useEffect(() => {
    const u1 = on<{ session: HomeSession; players: HomePlayer[] }>('home:state', (data) => {
      setSession(data.session);
      setPlayers(data.players);
      if (data.session.status === 'playing' && phase === 'lobby') {
        setPhase('playing');
        setAnswered(null);
        setRevealed(false);
        startTimer(Number(data.session.roundPayload?.timeLimit ?? 15));
      }
      if (data.session.status === 'ended') {
        setPhase('ended');
      }
    });
    const u2 = on<{ round: number; payload: Record<string, unknown> }>('home:round', (data) => {
      setSession(prev => prev ? { ...prev, currentRound: data.round, roundPayload: data.payload } : prev);
      setAnswered(null);
      setRevealed(false);
      startTimer(Number(data.payload?.timeLimit ?? 15));
    });
    const u3 = on<{ session: HomeSession; players: HomePlayer[] }>('home:ended', (data) => {
      setSession(data.session);
      setPlayers(data.players);
      setPhase('ended');
      clearJoin();
    });
    const u4 = on<{ payload: Record<string, unknown>; players: HomePlayer[] }>('home:card_flip', (data) => {
      setSession(prev => prev ? { ...prev, roundPayload: data.payload } : prev);
      if (data.players) setPlayers(data.players);
    });
    return () => { u1?.(); u2?.(); u3?.(); u4?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, phase]);

  const startTimer = useCallback((seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(seconds);
    let t = seconds;
    timerRef.current = setInterval(() => {
      t -= 1;
      setTimeLeft(t);
      if (t <= 0) {
        clearInterval(timerRef.current!);
        setRevealed(true);
      }
    }, 1000);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // ── API ────────────────────────────────────────────────────────────────────

  const lookupSession = async (c: string) => {
    setLoading(true); setError('');
    try {
      const r = await fetch(`/api/home/sessions/by-code/${c}`);
      if (!r.ok) {
        setError(r.status === 404 ? 'Codice non trovato' : 'Sessione non disponibile');
        return;
      }
      const data = await r.json() as { session: HomeSession; players: HomePlayer[] };
      setSession(data.session);
      setPlayers(data.players);
      setPhase('nickname');
    } catch {
      setError('Errore di rete — riprova');
    } finally {
      setLoading(false);
    }
  };

  const joinSession = async () => {
    if (!session || !nickname.trim()) return;
    setLoading(true); setError('');
    try {
      const r = await fetch(`/api/home/sessions/${session.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim() }),
      });
      if (!r.ok) {
        const err = await r.json() as { error: string };
        setError(err.error ?? 'Errore');
        return;
      }
      const p: HomePlayer = await r.json();
      setPlayer(p);

      // Persist to localStorage so refresh restores the player
      saveJoin(session.id, session.joinCode, p.id, nickname.trim());

      // Fetch updated player list immediately (socket may not be in room yet)
      try {
        const stateR = await fetch(`/api/home/sessions/${session.id}`);
        if (stateR.ok) {
          const stateData = await stateR.json() as { session: HomeSession; players: HomePlayer[] };
          setPlayers(stateData.players);
        }
      } catch { /* ignore — socket will sync soon */ }

      if (session.status === 'playing') {
        setPhase('playing');
        setAnswered(null);
        setRevealed(false);
        startTimer(Number(session.roundPayload?.timeLimit ?? 15));
      } else {
        setPhase('lobby');
      }
    } catch {
      setError('Errore di rete — riprova');
    } finally {
      setLoading(false);
    }
  };

  const skipRound = async () => {
    if (!session || !player) return;
    await fetch(`/api/home/sessions/${session.id}/next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const addScore = async (points: number) => {
    if (!session || !player) return;
    await fetch(`/api/home/sessions/${session.id}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: player.id, points: (player.score) + points }),
    });
    setPlayer(prev => prev ? { ...prev, score: prev.score + points } : prev);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden px-4 py-8"
      style={{ background:'linear-gradient(-45deg,#07061a,#1d0545,#0a1845,#1a0800,#07061a)', backgroundSize:'500% 500%', animation:'hjAurora 18s ease infinite' }}>

      <style>{`
        @keyframes hjAurora {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes hjPulse {
          0%,100% { transform: scale(1); box-shadow: 0 0 20px var(--ac, #F5B642); }
          50%     { transform: scale(1.04); box-shadow: 0 0 40px var(--ac, #F5B642); }
        }
        @keyframes hjRing {
          0%,100% { box-shadow: 0 0 0 4px rgba(245,182,66,0.25), 0 0 40px rgba(245,182,66,0.2); }
          50%     { box-shadow: 0 0 0 8px rgba(245,182,66,0.15), 0 0 70px rgba(245,182,66,0.3); }
        }
        .hj-ring { animation: hjRing 2.5s ease infinite; }
      `}</style>

      {/* Coloured starfield */}
      <div className="pointer-events-none absolute inset-0 z-0">
        {Array.from({ length: 35 }).map((_, i) => {
          const cs = ['#ffffff','#F5B642','#A855F7','#22D3EE','#F472B6'];
          return <div key={i} className="absolute rounded-full"
            style={{ left:`${(i*47+13)%100}%`, top:`${(i*59+7)%100}%`, width:1+(i%2), height:1+(i%2), background:cs[i%cs.length], opacity:0.09+(i%4)*0.04 }} />;
        })}
      </div>

      <AnimatePresence mode="wait">

        {/* ── ENTER CODE ── */}
        {phase === 'code' && (
          <motion.div key="code" initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-20 }}
            className="relative z-10 flex w-full max-w-sm flex-col items-center gap-7 text-center">
            <img src="/logo.png" alt="IDEA Games" className="h-14 w-auto object-contain opacity-90"
              style={{ filter:'drop-shadow(0 0 20px rgba(245,182,66,0.4))' }} />
            <div>
              <div className="text-display text-4xl font-black text-white">Entra nel Gioco</div>
              <div className="mt-2 text-sm text-white/45">Inserisci il codice che vedi sullo schermo</div>
            </div>
            <input
              type="text" value={code}
              onChange={e => setCode(e.target.value.toUpperCase().trim())}
              onKeyDown={e => e.key==='Enter' && code.length===6 && lookupSession(code)}
              placeholder="CODICE" maxLength={6}
              className="w-full rounded-2xl px-6 py-5 text-center text-3xl font-black uppercase tracking-[0.5em] focus:outline-none"
              style={{ background:'rgba(255,255,255,0.07)', border:'2px solid rgba(245,182,66,0.55)', color:'#F5B642', caretColor:'#F5B642' }}
            />
            {error && (
              <div className="rounded-2xl px-4 py-3 text-sm font-bold"
                style={{ background:'rgba(239,68,68,0.18)', border:'1px solid rgba(239,68,68,0.4)', color:'#f87171' }}>
                {error}
              </div>
            )}
            <button onClick={() => lookupSession(code)} disabled={loading||code.length<6}
              className="flex w-full items-center justify-center gap-3 rounded-2xl py-5 text-xl font-black text-black disabled:opacity-40"
              style={{ background:'linear-gradient(135deg,#F5B642,#FF8C00)', boxShadow:'0 0 50px rgba(245,182,66,0.45)' }}>
              {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <ChevronRight className="h-6 w-6" />}
              Avanti
            </button>
            <button onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-xs text-white/25 transition-colors hover:text-white/50">
              <Home className="h-3 w-3" /> Torna all'Hub
            </button>
          </motion.div>
        )}

        {/* ── LOADING ── */}
        {phase === 'nickname' && !session && (
          <motion.div key="loading-qr" initial={{ opacity:0 }} animate={{ opacity:1 }}
            className="relative z-10 flex flex-col items-center gap-6 text-center">
            <img src="/jonny-master-nobg.png" alt="Jonny" className="h-32 w-auto object-contain"
              style={{ filter:'drop-shadow(0 0 40px rgba(245,182,66,0.4))' }} />
            <Loader2 className="h-9 w-9 animate-spin" style={{ color:'#F5B642' }} />
            <div className="text-white/55">Caricamento partita...</div>
          </motion.div>
        )}

        {/* ── NICKNAME ── */}
        {phase === 'nickname' && session && (
          <motion.div key="nickname" initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-20 }}
            className="relative z-10 flex w-full max-w-sm flex-col items-center gap-7 text-center">
            <img src="/jonny-master-nobg.png" alt="Jonny" className="h-32 w-auto object-contain"
              style={{ filter:'drop-shadow(0 0 50px rgba(245,182,66,0.45))' }} />
            <div>
              <div className="text-display text-4xl font-black text-white">Come ti chiami?</div>
              <div className="mt-2 text-sm text-white/45">
                {session.joinCode} — {players.length} giocator{players.length!==1?'i':'e'} già dentro
              </div>
            </div>
            <input
              type="text" value={nickname}
              onChange={e => setNickname(e.target.value.slice(0,20))}
              onKeyDown={e => e.key==='Enter' && nickname.trim() && joinSession()}
              placeholder="Il tuo nome..." autoFocus
              className="w-full rounded-2xl px-6 py-5 text-center text-xl font-black focus:outline-none"
              style={{ background:'rgba(255,255,255,0.07)', border:'2px solid rgba(168,85,247,0.55)', color:'#fff', caretColor:'#A855F7' }}
            />
            {error && (
              <div className="rounded-2xl px-4 py-3 text-sm font-bold"
                style={{ background:'rgba(239,68,68,0.18)', border:'1px solid rgba(239,68,68,0.4)', color:'#f87171' }}>
                {error}
              </div>
            )}
            <button onClick={joinSession} disabled={loading||!nickname.trim()}
              className="flex w-full items-center justify-center gap-3 rounded-2xl py-5 text-xl font-black text-black disabled:opacity-40"
              style={{ background:'linear-gradient(135deg,#A855F7,#7c3aed)', boxShadow:'0 0 50px rgba(168,85,247,0.5)' }}>
              {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Check className="h-6 w-6" />}
              Entra!
            </button>
          </motion.div>
        )}

        {/* ── LOBBY ── */}
        {phase === 'lobby' && player && session && (
          <motion.div key="lobby" initial={{ opacity:0, scale:0.92 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0 }}
            className="relative z-10 flex w-full max-w-sm flex-col items-center gap-8 text-center">

            {/* Avatar ring */}
            <div className="hj-ring flex h-24 w-24 items-center justify-center rounded-3xl text-2xl font-black text-black"
              style={{ background:`linear-gradient(135deg,${player.avatarColor},${player.avatarColor}aa)` }}>
              {player.nickname.slice(0,2).toUpperCase()}
            </div>

            <div>
              <div className="text-display text-4xl font-black text-white">{player.nickname}</div>
              <div className="mt-2 text-lg font-black" style={{ color:'#F5B642' }}>Sei dentro! 🎉</div>
            </div>

            <div className="flex w-full flex-col items-center gap-4 rounded-3xl p-7"
              style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(168,85,247,0.35)', backdropFilter:'blur(12px)' }}>
              <div className="flex items-center gap-3">
                <Loader2 className="h-7 w-7 animate-spin" style={{ color:'#A855F7' }} />
                <div className="font-bold text-white/75">Aspettiamo il gioco...</div>
              </div>
              <div className="text-sm text-white/35">{players.length} giocator{players.length!==1?'i':'e'} connessi</div>

              {/* Mini player list */}
              {players.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2 pt-1">
                  {players.map((p, i) => (
                    <div key={p.id} className="rounded-full px-3 py-1 text-xs font-black"
                      style={{ background:`${AVATAR_COLORS[i%AVATAR_COLORS.length]}30`, border:`1px solid ${AVATAR_COLORS[i%AVATAR_COLORS.length]}55`, color:AVATAR_COLORS[i%AVATAR_COLORS.length] }}>
                      {p.nickname}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <img src="/jonny-master-nobg.png" alt="Jonny" className="h-24 w-auto object-contain"
              style={{ filter:'drop-shadow(0 0 30px rgba(245,182,66,0.35))', opacity:0.85 }} />
          </motion.div>
        )}

        {/* ── PLAYING ── */}
        {phase === 'playing' && player && session && (
          <motion.div key="playing" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="relative z-10 flex w-full max-w-sm flex-col gap-4">

            {/* Header bar */}
            <div className="flex items-center justify-between rounded-2xl px-4 py-3"
              style={{ background:'rgba(0,0,0,0.45)', backdropFilter:'blur(14px)', border:'1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-2">
                {session.gameSlug && GAME_ICONS[session.gameSlug]}
                <div>
                  <div className="text-xs text-white/35">Round {session.currentRound+1}/{session.totalRounds}</div>
                  <div className="text-sm font-black text-white">{player.nickname}</div>
                </div>
              </div>
              <div className="rounded-xl px-4 py-2 text-center transition-all"
                style={timeLeft!==null&&timeLeft<=5
                  ? { background:'rgba(239,68,68,0.22)', border:'2px solid rgba(239,68,68,0.65)', boxShadow:'0 0 25px rgba(239,68,68,0.4)' }
                  : { background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.14)' }}>
                <div className="text-2xl font-black tabular-nums"
                  style={{ color:timeLeft!==null&&timeLeft<=5?'#F87171':'#fff' }}>
                  {timeLeft ?? '—'}
                </div>
              </div>
            </div>

            {/* Score */}
            <div className="flex justify-center">
              <div className="rounded-full px-5 py-1.5 text-base font-black"
                style={{ background:'rgba(245,182,66,0.18)', border:'1px solid rgba(245,182,66,0.45)', color:'#F5B642' }}>
                {player.score} punti
              </div>
            </div>

            {/* Controller */}
            <PhoneController session={session} revealed={revealed} answered={answered} player={player}
              onAnswer={(idx) => {
                setAnswered(idx);
                if (timerRef.current) clearInterval(timerRef.current);
                setRevealed(true);
                const payload = session.roundPayload;
                if (String(payload.mode)==='home-quiz' && idx===Number(payload.correctIndex)) {
                  void addScore(Number(payload.points ?? 200));
                }
              }}
              onSkip={skipRound}
            />
          </motion.div>
        )}

        {/* ── ENDED ── */}
        {phase === 'ended' && player && (
          <motion.div key="ended" initial={{ opacity:0, scale:0.9 }} animate={{ opacity:1, scale:1 }}
            className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6 text-center">
            <img src="/jonny-master-nobg.png" alt="Jonny" className="h-32 w-auto object-contain"
              style={{ filter:'drop-shadow(0 0 50px rgba(245,182,66,0.5))' }} />
            <div>
              <div className="text-display text-4xl font-black text-white">Partita finita!</div>
              <div className="mt-2 text-2xl font-black" style={{ color:'#F5B642' }}>{player.score} punti!</div>
            </div>

            <div className="flex w-full flex-col gap-2">
              {[...players].sort((a,b)=>b.score-a.score).map((p,i) => {
                const MEDALS = ['🥇','🥈','🥉'];
                const isSelf = p.id === player.id;
                return (
                  <div key={p.id} className="flex items-center gap-3 rounded-2xl px-4 py-3 transition-all"
                    style={isSelf
                      ? { background:'rgba(245,182,66,0.18)', border:'2px solid rgba(245,182,66,0.55)', boxShadow:'0 0 25px rgba(245,182,66,0.25)' }
                      : { background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)' }}>
                    <div className="text-xl w-7 text-center">{MEDALS[i] ?? `#${i+1}`}</div>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black text-black"
                      style={{ background:`linear-gradient(135deg,${AVATAR_COLORS[i%AVATAR_COLORS.length]},${AVATAR_COLORS[(i+1)%AVATAR_COLORS.length]})` }}>
                      {p.nickname.slice(0,2).toUpperCase()}
                    </div>
                    <div className="flex-1 text-left text-sm font-black" style={{ color:isSelf?'#F5B642':'#fff' }}>{p.nickname}</div>
                    <div className="font-black" style={{ color:isSelf?'#F5B642':'rgba(255,255,255,0.6)' }}>{p.score}</div>
                  </div>
                );
              })}
            </div>

            <button onClick={() => navigate('/home')}
              className="flex items-center gap-3 rounded-2xl px-8 py-4 font-black text-black"
              style={{ background:'linear-gradient(135deg,#F5B642,#FF8C00)', boxShadow:'0 0 40px rgba(245,182,66,0.45)' }}>
              <Sparkles className="h-5 w-5" /> Nuova Partita
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

// ── PhoneController ────────────────────────────────────────────────────────────

function PhoneController({ session, revealed, answered, onAnswer, onSkip, player }: {
  session: HomeSession;
  revealed: boolean;
  answered: number | null;
  onAnswer: (idx: number) => void;
  onSkip: () => void;
  player?: HomePlayer | null;
}) {
  const p = session.roundPayload;
  const mode = String(p.mode ?? 'home-quiz');

  if (mode === 'home-quiz') {
    const answers = (p.answers as string[]) ?? [];
    const correct = Number(p.correctIndex ?? 0);
    const BG_COLORS = ['#3B82F6','#EC4899','#EAB308','#10B981'];
    const LETTERS   = ['A','B','C','D'];

    return (
      <div className="flex flex-col gap-3">
        {/* Compact question */}
        <div className="rounded-2xl p-4 text-center text-sm font-bold leading-snug text-white/85"
          style={{ background:'linear-gradient(135deg,rgba(168,85,247,0.2),rgba(245,182,66,0.07))', border:'1px solid rgba(168,85,247,0.4)' }}>
          {String(p.question ?? '')}
        </div>

        {/* Full-colour answer grid */}
        <div className="grid grid-cols-2 gap-3">
          {answers.map((ans, i) => {
            const isCorrect = i === correct;
            const isSelected = answered === i;
            let bg: string, border: string, shadow: string, textCol: string;
            if (revealed) {
              if (isCorrect) { bg='linear-gradient(135deg,#22c55e,#16a34a)'; border='2px solid #4ade80'; shadow='0 0 30px rgba(34,197,94,0.5)'; textCol='#fff'; }
              else if (isSelected) { bg='rgba(239,68,68,0.18)'; border='2px solid rgba(239,68,68,0.5)'; shadow='none'; textCol='rgba(239,68,68,0.8)'; }
              else { bg='rgba(255,255,255,0.04)'; border='1px solid rgba(255,255,255,0.08)'; shadow='none'; textCol='rgba(255,255,255,0.25)'; }
            } else if (isSelected) {
              bg=`linear-gradient(135deg,${BG_COLORS[i]},${BG_COLORS[i]}cc)`; border=`2px solid ${BG_COLORS[i]}`; shadow=`0 0 24px ${BG_COLORS[i]}80`; textCol='#000';
            } else {
              bg=`linear-gradient(135deg,${BG_COLORS[i]},${BG_COLORS[i]}cc)`; border=`2px solid ${BG_COLORS[i]}`; shadow=`0 0 18px ${BG_COLORS[i]}55`; textCol='#fff';
            }
            return (
              <motion.button key={i}
                whileTap={!revealed && answered===null ? { scale:0.94 } : {}}
                onClick={() => !revealed && answered===null && onAnswer(i)}
                disabled={revealed || answered!==null}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl px-3 py-5 text-sm font-black leading-tight transition-all"
                style={{ background:bg, border, boxShadow:shadow, color:textCol }}>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black"
                  style={{ background:'rgba(0,0,0,0.28)', color:revealed&&isCorrect?'#4ade80':textCol }}>
                  {LETTERS[i]}
                </div>
                <div className="text-center">{ans}</div>
                {revealed && isCorrect && <Check className="h-4 w-4 text-green-300" />}
              </motion.button>
            );
          })}
        </div>

        <button onClick={onSkip}
          className="flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-xs transition-colors"
          style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.3)' }}>
          <SkipForward className="h-3 w-3" /> Salta round
        </button>
      </div>
    );
  }

  if (mode === 'home-ballo') {
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl text-5xl"
          style={{ background:'linear-gradient(135deg,rgba(168,85,247,0.3),rgba(168,85,247,0.12))', border:'2px solid rgba(168,85,247,0.5)', boxShadow:'0 0 40px rgba(168,85,247,0.35)' }}>
          💃
        </div>
        <div className="text-display text-2xl font-black text-white">{String(p.name ?? 'Sfida di Ballo')}</div>
        <div className="text-sm text-white/60">{String(p.description ?? '')}</div>
        {!!p.musicHint && (
          <div className="rounded-2xl px-4 py-2.5 text-sm font-bold"
            style={{ background:'rgba(168,85,247,0.18)', border:'1px solid rgba(168,85,247,0.4)', color:'#c084fc' }}>
            🎵 {String(p.musicHint)}
          </div>
        )}
        <button onClick={onSkip}
          className="flex items-center gap-2 rounded-2xl px-6 py-3 text-sm transition-colors"
          style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.4)' }}>
          <SkipForward className="h-4 w-4" /> Salta
        </button>
      </div>
    );
  }

  if (mode === 'home-percorso') {
    const TYPE_ICONS: Record<string, string> = { sfida:'⚡', domanda:'❓', mimo:'🎭', reazione:'😱', fantasia:'🌟' };
    const icon = TYPE_ICONS[String(p.challengeType ?? 'sfida')] ?? '⚡';
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="text-6xl" style={{ filter:'drop-shadow(0 0 20px rgba(52,211,153,0.6))' }}>{icon}</div>
        <div className="text-display text-2xl font-black text-white">{String(p.title ?? 'Sfida')}</div>
        <div className="text-sm text-white/60 leading-relaxed">{String(p.description ?? '')}</div>
        <div className="rounded-2xl px-5 py-2.5 text-sm font-black"
          style={{ background:'rgba(52,211,153,0.18)', border:'1px solid rgba(52,211,153,0.45)', color:'#34D399' }}>
          {Number(p.points ?? 150)} punti
        </div>
        <button onClick={onSkip}
          className="flex items-center gap-2 rounded-2xl px-6 py-3 text-sm transition-colors"
          style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.4)' }}>
          <SkipForward className="h-4 w-4" /> Prossima sfida
        </button>
      </div>
    );
  }

  if (mode === 'home-coppie') {
    interface CC { id: string; text: string; pairId: number; flipped: boolean; matched: boolean; }
    const cards = (p.cards as CC[]) ?? [];
    const currentFlipped = (p.currentFlipped as string[]) ?? [];
    const matchedPairs = Number(p.matchedPairs ?? 0);
    const totalPairs = Number(p.totalPairs ?? 6);
    const canFlip = currentFlipped.length < 2;
    const allMatched = totalPairs > 0 && matchedPairs >= totalPairs;

    const handleFlip = async (cardId: string) => {
      if (!canFlip || allMatched) return;
      try {
        await fetch(`/api/home/sessions/${session.id}/flip`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardId, playerId: player?.id }),
        });
      } catch { /* silent */ }
    };

    return (
      <div className="flex flex-col items-center gap-4">
        <div className="flex w-full items-center justify-between">
          <div className="text-sm text-white/60">{matchedPairs}/{totalPairs} coppie trovate</div>
          <div className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
            allMatched ? 'bg-green-500/20 text-green-400' :
            canFlip ? 'bg-primary/20 text-primary' : 'bg-white/10 text-white/40'
          }`}>
            {allMatched ? '🎉 Tutte trovate!' : canFlip ? 'Tocca una carta' : 'Aspetta…'}
          </div>
        </div>

        <div className="grid w-full grid-cols-4 gap-1.5">
          {cards.map((card) => {
            const isFlippable = !card.flipped && !card.matched && canFlip && !allMatched;
            return (
              <motion.button
                key={card.id}
                whileTap={isFlippable ? { scale: 0.88 } : {}}
                onClick={() => isFlippable && void handleFlip(card.id)}
                className={`flex aspect-square items-center justify-center rounded-xl border-2 p-1 text-center text-xs font-bold leading-tight transition-all ${
                  card.matched
                    ? 'border-green-400 bg-green-400/20 text-green-300'
                    : card.flipped
                      ? 'border-primary bg-primary/20 text-white'
                      : isFlippable
                        ? 'border-white/15 bg-white/5 text-white/0 active:bg-primary/10'
                        : 'border-white/8 bg-white/3 text-white/0 cursor-not-allowed'
                }`}
              >
                {(card.flipped || card.matched)
                  ? card.text
                  : <span className="text-white/25 text-base">?</span>
                }
              </motion.button>
            );
          })}
        </div>

        {allMatched && (
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            className="rounded-2xl border border-green-400/30 bg-green-400/10 px-4 py-2 text-center text-sm font-bold text-green-400">
            🎉 Tutte trovate! Aspetta che l'host vada avanti
          </motion.div>
        )}
      </div>
    );
  }

  return null;
}
