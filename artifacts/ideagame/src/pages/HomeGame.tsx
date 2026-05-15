/**
 * HomeGame — Modalità HOME (TV/Proiettore)
 *
 * Flusso:
 *   welcome → join (QR + giocatori) → board (8 giochi) → playing → board → ... → champion
 *
 * URL: /home?s=SESSION_ID
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Users, QrCode, Trophy, Timer,
  Play, SkipForward, Home, Loader2, Check, X, Music,
  Laugh, Star, Mic, ShieldAlert, Zap, MessageSquare, ChevronRight,
} from 'lucide-react';
import { QrPlaceholder } from '@/components/QrPlaceholder';
import { JonnyAvatar } from '@/components/JonnyAvatar';
import { useEventSocket } from '@/hooks/useEventSocket';
import { AudioManager } from '@/audio/AudioManager';

// ── Types ─────────────────────────────────────────────────────────────────────

interface HomeSession {
  id: string;
  joinCode: string;
  hostName: string;
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

// ── Game catalogue ─────────────────────────────────────────────────────────────

const ALL_GAMES = [
  {
    slug: 'percorso-a-risate',
    name: 'Percorso a Risate',
    icon: <Laugh className="h-7 w-7" />,
    emoji: '😂',
    color: '#34D399',
    description: 'Sfide, mimo, reazioni esilaranti di gruppo',
  },
  {
    slug: 'gioco-coppie',
    name: 'Gioco delle Coppie',
    icon: <Zap className="h-7 w-7" />,
    emoji: '💞',
    color: '#F472B6',
    description: 'Memory card: trova le coppie prima degli altri!',
  },
  {
    slug: 'quizzone',
    name: 'Quizzone',
    icon: <Star className="h-7 w-7" />,
    emoji: '⭐',
    color: '#F5B642',
    description: 'Domande e risposte — chi sa di più vince!',
  },
  {
    slug: 'saramusica',
    name: 'SaraMusica',
    icon: <Music className="h-7 w-7" />,
    emoji: '🎵',
    color: '#60A5FA',
    description: 'Indovina la canzone dal suggerimento!',
  },
  {
    slug: 'adult-only',
    name: 'Adult Only',
    icon: <ShieldAlert className="h-7 w-7" />,
    emoji: '🔞',
    color: '#F87171',
    description: 'Sfide osé per adulti coraggiosi — 18+',
  },
  {
    slug: 'sfida-ballo',
    name: 'Sfida di Ballo',
    icon: <span className="text-2xl">💃</span>,
    emoji: '💃',
    color: '#A78BFA',
    description: 'Chi ha più ritmo sale sul podio!',
  },
  {
    slug: 'parola-alle-spalle',
    name: 'Parola alle Spalle',
    icon: <MessageSquare className="h-7 w-7" />,
    emoji: '💬',
    color: '#22D3EE',
    description: 'Fai indovinare la parola sulla tua schiena!',
  },
  {
    slug: 'karaoke-battle',
    name: 'Karaoke Battle',
    icon: <Mic className="h-7 w-7" />,
    emoji: '🎤',
    color: '#FB923C',
    description: 'Canta + Freestyle rap alternati!',
  },
];

const AVATAR_RING = ['#F5B642','#FF69B4','#60A5FA','#A78BFA','#34D399','#F87171','#F472B6','#FB923C','#22D3EE','#4ADE80'];

const FREESTYLE_TRACKS = [
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3',
] as const;



// ── Socket ─────────────────────────────────────────────────────────────────────

function useHomeSocket(sessionId: string | null) {
  const { on, emit } = useEventSocket(null);
  useEffect(() => {
    if (!sessionId) return;
    emit('join:home', sessionId);
    return () => { emit('leave:home', sessionId); };
  }, [sessionId, emit]);
  return { on };
}

// ── Main ──────────────────────────────────────────────────────────────────────

type Phase = 'welcome' | 'join' | 'board' | 'playing' | 'champion';

export default function HomeGame() {
  const [, navigate] = useLocation();
  const urlParams = new URLSearchParams(window.location.search);
  const urlSessionId = urlParams.get('s');

  const [phase, setPhase] = useState<Phase>(urlSessionId ? 'join' : 'welcome');
  const [session, setSession] = useState<HomeSession | null>(null);
  const [players, setPlayers] = useState<HomePlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [selectingGame, setSelectingGame] = useState<string | null>(null);
  const [jonnyMood, setJonnyMood] = useState<'idle' | 'excited' | 'thinking' | 'winner' | 'scoreboard' | 'correct'>('excited');
  const [jonnyMsg, setJonnyMsg] = useState('Benvenuti a JONNY\'S WORLD!');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const { on } = useHomeSocket(session?.id ?? null);

  // Derived
  const gamesPlayed = useMemo<string[]>(() => {
    const cfg = session?.gameConfig ?? {};
    return (cfg.gamesPlayed as string[]) ?? [];
  }, [session]);

  const visibleGames = useMemo(() => {
    const cfg = session?.gameConfig ?? {};
    const selected = (cfg.selectedGames as string[] | undefined) ?? [];
    if (selected.length > 0) return ALL_GAMES.filter(g => selected.includes(g.slug));
    return ALL_GAMES;
  }, [session]);

  const cfgPhase = useMemo(() => {
    const cfg = session?.gameConfig ?? {};
    return (cfg.phase as string) ?? 'join';
  }, [session]);

  // ── Audio unlock ────────────────────────────────────────────────────────────
  const unlockAudio = useCallback((_src?: string) => {
    setAudioUnlocked(true);
    void AudioManager.playLoop('global', 'lobby_loop');
  }, []);

  // ── Load session from URL ────────────────────────────────────────────────────
  useEffect(() => {
    if (!urlSessionId) return;
    fetch(`/api/home/sessions/${urlSessionId}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { session: HomeSession; players: HomePlayer[] } | null) => {
        if (!data) { navigate('/home'); return; }
        setSession(data.session);
        setPlayers(data.players);
        const cfg = data.session.gameConfig ?? {};
        const p = (cfg.phase as string) ?? 'join';
        if (data.session.status === 'ended') {
          setPhase('champion');
        } else if (data.session.status === 'playing') {
          setPhase('playing');
          setRevealed(false);
        } else if (p === 'board') {
          setPhase('board');
        } else {
          setPhase('join');
        }
      })
      .catch(() => navigate('/home'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSessionId]);

  // ── Socket listeners ─────────────────────────────────────────────────────────
  useEffect(() => {
    const u1 = on<{ session: HomeSession; players: HomePlayer[] }>('home:state', (d) => {
      setSession(d.session);
      setPlayers(d.players);
    });
    const u2 = on<{ session: HomeSession; players: HomePlayer[] }>('home:board', (d) => {
      setSession(d.session);
      setPlayers(d.players);
      setPhase('board');
      setJonnyMood('excited');
      setJonnyMsg('Scegli il tuo gioco!');
    });
    const u3 = on<{ session: HomeSession; players: HomePlayer[]; payload: Record<string, unknown> }>('home:game_started', (d) => {
      setSession(d.session);
      setPlayers(d.players);
      setPhase('playing');
      setRevealed(false);
      startTimer(Number(d.payload?.timeLimit ?? 30));
      setJonnyMood('thinking');
    });
    const u4 = on<{ round: number; payload: Record<string, unknown> }>('home:round', (d) => {
      setSession(prev => prev ? { ...prev, currentRound: d.round, roundPayload: d.payload } : prev);
      setRevealed(false);
      startTimer(Number(d.payload?.timeLimit ?? 30));
      setJonnyMood('thinking');
    });
    const u5 = on<{ session: HomeSession; players: HomePlayer[]; gameSlug: string }>('home:game_ended', (d) => {
      setSession(d.session);
      setPlayers(d.players);
      setPhase('board');
      setJonnyMood('winner');
      setJonnyMsg(`${ALL_GAMES.find(g => g.slug === d.gameSlug)?.name ?? 'Gioco'} completato! 🎉`);
      AudioManager.stopLoop();
    });
    const u6 = on<{ session: HomeSession; players: HomePlayer[] }>('home:champion', (d) => {
      setSession(d.session);
      setPlayers(d.players);
      setPhase('champion');
      setJonnyMood('winner');
      void AudioManager.playStinger('global', 'podium_theme');
    });
    const u7 = on<{ payload: Record<string, unknown>; players: HomePlayer[] }>('home:card_flip', (d) => {
      setSession(prev => prev ? { ...prev, roundPayload: d.payload } : prev);
      if (d.players) setPlayers(d.players);
    });
    return () => { u1?.(); u2?.(); u3?.(); u4?.(); u5?.(); u6?.(); u7?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  // ── Polling fallback in join ──────────────────────────────────────────────────
  useEffect(() => {
    if ((phase !== 'join' && phase !== 'board') || !session?.id) return;
    const sid = session.id;
    const interval = setInterval(() => {
      fetch(`/api/home/sessions/${sid}`)
        .then(r => r.ok ? r.json() : null)
        .then((d: { session: HomeSession; players: HomePlayer[] } | null) => {
          if (!d) return;
          setPlayers(d.players);
          setSession(d.session);
          if (d.session.status === 'playing') {
            setPhase('playing');
            setRevealed(false);
            startTimer(Number(d.session.roundPayload?.timeLimit ?? 30));
          } else if (d.session.status === 'ended') {
            setPhase('champion');
          }
        })
        .catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, session?.id]);

  // ── Timer ────────────────────────────────────────────────────────────────────
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
        setJonnyMood('correct');
      }
    }, 1000);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // ── API ───────────────────────────────────────────────────────────────────────

  const createSession = async () => {
    unlockAudio();
    setLoading(true);
    try {
      const r = await fetch('/api/home/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostName: 'Casa' }),
      });
      const s: HomeSession = await r.json();
      setSession(s);
      setPhase('join');
      navigate(`/home?s=${s.id}`, { replace: true });
      setJonnyMood('excited');
      setJonnyMsg('Aspettiamo i giocatori!');
    } finally { setLoading(false); }
  };

  const goToBoard = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/home/sessions/${session.id}/ready`, { method: 'POST' });
      const d = await r.json() as { session: HomeSession; players: HomePlayer[] };
      setSession(d.session);
      setPlayers(d.players);
      setPhase('board');
      setJonnyMood('excited');
      setJonnyMsg('Scegli il gioco!');
    } finally { setLoading(false); }
  };

  const selectGame = async (slug: string) => {
    if (!session || selectingGame) return;
    setSelectingGame(slug);
    try {
      const r = await fetch(`/api/home/sessions/${session.id}/select-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameSlug: slug }),
      });
      if (!r.ok) { alert('Errore nell\'avvio del gioco'); return; }
      const d = await r.json() as { session: HomeSession; players: HomePlayer[] };
      setSession(d.session);
      setPlayers(d.players);
      setPhase('playing');
      setRevealed(false);
      startTimer(Number(d.session.roundPayload?.timeLimit ?? 30));
      setJonnyMood('thinking');
      const game = ALL_GAMES.find(g => g.slug === slug);
      setJonnyMsg(`${game?.name ?? slug} iniziato!`);
      void AudioManager.playLoop(slug, 'round_loop');
    } finally { setSelectingGame(null); }
  };

  const nextRound = async () => {
    if (!session) return;
    setLoading(true);
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      const r = await fetch(`/api/home/sessions/${session.id}/next`, { method: 'POST' });
      if (!r.ok) {
        console.warn('nextRound rejected', r.status);
        return;
      }
      const d = await r.json() as { gameEnded?: boolean; session: HomeSession; payload?: Record<string, unknown>; players?: HomePlayer[] };
      if (d.gameEnded) {
        setSession(d.session);
        if (d.players) setPlayers(d.players);
        setPhase('board');
        setJonnyMood('winner');
        AudioManager.stopLoop();
      } else {
        setSession(d.session);
        setRevealed(false);
        startTimer(Number(d.payload?.timeLimit ?? 30));
        setJonnyMood('thinking');
      }
    } finally { setLoading(false); }
  };

  const endGame = async () => {
    if (!session) return;
    setLoading(true);
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      const r = await fetch(`/api/home/sessions/${session.id}/end-game`, { method: 'POST' });
      const d = await r.json() as { session: HomeSession; players: HomePlayer[] };
      setSession(d.session);
      setPlayers(d.players);
      setPhase('board');
      setJonnyMood('winner');
      AudioManager.stopLoop();
    } finally { setLoading(false); }
  };

  const goToChampion = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/home/sessions/${session.id}/champion`, { method: 'POST' });
      const d = await r.json() as { session: HomeSession; players: HomePlayer[] };
      setSession(d.session);
      setPlayers(d.players);
      setPhase('champion');
      setJonnyMood('winner');
      void AudioManager.playStinger('global', 'podium_theme');
    } finally { setLoading(false); }
  };

  const joinUrl = session ? `${window.location.origin}/home/join?s=${session.joinCode}` : '';
  const allDone = gamesPlayed.length >= visibleGames.length;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden"
      style={{ background: 'linear-gradient(-45deg,#07061a,#1d0545,#0a1845,#1a0800,#07061a)', backgroundSize: '500% 500%', animation: 'hgAurora 18s ease infinite' }}>

      <style>{`
        @keyframes hgAurora { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes hgPulse { 0%,100%{box-shadow:0 0 24px #F5B64255,0 0 60px #F5B64218} 50%{box-shadow:0 0 48px #F5B642aa,0 0 100px #F5B64235} }
        @keyframes hgFloat { 0%,100%{transform:translateY(0px) rotate(-1deg)} 50%{transform:translateY(-14px) rotate(1deg)} }
        @keyframes hgBlink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes hgSlideUp { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
        .hg-pulse{animation:hgPulse 2.8s ease infinite}
        .hg-float{animation:hgFloat 4s ease-in-out infinite}
        .hg-blink{animation:hgBlink 1.4s ease infinite}
      `}</style>

      {/* Hex overlay */}
      <div className="pointer-events-none absolute inset-0 z-0"
        style={{ opacity:0.04, backgroundImage:`url("data:image/svg+xml,%3Csvg width='56' height='48' viewBox='0 0 56 48' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M28 2L54 16L54 44L28 58L2 44L2 16Z' fill='none' stroke='white' stroke-width='1'/%3E%3C/svg%3E")`, backgroundSize:'56px 48px' }} />

      {/* Stars */}
      <div className="pointer-events-none absolute inset-0 z-0">
        {Array.from({length:50}).map((_,i)=>{const cs=['#fff','#F5B642','#A855F7','#22D3EE','#F472B6','#34D399'];return<div key={i} className="absolute rounded-full" style={{left:`${(i*37+11)%100}%`,top:`${(i*53+7)%100}%`,width:1.5+(i%3),height:1.5+(i%3),background:cs[i%cs.length],opacity:0.10+(i%5)*0.05}}/>;})}
      </div>

      {/* Audio unlock */}
      {!audioUnlocked && (
        <button onClick={() => unlockAudio()}
          className="hg-pulse absolute bottom-5 right-5 z-50 flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-black"
          style={{background:'rgba(245,182,66,0.15)',border:'1px solid rgba(245,182,66,0.6)',color:'#F5B642',backdropFilter:'blur(10px)'}}>
          🎵 Attiva audio
        </button>
      )}

      <AnimatePresence mode="wait">

        {/* ══ WELCOME ══ */}
        {phase === 'welcome' && (
          <motion.div key="welcome" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="relative z-10 flex flex-1 flex-col items-center justify-center gap-10 px-8 text-center">
            <motion.div initial={{y:-30,opacity:0}} animate={{y:0,opacity:1}} transition={{type:'spring',stiffness:100}}>
              <img src="/jonny-world-hero.png" alt="Jonny's World"
                className="mx-auto mb-4 h-48 w-auto object-contain"
                style={{filter:'drop-shadow(0 0 40px #F5B64250) drop-shadow(0 0 80px rgba(168,85,247,0.3))'}} />
              <div className="mt-3 text-base font-black tracking-[0.4em] uppercase" style={{color:'#A855F7',textShadow:'0 0 24px #A855F770'}}>
                Modalità Home — 8 Giochi
              </div>
            </motion.div>
            <div className="flex items-end gap-8">
              <div className="hg-float">
                <img src="/jonny-master-nobg.png" alt="Jonny" className="h-52 w-auto object-contain"
                  style={{filter:'drop-shadow(0 0 50px #F5B64255) drop-shadow(0 24px 40px rgba(0,0,0,0.7))'}} />
              </div>
              <motion.div initial={{x:30,opacity:0}} animate={{x:0,opacity:1}} transition={{delay:0.3}}
                className="mb-10 max-w-xs rounded-3xl p-5 text-left"
                style={{background:'linear-gradient(135deg,rgba(168,85,247,0.22),rgba(245,182,66,0.08))',border:'1px solid rgba(168,85,247,0.45)',backdropFilter:'blur(14px)'}}>
                <div className="text-xs font-black tracking-widest" style={{color:'#F5B642'}}>JONNY DICE:</div>
                <div className="mt-2 text-base leading-relaxed text-white/90">"{jonnyMsg}"</div>
              </motion.div>
            </div>
            <motion.button whileHover={{scale:1.07}} whileTap={{scale:0.94}}
              onClick={createSession} disabled={loading}
              className="hg-pulse flex items-center gap-4 rounded-3xl px-14 py-6 text-2xl font-black text-black disabled:opacity-60"
              style={{background:'linear-gradient(135deg,#F5B642,#FF8C00)',boxShadow:'0 0 70px #F5B64265,0 10px 32px rgba(0,0,0,0.5)'}}>
              {loading ? <Loader2 className="h-7 w-7 animate-spin"/> : <Sparkles className="h-7 w-7"/>}
              Gioca con Jonny
            </motion.button>
            <button onClick={() => navigate('/')}
              className="flex items-center gap-2 text-sm text-white/30 hover:text-white/60">
              <Home className="h-4 w-4"/> Torna all'Hub
            </button>
          </motion.div>
        )}

        {/* ══ JOIN (QR + players) ══ */}
        {phase === 'join' && session && (
          <motion.div key="join" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="relative z-10 flex flex-1 flex-col items-center gap-6 px-8 pt-8">

            {/* Header */}
            <div className="flex w-full max-w-5xl items-center justify-between">
              <div className="flex items-center gap-4">
                <img src="/jonny-master-nobg.png" alt="Jonny" className="h-14 w-auto object-contain"
                  style={{filter:'drop-shadow(0 0 24px #F5B64250)'}}/>
                <div>
                  <img src="/jonny-world-hero.png" alt="Jonny's World" className="h-10 w-auto object-contain"
                    style={{filter:'drop-shadow(0 0 16px #F5B64250)'}}/>
                  <div className="text-sm font-semibold" style={{color:'#A855F7'}}>Sala d'Attesa — scansiona per unirti</div>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl px-5 py-3"
                style={{background:'rgba(245,182,66,0.15)',border:'1px solid rgba(245,182,66,0.45)'}}>
                <Users className="h-5 w-5 text-yellow-400"/>
                <span className="text-3xl font-black text-yellow-400">{players.length}</span>
                <span className="text-sm text-white/50">giocatori</span>
              </div>
            </div>

            <div className="flex w-full max-w-5xl flex-1 items-start gap-8 overflow-hidden">
              {/* QR */}
              <div className="hg-pulse flex flex-col items-center rounded-3xl p-7"
                style={{background:'rgba(8,6,24,0.75)',border:'2px solid rgba(245,182,66,0.45)',backdropFilter:'blur(18px)'}}>
                <div className="mb-3 text-xs font-black uppercase tracking-widest" style={{color:'rgba(245,182,66,0.8)'}}>Scansiona per unirti</div>
                <div className="rounded-2xl bg-white p-3">
                  <QrPlaceholder text={joinUrl} size={180}/>
                </div>
                <div className="mt-4 flex items-center gap-3 rounded-xl px-4 py-2"
                  style={{background:'rgba(245,182,66,0.12)',border:'1px solid rgba(245,182,66,0.35)'}}>
                  <QrCode className="h-4 w-4" style={{color:'rgba(245,182,66,0.8)'}}/>
                  <span className="text-xs font-black tracking-widest" style={{color:'rgba(245,182,66,0.8)'}}>
                    {window.location.origin}/home/join?s=<span style={{color:'#F5B642'}}>{session.joinCode}</span>
                  </span>
                </div>
                <div className="mt-3 rounded-2xl px-6 py-2 text-center text-2xl font-black tracking-widest"
                  style={{background:'linear-gradient(135deg,#F5B642,#FF8C00)',color:'#000'}}>
                  {session.joinCode}
                </div>
              </div>

              {/* Players + Jonny */}
              <div className="flex flex-1 flex-col gap-5">
                <div className="grid grid-cols-3 gap-3 overflow-y-auto" style={{maxHeight:'340px'}}>
                  {players.map((p,i) => (
                    <motion.div key={p.id}
                      initial={{scale:0,opacity:0}} animate={{scale:1,opacity:1}} transition={{type:'spring',stiffness:200}}
                      className="flex items-center gap-3 rounded-2xl px-4 py-3"
                      style={{background:`linear-gradient(135deg,${AVATAR_RING[i%AVATAR_RING.length]}22,transparent)`,border:`1px solid ${AVATAR_RING[i%AVATAR_RING.length]}45`}}>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black text-black"
                        style={{background:`linear-gradient(135deg,${AVATAR_RING[i%AVATAR_RING.length]},${AVATAR_RING[(i+1)%AVATAR_RING.length]})`}}>
                        {p.nickname.slice(0,2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-black text-white">{p.nickname}</div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="flex items-center gap-5">
                  <div className="hg-float">
                    <JonnyAvatar mood={jonnyMood} size={90}/>
                  </div>
                  <div className="rounded-2xl p-4"
                    style={{background:'rgba(168,85,247,0.15)',border:'1px solid rgba(168,85,247,0.4)',backdropFilter:'blur(10px)'}}>
                    <div className="text-xs font-black" style={{color:'#F5B642'}}>JONNY</div>
                    <div className="mt-1 text-sm text-white/80">"{jonnyMsg}"</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4 pb-6">
              {players.length >= 1 && (
                <motion.button whileHover={{scale:1.05}} whileTap={{scale:0.96}}
                  onClick={goToBoard} disabled={loading}
                  className="flex items-center gap-3 rounded-2xl px-10 py-5 text-lg font-black text-black"
                  style={{background:'linear-gradient(135deg,#F5B642,#FF8C00)',boxShadow:'0 0 55px #F5B64255'}}>
                  {loading ? <Loader2 className="h-6 w-6 animate-spin"/> : <Play className="h-6 w-6"/>}
                  Tutti pronti! Iniziamo ({players.length} giocator{players.length===1?'e':'i'})
                </motion.button>
              )}
              <button onClick={() => navigate('/')}
                className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-5 text-sm text-white/35 hover:text-white/60">
                <X className="h-4 w-4"/> Esci
              </button>
            </div>
          </motion.div>
        )}

        {/* ══ BOARD (8 giochi) ══ */}
        {phase === 'board' && session && (
          <motion.div key="board" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="relative z-10 flex flex-1 flex-col overflow-hidden">

            {/* Top bar */}
            <div className="flex items-center justify-between px-6 py-3 shrink-0"
              style={{background:'rgba(0,0,0,0.6)',backdropFilter:'blur(18px)',borderBottom:'1px solid rgba(245,182,66,0.12)'}}>
              <div className="flex items-center gap-4">
                <img src="/jonny-master-nobg.png" alt="Jonny" className="h-12 w-auto object-contain"
                  style={{filter:'drop-shadow(0 0 18px #F5B64265)'}}/>
                <div>
                  <img src="/jonny-world-hero.png" alt="Jonny's World" className="h-7 w-auto object-contain"
                    style={{filter:'drop-shadow(0 0 10px #F5B64255)'}}/>
                  <div className="text-[11px] font-bold tracking-widest uppercase"
                    style={{color:'rgba(168,85,247,0.75)'}}>
                    Modalità Home · {gamesPlayed.length}/{visibleGames.length} completati
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <JonnyAvatar mood={jonnyMood} size={36}/>
                <div className="max-w-[220px] text-sm italic text-white/45">"{jonnyMsg}"</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-xl px-3 py-1.5 text-sm font-black"
                  style={{background:'rgba(245,182,66,0.15)',border:'1px solid rgba(245,182,66,0.35)',color:'#F5B642'}}>
                  <Users className="inline h-4 w-4 mr-1"/>{players.length}
                </div>
                {allDone && (
                  <motion.button onClick={goToChampion} disabled={loading}
                    whileHover={{scale:1.05}} whileTap={{scale:0.97}}
                    className="flex items-center gap-2 rounded-2xl px-5 py-2 text-sm font-black text-black"
                    style={{background:'linear-gradient(135deg,#F5B642,#FF8C00)',boxShadow:'0 0 30px #F5B64255'}}>
                    <Trophy className="h-4 w-4"/> Classifica Finale
                  </motion.button>
                )}
              </div>
            </div>

            {/* Jonny message banner */}
            {jonnyMsg !== 'Scegli il gioco!' && (
              <motion.div initial={{y:-40,opacity:0}} animate={{y:0,opacity:1}} exit={{y:-40,opacity:0}}
                className="mx-4 mt-3 flex items-center gap-3 rounded-2xl px-5 py-3 shrink-0"
                style={{background:'linear-gradient(135deg,rgba(245,182,66,0.18),rgba(168,85,247,0.1))',border:'1px solid rgba(245,182,66,0.35)'}}>
                <span className="text-2xl">🎉</span>
                <span className="font-black text-white">{jonnyMsg}</span>
              </motion.div>
            )}

            {/* Score bar */}
            {players.length > 0 && (
              <div className="mx-4 mt-2 flex gap-2 overflow-x-auto shrink-0">
                {[...players].sort((a,b)=>b.score-a.score).map((p,i)=>(
                  <div key={p.id} className="flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5"
                    style={{background:`${AVATAR_RING[i%AVATAR_RING.length]}22`,border:`1px solid ${AVATAR_RING[i%AVATAR_RING.length]}45`}}>
                    <span className="text-xs">{i===0?'🥇':i===1?'🥈':i===2?'🥉':'·'}</span>
                    <span className="text-xs font-black text-white">{p.nickname}</span>
                    <span className="text-xs font-black" style={{color:'#F5B642'}}>{p.score}pt</span>
                  </div>
                ))}
              </div>
            )}

            {/* 8 game tiles — ottagonali */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="grid grid-cols-4 gap-3 max-w-5xl mx-auto">
                {visibleGames.map(g => {
                  const done = gamesPlayed.includes(g.slug);
                  const isLoading = selectingGame === g.slug;
                  return (
                    <div key={g.slug} style={{filter: done ? 'none' : `drop-shadow(0 0 22px ${g.color}50)`}}>
                      <motion.button
                        whileHover={done ? {} : {scale:1.06}}
                        whileTap={done ? {} : {scale:0.95}}
                        onClick={() => !done && !selectingGame && selectGame(g.slug)}
                        disabled={done || !!selectingGame}
                        className="relative w-full flex flex-col items-center justify-center gap-2 transition-all"
                        style={{
                          clipPath:'polygon(30% 0%,70% 0%,100% 30%,100% 70%,70% 100%,30% 100%,0% 70%,0% 30%)',
                          aspectRatio:'1/1',
                          ...(done
                            ? {background:'rgba(255,255,255,0.04)',opacity:0.5}
                            : {background:`linear-gradient(145deg,${g.color}28,${g.color}10)`}),
                        }}>

                        {/* Done overlay */}
                        {done && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1"
                            style={{background:'rgba(0,0,0,0.45)'}}>
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500">
                              <Check className="h-5 w-5 text-white"/>
                            </div>
                            <span className="text-[10px] font-black text-green-400">Fatto</span>
                          </div>
                        )}

                        {/* Loading overlay */}
                        {isLoading && (
                          <div className="absolute inset-0 flex items-center justify-center"
                            style={{background:'rgba(0,0,0,0.65)'}}>
                            <Loader2 className="h-7 w-7 animate-spin" style={{color:g.color}}/>
                          </div>
                        )}

                        {!done && !isLoading && (
                          <>
                            <div className="text-4xl leading-none">{g.emoji}</div>
                            <div className="text-display text-xs font-black leading-tight text-center px-4"
                              style={{color:g.color,textShadow:`0 0 16px ${g.color}80`}}>
                              {g.name}
                            </div>
                          </>
                        )}
                      </motion.button>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* ══ PLAYING ══ */}
        {phase === 'playing' && session && (
          <motion.div key="playing" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="relative z-10 flex flex-1 flex-col">

            {/* Top bar */}
            <div className="flex items-center justify-between px-6 py-3"
              style={{background:'rgba(0,0,0,0.5)',backdropFilter:'blur(14px)',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
              <div className="flex items-center gap-3">
                <JonnyAvatar mood={jonnyMood} size={40}/>
                <div>
                  <div className="text-xs uppercase tracking-widest text-white/30">
                    {ALL_GAMES.find(g=>g.slug===session.gameSlug)?.name ?? session.gameSlug}
                  </div>
                  <div className="text-xl font-black text-white">
                    {session.currentRound+1}<span className="text-lg text-white/30"> / {session.totalRounds}</span>
                  </div>
                </div>
              </div>

              {/* Timer */}
              <div className="rounded-2xl px-7 py-2 text-center transition-all"
                style={timeLeft!==null&&timeLeft<=5
                  ? {background:'rgba(239,68,68,0.22)',border:'2px solid rgba(239,68,68,0.65)',boxShadow:'0 0 35px rgba(239,68,68,0.35)'}
                  : {background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.14)'}}>
                <div className="flex items-center gap-2">
                  <Timer className="h-4 w-4" style={{color:timeLeft!==null&&timeLeft<=5?'#F87171':'rgba(255,255,255,0.4)'}}/>
                  <div className="text-4xl font-black tabular-nums"
                    style={{color:timeLeft!==null&&timeLeft<=5?'#F87171':'#fff'}}>
                    {timeLeft ?? '—'}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={nextRound} disabled={loading}
                  className="flex items-center gap-2 rounded-2xl px-5 py-2 text-sm font-bold disabled:opacity-40"
                  style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.14)',color:'rgba(255,255,255,0.65)'}}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <SkipForward className="h-4 w-4"/>} Avanti
                </button>
                <button onClick={endGame} disabled={loading}
                  className="flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-bold disabled:opacity-40"
                  style={{background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.35)',color:'rgba(239,68,68,0.7)'}}>
                  <X className="h-4 w-4"/> Fine gioco
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex flex-1 items-center justify-center overflow-auto px-6 py-3">
              <RoundBoard key={session.currentRound} session={session} revealed={revealed}
                onReveal={() => { setRevealed(true); if(timerRef.current) clearInterval(timerRef.current); setJonnyMood('correct'); }}
                onNext={nextRound} players={players} onScore={async (pid,pts) => {
                  await fetch(`/api/home/sessions/${session.id}/score`, {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({ playerId:pid, points:pts }),
                  });
                  setPlayers(prev => prev.map(p => p.id===pid ? {...p,score:pts} : p));
                }}/>
            </div>

            {/* Score bar */}
            <div className="flex shrink-0 items-center gap-3 overflow-x-auto px-6 py-3"
              style={{background:'rgba(0,0,0,0.55)',backdropFilter:'blur(14px)',borderTop:'1px solid rgba(255,255,255,0.06)'}}>
              {[...players].sort((a,b)=>b.score-a.score).map((p,i)=>(
                <div key={p.id} className="flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2"
                  style={{background:`linear-gradient(135deg,${AVATAR_RING[i%AVATAR_RING.length]}22,transparent)`,border:`1px solid ${AVATAR_RING[i%AVATAR_RING.length]}45`}}>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black text-black"
                    style={{background:`linear-gradient(135deg,${AVATAR_RING[i%AVATAR_RING.length]},${AVATAR_RING[(i+1)%AVATAR_RING.length]})`}}>
                    {p.nickname.slice(0,2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-black text-white">{p.nickname}</div>
                    <div className="text-xs font-black" style={{color:'#F5B642'}}>{p.score}pt</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ══ CHAMPION ══ */}
        {phase === 'champion' && (
          <motion.div key="champion" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 px-8 text-center">

            <motion.div initial={{scale:0,rotate:-20}} animate={{scale:1,rotate:0}}
              transition={{type:'spring',stiffness:180}}>
              <img src="/jonny-world-hero.png" alt="" className="mx-auto mb-2 h-36 w-auto object-contain"
                style={{filter:'drop-shadow(0 0 60px #F5B64285)'}}/>
            </motion.div>

            <div>
              <h2 className="text-display text-7xl font-black"
                style={{background:'linear-gradient(135deg,#fff,#F5B642)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',filter:'drop-shadow(0 0 40px #F5B64270)'}}>
                Champion!
              </h2>
              <div className="mt-2 text-xl text-white/45">🏆 Classifica Suprema di JONNY'S WORLD 🏆</div>
            </div>

            <div className="flex w-full max-w-xl flex-col gap-3">
              {[...players].sort((a,b)=>b.score-a.score).map((p,i)=>{
                const BG=['linear-gradient(135deg,#F5B642,#FF8C00)','linear-gradient(135deg,#94A3B8,#64748B)','linear-gradient(135deg,#CD7F32,#8B4513)'];
                const GLOW=['rgba(245,182,66,0.35)','rgba(148,163,184,0.22)','rgba(205,127,50,0.22)'];
                const MEDALS=['🥇','🥈','🥉'];
                return (
                  <motion.div key={p.id}
                    initial={{x:-80,opacity:0}} animate={{x:0,opacity:1}}
                    transition={{delay:i*0.13,type:'spring',stiffness:120}}
                    className="flex items-center gap-4 rounded-2xl px-5 py-4"
                    style={i<3?{background:BG[i],boxShadow:`0 0 40px ${GLOW[i]}`}:{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)'}}>
                    <div className="text-4xl w-12 text-center">{MEDALS[i]??`#${i+1}`}</div>
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-lg font-black"
                      style={i<3?{background:'rgba(0,0,0,0.25)',color:'#fff'}:{background:AVATAR_RING[i%AVATAR_RING.length],color:'#000'}}>
                      {p.nickname.slice(0,2).toUpperCase()}
                    </div>
                    <div className="flex-1 text-left">
                      <div className={`text-xl font-black ${i===0?'text-black':'text-white'}`}>{p.nickname}</div>
                    </div>
                    <div className={`text-3xl font-black ${i===0?'text-black':'text-yellow-400'}`}>{p.score} pt</div>
                  </motion.div>
                );
              })}
            </div>

            {/* Games summary */}
            <div className="flex gap-2 flex-wrap justify-center">
              {ALL_GAMES.map(g => (
                <div key={g.slug} className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black"
                  style={gamesPlayed.includes(g.slug)
                    ? {background:`${g.color}25`,border:`1px solid ${g.color}55`,color:g.color}
                    : {background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'rgba(255,255,255,0.3)'}}>
                  {gamesPlayed.includes(g.slug) && <Check className="h-3 w-3"/>}
                  {g.emoji} {g.name}
                </div>
              ))}
            </div>

            <div className="flex gap-4">
              <motion.button whileHover={{scale:1.05}} whileTap={{scale:0.96}}
                onClick={createSession} disabled={loading}
                className="flex items-center gap-3 rounded-2xl px-8 py-4 font-black text-black"
                style={{background:'linear-gradient(135deg,#F5B642,#FF8C00)',boxShadow:'0 0 45px #F5B64255'}}>
                <Sparkles className="h-5 w-5"/> Nuova Serata
              </motion.button>
              <button onClick={() => navigate('/')}
                className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-sm text-white/35 hover:text-white/60">
                <Home className="h-4 w-4"/> Hub
              </button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

// ── RoundBoard ─────────────────────────────────────────────────────────────────

function RoundBoard({ session, revealed, onReveal, onNext, players, onScore }: {
  session: HomeSession;
  revealed: boolean;
  onReveal: () => void;
  onNext?: () => void;
  players: HomePlayer[];
  onScore: (playerId: string, points: number) => Promise<void>;
}) {
  const p = session.roundPayload;
  const mode = String(p.mode ?? 'home-quiz');

  if (mode === 'home-quiz')       return <QuizBoard payload={p} revealed={revealed} onReveal={onReveal}/>;
  if (mode === 'home-ballo')      return <BalloBoard payload={p} onReveal={onReveal} players={players} onScore={onScore}/>;
  if (mode === 'home-percorso')   return <PercorsoBoard payload={p} onReveal={onReveal} players={players} onScore={onScore}/>;
  if (mode === 'home-coppie')     return <CoppieBoard payload={p} onNext={onNext}/>;
  if (mode === 'home-saramusica') return <SaraMusicaBoard payload={p} revealed={revealed} onReveal={onReveal}/>;
  if (mode === 'home-adult')      return <AdultOnlyBoard payload={p} revealed={revealed} onReveal={onReveal} players={players} onScore={onScore}/>;
  if (mode === 'home-wordback')   return <WordBackBoard payload={p} players={players} onScore={onScore} onReveal={onReveal}/>;
  if (mode === 'home-karaoke')    return <KaraokeBoard payload={p} onReveal={onReveal} players={players} onScore={onScore}/>;
  if (mode === 'home-freestyle')  return <FreestyleBoard payload={p} onReveal={onReveal} players={players} onScore={onScore}/>;
  return <div className="text-white/40 text-2xl">Caricamento gioco…</div>;
}

// ── QuizBoard ─────────────────────────────────────────────────────────────────

function QuizBoard({ payload, revealed, onReveal }: { payload: Record<string,unknown>; revealed: boolean; onReveal: () => void }) {
  const answers = (payload.answers as string[]) ?? [];
  const correct = Number(payload.correctIndex ?? 0);
  const points = Number(payload.points ?? 200);
  const LETTERS = ['A','B','C','D'];
  const ANS_COLORS = ['#3B82F6','#EC4899','#EAB308','#10B981'];
  const ANS_GLOW   = ['rgba(59,130,246,0.55)','rgba(236,72,153,0.55)','rgba(234,179,8,0.55)','rgba(16,185,129,0.55)'];

  return (
    <div className="flex w-full max-w-3xl flex-col gap-5">
      <motion.div key={String(payload.roundIndex)} initial={{y:24,opacity:0}} animate={{y:0,opacity:1}}
        className="rounded-3xl p-8 text-center"
        style={{background:'linear-gradient(135deg,rgba(168,85,247,0.22),rgba(245,182,66,0.08))',border:'1px solid rgba(168,85,247,0.45)',backdropFilter:'blur(14px)'}}>
        <div className="mb-2 text-xs font-black uppercase tracking-widest" style={{color:'rgba(245,182,66,0.8)'}}>
          {String(payload.category ?? 'Quiz')}
        </div>
        <div className="text-display text-2xl font-black leading-snug text-white">{String(payload.question ?? '')}</div>
        <div className="mt-4">
          <span className="rounded-full px-4 py-1.5 text-sm font-black"
            style={{background:'rgba(245,182,66,0.18)',color:'#F5B642',border:'1px solid rgba(245,182,66,0.4)'}}>
            {points} punti
          </span>
        </div>
      </motion.div>
      <div className="grid grid-cols-2 gap-4">
        {answers.map((ans,i) => {
          const isCorrect = i===correct;
          let bg: string, border: string, shadow: string, textCol: string;
          if (revealed) {
            if (isCorrect) { bg='linear-gradient(135deg,#22c55e,#16a34a)'; border='2px solid #4ade80'; shadow='0 0 45px rgba(34,197,94,0.55)'; textCol='#fff'; }
            else { bg='rgba(255,255,255,0.04)'; border='2px solid rgba(255,255,255,0.08)'; shadow='none'; textCol='rgba(255,255,255,0.3)'; }
          } else {
            bg=`linear-gradient(135deg,${ANS_COLORS[i]},${ANS_COLORS[i]}cc)`;
            border=`2px solid ${ANS_COLORS[i]}`; shadow=`0 0 35px ${ANS_GLOW[i]}`; textCol='#fff';
          }
          return (
            <motion.div key={i} initial={{scale:0.88,opacity:0}} animate={{scale:1,opacity:1}} transition={{delay:i*0.07}}
              className="flex items-center gap-4 rounded-2xl px-6 py-5 text-left"
              style={{background:bg,border,boxShadow:shadow}}>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-black"
                style={{background:'rgba(0,0,0,0.3)',color:revealed&&isCorrect?'#4ade80':textCol}}>
                {LETTERS[i]}
              </div>
              <div className="flex-1 text-base font-black leading-snug" style={{color:textCol}}>{ans}</div>
              {revealed && isCorrect && <Check className="h-6 w-6 shrink-0 text-white"/>}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ── BalloBoard ────────────────────────────────────────────────────────────────

function BalloBoard({ payload, onReveal, players, onScore }: {
  payload: Record<string,unknown>;
  onReveal: () => void;
  players: HomePlayer[];
  onScore: (pid: string, pts: number) => Promise<void>;
}) {
  const [awarded, setAwarded] = useState<string|null>(null);
  const pts = Number(payload.points ?? 150);
  return (
    <motion.div key={String(payload.roundIndex)} initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}}
      className="flex w-full max-w-2xl flex-col items-center gap-7 text-center">
      <div className="flex h-28 w-28 items-center justify-center rounded-3xl text-7xl"
        style={{background:'linear-gradient(135deg,rgba(167,139,250,0.35),rgba(167,139,250,0.15))',border:'2px solid rgba(167,139,250,0.55)',boxShadow:'0 0 60px rgba(167,139,250,0.4)'}}>
        💃
      </div>
      <div className="text-display text-5xl font-black text-white" style={{textShadow:'0 0 30px rgba(167,139,250,0.5)'}}>
        {String(payload.name ?? 'Sfida di Ballo')}
      </div>
      <div className="max-w-lg text-xl text-white/65">{String(payload.description ?? '')}</div>
      {!!payload.musicHint && (
        <div className="flex items-center gap-3 rounded-2xl px-6 py-3"
          style={{background:'rgba(167,139,250,0.18)',border:'1px solid rgba(167,139,250,0.45)',color:'#c084fc'}}>
          <Music className="h-5 w-5"/>
          <span className="text-base font-black">🎵 {String(payload.musicHint)}</span>
        </div>
      )}
      <div className="text-6xl font-black" style={{color:'#A78BFA',textShadow:'0 0 30px rgba(167,139,250,0.6)'}}>
        {Number(payload.duration ?? 60)}s
      </div>
      <div className="text-base text-white/50">Chi ha ballato meglio? Assegna i punti ({pts}pt):</div>
      <div className="flex flex-wrap justify-center gap-3">
        {players.map(p => (
          <button key={p.id} disabled={!!awarded}
            onClick={async () => { setAwarded(p.id); await onScore(p.id, p.score + pts); onReveal(); }}
            className="rounded-2xl px-5 py-3 text-sm font-black transition-all disabled:opacity-50"
            style={awarded===p.id
              ? {background:'linear-gradient(135deg,#A78BFA,#7c3aed)',color:'#fff',boxShadow:'0 0 30px rgba(167,139,250,0.6)'}
              : {background:`linear-gradient(135deg,${p.avatarColor},${p.avatarColor}cc)`,color:'#000'}}>
            {p.nickname} {awarded===p.id && '✓'}
          </button>
        ))}
        <button disabled={!!awarded} onClick={() => onReveal()}
          className="rounded-2xl px-5 py-3 text-sm font-black transition-all"
          style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.14)',color:'rgba(255,255,255,0.5)'}}>
          Nessuno
        </button>
      </div>
    </motion.div>
  );
}

// ── PercorsoBoard ─────────────────────────────────────────────────────────────

function PercorsoBoard({ payload, onReveal, players, onScore }: {
  payload: Record<string,unknown>;
  onReveal: () => void;
  players: HomePlayer[];
  onScore: (pid: string, pts: number) => Promise<void>;
}) {
  const [awarded, setAwarded] = useState<string|null>(null);
  const pts = Number(payload.points ?? 150);
  const TYPE_ICONS: Record<string,string> = { sfida:'⚡',domanda:'❓',mimo:'🎭',ballo:'💃',veloce:'🏃',coppia:'👫',reazione:'😱',fantasia:'🌟' };
  const icon = TYPE_ICONS[String(payload.challengeType??'sfida')]??'⚡';
  return (
    <motion.div key={String(payload.roundIndex)} initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}}
      className="flex w-full max-w-2xl flex-col items-center gap-7 text-center">
      <div className="flex h-28 w-28 items-center justify-center rounded-3xl text-7xl"
        style={{background:'linear-gradient(135deg,rgba(52,211,153,0.35),rgba(52,211,153,0.15))',border:'2px solid rgba(52,211,153,0.55)',boxShadow:'0 0 60px rgba(52,211,153,0.4)'}}>
        {icon}
      </div>
      <div className="text-display text-5xl font-black text-white" style={{textShadow:'0 0 30px rgba(52,211,153,0.5)'}}>
        {String(payload.title??'Sfida')}
      </div>
      <div className="max-w-lg text-lg text-white/65 leading-relaxed">{String(payload.description??'')}</div>
      <div className="flex items-center gap-6">
        <div className="rounded-2xl px-5 py-2" style={{background:'rgba(52,211,153,0.18)',border:'1px solid rgba(52,211,153,0.45)',color:'#34D399'}}>
          <span className="text-xl font-black">{pts} pt</span>
        </div>
        <div className="rounded-2xl px-5 py-2" style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.14)',color:'rgba(255,255,255,0.6)'}}>
          <Timer className="inline h-4 w-4 mr-1"/><span className="text-xl font-black">{Number(payload.timeLimit??60)}s</span>
        </div>
      </div>
      <div className="text-base text-white/50">Chi ha superato la sfida? Assegna i punti ({pts}pt):</div>
      <div className="flex flex-wrap justify-center gap-3">
        {players.map(p => (
          <button key={p.id} disabled={!!awarded}
            onClick={async () => { setAwarded(p.id); await onScore(p.id, p.score + pts); onReveal(); }}
            className="rounded-2xl px-5 py-3 text-sm font-black transition-all disabled:opacity-50"
            style={awarded===p.id
              ? {background:'linear-gradient(135deg,#34D399,#059669)',color:'#fff',boxShadow:'0 0 30px rgba(52,211,153,0.6)'}
              : {background:`linear-gradient(135deg,${p.avatarColor},${p.avatarColor}cc)`,color:'#000'}}>
            {p.nickname} {awarded===p.id && '✓'}
          </button>
        ))}
        <button disabled={!!awarded} onClick={() => onReveal()}
          className="rounded-2xl px-5 py-3 text-sm font-black transition-all"
          style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.14)',color:'rgba(255,255,255,0.5)'}}>
          Nessuno
        </button>
      </div>
    </motion.div>
  );
}

// ── AudioPlayer (shared) ──────────────────────────────────────────────────────

function AudioPlayer({ src, label = 'Riproduci', color = '#60A5FA' }: { src: string | null; label?: string; color?: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { return () => { audioRef.current?.pause(); }; }, []);

  useEffect(() => {
    if (audioRef.current) { audioRef.current.pause(); setPlaying(false); }
  }, [src]);

  if (!src) return (
    <div className="flex items-center gap-2 rounded-xl px-5 py-2.5"
      style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.12)'}}>
      <span className="text-sm text-white/35">🔇 Nessun file audio — aggiorna URL in /admin/sara-musica</span>
    </div>
  );

  const toggle = async () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(src);
      audioRef.current.loop = true;
      audioRef.current.onended = () => setPlaying(false);
    }
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else {
      setLoading(true);
      try { await audioRef.current.play(); setPlaying(true); } catch { /* autoplay blocked */ }
      finally { setLoading(false); }
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <motion.button onClick={toggle} whileHover={{scale:1.05}} whileTap={{scale:0.95}}
        className="flex items-center gap-3 rounded-2xl px-8 py-4 text-lg font-black text-white"
        style={{background:`linear-gradient(135deg,${color}cc,${color}77)`,boxShadow:`0 0 40px ${color}66`}}>
        {loading ? <Loader2 className="h-6 w-6 animate-spin"/> : playing ? '⏸ Pausa' : `▶ ${label}`}
      </motion.button>
      {playing && (
        <div className="flex items-center gap-1.5">
          {[1,2,3,4,5].map(i => (
            <motion.div key={i} className="w-1.5 rounded-full"
              style={{background:color,height:24}}
              animate={{scaleY:[0.2,1,0.2]}}
              transition={{duration:0.7,repeat:Infinity,delay:i*0.11}}/>
          ))}
        </div>
      )}
    </div>
  );
}

// ── SaraMusicaBoard ───────────────────────────────────────────────────────────

function SaraMusicaBoard({ payload, revealed, onReveal }: { payload: Record<string,unknown>; revealed: boolean; onReveal: () => void }) {
  const audioUrl = payload.audioUrl ? String(payload.audioUrl) : null;
  return (
    <motion.div key={String(payload.roundIndex)} initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}}
      className="flex w-full max-w-2xl flex-col items-center gap-7 text-center">
      <div className="flex h-28 w-28 items-center justify-center rounded-3xl text-7xl"
        style={{background:'linear-gradient(135deg,rgba(96,165,250,0.35),rgba(96,165,250,0.15))',border:'2px solid rgba(96,165,250,0.55)',boxShadow:'0 0 60px rgba(96,165,250,0.4)'}}>
        🎵
      </div>
      {!revealed ? (
        <>
          <div className="text-display text-4xl font-black text-white">Indovina la Canzone!</div>
          <AudioPlayer src={audioUrl} label="Riproduci canzone" color="#60A5FA"/>
          <div className="max-w-lg rounded-3xl p-6"
            style={{background:'rgba(96,165,250,0.12)',border:'1px solid rgba(96,165,250,0.4)'}}>
            <div className="text-xs font-black uppercase tracking-widest mb-2" style={{color:'rgba(96,165,250,0.8)'}}>SUGGERIMENTO</div>
            <div className="text-lg text-white/80 italic leading-relaxed">"{String(payload.snippetHint??'...')}"</div>
          </div>
          <button onClick={onReveal} className="flex items-center gap-3 rounded-2xl px-10 py-5 text-xl font-black text-white"
            style={{background:'linear-gradient(135deg,#60A5FA,#2563eb)',boxShadow:'0 0 50px rgba(96,165,250,0.55)'}}>
            🎵 Rivela canzone
          </button>
        </>
      ) : (
        <>
          <div className="text-display text-5xl font-black text-white">{String(payload.title??'?')}</div>
          <div className="text-2xl font-bold" style={{color:'#60A5FA'}}>— {String(payload.artist??'')}</div>
          <AudioPlayer src={audioUrl} label="Riproduci ancora" color="#60A5FA"/>
          <div className="rounded-2xl px-5 py-2" style={{background:'rgba(96,165,250,0.18)',border:'1px solid rgba(96,165,250,0.45)',color:'#60A5FA'}}>
            <span className="text-xl font-black">{Number(payload.points??100)} punti a chi l'ha indovinata!</span>
          </div>
        </>
      )}
    </motion.div>
  );
}

// ── AdultOnlyBoard ────────────────────────────────────────────────────────────

function AdultOnlyBoard({ payload, revealed, onReveal, players, onScore }: {
  payload: Record<string,unknown>;
  revealed: boolean;
  onReveal: () => void;
  players: HomePlayer[];
  onScore: (pid: string, pts: number) => Promise<void>;
}) {
  const [awarded, setAwarded] = useState<string|null>(null);
  const pts = Number(payload.points ?? 150);
  return (
    <motion.div key={String(payload.roundIndex)} initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}}
      className="flex w-full max-w-2xl flex-col items-center gap-7 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-3xl text-6xl"
        style={{background:'linear-gradient(135deg,rgba(248,113,113,0.35),rgba(248,113,113,0.15))',border:'2px solid rgba(248,113,113,0.55)',boxShadow:'0 0 60px rgba(248,113,113,0.4)'}}>
        🔞
      </div>
      <div className="text-display text-4xl font-black text-white">{String(payload.title??'Sfida Adult Only')}</div>
      <div className="max-w-xl rounded-3xl p-6"
        style={{background:'rgba(248,113,113,0.12)',border:'1px solid rgba(248,113,113,0.4)'}}>
        <div className="text-lg text-white/80 leading-relaxed">{String(payload.body??'')}</div>
      </div>
      <div className="flex items-center gap-4">
        <div className="rounded-2xl px-4 py-2" style={{background:'rgba(248,113,113,0.18)',color:'#F87171',border:'1px solid rgba(248,113,113,0.45)'}}>
          <span className="font-black">{pts} pt</span>
        </div>
        <div className="rounded-2xl px-4 py-2" style={{background:'rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.6)',border:'1px solid rgba(255,255,255,0.14)'}}>
          <Timer className="inline h-4 w-4 mr-1"/><span className="font-black">{Number(payload.timeLimit??90)}s</span>
        </div>
      </div>
      {!revealed ? (
        <button onClick={onReveal} className="flex items-center gap-3 rounded-2xl px-10 py-5 text-xl font-black text-white"
          style={{background:'linear-gradient(135deg,#F87171,#dc2626)',boxShadow:'0 0 50px rgba(248,113,113,0.55)'}}>
          <Check className="h-6 w-6"/> Sfida completata!
        </button>
      ) : (
        <>
          <div className="text-base text-white/50">Chi l'ha completata? Assegna i punti ({pts}pt):</div>
          <div className="flex flex-wrap justify-center gap-3">
            {players.map(p => (
              <button key={p.id} disabled={!!awarded}
                onClick={async () => { setAwarded(p.id); await onScore(p.id, p.score + pts); }}
                className="rounded-2xl px-5 py-3 text-sm font-black transition-all disabled:opacity-50"
                style={awarded===p.id
                  ? {background:'linear-gradient(135deg,#F87171,#dc2626)',color:'#fff',boxShadow:'0 0 30px rgba(248,113,113,0.6)'}
                  : {background:`linear-gradient(135deg,${p.avatarColor},${p.avatarColor}cc)`,color:'#000'}}>
                {p.nickname} {awarded===p.id && '✓'}
              </button>
            ))}
            <button disabled={!!awarded} onClick={() => {}}
              className="rounded-2xl px-5 py-3 text-sm font-black transition-all"
              style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.14)',color:'rgba(255,255,255,0.5)'}}>
              Nessuno
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}

// ── WordBackBoard ─────────────────────────────────────────────────────────────

function WordBackBoard({ payload, players, onScore, onReveal }: {
  payload: Record<string,unknown>;
  players: HomePlayer[];
  onScore: (pid: string, pts: number) => Promise<void>;
  onReveal: () => void;
}) {
  const [awarded, setAwarded] = useState<string|null>(null);
  const pts = Number(payload.points??150);

  return (
    <motion.div key={String(payload.roundIndex)} initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}}
      className="flex w-full max-w-2xl flex-col items-center gap-7 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-3xl text-6xl"
        style={{background:'linear-gradient(135deg,rgba(34,211,238,0.35),rgba(34,211,238,0.15))',border:'2px solid rgba(34,211,238,0.55)',boxShadow:'0 0 60px rgba(34,211,238,0.4)'}}>
        💬
      </div>
      <div className="rounded-3xl px-8 py-6"
        style={{background:'linear-gradient(135deg,rgba(34,211,238,0.2),rgba(34,211,238,0.08))',border:'2px solid rgba(34,211,238,0.55)',boxShadow:'0 0 50px rgba(34,211,238,0.3)'}}>
        <div className="text-xs font-black uppercase tracking-widest mb-2" style={{color:'rgba(34,211,238,0.8)'}}>La parola sulla schiena</div>
        <div className="text-display text-6xl font-black" style={{color:'#22D3EE',textShadow:'0 0 40px rgba(34,211,238,0.6)'}}>
          {String(payload.word??'?')}
        </div>
        {!!payload.hint && (
          <div className="mt-3 text-base text-white/55 italic">💡 {String(payload.hint)}</div>
        )}
      </div>
      <div className="text-base text-white/50">Chi l'ha indovinata? Assegna i punti:</div>
      <div className="flex flex-wrap justify-center gap-3">
        {players.map(p => (
          <button key={p.id} disabled={!!awarded}
            onClick={async () => {
              setAwarded(p.id);
              await onScore(p.id, p.score + pts);
              onReveal();
            }}
            className="rounded-2xl px-5 py-3 text-sm font-black text-black transition-all disabled:opacity-50"
            style={awarded===p.id
              ? {background:'linear-gradient(135deg,#22D3EE,#0891b2)',boxShadow:'0 0 30px rgba(34,211,238,0.6)'}
              : {background:`linear-gradient(135deg,${p.avatarColor},${p.avatarColor}cc)`}}>
            {p.nickname} {awarded===p.id && '✓'}
          </button>
        ))}
        <button disabled={!!awarded} onClick={() => { onReveal(); }}
          className="rounded-2xl px-5 py-3 text-sm font-black transition-all"
          style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.14)',color:'rgba(255,255,255,0.5)'}}>
          Nessuno
        </button>
      </div>
    </motion.div>
  );
}

// ── KaraokeBoard ──────────────────────────────────────────────────────────────

function KaraokeBoard({ payload, onReveal, players, onScore }: {
  payload: Record<string,unknown>;
  onReveal: () => void;
  players: HomePlayer[];
  onScore: (pid: string, pts: number) => Promise<void>;
}) {
  const [awarded, setAwarded] = useState<string|null>(null);
  const pts = Number(payload.points ?? 150);
  return (
    <motion.div key={String(payload.roundIndex)} initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}}
      className="flex w-full max-w-2xl flex-col items-center gap-7 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-3xl text-6xl"
        style={{background:'linear-gradient(135deg,rgba(251,146,60,0.35),rgba(251,146,60,0.15))',border:'2px solid rgba(251,146,60,0.55)',boxShadow:'0 0 60px rgba(251,146,60,0.4)'}}>
        🎤
      </div>
      <div className="text-display text-5xl font-black text-white">{String(payload.title??'Karaoke')}</div>
      <div className="text-2xl font-bold" style={{color:'#FB923C'}}>— {String(payload.artist??'')}</div>
      {!!payload.lyricSnippet && (
        <div className="max-w-xl rounded-3xl p-6"
          style={{background:'rgba(251,146,60,0.12)',border:'1px solid rgba(251,146,60,0.4)'}}>
          <div className="text-xs font-black uppercase tracking-widest mb-3" style={{color:'rgba(251,146,60,0.8)'}}>TESTO</div>
          <div className="text-lg text-white/80 italic leading-relaxed whitespace-pre-line">
            "{String(payload.lyricSnippet)}"
          </div>
        </div>
      )}
      <div className="text-base text-white/50">Chi ha cantato meglio? Assegna i punti ({pts}pt):</div>
      <div className="flex flex-wrap justify-center gap-3">
        {players.map(p => (
          <button key={p.id} disabled={!!awarded}
            onClick={async () => { setAwarded(p.id); await onScore(p.id, p.score + pts); onReveal(); }}
            className="rounded-2xl px-5 py-3 text-sm font-black transition-all disabled:opacity-50"
            style={awarded===p.id
              ? {background:'linear-gradient(135deg,#FB923C,#ea580c)',color:'#fff',boxShadow:'0 0 30px rgba(251,146,60,0.6)'}
              : {background:`linear-gradient(135deg,${p.avatarColor},${p.avatarColor}cc)`,color:'#000'}}>
            {p.nickname} {awarded===p.id && '✓'}
          </button>
        ))}
        <button disabled={!!awarded} onClick={() => onReveal()}
          className="rounded-2xl px-5 py-3 text-sm font-black transition-all"
          style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.14)',color:'rgba(255,255,255,0.5)'}}>
          Nessuno
        </button>
      </div>
    </motion.div>
  );
}

// ── FreestyleBoard ────────────────────────────────────────────────────────────

function FreestyleBoard({ payload, onReveal, players, onScore }: {
  payload: Record<string,unknown>;
  onReveal: () => void;
  players: HomePlayer[];
  onScore: (pid: string, pts: number) => Promise<void>;
}) {
  const [awarded, setAwarded] = useState<string|null>(null);
  const pts = Number(payload.points ?? 200);
  const trackIdx = Number(payload.roundIndex ?? 0) % FREESTYLE_TRACKS.length;
  const trackUrl = FREESTYLE_TRACKS[trackIdx] ?? FREESTYLE_TRACKS[0];
  return (
    <motion.div key={String(payload.roundIndex)} initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}}
      className="flex w-full max-w-2xl flex-col items-center gap-7 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-3xl text-6xl"
        style={{background:'linear-gradient(135deg,rgba(251,146,60,0.35),rgba(251,146,60,0.15))',border:'2px solid rgba(251,146,60,0.55)',boxShadow:'0 0 60px rgba(251,146,60,0.4)'}}>
        🎙️
      </div>
      <div className="text-xs font-black uppercase tracking-widest" style={{color:'rgba(251,146,60,0.8)'}}>FREESTYLE RAP</div>
      <div className="rounded-3xl px-10 py-6"
        style={{background:'linear-gradient(135deg,rgba(251,146,60,0.2),rgba(251,146,60,0.08))',border:'2px solid rgba(251,146,60,0.55)',boxShadow:'0 0 60px rgba(251,146,60,0.4)'}}>
        <div className="text-display text-7xl font-black" style={{color:'#FB923C',textShadow:'0 0 50px rgba(251,146,60,0.7)'}}>
          {String(payload.word??'Improvvisa!')}
        </div>
      </div>
      <div className="text-lg text-white/55">Improvvisa un freestyle su questa parola — {Number(payload.timeLimit??30)} secondi!</div>
      <AudioPlayer src={trackUrl} label="Avvia base musicale" color="#FB923C"/>
      <div className="text-base text-white/50">Chi ha rappato meglio? Assegna i punti ({pts}pt):</div>
      <div className="flex flex-wrap justify-center gap-3">
        {players.map(p => (
          <button key={p.id} disabled={!!awarded}
            onClick={async () => { setAwarded(p.id); await onScore(p.id, p.score + pts); onReveal(); }}
            className="rounded-2xl px-5 py-3 text-sm font-black transition-all disabled:opacity-50"
            style={awarded===p.id
              ? {background:'linear-gradient(135deg,#FB923C,#ea580c)',color:'#fff',boxShadow:'0 0 30px rgba(251,146,60,0.6)'}
              : {background:`linear-gradient(135deg,${p.avatarColor},${p.avatarColor}cc)`,color:'#000'}}>
            {p.nickname} {awarded===p.id && '✓'}
          </button>
        ))}
        <button disabled={!!awarded} onClick={() => onReveal()}
          className="rounded-2xl px-5 py-3 text-sm font-black transition-all"
          style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.14)',color:'rgba(255,255,255,0.5)'}}>
          Nessuno
        </button>
      </div>
    </motion.div>
  );
}

// ── CoppieBoard ───────────────────────────────────────────────────────────────

interface CoppieCard { id: string; text: string; imageUrl?: string; pairId: number; flipped: boolean; matched: boolean; }

function CoppieBoard({ payload, onNext }: { payload: Record<string,unknown>; onNext?: () => void }) {
  const cards = (payload.cards as CoppieCard[]) ?? [];
  const matched = Number(payload.matchedPairs ?? 0);
  const total = Number(payload.totalPairs ?? 0);
  const cols = Math.min(Math.ceil(Math.sqrt(cards.length)), 6);

  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-5">
      <div className="flex items-center gap-4">
        <div className="text-display text-3xl font-black" style={{color:'#F472B6'}}>
          {String(payload.category ?? 'Coppie')}
        </div>
        <div className="rounded-full px-5 py-1.5 text-base font-black"
          style={{background:'rgba(244,114,182,0.18)',color:'#F472B6',border:'1px solid rgba(244,114,182,0.45)'}}>
          {matched}/{total} coppie
        </div>
      </div>
      <div className={`grid gap-3`} style={{gridTemplateColumns:`repeat(${cols}, minmax(0, 1fr))`,width:'100%'}}>
        {cards.map(card => (
          <div key={card.id}
            className="relative flex min-h-16 items-center justify-center rounded-2xl text-sm font-black"
            style={card.matched
              ? {background:'linear-gradient(135deg,#22c55e,#16a34a)',border:'2px solid #4ade80',boxShadow:'0 0 20px rgba(34,197,94,0.4)',color:'#fff'}
              : card.flipped
              ? {background:'linear-gradient(135deg,#F472B6,#ec4899)',border:'2px solid #F472B6',boxShadow:'0 0 25px rgba(244,114,182,0.5)',color:'#fff'}
              : {background:'rgba(255,255,255,0.05)',border:'2px solid rgba(244,114,182,0.3)',color:'rgba(255,255,255,0.5)'}}>
            {card.matched ? (
              card.imageUrl
                ? <img src={card.imageUrl} alt={card.text} className="h-16 w-16 rounded-xl object-cover"/>
                : <span className="px-2 text-center text-sm font-black">{card.text}</span>
            ) : card.flipped ? (
              card.imageUrl
                ? <img src={card.imageUrl} alt={card.text} className="h-16 w-16 rounded-xl object-cover"/>
                : <span className="px-2 text-center text-sm font-black">{card.text}</span>
            ) : (
              card.imageUrl
                ? <img src={card.imageUrl} alt="" className="h-16 w-16 rounded-xl object-cover"
                    style={{filter:'blur(8px)',opacity:0.15}}/>
                : <span className="text-2xl text-white/25">?</span>
            )}
          </div>
        ))}
      </div>
      {matched >= total && total > 0 && (
        <motion.button initial={{scale:0}} animate={{scale:1}} transition={{type:'spring'}}
          onClick={onNext}
          className="flex items-center gap-3 rounded-2xl px-10 py-5 text-xl font-black text-black"
          style={{background:'linear-gradient(135deg,#F5B642,#FF8C00)',boxShadow:'0 0 50px #F5B64255'}}>
          <Trophy className="h-6 w-6"/> Tutte le coppie! Avanti
        </motion.button>
      )}
    </div>
  );
}
