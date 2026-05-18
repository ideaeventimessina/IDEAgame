/**
 * HomeJoin — Pagina telefono per Modalità HOME
 *
 * URL: /home/join?s=CODE
 *
 * Flusso: code → nickname → lobby → playing (controller per ogni gioco) → ended
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, Check, ChevronRight, Home, Star, Music,
  Laugh, Zap, ShieldAlert, MessageSquare, Mic, Timer,
} from 'lucide-react';
import { useEventSocket } from '@/hooks/useEventSocket';
import { GameFlowPhone } from '@/components/GameFlowPhone';

// ── Types ─────────────────────────────────────────────────────────────────────

interface HomeSession {
  id: string;
  joinCode: string;
  gameSlug: string | null;
  gameConfig: Record<string, unknown>;
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

// ── Constants ─────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#F5B642','#FF69B4','#60A5FA','#A78BFA','#34D399','#F87171','#F472B6','#FB923C','#22D3EE','#4ADE80'];

const GAME_INFO: Record<string, { name: string; emoji: string; color: string; icon: React.ReactNode }> = {
  'percorso-a-risate':  { name:'Percorso a Risate',   emoji:'😂', color:'#34D399', icon:<Laugh className="h-5 w-5"/> },
  'gioco-coppie':       { name:'Gioco delle Coppie',  emoji:'💞', color:'#F472B6', icon:<Zap className="h-5 w-5"/> },
  'quizzone':           { name:'Quizzone',             emoji:'⭐', color:'#F5B642', icon:<Star className="h-5 w-5"/> },
  'saramusica':         { name:'SaraMusica',           emoji:'🎵', color:'#60A5FA', icon:<Music className="h-5 w-5"/> },
  'adult-only':         { name:'Adult Only',           emoji:'🔞', color:'#F87171', icon:<ShieldAlert className="h-5 w-5"/> },
  'sfida-ballo':        { name:'Sfida di Ballo',       emoji:'💃', color:'#A78BFA', icon:<span>💃</span> },
  'parola-alle-spalle': { name:'Parola alle Spalle',   emoji:'💬', color:'#22D3EE', icon:<MessageSquare className="h-5 w-5"/> },
  'karaoke-battle':     { name:'Karaoke Battle',       emoji:'🎤', color:'#FB923C', icon:<Mic className="h-5 w-5"/> },
};

// ── localStorage ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ideagame:home:player';
function saveJoin(sessionId: string, joinCode: string, playerId: string, nick: string) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId, joinCode, playerId, nickname: nick })); } catch { /* ignore */ }
}
function clearJoin() { try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ } }
function getSavedJoin(): { sessionId: string; joinCode: string; playerId: string; nickname: string } | null {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) as { sessionId: string; joinCode: string; playerId: string; nickname: string } : null; } catch { return null; }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const BUILD_STAMP_JOIN = `${new Date().toISOString().slice(0,16).replace('T',' ')} / HomeJoin v-check`;
export default function HomeJoin() {
  useEffect(() => {
    console.log('[RuntimeCheck] HomeJoin mounted FILE=src/pages/HomeJoin.tsx BUILD=' + BUILD_STAMP_JOIN);
  }, []);
  const [, navigate] = useLocation();
  const urlParams = new URLSearchParams(window.location.search);
  const urlCode = urlParams.get('s')?.toUpperCase().trim() ?? null;

  const [phase, _setPhase] = useState<'code' | 'nickname' | 'lobby' | 'playing' | 'ended'>(urlCode ? 'nickname' : 'code');
  const [code, setCode] = useState(urlCode ?? '');
  const [nickname, setNickname] = useState('');
  const [session, setSession] = useState<HomeSession | null>(null);
  const [player, _setPlayer] = useState<HomePlayer | null>(null);
  const [players, setPlayers] = useState<HomePlayer[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [answered, setAnswered] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef = useRef<'code' | 'nickname' | 'lobby' | 'playing' | 'ended'>('code');
  const playerRef = useRef<HomePlayer | null>(null);
  const prevGameSlugRef = useRef<string | null>(null);
  const prevCurrentRoundRef = useRef<number>(-1);
  // Tracks the last known roundPayload.mode so home:state can detect flow→game transitions
  // even when slug/round haven't changed (flow uses same slot: gameSlug=sfida-ballo, round=0).
  const currentModeRef = useRef<string>('');

  const { on, emit, connected: socketConnected } = useEventSocket(null);

  // Keep refs in sync with state so socket handlers always see current values
  const setPhase = useCallback((p: 'code' | 'nickname' | 'lobby' | 'playing' | 'ended') => {
    phaseRef.current = p;
    _setPhase(p);
  }, []);
  const setPlayer = useCallback((fn: HomePlayer | null | ((prev: HomePlayer | null) => HomePlayer | null)) => {
    if (typeof fn === 'function') {
      _setPlayer(prev => {
        const next = fn(prev);
        playerRef.current = next;
        return next;
      });
    } else {
      playerRef.current = fn;
      _setPlayer(fn);
    }
  }, []);

  // Restore saved session on mount
  useEffect(() => {
    const saved = getSavedJoin();

    if (urlCode) {
      // If we have a saved join for this exact code, restore directly — skip nickname prompt
      if (saved && saved.joinCode === urlCode) {
        fetch(`/api/home/sessions/${saved.sessionId}`)
          .then(r => r.ok ? r.json() : null)
          .then((d: { session: HomeSession; players: HomePlayer[] } | null) => {
            if (!d || d.session.status === 'ended') { clearJoin(); lookupSession(urlCode); return; }
            const p = d.players.find(pl => pl.id === saved.playerId);
            if (!p) { clearJoin(); lookupSession(urlCode); return; }
            setSession(d.session);
            setPlayers(d.players);
            setPlayer(p);
            setNickname(saved.nickname);
            if (d.session.status === 'playing') {
              setPhase('playing');
              setAnswered(null);
              setRevealed(false);
              startRoundTimer(d.session.roundPayload ?? {});
            } else {
              setPhase('lobby');
            }
          })
          .catch(() => { clearJoin(); lookupSession(urlCode); });
        return;
      }
      // No matching saved join — ask for nickname as before
      lookupSession(urlCode);
      return;
    }

    // No urlCode in URL — try restoring from any saved join
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
          startRoundTimer(d.session.roundPayload ?? {});
        } else {
          setPhase('lobby');
        }
      })
      .catch(() => clearJoin());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Join home socket room
  useEffect(() => {
    if (!session?.id) return;
    emit('join:home', session.id);
    return () => { emit('leave:home', session.id); };
  }, [session?.id, emit]);

  // Register phone for home-flow booking/disconnect tracking
  useEffect(() => {
    if (!session?.id || !player?.id) return;
    emit('home:player_register', { sessionId: session.id, playerId: player.id });
  }, [session?.id, player?.id, emit]);

  // Polling fallback in lobby
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
            startRoundTimer(data.session.roundPayload ?? {});
          } else if (data.session.status === 'ended') {
            setSession(data.session);
            setPhase('ended');
            clearJoin();
          } else {
            setSession(data.session);
          }
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, session?.id]);

  // Polling fallback in playing phase — recovers from missed home:game_started / home:game_ended / home:round
  useEffect(() => {
    if (phase !== 'playing' || !session?.id) return;
    const sid = session.id;
    const knownSlug = session.gameSlug;
    const knownRound = session.currentRound;
    const interval = setInterval(() => {
      fetch(`/api/home/sessions/${sid}`)
        .then(r => r.ok ? r.json() : null)
        .then((data: { session: HomeSession; players: HomePlayer[] } | null) => {
          if (!data) return;
          setPlayers(data.players);
          const cur = playerRef.current;
          if (cur) { const me = data.players.find(p => p.id === cur.id); if (me) setPlayer(me); }
          const slugChanged = data.session.gameSlug !== knownSlug;
          const roundChanged = data.session.currentRound !== knownRound;
          const notPlaying = data.session.status !== 'playing';
          if (slugChanged || roundChanged || notPlaying) {
            setSession(data.session);
            if (data.session.status === 'lobby') {
              setPhase('lobby');
            } else if (data.session.status === 'ended') {
              setPhase('ended');
              clearJoin();
            } else if (data.session.status === 'playing' && (slugChanged || roundChanged)) {
              prevGameSlugRef.current = data.session.gameSlug;
              prevCurrentRoundRef.current = data.session.currentRound;
              setAnswered(null);
              setRevealed(false);
              startRoundTimer(data.session.roundPayload ?? {});
            }
          }
        })
        .catch(() => {});
    }, 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, session?.id, session?.gameSlug, session?.currentRound]);

  // Socket listeners — registered once per `on` instance.
  // Use phaseRef/playerRef (not state) to avoid re-registration on every phase change,
  // which would cause missed events during the cleanup/setup window.
  useEffect(() => {
    const u1 = on<{ session: HomeSession; players: HomePlayer[] }>('home:state', (d) => {
      const newMode  = String(d.session.roundPayload?.mode ?? '');
      const prevMode = currentModeRef.current;
      const cur = playerRef.current;
      if (cur) { const me = d.players.find(p => p.id === cur.id); if (me) setPlayer(me); }
      setSession(d.session);
      setPlayers(d.players);
      if (d.session.status === 'playing') {
        if (phaseRef.current === 'lobby') {
          setPhase('playing');
          setAnswered(null);
          setRevealed(false);
          currentModeRef.current = newMode;
          if (newMode !== 'home-flow') startRoundTimer(d.session.roundPayload ?? {});
        } else if (phaseRef.current === 'playing') {
          // ── Fallback: flow→real-game mode transition detected in home:state ──
          // Fires when home:round was missed but home:state arrived with the real game payload.
          // currentModeRef is updated by the home:round handler first (normal path),
          // so this branch only acts when home:round truly never arrived.
          if (prevMode === 'home-flow' && newMode !== 'home-flow' && newMode !== '') {
            console.log('[BalloFlow] home:state: flow→game transition (fallback)', prevMode, '→', newMode);
            setAnswered(null);
            setRevealed(false);
            currentModeRef.current = newMode;
            startRoundTimer(d.session.roundPayload ?? {});
          } else if (
            d.session.gameSlug !== prevGameSlugRef.current ||
            d.session.currentRound !== prevCurrentRoundRef.current
          ) {
            // Game changed OR round advanced — missed home:game_started / home:round event
            setAnswered(null);
            setRevealed(false);
            currentModeRef.current = newMode;
            startRoundTimer(d.session.roundPayload ?? {});
          } else {
            // Same game/round — just keep mode ref in sync
            currentModeRef.current = newMode;
          }
        }
        prevGameSlugRef.current = d.session.gameSlug;
        prevCurrentRoundRef.current = d.session.currentRound;
      }
      if (d.session.status === 'ended') setPhase('ended');
    });

    const u2 = on<{ session: HomeSession; players: HomePlayer[] }>('home:board', (d) => {
      setSession(d.session);
      setPlayers(d.players);
      setPhase('lobby');
    });

    const u3 = on<{ session: HomeSession; players: HomePlayer[]; payload: Record<string,unknown> }>('home:game_started', (d) => {
      prevGameSlugRef.current = d.session.gameSlug;
      setSession(d.session);
      setPlayers(d.players);
      setPhase('playing');
      setAnswered(null);
      setRevealed(false);
      // Flow pilot: no round timer during theme_select/booking/confirm/countdown
      if (String(d.session.roundPayload?.mode ?? '') !== 'home-flow') {
        startRoundTimer(d.payload ?? {});
      }
    });

    const u4 = on<{ round: number; payload: Record<string,unknown> }>('home:round', (d) => {
      const roundMode = String(d.payload?.mode ?? '');
      const prevMode  = currentModeRef.current;
      currentModeRef.current = roundMode;
      prevCurrentRoundRef.current = d.round;
      console.log('[BalloFlow] home:round → mode:', roundMode, '| prevMode:', prevMode, '| round:', d.round);
      setSession(prev => prev ? { ...prev, currentRound: d.round, roundPayload: d.payload } : prev);
      setAnswered(null);
      setRevealed(false);
      startRoundTimer(d.payload ?? {});
    });

    const u5 = on<{ session: HomeSession; players: HomePlayer[]; gameSlug: string }>('home:game_ended', (d) => {
      setSession(d.session);
      setPlayers(d.players);
      const cur = playerRef.current;
      if (cur) { const me = d.players.find(p => p.id === cur.id); if (me) setPlayer(me); }
      setPhase('lobby');
    });

    const u6 = on<{ session: HomeSession; players: HomePlayer[] }>('home:champion', (d) => {
      setSession(d.session);
      setPlayers(d.players);
      const cur = playerRef.current;
      if (cur) { const me = d.players.find(p => p.id === cur.id); if (me) setPlayer(me); }
      setPhase('ended');
      clearJoin();
    });

    const u7 = on<{ payload: Record<string,unknown>; players: HomePlayer[] }>('home:card_flip', (d) => {
      setSession(prev => prev ? { ...prev, roundPayload: d.payload } : prev);
      if (d.players) {
        setPlayers(d.players);
        const cur = playerRef.current;
        if (cur) { const me = d.players.find(p => p.id === cur.id); if (me) setPlayer(me); }
      }
    });

    // Ballo auto-scoring result — optimistically update this player's score;
    // the full round advance arrives moments later via home:round or home:game_ended
    const u8 = on<{ winnerId: string; winnerNickname: string; points: number }>('home:ballo_result', (d) => {
      const cur = playerRef.current;
      if (cur && cur.id === d.winnerId) {
        setPlayer(prev => prev ? { ...prev, score: prev.score + d.points } : prev);
      }
    });

    const u9 = on<{ sessionId: string; round: number; correctIndex: number }>('home:quiz_all_answered', (d) => {
      console.log('[QuizTrace:phone] received home:quiz_all_answered', d);
      // All players answered — reveal answer on phone even if this player hasn't answered yet
      if (timerRef.current) clearInterval(timerRef.current);
      setRevealed(true);
      console.log('[QuizTrace:phone] showing result');
    });

    return () => { u1?.(); u2?.(); u3?.(); u4?.(); u5?.(); u6?.(); u7?.(); u8?.(); u9?.(); };
  // Only re-register when the socket `on` function changes (new connection)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  const startTimer = useCallback((seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(seconds);
    let t = seconds;
    timerRef.current = setInterval(() => {
      t -= 1;
      setTimeLeft(t);
      if (t <= 0) { clearInterval(timerRef.current!); setRevealed(true); }
    }, 1000);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // Server-authoritative timer: derives remaining time from server-stamped roundStartedAt.
  // Prevents timer reset on phone reload — phones join mid-round with the correct countdown.
  const startRoundTimer = useCallback((payload: Record<string, unknown>) => {
    const tl = Number(payload.timeLimit ?? 30);
    const rsa = payload.roundStartedAt as string | null;
    const remaining = rsa
      ? Math.max(0, Math.ceil(tl - (Date.now() - new Date(rsa).getTime()) / 1000))
      : tl;
    if (remaining <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeLeft(0);
      setRevealed(true);
    } else {
      startTimer(remaining);
    }
  }, [startTimer]);

  // ── API ───────────────────────────────────────────────────────────────────────

  const lookupSession = async (c: string) => {
    setLoading(true); setError('');
    try {
      const r = await fetch(`/api/home/sessions/by-code/${c}`);
      if (!r.ok) { setError(r.status === 404 ? 'Codice non trovato' : 'Sessione non disponibile'); return; }
      const data = await r.json() as { session: HomeSession; players: HomePlayer[] };
      setSession(data.session);
      setPlayers(data.players);
      setPhase('nickname');
    } catch { setError('Errore di rete — riprova'); }
    finally { setLoading(false); }
  };

  const joinSession = async () => {
    if (!session || !nickname.trim()) return;
    setLoading(true); setError('');
    try {
      const r = await fetch(`/api/home/sessions/${session.id}/join`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ nickname: nickname.trim() }),
      });
      if (!r.ok) { const err = await r.json() as { error: string }; setError(err.error ?? 'Errore'); return; }
      const p: HomePlayer = await r.json();
      setPlayer(p);
      saveJoin(session.id, session.joinCode, p.id, nickname.trim());
      // iOS Shake to Undo mitigation: clear nickname immediately so the input
      // value (and its undo stack) is gone before phase transition unmounts it.
      setNickname('');
      (document.activeElement as HTMLElement)?.blur?.();
      window.getSelection()?.removeAllRanges();
      document.body.style.userSelect = 'none';
      document.body.style.setProperty('-webkit-user-select', 'none');
      document.body.style.touchAction = 'manipulation';

      // Fetch updated state
      try {
        const sr = await fetch(`/api/home/sessions/${session.id}`);
        if (sr.ok) {
          const sd = await sr.json() as { session: HomeSession; players: HomePlayer[] };
          setPlayers(sd.players);
          setSession(sd.session);
        }
      } catch { /* ignore */ }

      if (session.status === 'playing') {
        setPhase('playing');
        setAnswered(null); setRevealed(false);
        startRoundTimer(session.roundPayload ?? {});
      } else {
        setPhase('lobby');
      }
    } catch { setError('Errore di rete — riprova'); }
    finally { setLoading(false); }
  };

  const addScore = async (points: number) => {
    if (!session || !player) return;
    const newScore = player.score + points;
    const r = await fetch(`/api/home/sessions/${session.id}/score`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ playerId: player.id, points: newScore }),
    }).catch(() => null);
    if (!r || r.status === 409) {
      setError('Tempo scaduto!');
      return;
    }
    setPlayer(prev => prev ? {...prev, score: newScore} : prev);
  };

  const flipCard = async (cardId: string) => {
    if (!session || !player) return;
    await fetch(`/api/home/sessions/${session.id}/flip`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ cardId, playerId: player.id }),
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-hidden"
      style={{background:'#07061a'}}>

      <style>{`
        @keyframes hjAurora { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes hjPulse { 0%,100%{box-shadow:0 0 20px var(--ac,#F5B642)} 50%{box-shadow:0 0 40px var(--ac,#F5B642)} }
        @keyframes hjFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        .hj-ring{animation:hjPulse 2.5s ease infinite}
        .hj-float{animation:hjFloat 3s ease-in-out infinite}
      `}</style>

      <AnimatePresence mode="wait">

        {/* ── CODE ── */}
        {phase === 'code' && (
          <motion.div key="code" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0,y:-20}}
            className="relative flex min-h-screen w-full flex-col">

            {/* Hero image — top 55% */}
            <div className="relative w-full overflow-hidden" style={{height:'55vh',minHeight:260}}>
              <img src="/jonny-world-promo.jpg" alt="Jonny's World"
                className="absolute inset-0 h-full w-full object-cover object-top"
                style={{objectPosition:'center 15%'}}/>
              {/* Bottom fade into form panel */}
              <div className="absolute inset-x-0 bottom-0 h-28"
                style={{background:'linear-gradient(to bottom,transparent,#07061a)'}}/>
              {/* Top fade */}
              <div className="absolute inset-x-0 top-0 h-12"
                style={{background:'linear-gradient(to top,transparent,rgba(7,6,26,0.5))'}}/>
            </div>

            {/* Form panel — bottom 45% */}
            <div className="flex flex-1 flex-col items-center gap-5 px-5 pb-8 pt-2">
              <div className="text-center">
                <div className="text-display text-3xl font-black text-white">Entra nel Gioco</div>
                <div className="mt-1 text-sm" style={{color:'rgba(245,182,66,0.7)'}}>Inserisci il codice che vedi sullo schermo</div>
              </div>

              <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase().trim())}
                onKeyDown={e => e.key==='Enter' && code.length>=4 && lookupSession(code)}
                placeholder="CODICE" maxLength={6}
                className="w-full max-w-sm rounded-2xl px-6 py-5 text-center text-3xl font-black uppercase tracking-[0.5em] focus:outline-none"
                style={{background:'rgba(255,255,255,0.07)',border:'2px solid rgba(245,182,66,0.55)',color:'#F5B642',caretColor:'#F5B642'}}/>

              {error && (
                <div className="w-full max-w-sm rounded-2xl px-4 py-3 text-sm font-bold"
                  style={{background:'rgba(239,68,68,0.18)',border:'1px solid rgba(239,68,68,0.4)',color:'#f87171'}}>
                  {error}
                </div>
              )}

              <button onClick={() => lookupSession(code)} disabled={loading||code.length<4}
                className="flex w-full max-w-sm items-center justify-center gap-3 rounded-2xl py-5 text-xl font-black text-black disabled:opacity-40"
                style={{background:'linear-gradient(135deg,#F5B642,#FF8C00)',boxShadow:'0 0 50px rgba(245,182,66,0.45)'}}>
                {loading ? <Loader2 className="h-6 w-6 animate-spin"/> : <ChevronRight className="h-6 w-6"/>} Avanti
              </button>

              <button onClick={() => navigate('/')}
                className="flex items-center gap-1.5 text-xs"
                style={{color:'rgba(255,255,255,0.25)'}}>
                <Home className="h-3 w-3"/> Torna all'Hub
              </button>
            </div>
          </motion.div>
        )}

        {/* ── NICKNAME ── */}
        {phase === 'nickname' && session && (
          <motion.div key="nickname" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0,y:-20}}
            className="relative flex min-h-screen w-full flex-col">

            {/* Hero image — compact top */}
            <div className="relative w-full overflow-hidden" style={{height:'45vh',minHeight:220}}>
              <img src="/jonny-world-promo.jpg" alt="Jonny's World"
                className="absolute inset-0 h-full w-full object-cover"
                style={{objectPosition:'center 10%'}}/>
              <div className="absolute inset-x-0 bottom-0 h-24"
                style={{background:'linear-gradient(to bottom,transparent,#07061a)'}}/>
              <div className="absolute inset-x-0 top-0 h-10"
                style={{background:'linear-gradient(to top,transparent,rgba(7,6,26,0.4))'}}/>
              {/* Code badge overlay */}
              <div className="absolute bottom-8 left-0 right-0 flex justify-center">
                <div className="flex items-center gap-2 rounded-full px-5 py-2"
                  style={{background:'rgba(7,6,26,0.75)',border:'1px solid rgba(245,182,66,0.5)',backdropFilter:'blur(8px)'}}>
                  <span className="text-xs font-black uppercase tracking-widest" style={{color:'rgba(245,182,66,0.7)'}}>Codice</span>
                  <span className="text-base font-black tracking-widest" style={{color:'#F5B642'}}>{session.joinCode}</span>
                  <span className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>· {players.length} dentro</span>
                </div>
              </div>
            </div>

            {/* Form panel */}
            <div className="flex flex-1 flex-col items-center gap-5 px-5 pb-8 pt-3">
              <div className="text-center">
                <div className="text-display text-3xl font-black text-white">Come ti chiami?</div>
                <div className="mt-1 text-sm" style={{color:'rgba(168,85,247,0.8)'}}>Scegli il tuo nome da guerriero 🔥</div>
              </div>

              <input type="text" value={nickname} onChange={e => setNickname(e.target.value.slice(0,20))}
                onKeyDown={e => e.key==='Enter' && nickname.trim() && void joinSession()}
                placeholder="Il tuo nome..." autoFocus
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                className="w-full max-w-sm rounded-2xl px-6 py-5 text-center text-xl font-black focus:outline-none"
                style={{background:'rgba(255,255,255,0.07)',border:'2px solid rgba(168,85,247,0.55)',color:'#fff',caretColor:'#A855F7'}}/>

              {error && (
                <div className="w-full max-w-sm rounded-2xl px-4 py-3 text-sm font-bold"
                  style={{background:'rgba(239,68,68,0.18)',border:'1px solid rgba(239,68,68,0.4)',color:'#f87171'}}>
                  {error}
                </div>
              )}

              <button onClick={joinSession} disabled={loading||!nickname.trim()}
                className="flex w-full max-w-sm items-center justify-center gap-3 rounded-2xl py-5 text-xl font-black text-black disabled:opacity-40"
                style={{background:'linear-gradient(135deg,#A855F7,#7c3aed)',boxShadow:'0 0 50px rgba(168,85,247,0.5)'}}>
                {loading ? <Loader2 className="h-6 w-6 animate-spin"/> : <Check className="h-6 w-6"/>} Entra!
              </button>
            </div>
          </motion.div>
        )}

        {/* ── LOBBY (attesa gioco) ── */}
        {phase === 'lobby' && player && session && (
          <motion.div key="lobby" initial={{opacity:0,scale:0.92}} animate={{opacity:1,scale:1}} exit={{opacity:0}}
            className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6 text-center">

            {/* Avatar */}
            <div className="hj-ring flex h-24 w-24 items-center justify-center rounded-3xl text-2xl font-black text-black"
              style={{background:`linear-gradient(135deg,${player.avatarColor},${player.avatarColor}aa)`}}>
              {player.nickname.slice(0,2).toUpperCase()}
            </div>

            <div>
              <div className="text-display text-3xl font-black text-white">{player.nickname}</div>
              <div className="mt-1 text-lg font-black" style={{color:'#F5B642'}}>Sei dentro! 🎉</div>
            </div>

            {/* Score */}
            <div className="rounded-2xl px-6 py-3"
              style={{background:'rgba(245,182,66,0.15)',border:'1px solid rgba(245,182,66,0.4)'}}>
              <div className="text-xs font-black uppercase tracking-widest text-white/50">Punteggio</div>
              <div className="text-3xl font-black" style={{color:'#F5B642'}}>{player.score} pt</div>
            </div>

            {/* Scoreboard mini */}
            {players.length > 1 && (
              <div className="w-full rounded-3xl p-4"
                style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(168,85,247,0.3)'}}>
                <div className="mb-2 text-xs font-black uppercase tracking-widest text-white/40">Classifica</div>
                <div className="flex flex-col gap-1.5">
                  {[...players].sort((a,b)=>b.score-a.score).slice(0,5).map((p,i)=>(
                    <div key={p.id} className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm"
                      style={p.id===player.id
                        ? {background:`${player.avatarColor}22`,border:`1px solid ${player.avatarColor}55`}
                        : {background:'rgba(255,255,255,0.04)'}}>
                      <span className="w-5 text-xs">{i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</span>
                      <span className={`flex-1 truncate text-left font-bold ${p.id===player.id?'text-white':'text-white/60'}`}>{p.nickname}</span>
                      <span className="text-xs font-black" style={{color:'#F5B642'}}>{p.score}pt</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex w-full flex-col items-center gap-3 rounded-3xl p-5"
              style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(168,85,247,0.3)'}}>
              <div className="flex items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin" style={{color:'#A855F7'}}/>
                <div className="font-bold text-white/75">La TV sta scegliendo il gioco…</div>
              </div>
              <div className="text-sm text-white/35">{players.length} giocator{players.length!==1?'i':'e'} connessi</div>
            </div>

            <img src="/jonny-master-nobg.png" alt="" className="h-20 w-auto object-contain opacity-80"
              style={{filter:'drop-shadow(0 0 30px rgba(245,182,66,0.35))'}}/>
          </motion.div>
        )}

        {/* ── PLAYING ── */}
        {phase === 'playing' && player && session && (
          <motion.div key="playing" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="relative z-10 flex w-full max-w-sm flex-col gap-4">

            {/* Header */}
            <div className="flex items-center justify-between rounded-2xl px-4 py-3"
              style={{background:'rgba(0,0,0,0.5)',backdropFilter:'blur(14px)',border:'1px solid rgba(255,255,255,0.08)'}}>
              <div className="flex items-center gap-2">
                {session.gameSlug && GAME_INFO[session.gameSlug] && (
                  <span style={{color:GAME_INFO[session.gameSlug].color}}>
                    {GAME_INFO[session.gameSlug].icon}
                  </span>
                )}
                <div>
                  <div className="text-xs text-white/35">
                    {GAME_INFO[session.gameSlug??'']?.name ?? session.gameSlug} — Round {session.currentRound+1}/{session.totalRounds}
                  </div>
                  <div className="text-sm font-black text-white">{player.nickname}</div>
                </div>
              </div>
              <div className="rounded-xl px-4 py-2 text-center transition-all"
                style={timeLeft!==null&&timeLeft<=5
                  ? {background:'rgba(239,68,68,0.22)',border:'2px solid rgba(239,68,68,0.65)'}
                  : {background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.14)'}}>
                <div className="text-2xl font-black tabular-nums"
                  style={{color:timeLeft!==null&&timeLeft<=5?'#F87171':'#fff'}}>
                  {timeLeft ?? '—'}
                </div>
              </div>
            </div>

            {/* Score */}
            <div className="flex justify-center">
              <div className="rounded-full px-5 py-1.5 text-base font-black"
                style={{background:'rgba(245,182,66,0.18)',border:'1px solid rgba(245,182,66,0.45)',color:'#F5B642'}}>
                {player.score} punti
              </div>
            </div>

            {/* ── Emergency debug panel (?debug=1 only) ─────────────────── */}
            {new URLSearchParams(window.location.search).has('debug') && (() => {
              const p = session.roundPayload;
              const mode = String(p.mode ?? '—');
              const gfp  = String((p as Record<string,unknown>).gameFlowPhase ?? '—');
              const motPerm = (() => {
                try { return localStorage.getItem('ideagame:motion-permission') ?? 'null'; }
                catch { return 'err'; }
              })();
              const browserBlocked = (() => {
                const ua2 = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '';
                const isIOS2 = /iPad|iPhone|iPod/.test(ua2) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
                const blocked2 = ['CriOS','FxiOS','Instagram','FBAN','FBAV'].some(t => ua2.includes(t));
                const safari2 = ua2.includes('Safari') && !ua2.includes('CriOS') && !ua2.includes('FxiOS');
                return isIOS2 && blocked2 && !safari2;
              })();
              const rows: [string, string, boolean|undefined][] = [
                ['phase',           phase,           phase === 'playing'],
                ['mode',            mode,            undefined],
                ['gameFlowPhase',   gfp,             undefined],
                ['motionPerm(ls)',  motPerm,         motPerm === 'granted'],
                ['browserBlocked', String(browserBlocked), !browserBlocked],
                ['socket',         socketConnected ? '✅ connected' : '❌ disconnected', socketConnected],
                ['gameSlug',       session.gameSlug ?? '—', undefined],
                ['round',          String(session.currentRound), undefined],
              ];
              return (
                <div style={{
                  background: 'rgba(0,0,0,0.92)', border: '1px solid rgba(250,204,21,0.5)',
                  borderRadius: 12, padding: '8px 12px', fontSize: 10, fontFamily: 'monospace',
                  color: '#facc15', display: 'flex', flexDirection: 'column', gap: 3,
                }}>
                  <div style={{ fontWeight: 900, fontSize: 11, marginBottom: 2 }}>🔬 DEBUG PANEL</div>
                  {rows.map(([label, val, ok]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ opacity: 0.55 }}>{label}</span>
                      <span style={{ color: ok === false ? '#f87171' : ok === true ? '#4ade80' : '#facc15' }}>{val}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Game controller */}
            <PhoneController
              session={session}
              player={player}
              players={players}
              revealed={revealed}
              answered={answered}
              timeLeft={timeLeft}
              onAnswer={(idx) => {
                setAnswered(idx);
                if (timerRef.current) clearInterval(timerRef.current);
                setRevealed(true);
                const p = session.roundPayload;
                if (String(p.mode)==='home-quiz' && idx===Number(p.correctIndex)) {
                  void addScore(Number(p.points ?? 200));
                }
                // Report answer to server so it can detect when all players answered
                if (String(p.mode) === 'home-quiz' && player) {
                  console.log('[QuizTrace:phone] answer submitted', { playerId: player.id, round: session.currentRound, answer: idx });
                  void fetch(`/api/home/sessions/${session.id}/answer`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ playerId: player.id, answerIndex: idx, round: session.currentRound }),
                  }).then(r => r.json()).then(d => console.log('[QuizTrace:phone] answer POST response', d)).catch(err => console.log('[QuizTrace:phone] answer POST failed', err));
                }
              }}
              onFlip={flipCard}
              onScore={addScore}
              emit={emit}
            />
          </motion.div>
        )}

        {/* ── ENDED (champion) ── */}
        {phase === 'ended' && player && (
          <motion.div key="ended" initial={{opacity:0,scale:0.9}} animate={{opacity:1,scale:1}}
            className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6 text-center">
            <img src="/jonny-world-hero.png" alt="" className="h-32 w-auto object-contain"
              style={{filter:'drop-shadow(0 0 50px rgba(245,182,66,0.5))'}}/>
            <div>
              <div className="text-display text-5xl font-black text-white">🏆 Fine!</div>
              <div className="mt-2 text-2xl font-black" style={{color:'#F5B642'}}>{player.score} punti totali!</div>
            </div>
            <div className="flex w-full flex-col gap-2">
              {[...players].sort((a,b)=>b.score-a.score).map((p,i)=>{
                const MEDALS=['🥇','🥈','🥉'];
                const isSelf = p.id===player.id;
                return (
                  <div key={p.id} className="flex items-center gap-3 rounded-2xl px-4 py-3"
                    style={isSelf
                      ? {background:'linear-gradient(135deg,rgba(245,182,66,0.25),rgba(245,182,66,0.1))',border:'2px solid rgba(245,182,66,0.5)'}
                      : {background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)'}}>
                    <div className="text-2xl w-8 text-center">{MEDALS[i]??`#${i+1}`}</div>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black"
                      style={{background:AVATAR_COLORS[i%AVATAR_COLORS.length],color:'#000'}}>
                      {p.nickname.slice(0,2).toUpperCase()}
                    </div>
                    <div className="flex-1 text-left">
                      <div className={`text-sm font-black ${isSelf?'text-yellow-400':'text-white'}`}>{p.nickname}</div>
                    </div>
                    <div className={`text-lg font-black ${isSelf?'text-yellow-400':'text-white/60'}`}>{p.score}pt</div>
                  </div>
                );
              })}
            </div>
            <button onClick={() => { clearJoin(); navigate('/'); }}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-sm text-white/45 hover:text-white/70">
              <Home className="h-4 w-4"/> Torna all'Hub
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

// ── PhoneController ────────────────────────────────────────────────────────────

function PhoneController({
  session, player, players, revealed, answered, timeLeft,
  onAnswer, onFlip, onScore, emit,
}: {
  session: HomeSession;
  player: HomePlayer;
  players: HomePlayer[];
  revealed: boolean;
  answered: number | null;
  timeLeft: number | null;
  onAnswer: (idx: number) => void;
  onFlip: (cardId: string) => void;
  onScore: (pts: number) => Promise<void>;
  emit: (event: string, data: unknown) => void;
}) {
  const p = session.roundPayload;
  const mode = String(p.mode ?? 'home-quiz');

  if (mode === 'home-flow')       return <GameFlowPhone session={session} player={player}/>;
  if (mode === 'home-quiz')       return <QuizController payload={p} revealed={revealed} answered={answered} onAnswer={onAnswer}/>;
  if (mode === 'home-coppie')     return <CoppieController payload={p} onFlip={onFlip} player={player}/>;
  if (mode === 'home-percorso')   return <PercorsoHomeController payload={p} timeLeft={timeLeft}/>;
  if (mode === 'home-saramusica') return <SaraMusicaController payload={p} player={player} session={session}/>;
  if (mode === 'home-adult')      return <AdultController payload={p} timeLeft={timeLeft} onScore={onScore}/>;
  if (mode === 'home-ballo')      return <BalloController payload={p} timeLeft={timeLeft} sessionId={session.id} emit={emit} playerId={player.id} round={session.currentRound}/>;
  if (mode === 'home-wordback')   return <WordBackController payload={p} timeLeft={timeLeft}/>;
  if (mode === 'home-karaoke')    return <KaraokeController payload={p} sessionId={session.id}/>;
  if (mode === 'home-freestyle')  return <FreestyleController payload={p} timeLeft={timeLeft}/>;
  return <div className="text-center text-white/40 py-8">In attesa del gioco…</div>;
}

// ── QuizController ─────────────────────────────────────────────────────────────

function QuizController({ payload, revealed, answered, onAnswer }: {
  payload: Record<string,unknown>;
  revealed: boolean;
  answered: number | null;
  onAnswer: (idx: number) => void;
}) {
  const answers = (payload.answers as string[]) ?? [];
  const correct = Number(payload.correctIndex ?? 0);
  const LETTERS = ['A','B','C','D'];
  const COLORS = ['#3B82F6','#EC4899','#EAB308','#10B981'];

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl p-4 text-center"
        style={{background:'rgba(168,85,247,0.12)',border:'1px solid rgba(168,85,247,0.35)'}}>
        <div className="text-sm font-black leading-snug text-white">{String(payload.question??'')}</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {answers.map((ans,i)=>{
          const isCorrect = i===correct;
          const isAnswered = answered===i;
          let bg: string;
          if (revealed) {
            bg = isCorrect ? 'linear-gradient(135deg,#22c55e,#16a34a)' : 'rgba(255,255,255,0.04)';
          } else if (isAnswered) {
            bg = `linear-gradient(135deg,${COLORS[i]},${COLORS[i]}cc)`;
          } else {
            bg = `${COLORS[i]}22`;
          }
          return (
            <button key={i} onClick={() => !revealed && answered===null && onAnswer(i)}
              disabled={revealed || answered!==null}
              className="flex items-center gap-2 rounded-xl p-3 text-left text-sm font-black transition-all disabled:opacity-70"
              style={{background:bg,border:`1px solid ${COLORS[i]}55`,color:'#fff'}}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black"
                style={{background:'rgba(0,0,0,0.3)'}}>
                {LETTERS[i]}
              </span>
              <span className="text-xs leading-tight">{ans}</span>
              {revealed && isCorrect && <Check className="ml-auto h-4 w-4 shrink-0"/>}
            </button>
          );
        })}
      </div>
      {revealed && (
        <div className="rounded-xl p-3 text-center text-xs font-bold"
          style={answered===correct
            ? {background:'rgba(34,197,94,0.18)',color:'#4ade80',border:'1px solid rgba(34,197,94,0.35)'}
            : {background:'rgba(239,68,68,0.18)',color:'#f87171',border:'1px solid rgba(239,68,68,0.35)'}}>
          {answered===correct ? '✅ Risposta corretta!' : `❌ La risposta era: ${answers[correct]}`}
        </div>
      )}
    </div>
  );
}

// ── CoppieController ──────────────────────────────────────────────────────────

interface CoppieCard { id: string; text: string; imageUrl?: string; pairId: number; flipped: boolean; matched: boolean; }

function CoppieController({ payload, onFlip, player }: {
  payload: Record<string,unknown>;
  onFlip: (cardId: string) => void;
  player: HomePlayer;
}) {
  const cards = (payload.cards as CoppieCard[]) ?? [];
  const matched = Number(payload.matchedPairs ?? 0);
  const total = Number(payload.totalPairs ?? 0);
  const lastFlippedBy = payload.lastFlippedBy as string | null;
  const isMyTurn = !lastFlippedBy || lastFlippedBy === player.id || (payload.currentFlipped as string[])?.length === 0;
  const cols = Math.min(Math.ceil(Math.sqrt(cards.length)), 4);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-xl px-4 py-2"
        style={{background:'rgba(244,114,182,0.12)',border:'1px solid rgba(244,114,182,0.35)'}}>
        <span className="text-sm font-black" style={{color:'#F472B6'}}>💞 Coppie: {matched}/{total}</span>
        <span className="text-xs text-white/50">{isMyTurn ? '🟢 Il tuo turno!' : '⏳ Aspetta...'}</span>
      </div>
      <div className="grid gap-2" style={{gridTemplateColumns:`repeat(${cols},minmax(0,1fr))`}}>
        {cards.map(card=>(
          <button key={card.id}
            onClick={() => isMyTurn && !card.matched && !card.flipped && onFlip(card.id)}
            disabled={!isMyTurn || card.matched || card.flipped}
            className="flex min-h-14 items-center justify-center rounded-xl text-xs font-black transition-all disabled:opacity-60"
            style={card.matched
              ? {background:'rgba(34,197,94,0.25)',border:'1px solid rgba(34,197,94,0.55)',color:'#4ade80'}
              : card.flipped
              ? {background:'linear-gradient(135deg,rgba(244,114,182,0.4),rgba(244,114,182,0.2))',border:'2px solid #F472B6',color:'#fff'}
              : {background:'rgba(255,255,255,0.05)',border:'1px solid rgba(244,114,182,0.3)',color:'rgba(255,255,255,0.5)'}}>
            {card.matched || card.flipped ? (
              card.imageUrl
                ? <img src={card.imageUrl} alt={card.text} className="h-10 w-10 rounded-lg object-cover"/>
                : <span className="px-1 text-center leading-tight">{card.text}</span>
            ) : '?'}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── PercorsoHomeController — sfida dinamica per home-percorso ─────────────────

const HOME_PERCORSO_EMOJIS: Record<string, string> = {
  sfida: '⚡', domanda: '❓', mimo: '🎭', ballo: '💃',
  veloce: '🏃', coppia: '👫', reazione: '😱', fantasia: '🌟',
};

function PercorsoHomeBallo({ timeLeft }: { timeLeft: number | null }) {
  const [energy, setEnergy] = useState(0);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const handlerRef = useRef<((e: DeviceMotionEvent) => void) | null>(null);

  // Blur any focused input to prevent iOS "Shake to Undo" popup
  useEffect(() => {
    const el = document.activeElement;
    if (el instanceof HTMLElement) el.blur();
    window.getSelection()?.removeAllRanges();
  }, []);

  const startSensor = useCallback(() => {
    const h = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.sqrt((a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2);
      setEnergy(prev => Math.min(100, Math.max(0, prev * 0.7 + Math.min(100, (mag / 25) * 100) * 0.3)));
    };
    handlerRef.current = h;
    window.addEventListener('devicemotion', h);
    setHasPermission(true);
  }, []);

  useEffect(() => {
    const DM = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof DM.requestPermission !== 'function') { startSensor(); }
    else { setHasPermission(false); }
    return () => { if (handlerRef.current) window.removeEventListener('devicemotion', handlerRef.current); };
  }, [startSensor]);

  useEffect(() => {
    const id = setInterval(() => setEnergy(prev => Math.max(0, prev - 2)), 80);
    return () => clearInterval(id);
  }, []);

  const color = energy > 70 ? '#22c55e' : energy > 35 ? '#eab308' : '#34D399';

  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center w-full">
      <div className="text-5xl">💃</div>
      <div className="text-xl font-black text-white">BALLA!</div>
      {timeLeft !== null && (
        <div className="flex items-center gap-2 rounded-xl px-5 py-2"
          style={{background:'rgba(52,211,153,0.18)',border:'1px solid rgba(52,211,153,0.45)',color:'#34D399'}}>
          <Timer className="h-4 w-4"/>
          <span className="text-2xl font-black tabular-nums">{timeLeft}s</span>
        </div>
      )}
      {hasPermission === false ? (
        <button onClick={async () => {
          const DM = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
          if (typeof DM.requestPermission === 'function') {
            const r = await DM.requestPermission();
            if (r === 'granted') startSensor();
          }
        }} className="w-full rounded-2xl py-3 text-sm font-black text-white"
           style={{background:'linear-gradient(135deg,#34D399,#059669)'}}>
          🎯 Attiva sensore di movimento
        </button>
      ) : (
        <div className="w-full space-y-1">
          <div className="flex justify-between text-xs font-bold text-white/60">
            <span>Energia</span>
            <span className="tabular-nums" style={{color}}>{energy}%</span>
          </div>
          <div className="relative h-10 overflow-hidden rounded-2xl bg-white/10">
            <motion.div className="absolute inset-y-0 left-0 rounded-2xl"
              animate={{width:`${energy}%`}} transition={{duration:0.08}}
              style={{background:`linear-gradient(90deg,${color}88,${color})`,boxShadow:`0 0 20px ${color}66`}}/>
            <div className="absolute inset-0 flex items-center justify-center text-sm font-black text-white">
              {energy > 75 ? '🔥 Che energia!' : energy > 40 ? '💪 Continua!' : '🎭 Muoviti!'}
            </div>
          </div>
        </div>
      )}
      <div className="text-xs text-white/35">L'animatore assegna i punti dalla TV</div>
    </div>
  );
}

function PercorsoHomeController({ payload, timeLeft }: {
  payload: Record<string, unknown>;
  timeLeft: number | null;
}) {
  const ct = String(payload.challengeType ?? 'sfida');
  const emoji = HOME_PERCORSO_EMOJIS[ct] ?? '🎯';
  const goLabel: Record<string, string> = {
    mimo: '🎭 Recita!', sfida: '⚡ Forza!', veloce: '🏃 Corri!',
    coppia: '👫 Insieme!', reazione: '😱 Reagisci!', fantasia: '🌟 Improvvisa!', domanda: '❓ Rispondi!',
  };

  if (ct === 'ballo') return <PercorsoHomeBallo timeLeft={timeLeft} />;

  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <div className="text-5xl">{emoji}</div>
      <div className="text-xl font-black text-white">{String(payload.title ?? 'Sfida!')}</div>
      {!!payload.description && (
        <div className="text-sm text-white/55 leading-relaxed px-2">{String(payload.description)}</div>
      )}
      {timeLeft !== null && (
        <div className="flex items-center gap-2 rounded-xl px-5 py-2"
          style={{background:'rgba(52,211,153,0.18)',border:'1px solid rgba(52,211,153,0.45)',color:'#34D399'}}>
          <Timer className="h-4 w-4"/>
          <span className="text-2xl font-black tabular-nums">{timeLeft}s</span>
        </div>
      )}
      <motion.div animate={{scale:[1,1.06,1]}} transition={{repeat:Infinity,duration:1.5}}
        className="rounded-xl px-6 py-2 text-xl font-black text-white"
        style={{background:'rgba(52,211,153,0.2)',border:'1px solid rgba(52,211,153,0.45)'}}>
        {goLabel[ct] ?? '💪 Forza!'}
      </motion.div>
      <div className="text-xs text-white/35">L'animatore assegna i punti dalla TV</div>
    </div>
  );
}

// ── SimpleController (Ballo, Adult, WordBack) ──────────────────────────────────

function SimpleController({ payload, color, emoji, label, timeLeft }: {
  payload: Record<string,unknown>;
  color: string;
  emoji: string;
  label: string;
  timeLeft: number | null;
}) {
  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div className="text-6xl">{emoji}</div>
      <div className="text-xl font-black text-white">{String(payload.title ?? payload.name ?? label)}</div>
      {!!payload.description && (
        <div className="text-sm text-white/55 leading-relaxed px-2">{String(payload.description)}</div>
      )}
      {timeLeft !== null && (
        <div className="flex items-center gap-2 rounded-xl px-5 py-2"
          style={{background:`${color}18`,border:`1px solid ${color}45`,color}}>
          <Timer className="h-4 w-4"/>
          <span className="text-2xl font-black tabular-nums">{timeLeft}s</span>
        </div>
      )}
      <div className="text-xs text-white/35">L'animatore assegna i punti dalla TV</div>
    </div>
  );
}

// ── BalloController ────────────────────────────────────────────────────────────

const MOTION_PERM_KEY = 'ideagame:motion-permission';

function BalloController({ payload, timeLeft, sessionId, emit, playerId, round }: {
  payload: Record<string,unknown>;
  timeLeft: number | null;
  sessionId: string;
  emit: (event: string, data: unknown) => void;
  playerId: string;
  round?: number;
}) {
  const [energy, setEnergy] = useState(0);
  // Eagerly init from localStorage — if permission was granted during booking, sensors
  // start immediately on mount with no button shown.
  const [motionPerm, setMotionPerm] = useState<'unknown'|'granted'|'denied'|'unsupported'>(() => {
    try {
      if (typeof DeviceMotionEvent === 'undefined') return 'unsupported';
      const saved = localStorage.getItem(MOTION_PERM_KEY);
      if (saved === 'granted') return 'granted';
      if (saved === 'denied') return 'denied';
    } catch { /* ignore */ }
    return 'unknown';
  });
  // ── Motion tracking refs ──────────────────────────────────────────────────
  // Primary: deviceorientation angle-delta samples (no violent shake needed)
  // Fallback: smoothed accelerometer samples (clamped to prevent spike scoring)
  const orientSamplesRef  = useRef<number[]>([]);
  const prevOrientRef     = useRef<{ beta: number; gamma: number; alpha: number } | null>(null);
  const accelSamplesRef   = useRef<number[]>([]);
  const smoothedEnergyRef = useRef<number>(0);
  const timeLeftRef = useRef(timeLeft);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);

  // ── Diagnostics (visible in dev OR ?debug=1) ────────────────────────────
  const showDiag = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('debug');
  const isIOS = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
  const isStandalone = typeof window !== 'undefined' && (
    (navigator as { standalone?: boolean }).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true
  );
  // Browsers that block DeviceMotion on iOS (Chrome iOS, Firefox iOS, in-app browsers)
  // Uses .includes() instead of regex to avoid silent null-UA failure.
  const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || '';
  const BLOCKED_TOKENS = ['CriOS', 'FxiOS', 'Instagram', 'FBAN', 'FBAV'] as const;
  const matchedToken   = BLOCKED_TOKENS.find(t => ua.includes(t)) ?? null;
  const isSafari       = ua.includes('Safari') && !ua.includes('CriOS') && !ua.includes('FxiOS');
  const isBlockedBrowser = isIOS && matchedToken !== null && !isSafari;

  // ── Browser detection log (always — visible in Safari DevTools / ?debug=1) ──
  if (typeof window !== 'undefined') {
    console.log('[BrowserGuard]', {
      ua: ua.slice(0, 200),
      isIOS,
      matchedToken,
      isSafari,
      isBlockedBrowser,
    });
  }
  // Refs updated on every sensor event — never cause re-renders
  const diagMotionCountRef  = useRef(0);
  const diagOrientCountRef  = useRef(0);
  const diagLastOrientRef   = useRef<{ a: number|null; b: number|null; g: number|null }>({ a: null, b: null, g: null });
  const diagLastAccelRef    = useRef<{ x: number|null; y: number|null; z: number|null }>({ x: null, y: null, z: null });
  const diagLastEmitRef     = useRef<number|null>(null);
  // Snapshot read into state by a 400ms refresh interval (only when showDiag)
  const [diagSnap, setDiagSnap] = useState({
    mo: 0, or: 0,
    a: null as number|null, b: null as number|null, g: null as number|null,
    x: null as number|null, y: null as number|null, z: null as number|null,
    ts: null as number|null,
  });
  const [diagMotionPerm,  setDiagMotionPerm]  = useState('—');
  const [diagOrientPerm,  setDiagOrientPerm]  = useState('—');
  const [testRunning,     setTestRunning]      = useState(false);
  const [testCountdown,   setTestCountdown]    = useState(0);
  const [diagOpen,        setDiagOpen]         = useState(false);
  const [safariDismissed, setSafariDismissed]  = useState(false);
  const [showSafariHints, setShowSafariHints]  = useState(false);
  const [linkCopied,      setLinkCopied]       = useState(false);

  // Aggressively prevent iOS "Shake to Undo" popup for the entire ballo session.
  // iOS "Annulla inserimento" (Shake to Undo) mitigation.
  // NOTE: Shake to Undo cannot be fully disabled from Safari/PWA.
  // Strategy: on mount add .ballo-mode to <body> (hides all inputs via CSS),
  // blur any focused element, lock user-select, intercept focusin+selectionchange.
  // The .ballo-mode CSS class is defined in index.css.
  useEffect(() => {
    document.body.classList.add('ballo-mode');

    const blurActive = () => {
      const el = document.activeElement;
      if (el instanceof HTMLElement) el.blur();
      window.getSelection()?.removeAllRanges();
    };
    blurActive();

    const guardFocus = (e: FocusEvent) => {
      const t = e.target;
      if (
        t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable)
      ) { t.blur(); }
    };
    const guardSelection = () => { window.getSelection()?.removeAllRanges(); };

    window.addEventListener('focusin', guardFocus, true);
    document.addEventListener('selectionchange', guardSelection);
    document.body.style.userSelect = 'none';
    document.body.style.setProperty('-webkit-user-select', 'none');
    document.body.style.touchAction = 'manipulation';

    return () => {
      document.body.classList.remove('ballo-mode');
      window.removeEventListener('focusin', guardFocus, true);
      document.removeEventListener('selectionchange', guardSelection);
      document.body.style.userSelect = '';
      document.body.style.removeProperty('-webkit-user-select');
      document.body.style.touchAction = '';
    };
  }, []);

  // Permission state is initialised eagerly from localStorage (see useState above).
  // If the player granted permission during the booking phase (GameFlowPhone),
  // motionPerm starts as 'granted' and the sensor loop kicks off immediately on mount
  // with no extra button. The button below is kept as a fallback for direct
  // BalloController access (e.g. non-flow mode or page reload without pre-grant).

  const requestMotion = useCallback(async () => {
    const dme = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
    const doe = (typeof DeviceOrientationEvent !== 'undefined')
      ? DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
      : null;
    console.log('[iPhoneMotion] requestMotion start — dme.rP:', typeof dme.requestPermission,
      '| doe.rP:', typeof doe?.requestPermission,
      '| userAgent:', navigator.userAgent.slice(0, 80));

    let motionGranted = false;
    let orientGranted = false;

    if (typeof dme.requestPermission === 'function') {
      // ── Fire BOTH synchronously from the user gesture tap (no await before either
      // call). iOS requires requestPermission() to start within the gesture stack.
      // Each call gets its own synchronous try/catch so a throw from one cannot
      // prevent the other from being started — this replaces the old Promise.all
      // which would collapse both into a single 'denied' if orientation threw.
      let motionP: Promise<string>;
      try {
        motionP = dme.requestPermission();
      } catch (e) {
        console.log('[iPhoneMotion] motion rP threw synchronously:', e);
        motionP = Promise.resolve('denied');
      }

      let orientP: Promise<string> = Promise.resolve('granted'); // default when no API
      if (typeof doe?.requestPermission === 'function') {
        try {
          orientP = doe.requestPermission();
        } catch (e) {
          console.log('[iPhoneMotion] orientation rP threw synchronously:', e);
          orientP = Promise.resolve('denied');
        }
      }

      // ── Await each independently — one rejection cannot deny the other ───────
      try {
        const r = await motionP;
        motionGranted = r === 'granted';
        console.log('[iPhoneMotion] motion permission result:', r);
      } catch (err) {
        console.log('[iPhoneMotion] motion permission error (rejected):', err);
      }

      try {
        const r = await orientP;
        orientGranted = r === 'granted';
        console.log('[iPhoneMotion] orientation permission result:', r);
      } catch (err) {
        console.log('[iPhoneMotion] orientation permission error (rejected):', err);
      }
    } else {
      // Non-iOS / desktop: no requestPermission API — sensors available automatically
      motionGranted = true;
      orientGranted = true;
      console.log('[iPhoneMotion] no requestPermission API — auto-granted (Android/desktop)');
    }

    // Grant if AT LEAST ONE sensor path works — fallback logic handles the rest
    const granted = motionGranted || orientGranted;
    console.log('[iPhoneMotion] final — motionGranted:', motionGranted,
      '| orientGranted:', orientGranted, '| proceeding:', granted);
    const perm: 'granted' | 'denied' = granted ? 'granted' : 'denied';
    localStorage.setItem(MOTION_PERM_KEY, perm);
    setMotionPerm(perm);
  }, []);

  useEffect(() => {
    if (motionPerm !== 'granted') return;
    console.log('[iPhoneMotion] listener attached — starting sensors',
      '| has DeviceOrientationEvent:', typeof DeviceOrientationEvent,
      '| has DeviceMotionEvent:', typeof DeviceMotionEvent);

    // orientActive: true once the first deviceorientation sample arrives.
    // Used as the hard gate for the accel fallback — avoids the stale-length
    // race where orientSamplesRef.length is 0 between intervals.
    let orientActive = false;

    // orientActive: set once orientation fires (even with zero values).
    // Used only for the 1000ms watchdog log — NOT for gating handleMotion.
    // Gate logic instead checks orientSamplesRef.current.length (see handleMotion).
    let accelLoggedOnce = false; // log fallback start only once

    // ── PRIMARY: deviceorientation — angle-delta scoring ─────────────────────
    // Only orientation samples with movement > 0.1° are queued.
    // iPhone bug: deviceorientation fires but returns alpha/beta/gamma = 0 or null
    // when DeviceOrientationEvent.requestPermission() was not called separately.
    // In that case, movement = 0 and NO sample is pushed — allowing accel fallback.
    const handleOrientation = (e: DeviceOrientationEvent) => {
      diagOrientCountRef.current++;
      diagLastOrientRef.current = { a: e.alpha, b: e.beta, g: e.gamma };
      if (!orientActive) {
        orientActive = true;
        console.log('[Ballo iPhone] orientation first sample — alpha:', e.alpha,
          'beta:', e.beta, 'gamma:', e.gamma,
          '| all null?', e.alpha === null && e.beta === null && e.gamma === null);
      }
      const beta  = e.beta  ?? 0;
      const gamma = e.gamma ?? 0;
      const alpha = e.alpha ?? 0;
      const prev  = prevOrientRef.current;
      if (prev !== null) {
        const db = Math.abs(beta  - prev.beta);
        const dg = Math.abs(gamma - prev.gamma);
        let   da = Math.abs(alpha - prev.alpha);
        if (da > 180) da = 360 - da; // handle alpha 0↔360 wrap
        const movement = Math.sqrt(db * db + dg * dg + (da * 0.4) * (da * 0.4));
        if (movement > 0.1) {
          // Only queue meaningful rotation — threshold filters iPhone zero-lock bug
          orientSamplesRef.current.push(Math.min(movement, 60));
        }
        // else: event fired but no real rotation (iPhone with blocked orientation)
        // → sample NOT pushed → handleMotion accel fallback remains active
      }
      prevOrientRef.current = { beta, gamma, alpha };
    };

    // ── FALLBACK: clamped accelerometer ───────────────────────────────────────
    // Active whenever orientation has NOT pushed meaningful samples this interval.
    // Gated on orientSamplesRef.current.length (not orientActive flag) so that
    // iPhones where orientation fires but returns zero-deltas still score.
    const handleMotion = (e: DeviceMotionEvent) => {
      diagMotionCountRef.current++;
      const _da = e.acceleration ?? e.accelerationIncludingGravity;
      if (_da) diagLastAccelRef.current = { x: _da.x ?? null, y: _da.y ?? null, z: _da.z ?? null };
      if (orientSamplesRef.current.length > 0) return; // real orientation data this interval
      if (!accelLoggedOnce) {
        accelLoggedOnce = true;
        console.log('[Ballo iPhone] fallback started — using devicemotion accel');
      }
      const acc = e.acceleration ?? e.accelerationIncludingGravity;
      if (!acc) {
        console.log('[Ballo iPhone] handleMotion — acc null (both acceleration + aig are null)');
        return;
      }
      let mag = Math.sqrt((acc.x ?? 0) ** 2 + (acc.y ?? 0) ** 2 + (acc.z ?? 0) ** 2);
      if (!e.acceleration) mag = Math.abs(mag - 9.81); // remove gravity baseline
      accelSamplesRef.current.push(Math.min(mag, 10));
    };

    window.addEventListener('deviceorientation', handleOrientation);
    window.addEventListener('devicemotion', handleMotion);

    // 1000ms watchdog: diagnose orientation status
    const orientWatchdog = setTimeout(() => {
      console.log('[Ballo iPhone] 1000ms watchdog — orientActive:', orientActive,
        '| orientSamples queued:', orientSamplesRef.current.length,
        '| accelSamples queued:', accelSamplesRef.current.length,
        '| accelFallback:', accelLoggedOnce);
      if (!orientActive) {
        console.log('[Ballo iPhone] deviceorientation never fired — pure accel mode');
      } else if (orientSamplesRef.current.length === 0 && accelSamplesRef.current.length === 0) {
        console.log('[Ballo iPhone] orientation fired but zero movement + no accel — sensor stall');
      }
    }, 1000);

    // ── Interval: compute smoothed energy and emit ───────────────────────────
    const interval = setInterval(() => {
      const orientSamples = orientSamplesRef.current;
      const accelSamples  = accelSamplesRef.current;

      let rawEnergy = 0;
      if (orientSamples.length > 0) {
        const avg = orientSamples.reduce((a, b) => a + b, 0) / orientSamples.length;
        orientSamples.length = 0;
        accelSamples.length  = 0; // discard stale accel
        // Sensitivity: 0–25° avg → 0–100. Normal arm swing ~10–15° → 40–60%.
        rawEnergy = Math.min(100, Math.round((avg / 25) * 100));
      } else if (accelSamples.length > 0) {
        const avg = accelSamples.reduce((a, b) => a + b, 0) / accelSamples.length;
        accelSamples.length = 0;
        // Map 0–8 m/s² → 0–100 (more sensitive than before)
        rawEnergy = Math.min(100, Math.round((avg / 8) * 100));
      } else {
        return; // no samples yet — skip, keep displayed energy
      }

      // Exponential smoothing: more responsive (45% new vs 55% old)
      const smoothed = Math.round(smoothedEnergyRef.current * 0.5 + rawEnergy * 0.5);
      smoothedEnergyRef.current = smoothed;
      setEnergy(smoothed);

      // Emit whenever timeLeft > 0 (null means no timer = always emit)
      const tl = timeLeftRef.current;
      if (tl === null || tl > 0) {
        console.log('[BalloSensor] emit energy', smoothed,
          '| orientActive:', orientActive, '| tl:', tl);
        emit('home:ballo_energy', { sessionId, playerId, energy: smoothed, round: round ?? 0 });
        diagLastEmitRef.current = Date.now();
      }
    }, 400);

    // Visibility / focus regain — iOS popup briefly hides the page.
    // When dismissed, re-blur and keep emitting if timer is still running.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && (timeLeftRef.current ?? 0) > 0) {
        const el = document.activeElement;
        if (el instanceof HTMLElement) el.blur();
        window.getSelection()?.removeAllRanges();
      }
    };
    const handleWindowFocus = () => {
      if ((timeLeftRef.current ?? 0) > 0) {
        const el = document.activeElement;
        if (el instanceof HTMLElement) el.blur();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      clearTimeout(orientWatchdog);
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('devicemotion', handleMotion);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleWindowFocus);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionPerm, emit, sessionId, playerId]);

  // ── Diagnostic display-refresh (400ms, only when panel is visible) ───────
  useEffect(() => {
    if (!showDiag) return;
    const id = setInterval(() => setDiagSnap({
      mo: diagMotionCountRef.current,
      or: diagOrientCountRef.current,
      a: diagLastOrientRef.current.a,
      b: diagLastOrientRef.current.b,
      g: diagLastOrientRef.current.g,
      x: diagLastAccelRef.current.x,
      y: diagLastAccelRef.current.y,
      z: diagLastAccelRef.current.z,
      ts: diagLastEmitRef.current,
    }), 400);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDiag]);

  // ── Standalone sensor test (10 s window, triggered by test button) ────────
  const runSensorTest = useCallback(async () => {
    if (testRunning) return;
    setTestRunning(true);
    setTestCountdown(10);
    // Reset counters for a clean test window
    diagMotionCountRef.current = 0;
    diagOrientCountRef.current = 0;

    const dme = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
    const doe = (typeof DeviceOrientationEvent !== 'undefined')
      ? DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
      : null;

    if (typeof dme.requestPermission === 'function') {
      // Fire BOTH synchronously from user gesture tap (no await before either)
      let mp: Promise<string>;
      try { mp = dme.requestPermission(); }
      catch (e) { mp = Promise.resolve('denied'); console.log('[iPhoneMotion:test] motion rP sync throw', e); }

      let op: Promise<string> = Promise.resolve('granted');
      if (typeof doe?.requestPermission === 'function') {
        try { op = doe.requestPermission(); }
        catch (e) { op = Promise.resolve('denied'); console.log('[iPhoneMotion:test] orient rP sync throw', e); }
      }

      try { const r = await mp; setDiagMotionPerm(r); console.log('[iPhoneMotion:test] motion perm:', r); }
      catch (e) { setDiagMotionPerm(`error`); console.log('[iPhoneMotion:test] motion perm error', e); }
      try { const r = await op; setDiagOrientPerm(r); console.log('[iPhoneMotion:test] orient perm:', r); }
      catch (e) { setDiagOrientPerm(`error`); console.log('[iPhoneMotion:test] orient perm error', e); }
    } else {
      setDiagMotionPerm('auto');
      setDiagOrientPerm('auto');
    }

    // Attach temporary listeners for 10 s
    const onM = (e: DeviceMotionEvent) => {
      diagMotionCountRef.current++;
      const a = e.acceleration ?? e.accelerationIncludingGravity;
      if (a) diagLastAccelRef.current = { x: a.x ?? null, y: a.y ?? null, z: a.z ?? null };
    };
    const onO = (e: DeviceOrientationEvent) => {
      diagOrientCountRef.current++;
      diagLastOrientRef.current = { a: e.alpha, b: e.beta, g: e.gamma };
    };
    window.addEventListener('devicemotion', onM);
    window.addEventListener('deviceorientation', onO);

    const tick = setInterval(() => setTestCountdown(c => Math.max(0, c - 1)), 1000);

    setTimeout(() => {
      window.removeEventListener('devicemotion', onM);
      window.removeEventListener('deviceorientation', onO);
      clearInterval(tick);
      setTestRunning(false);
      console.log('[iPhoneMotion:test] done — motion:', diagMotionCountRef.current, '| orient:', diagOrientCountRef.current);
    }, 10_000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testRunning]);

  const energyColor = energy > 70 ? '#22c55e' : energy > 35 ? '#eab308' : '#A78BFA';

  // ── Sensor status (shown in debug mode at top of card) ──────────────────
  const sensorStatus: { icon: string; label: string; color: string } = (() => {
    if (motionPerm !== 'granted')
      return { icon: '⏳', label: 'In attesa di permesso', color: '#facc15' };
    if (diagSnap.mo === 0 && diagSnap.or === 0)
      return { icon: '❌', label: 'Nessun evento ricevuto', color: '#f87171' };
    if (energy === 0)
      return { icon: '⚠️', label: 'Eventi ricevuti ma energia 0', color: '#fb923c' };
    if (diagSnap.ts === null)
      return { icon: '⚠️', label: 'Energia OK ma socket non emette', color: '#fb923c' };
    return { icon: '✅', label: 'Socket emette', color: '#4ade80' };
  })();

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center" style={{userSelect:'none',WebkitUserSelect:'none'}}>

      {/* ── Browser guard (Chrome iOS / Firefox iOS / in-app browsers) ─────── */}
      {isBlockedBrowser && !safariDismissed && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99998,
          background: 'rgba(0,0,0,0.97)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '32px 24px', gap: 18,
          textAlign: 'center',
          overflowY: 'auto',
        }}>
          <div style={{ fontSize: 52 }}>🧭</div>

          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1.3 }}>
            Apri con Safari
          </div>

          {/* Detected browser badge */}
          <div style={{
            padding: '4px 14px', borderRadius: 20,
            background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.4)',
            fontSize: 11, fontWeight: 700, color: '#fca5a5', letterSpacing: '0.04em',
          }}>
            Browser: {
              matchedToken === 'CriOS'     ? 'Chrome iPhone' :
              matchedToken === 'FxiOS'     ? 'Firefox iPhone' :
              matchedToken === 'Instagram' ? 'Instagram' :
              (matchedToken === 'FBAN' || matchedToken === 'FBAV') ? 'Facebook' :
              matchedToken ?? 'non supportato'
            }
          </div>

          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.65, maxWidth: 300 }}>
            Su iPhone i sensori di movimento funzionano solo aprendo il gioco con Safari.
            {matchedToken === 'CriOS' ? ' Chrome su iPhone blocca i sensori.' :
             matchedToken === 'FxiOS' ? ' Firefox su iPhone blocca i sensori.' :
             ' Questo browser blocca i sensori.'}
          </div>

          {/* Primary: copy link */}
          <button
            onClick={() => {
              void navigator.clipboard.writeText(window.location.href).then(() => {
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2500);
              });
            }}
            style={{
              width: '100%', maxWidth: 320, padding: '15px 20px',
              borderRadius: 16, border: 'none',
              background: linkCopied
                ? 'linear-gradient(135deg,#16a34a,#15803d)'
                : 'linear-gradient(135deg,#A78BFA,#7C3AED)',
              color: '#fff', fontSize: 16, fontWeight: 900,
              cursor: 'pointer', letterSpacing: '0.02em',
              transition: 'background 0.3s',
            }}>
            {linkCopied ? '✅ Link copiato!' : '📋 Copia link'}
          </button>

          {/* Secondary: show instructions */}
          <button
            onClick={() => setShowSafariHints(h => !h)}
            style={{
              width: '100%', maxWidth: 320, padding: '13px 20px',
              borderRadius: 16, border: '2px solid rgba(167,139,250,0.5)',
              background: 'rgba(167,139,250,0.1)',
              color: '#c4b5fd', fontSize: 14, fontWeight: 800,
              cursor: 'pointer',
            }}>
            {showSafariHints ? '▲ Nascondi istruzioni' : '📖 Mostra istruzioni'}
          </button>

          {showSafariHints && (
            <div style={{
              width: '100%', maxWidth: 320,
              background: 'rgba(167,139,250,0.08)',
              border: '1px solid rgba(167,139,250,0.25)',
              borderRadius: 14, padding: '16px 18px',
              textAlign: 'left',
            }}>
              {([
                { icon: '⬆️', text: 'Tocca il pulsante Condividi (□↑) in basso allo schermo' },
                { icon: '📋', text: 'Tocca "Copia link"' },
                { icon: '🧭', text: 'Apri Safari' },
                { icon: '🔗', text: 'Incolla il link nella barra degli indirizzi e vai' },
              ] as { icon: string; text: string }[]).map(({ icon, text }, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  marginBottom: i < 3 ? 12 : 0,
                }}>
                  <div style={{
                    minWidth: 26, height: 26, borderRadius: '50%',
                    background: 'rgba(167,139,250,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 900, color: '#c4b5fd', flexShrink: 0,
                  }}>{i + 1}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
                    {icon} {text}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tertiary: continue without sensors (tiny link only) */}
          <button
            onClick={() => setSafariDismissed(true)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.25)', fontSize: 12, fontWeight: 500,
              textDecoration: 'underline', marginTop: 4, padding: '4px 8px',
            }}>
            Continua senza sensori
          </button>
        </div>
      )}

      {/* ── Fixed diagnostic overlay (dev / ?debug=1) ────────────────────── */}
      {showDiag && (() => {
        const n = (v: number|null) => v === null ? 'null' : v.toFixed(1);
        const Row = ({ label, val, ok }: { label: string; val: string; ok?: boolean }) => (
          <div className="flex justify-between gap-2 leading-tight">
            <span className="opacity-50 shrink-0">{label}</span>
            <span className={`text-right ${ok === false ? 'text-red-400' : ok === true ? 'text-green-400' : ''}`}>{val}</span>
          </div>
        );
        const dme = DeviceMotionEvent as unknown as { requestPermission?: unknown };
        const doe = typeof DeviceOrientationEvent !== 'undefined'
          ? DeviceOrientationEvent as unknown as { requestPermission?: unknown }
          : null;
        const secAgo = diagSnap.ts ? Math.round((Date.now() - diagSnap.ts) / 1000) : null;
        return (
          <div style={{
            position: 'fixed', top: 8, left: 8, right: 8,
            zIndex: 99999,
            background: 'rgba(0,0,0,0.92)',
            border: '1px solid rgba(250,204,21,0.5)',
            borderRadius: 16,
            overflow: 'hidden',
          }}>
            {/* Collapse toggle */}
            <button
              onClick={() => setDiagOpen(o => !o)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', padding: '8px 12px',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: '#facc15', fontFamily: 'monospace', fontSize: 11, fontWeight: 900,
              }}>
              <span>🔬 DEBUG SENSORI</span>
              <span style={{ fontSize: 14 }}>{diagOpen ? '▲' : '▼'}</span>
            </button>

            {diagOpen && (
              <div style={{
                maxHeight: '70vh', overflowY: 'auto',
                padding: '0 12px 10px',
                color: '#facc15', fontFamily: 'monospace', fontSize: 10,
              }}>
                {/* Sensor status summary */}
                <div style={{
                  marginBottom: 8, padding: '6px 10px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.07)',
                  fontSize: 11, fontWeight: 900, color: sensorStatus.color,
                }}>
                  {sensorStatus.icon} {sensorStatus.label}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Row label="isIOS"                 val={isIOS ? '✅ YES' : '❌ NO'} ok={isIOS} />
                  <Row label="isPWA"                 val={isStandalone ? '✅ YES' : '❌ NO'} />
                  <Row label="DeviceMotionEvent"     val={typeof DeviceMotionEvent !== 'undefined' ? '✅' : '❌ MISSING'} ok={typeof DeviceMotionEvent !== 'undefined'} />
                  <Row label="DME.requestPerm"       val={typeof dme.requestPermission === 'function' ? '✅ fn' : '❌ none'} ok={typeof dme.requestPermission === 'function'} />
                  <Row label="DeviceOrientEvent"     val={typeof DeviceOrientationEvent !== 'undefined' ? '✅' : '❌ MISSING'} ok={typeof DeviceOrientationEvent !== 'undefined'} />
                  <Row label="DOE.requestPerm"       val={typeof doe?.requestPermission === 'function' ? '✅ fn' : '❌ none'} ok={typeof doe?.requestPermission === 'function'} />
                  <div style={{ borderTop: '1px solid rgba(250,204,21,0.2)', margin: '4px 0' }} />
                  <Row label="motionPerm (main)"     val={motionPerm} ok={motionPerm === 'granted'} />
                  <Row label="motionPerm (test)"     val={diagMotionPerm} ok={diagMotionPerm === 'granted' || diagMotionPerm === 'auto'} />
                  <Row label="orientPerm (test)"     val={diagOrientPerm} ok={diagOrientPerm === 'granted' || diagOrientPerm === 'auto'} />
                  <div style={{ borderTop: '1px solid rgba(250,204,21,0.2)', margin: '4px 0' }} />
                  <Row label="motionEvents"          val={String(diagSnap.mo)} ok={diagSnap.mo > 0} />
                  <Row label="orientEvents"          val={String(diagSnap.or)} ok={diagSnap.or > 0} />
                  <Row label="last α/β/γ"            val={diagSnap.a !== null ? `${n(diagSnap.a)}° ${n(diagSnap.b)}° ${n(diagSnap.g)}°` : '—'} ok={diagSnap.a !== null} />
                  <Row label="last accel x/y/z"      val={diagSnap.x !== null ? `${n(diagSnap.x)} ${n(diagSnap.y)} ${n(diagSnap.z)}` : '—'} ok={diagSnap.x !== null} />
                  <div style={{ borderTop: '1px solid rgba(250,204,21,0.2)', margin: '4px 0' }} />
                  <Row label="energy"                val={`${energy}%`} ok={energy > 0} />
                  <Row label="last emit"             val={secAgo !== null ? `${secAgo}s ago` : '—'} ok={secAgo !== null} />
                  <Row label="online"                val={navigator.onLine ? '✅ yes' : '❌ offline'} ok={navigator.onLine} />
                  <div style={{ fontSize: 9, opacity: 0.4, wordBreak: 'break-all', marginTop: 4, lineHeight: 1.3 }}>
                    {navigator.userAgent}
                  </div>

                  <button
                    onClick={() => void runSensorTest()}
                    style={{
                      marginTop: 8, width: '100%', borderRadius: 10,
                      padding: '10px 0', fontSize: 11, fontWeight: 900,
                      background: testRunning ? 'rgba(250,204,21,0.12)' : 'rgba(250,204,21,0.22)',
                      color: '#facc15', border: '1px solid rgba(250,204,21,0.45)',
                      cursor: testRunning ? 'default' : 'pointer',
                      letterSpacing: '0.05em',
                    }}>
                    {testRunning
                      ? `⏱ Test… ${testCountdown}s  motion:${diagSnap.mo}  orient:${diagSnap.or}`
                      : '🧪 Test sensori iPhone (10 s)'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Sensor status badge (debug mode only, always visible below overlay) */}
      {showDiag && (
        <div style={{
          marginTop: 90, padding: '5px 14px', borderRadius: 20,
          background: 'rgba(0,0,0,0.55)', border: `1px solid ${sensorStatus.color}55`,
          fontSize: 11, fontWeight: 700, color: sensorStatus.color,
        }}>
          {sensorStatus.icon} {sensorStatus.label}
        </div>
      )}

      <div className="text-6xl">💃</div>
      <div className="text-xl font-black text-white">{String(payload.name ?? 'Sfida di Ballo')}</div>
      <div className="text-sm text-white/55 leading-relaxed px-2">{String(payload.description ?? '')}</div>
      {!!payload.musicHint && (
        <div className="rounded-xl px-4 py-2 text-sm font-black" style={{background:'rgba(167,139,250,0.18)',color:'#c084fc',border:'1px solid rgba(167,139,250,0.4)'}}>
          🎵 {String(payload.musicHint)}
        </div>
      )}

      {/* ── Sensore movimento ── */}
      {motionPerm === 'unknown' && (
        <button onClick={() => void requestMotion()}
          className="flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-black"
          style={{background:'linear-gradient(135deg,#A78BFA,#7C3AED)',color:'#fff',boxShadow:'0 0 30px rgba(167,139,250,0.4)'}}>
          📱 Attiva sensori movimento
        </button>
      )}
      {motionPerm === 'denied' && (
        <div className="flex flex-col items-center gap-2">
          <div className="rounded-xl px-4 py-2 text-xs text-white/40 border border-white/10">
            Sensori negati — balla comunque! 🕺
          </div>
          <button
            onClick={() => {
              localStorage.removeItem(MOTION_PERM_KEY);
              setMotionPerm('unknown');
              void requestMotion();
            }}
            className="rounded-xl px-5 py-2 text-xs font-black"
            style={{
              background: 'rgba(167,139,250,0.15)',
              border: '1px solid rgba(167,139,250,0.4)',
              color: '#c084fc', cursor: 'pointer',
            }}>
            🔄 Riprova sensori
          </button>
        </div>
      )}
      {motionPerm === 'unsupported' && (
        <div className="rounded-xl px-4 py-2 text-xs text-white/40 border border-white/10">
          Sensori non supportati su questo dispositivo
        </div>
      )}
      {motionPerm === 'granted' && (
        <div className="w-full space-y-2">
          <div className="flex items-center justify-between text-xs font-bold" style={{color:'#A78BFA'}}>
            <span>⚡ Energia</span><span className="tabular-nums">{energy}%</span>
          </div>
          <div className="relative h-8 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div className="absolute inset-y-0 left-0 rounded-full"
              animate={{ width: `${energy}%` }} transition={{ duration: 0.2 }}
              style={{ background: energyColor, boxShadow: `0 0 12px ${energyColor}80` }} />
            <div className="absolute inset-0 flex items-center justify-center text-xs font-black text-white">
              {energy > 60 ? '🔥 FUOCO!' : energy > 30 ? '💃 Bene!' : '📱 Muoviti!'}
            </div>
          </div>
        </div>
      )}

      {timeLeft !== null && (
        <div className="flex items-center gap-2 rounded-xl px-5 py-2"
          style={{background:'rgba(167,139,250,0.18)',border:'1px solid rgba(167,139,250,0.45)',color:'#A78BFA'}}>
          <Timer className="h-4 w-4"/>
          <span className="text-2xl font-black tabular-nums">{timeLeft}s</span>
        </div>
      )}
      <div className="text-2xl font-black" style={{color:'#A78BFA'}}>BALLA! 🕺</div>

    </div>
  );
}

// ── SaraMusicaController ──────────────────────────────────────────────────────

function SaraMusicaController({ payload, player, session }: {
  payload: Record<string,unknown>;
  player: HomePlayer;
  session: HomeSession;
}) {
  const [answered, setAnswered] = useState<number | null>(null);
  const [result, setResult] = useState<'correct' | 'wrong' | 'late' | null>(null);
  const choices = (payload.choices as string[]) ?? [];
  const pts = Number(payload.points ?? 100);

  const submitAnswer = async (idx: number) => {
    if (answered !== null) return;
    setAnswered(idx);
    try {
      const r = await fetch(`/api/home/sessions/${session.id}/saramusica-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: player.id, choiceIndex: idx, round: Number(payload.roundIndex ?? 0) }),
      });
      const data = await r.json() as { ok: boolean; correct?: boolean; alreadyWon?: boolean };
      console.log('[SaraTrace:phone] answer response', data);
      if (data.alreadyWon) setResult('late');
      else setResult(data.correct ? 'correct' : 'wrong');
    } catch {
      setResult('wrong');
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <div className="text-5xl">🎵</div>
      <div className="text-lg font-black text-white">Indovina la canzone!</div>
      <div className="rounded-2xl p-3 w-full"
        style={{background:'rgba(96,165,250,0.12)',border:'1px solid rgba(96,165,250,0.35)'}}>
        <div className="text-xs font-black uppercase tracking-widest mb-1" style={{color:'rgba(96,165,250,0.8)'}}>SUGGERIMENTO</div>
        <div className="text-sm text-white/75 italic leading-relaxed">"{String(payload.snippetHint??'...')}"</div>
      </div>

      {result === null && (
        <div className="grid grid-cols-2 gap-3 w-full">
          {choices.map((choice, idx) => (
            <button key={idx} onClick={() => void submitAnswer(idx)}
              disabled={answered !== null}
              className="rounded-2xl px-3 py-4 text-sm font-black text-white disabled:opacity-50"
              style={{background:'linear-gradient(135deg,rgba(96,165,250,0.25),rgba(37,99,235,0.15))',border:'2px solid rgba(96,165,250,0.45)',boxShadow:'0 0 20px rgba(96,165,250,0.2)'}}>
              {choice}
            </button>
          ))}
        </div>
      )}

      {result === 'correct' && (
        <motion.div initial={{scale:0}} animate={{scale:1}} transition={{type:'spring'}}
          className="rounded-2xl p-5 text-center w-full"
          style={{background:'rgba(34,197,94,0.18)',border:'2px solid rgba(34,197,94,0.5)',color:'#4ade80'}}>
          <div className="text-3xl mb-1">✅</div>
          <div className="text-xl font-black">Esatto! +{pts}pt</div>
          <div className="text-sm opacity-70 mt-1">Risposta corretta!</div>
        </motion.div>
      )}

      {result === 'wrong' && (
        <div className="rounded-2xl p-5 text-center w-full"
          style={{background:'rgba(239,68,68,0.18)',border:'2px solid rgba(239,68,68,0.4)',color:'#f87171'}}>
          <div className="text-3xl mb-1">❌</div>
          <div className="text-xl font-black">Risposta sbagliata!</div>
        </div>
      )}

      {result === 'late' && (
        <div className="rounded-2xl p-5 text-center w-full"
          style={{background:'rgba(245,182,66,0.18)',border:'2px solid rgba(245,182,66,0.4)',color:'#F5B642'}}>
          <div className="text-3xl mb-1">⏱</div>
          <div className="text-xl font-black">Qualcuno ha già risposto!</div>
        </div>
      )}
    </div>
  );
}

// ── AdultController ────────────────────────────────────────────────────────────

function AdultController({ payload, timeLeft, onScore }: {
  payload: Record<string,unknown>;
  timeLeft: number | null;
  onScore?: (pts: number) => Promise<void>;
}) {
  const [choice, setChoice] = useState<'true'|'false'|null>(null);
  const pts = Number(payload.points ?? 150);
  const isYesNo = String(payload.body ?? '').length > 0;
  const hasChoice = choice !== null;

  const pick = async (v: 'true'|'false') => {
    if (hasChoice) return;
    setChoice(v);
    if (v === 'true' && onScore) await onScore(pts);
  };

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center" style={{userSelect:'none',WebkitUserSelect:'none'}}>
      <div className="text-6xl">🔞</div>
      <div className="text-xl font-black text-white">{String(payload.title ?? 'Sfida Adult Only')}</div>
      {isYesNo && (
        <div className="rounded-2xl p-4 w-full"
          style={{background:'rgba(248,113,113,0.12)',border:'1px solid rgba(248,113,113,0.35)'}}>
          <div className="text-sm text-white/75 leading-relaxed">{String(payload.body ?? '')}</div>
        </div>
      )}
      {timeLeft !== null && (
        <div className="flex items-center gap-2 rounded-xl px-5 py-2"
          style={{background:'rgba(248,113,113,0.18)',border:'1px solid rgba(248,113,113,0.45)',color:'#F87171'}}>
          <Timer className="h-4 w-4"/>
          <span className="text-2xl font-black tabular-nums">{timeLeft}s</span>
        </div>
      )}

      {/* Answer buttons */}
      {!hasChoice ? (
        <div className="flex w-full gap-4">
          <button onClick={() => void pick('true')}
            className="flex flex-1 flex-col items-center justify-center gap-2 rounded-3xl py-7 text-lg font-black text-white"
            style={{background:'linear-gradient(135deg,rgba(34,197,94,0.28),rgba(34,197,94,0.10))',border:'2px solid rgba(34,197,94,0.6)',boxShadow:'0 0 30px rgba(34,197,94,0.25)'}}>
            <span className="text-4xl">✅</span>
            L'ho fatto!
          </button>
          <button onClick={() => void pick('false')}
            className="flex flex-1 flex-col items-center justify-center gap-2 rounded-3xl py-7 text-lg font-black text-white"
            style={{background:'linear-gradient(135deg,rgba(248,113,113,0.28),rgba(248,113,113,0.10))',border:'2px solid rgba(248,113,113,0.6)',boxShadow:'0 0 30px rgba(248,113,113,0.25)'}}>
            <span className="text-4xl">❌</span>
            Non ci sto!
          </button>
        </div>
      ) : (
        <motion.div initial={{scale:0.8,opacity:0}} animate={{scale:1,opacity:1}}
          className="flex flex-col items-center gap-2 rounded-3xl px-8 py-6"
          style={choice === 'true'
            ? {background:'rgba(34,197,94,0.15)',border:'2px solid rgba(34,197,94,0.6)'}
            : {background:'rgba(248,113,113,0.15)',border:'2px solid rgba(248,113,113,0.6)'}}>
          <div className="text-4xl">{choice === 'true' ? '🔥' : '😅'}</div>
          <div className="text-lg font-black text-white">
            {choice === 'true' ? 'Sfida accettata!' : 'Passato!'}
          </div>
          {choice === 'true' && (
            <div className="text-sm" style={{color:'rgba(34,197,94,0.9)'}}>+{pts} punti assegnati!</div>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ── WordBackController ─────────────────────────────────────────────────────────

function WordBackController({ payload, timeLeft }: { payload: Record<string,unknown>; timeLeft: number | null }) {
  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div className="text-6xl">💬</div>
      <div className="text-xl font-black text-white">Fai indovinare la parola!</div>
      <div className="rounded-2xl p-5 w-full"
        style={{background:'rgba(34,211,238,0.12)',border:'1px solid rgba(34,211,238,0.35)'}}>
        <div className="text-xs font-black uppercase tracking-widest mb-2" style={{color:'rgba(34,211,238,0.8)'}}>CATEGORIA</div>
        <div className="text-base text-white/70">{String(payload.category ?? '')} — {String(payload.difficulty ?? 'medium')}</div>
        {!!payload.hint && (
          <div className="mt-2 text-sm text-white/50 italic">💡 {String(payload.hint)}</div>
        )}
      </div>
      <div className="text-base text-white/45">
        Descrivi la parola sulla schiena con gesti o parole — senza dirla!
      </div>
      {timeLeft !== null && (
        <div className="flex items-center gap-2 rounded-xl px-5 py-2"
          style={{background:'rgba(34,211,238,0.18)',border:'1px solid rgba(34,211,238,0.45)',color:'#22D3EE'}}>
          <Timer className="h-4 w-4"/>
          <span className="text-2xl font-black tabular-nums">{timeLeft}s</span>
        </div>
      )}
      <div className="text-xs text-white/35">L'animatore assegna i punti dalla TV</div>
    </div>
  );
}

// ── KaraokeController ─────────────────────────────────────────────────────────

function KaraokeController({ payload, sessionId: _sessionId }: {
  payload: Record<string,unknown>;
  sessionId: string;
}) {
  const [micActive, setMicActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micError, setMicError] = useState('');
  const micRef = useRef<MediaStream | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const startMic = useCallback(async () => {
    if (micActive) return;
    setMicError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyzer = ctx.createAnalyser();
      analyzer.fftSize = 256;
      src.connect(analyzer);
      micRef.current = stream;
      analyzerRef.current = analyzer;
      setMicActive(true);
      const buf = new Uint8Array(analyzer.frequencyBinCount);
      const tick = () => {
        analyzer.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        setMicLevel(Math.round((avg / 255) * 100));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch { setMicError('Microfono non disponibile — controlla i permessi'); }
  }, [micActive]);

  const stopMic = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    micRef.current?.getTracks().forEach(t => t.stop());
    micRef.current = null; analyzerRef.current = null;
    setMicActive(false); setMicLevel(0);
  }, []);

  useEffect(() => () => stopMic(), [stopMic]);

  const micColor = micLevel > 70 ? '#22c55e' : micLevel > 35 ? '#eab308' : '#FB923C';

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div className="text-6xl">🎤</div>
      <div className="text-xl font-black text-white">{String(payload.title ?? 'Karaoke')}</div>
      <div className="text-base font-bold" style={{color:'#FB923C'}}>— {String(payload.artist ?? '')}</div>
      {!!payload.lyricSnippet && (
        <div className="rounded-2xl p-4 w-full"
          style={{background:'rgba(251,146,60,0.12)',border:'1px solid rgba(251,146,60,0.35)'}}>
          <div className="text-sm text-white/70 italic leading-relaxed whitespace-pre-line">
            "{String(payload.lyricSnippet)}"
          </div>
        </div>
      )}

      {/* ── Microfono ── */}
      {!micActive ? (
        <button onClick={() => void startMic()}
          className="flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-black"
          style={{background:'linear-gradient(135deg,#FB923C,#ea580c)',color:'#fff',boxShadow:'0 0 30px rgba(251,146,60,0.45)'}}>
          <Mic className="h-4 w-4"/> Attiva microfono
        </button>
      ) : (
        <div className="w-full space-y-2">
          <div className="flex items-center justify-between text-xs font-bold" style={{color:'#FB923C'}}>
            <span className="flex items-center gap-1"><Mic className="h-3 w-3"/> Microfono attivo</span>
            <span className="tabular-nums">{micLevel}%</span>
          </div>
          <div className="relative h-8 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div className="absolute inset-y-0 left-0 rounded-full"
              animate={{ width: `${micLevel}%` }} transition={{ duration: 0.08 }}
              style={{ background: micColor, boxShadow: `0 0 12px ${micColor}80` }} />
            <div className="absolute inset-0 flex items-center justify-center text-xs font-black text-white">
              {micLevel > 60 ? '🔥 Dai tutto!' : micLevel > 25 ? '🎤 Bene!' : '🔇 Canta più forte!'}
            </div>
          </div>
          <button onClick={stopMic} className="text-xs text-white/30 hover:text-white/60 transition-colors mt-1">
            Disattiva mic
          </button>
        </div>
      )}
      {micError && <div className="text-xs text-red-400">{micError}</div>}

      <div className="text-2xl font-black" style={{color:'#FB923C'}}>CANTA! 🎤</div>
      <div className="text-xs text-white/35">Guarda i testi sulla TV</div>
    </div>
  );
}

// ── FreestyleController ───────────────────────────────────────────────────────

function FreestyleController({ payload, timeLeft }: { payload: Record<string,unknown>; timeLeft: number | null }) {
  const targetWord = String(payload.word ?? '').toLowerCase().trim();
  const [recognized, setRecognized] = useState(false);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) { setMicError('Il tuo browser non supporta il riconoscimento vocale'); return; }
    const r = new SR();
    r.lang = 'it-IT';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (ev: { resultIndex: number; results: { transcript: string; isFinal: boolean }[][] }) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const transcript = (ev.results[i]![0]?.transcript ?? '').toLowerCase();
        if (targetWord && transcript.includes(targetWord)) setRecognized(true);
      }
    };
    r.onend = () => { try { r.start(); } catch { setListening(false); } };
    r.onerror = (ev: { error: string }) => {
      if (ev.error !== 'aborted' && ev.error !== 'no-speech') {
        setMicError(`Errore: ${ev.error}`); setListening(false);
      }
    };
    recognitionRef.current = r;
    r.start();
    setListening(true);
  }, [targetWord]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  // Reset when word changes
  useEffect(() => { setRecognized(false); }, [targetWord]);

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div className="text-6xl">🎙️</div>
      <div className="text-xl font-black text-white">FREESTYLE RAP</div>

      {/* Word chip — illuminates when recognized */}
      <motion.div
        animate={recognized ? { scale: [1, 1.15, 1], boxShadow: ['0 0 0px #FB923C', '0 0 40px #FB923C', '0 0 20px #FB923C'] } : {}}
        transition={{ duration: 0.5 }}
        className="rounded-2xl px-6 py-4 w-full"
        style={{
          background: recognized ? 'rgba(251,146,60,0.28)' : 'rgba(251,146,60,0.12)',
          border: `2px solid ${recognized ? '#FB923C' : 'rgba(251,146,60,0.45)'}`,
          boxShadow: recognized ? '0 0 50px rgba(251,146,60,0.5)' : '0 0 30px rgba(251,146,60,0.2)',
        }}>
        <div className="text-xs font-black uppercase tracking-widest mb-2" style={{color:'rgba(251,146,60,0.8)'}}>LA PAROLA</div>
        <div className="text-4xl font-black" style={{color:'#FB923C'}}>
          {String(payload.word ?? '?')}
          {recognized && <span className="ml-2 text-green-400">✓</span>}
        </div>
        {recognized && (
          <div className="mt-1 text-xs font-bold text-green-400 animate-pulse">🎉 Parola riconosciuta!</div>
        )}
      </motion.div>

      {/* Timer */}
      {timeLeft !== null && (
        <div className="flex items-center gap-2 rounded-xl px-5 py-2"
          style={{background:'rgba(251,146,60,0.18)',border:'1px solid rgba(251,146,60,0.45)',color:'#FB923C'}}>
          <Timer className="h-4 w-4"/>
          <span className="text-2xl font-black tabular-nums">{timeLeft}s</span>
        </div>
      )}

      {/* Mic button */}
      {!listening ? (
        <button onClick={startListening}
          className="flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-black"
          style={{background:'linear-gradient(135deg,#FB923C,#ea580c)',color:'#fff',boxShadow:'0 0 24px rgba(251,146,60,0.45)'}}>
          <Mic className="h-4 w-4"/> Attiva il microfono
        </button>
      ) : (
        <motion.button onClick={stopListening}
          animate={{ scale: [1, 1.04, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}
          className="flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-black bg-red-500 text-white shadow-lg shadow-red-500/40">
          <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
          🎙️ In ascolto… (tocca per stop)
        </motion.button>
      )}
      {micError && <div className="text-xs text-red-400">{micError}</div>}

      <div className="text-sm text-white/60">Improvvisa un rap e di' la parola ad alta voce!</div>
    </div>
  );
}
