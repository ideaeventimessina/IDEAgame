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

export default function HomeJoin() {
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

  const { on, emit } = useEventSocket(null);

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
              startTimer(Number(d.session.roundPayload?.timeLimit ?? 30));
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
          startTimer(Number(d.session.roundPayload?.timeLimit ?? 30));
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
            startTimer(Number(data.session.roundPayload?.timeLimit ?? 30));
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

  // Polling fallback in playing phase — recovers from missed home:game_started / home:game_ended
  useEffect(() => {
    if (phase !== 'playing' || !session?.id) return;
    const sid = session.id;
    const knownSlug = session.gameSlug;
    const interval = setInterval(() => {
      fetch(`/api/home/sessions/${sid}`)
        .then(r => r.ok ? r.json() : null)
        .then((data: { session: HomeSession; players: HomePlayer[] } | null) => {
          if (!data) return;
          setPlayers(data.players);
          const cur = playerRef.current;
          if (cur) { const me = data.players.find(p => p.id === cur.id); if (me) setPlayer(me); }
          if (data.session.gameSlug !== knownSlug || data.session.status !== 'playing') {
            setSession(data.session);
            if (data.session.status === 'lobby') {
              setPhase('lobby');
            } else if (data.session.status === 'ended') {
              setPhase('ended');
              clearJoin();
            } else if (data.session.status === 'playing' && data.session.gameSlug !== knownSlug) {
              prevGameSlugRef.current = data.session.gameSlug;
              setAnswered(null);
              setRevealed(false);
              startTimer(Number(data.session.roundPayload?.timeLimit ?? 30));
            }
          }
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, session?.id, session?.gameSlug]);

  // Socket listeners — registered once per `on` instance.
  // Use phaseRef/playerRef (not state) to avoid re-registration on every phase change,
  // which would cause missed events during the cleanup/setup window.
  useEffect(() => {
    const u1 = on<{ session: HomeSession; players: HomePlayer[] }>('home:state', (d) => {
      setSession(d.session);
      setPlayers(d.players);
      const cur = playerRef.current;
      if (cur) { const me = d.players.find(p => p.id === cur.id); if (me) setPlayer(me); }
      if (d.session.status === 'playing') {
        if (phaseRef.current === 'lobby') {
          setPhase('playing');
          setAnswered(null);
          setRevealed(false);
          startTimer(Number(d.session.roundPayload?.timeLimit ?? 30));
        } else if (phaseRef.current === 'playing' && d.session.gameSlug !== prevGameSlugRef.current) {
          // Game changed while phone was already playing — missed home:game_ended + home:game_started
          setAnswered(null);
          setRevealed(false);
          startTimer(Number(d.session.roundPayload?.timeLimit ?? 30));
        }
        prevGameSlugRef.current = d.session.gameSlug;
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
      startTimer(Number(d.payload?.timeLimit ?? 30));
    });

    const u4 = on<{ round: number; payload: Record<string,unknown> }>('home:round', (d) => {
      setSession(prev => prev ? { ...prev, currentRound: d.round, roundPayload: d.payload } : prev);
      setAnswered(null);
      setRevealed(false);
      startTimer(Number(d.payload?.timeLimit ?? 30));
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

    return () => { u1?.(); u2?.(); u3?.(); u4?.(); u5?.(); u6?.(); u7?.(); };
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
        startTimer(Number(session.roundPayload?.timeLimit ?? 30));
      } else {
        setPhase('lobby');
      }
    } catch { setError('Errore di rete — riprova'); }
    finally { setLoading(false); }
  };

  const addScore = async (points: number) => {
    if (!session || !player) return;
    const newScore = player.score + points;
    await fetch(`/api/home/sessions/${session.id}/score`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ playerId: player.id, points: newScore }),
    });
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
                onKeyDown={e => e.key==='Enter' && nickname.trim() && joinSession()}
                placeholder="Il tuo nome..." autoFocus
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
              }}
              onFlip={flipCard}
              onScore={addScore}
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
  onAnswer, onFlip, onScore,
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
}) {
  const p = session.roundPayload;
  const mode = String(p.mode ?? 'home-quiz');

  if (mode === 'home-quiz')       return <QuizController payload={p} revealed={revealed} answered={answered} onAnswer={onAnswer}/>;
  if (mode === 'home-coppie')     return <CoppieController payload={p} onFlip={onFlip} player={player}/>;
  if (mode === 'home-percorso')   return <PercorsoHomeController payload={p} timeLeft={timeLeft}/>;
  if (mode === 'home-saramusica') return <SaraMusicaController payload={p} players={players} player={player} onScore={onScore}/>;
  if (mode === 'home-adult')      return <AdultController payload={p} timeLeft={timeLeft}/>;
  if (mode === 'home-ballo')      return <BalloController payload={p} timeLeft={timeLeft} sessionId={session.id}/>;
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

function BalloController({ payload, timeLeft, sessionId: _sessionId }: {
  payload: Record<string,unknown>;
  timeLeft: number | null;
  sessionId: string;
}) {
  const [energy, setEnergy] = useState(0);
  const [motionPerm, setMotionPerm] = useState<'unknown'|'granted'|'denied'|'unsupported'>('unknown');
  const magsRef = useRef<number[]>([]);

  useEffect(() => {
    if (typeof DeviceMotionEvent === 'undefined') { setMotionPerm('unsupported'); return; }
    const dme = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof dme.requestPermission !== 'function') setMotionPerm('granted');
  }, []);

  const requestMotion = useCallback(async () => {
    const dme = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof dme.requestPermission === 'function') {
      try { const r = await dme.requestPermission(); setMotionPerm(r === 'granted' ? 'granted' : 'denied'); }
      catch { setMotionPerm('denied'); }
    } else { setMotionPerm('granted'); }
  }, []);

  useEffect(() => {
    if (motionPerm !== 'granted') return;
    const mags = magsRef.current;
    const handleMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const mag = Math.sqrt((acc.x ?? 0) ** 2 + (acc.y ?? 0) ** 2 + (acc.z ?? 0) ** 2);
      mags.push(Math.min(100, Math.abs(mag - 9.81) * 8));
    };
    window.addEventListener('devicemotion', handleMotion);
    const interval = setInterval(() => {
      if (mags.length === 0) return;
      const avg = mags.reduce((a, b) => a + b, 0) / mags.length;
      mags.length = 0;
      setEnergy(Math.min(100, Math.round(avg)));
    }, 400);
    return () => { window.removeEventListener('devicemotion', handleMotion); clearInterval(interval); };
  }, [motionPerm]);

  const energyColor = energy > 70 ? '#22c55e' : energy > 35 ? '#eab308' : '#A78BFA';

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
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
        <div className="rounded-xl px-4 py-2 text-xs text-white/40 border border-white/10">
          Sensori negati — balla comunque! 🕺
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

function SaraMusicaController({ payload, players, player, onScore }: {
  payload: Record<string,unknown>;
  players: HomePlayer[];
  player: HomePlayer;
  onScore: (pts: number) => Promise<void>;
}) {
  const [guessed, setGuessed] = useState(false);
  const pts = Number(payload.points ?? 100);
  void players; // used for future features

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div className="text-6xl">🎵</div>
      <div className="text-xl font-black text-white">Indovina la canzone!</div>
      <div className="rounded-2xl p-4 w-full"
        style={{background:'rgba(96,165,250,0.12)',border:'1px solid rgba(96,165,250,0.35)'}}>
        <div className="text-xs font-black uppercase tracking-widest mb-2" style={{color:'rgba(96,165,250,0.8)'}}>SUGGERIMENTO</div>
        <div className="text-sm text-white/75 italic leading-relaxed">"{String(payload.snippetHint??'...')}"</div>
      </div>
      {!guessed ? (
        <button onClick={async () => {
          setGuessed(true);
          await onScore(pts);
        }}
          className="flex w-full items-center justify-center gap-3 rounded-2xl py-5 text-xl font-black text-black"
          style={{background:'linear-gradient(135deg,#60A5FA,#2563eb)',boxShadow:'0 0 40px rgba(96,165,250,0.5)'}}>
          🎵 L'ho indovinata! +{pts}pt
        </button>
      ) : (
        <div className="rounded-2xl p-4 text-center w-full"
          style={{background:'rgba(34,197,94,0.18)',border:'1px solid rgba(34,197,94,0.35)',color:'#4ade80'}}>
          ✅ +{pts} punti assegnati! ({player.score + pts}pt totali)
        </div>
      )}
    </div>
  );
}

// ── AdultController ────────────────────────────────────────────────────────────

function AdultController({ payload, timeLeft }: { payload: Record<string,unknown>; timeLeft: number | null }) {
  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div className="text-6xl">🔞</div>
      <div className="text-xl font-black text-white">{String(payload.title ?? 'Sfida Adult Only')}</div>
      <div className="rounded-2xl p-4 w-full"
        style={{background:'rgba(248,113,113,0.12)',border:'1px solid rgba(248,113,113,0.35)'}}>
        <div className="text-sm text-white/75 leading-relaxed">{String(payload.body ?? '')}</div>
      </div>
      {timeLeft !== null && (
        <div className="flex items-center gap-2 rounded-xl px-5 py-2"
          style={{background:'rgba(248,113,113,0.18)',border:'1px solid rgba(248,113,113,0.45)',color:'#F87171'}}>
          <Timer className="h-4 w-4"/>
          <span className="text-2xl font-black tabular-nums">{timeLeft}s</span>
        </div>
      )}
      <div className="text-xs text-white/35">L'animatore assegna i punti dalla TV</div>
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
