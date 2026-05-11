/**
 * HomeGame — modalità HOME (Trivial Pursuit-style)
 *
 * Schermata TV: selezione gioco → selezione categoria → board di gioco con timer
 * Giocatori si connettono via QR con il telefono.
 *
 * URL: /home?s=SESSION_ID (dopo creazione sessione)
 *      /home (se non c'è sessione → schermata di avvio)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Users, QrCode, ChevronRight, Trophy, Timer,
  Play, SkipForward, Home, Loader2, Check, X, Star, Zap, Music, Laugh
} from 'lucide-react';
import { QrPlaceholder } from '@/components/QrPlaceholder';
import { JonnyAvatar } from '@/components/JonnyAvatar';
import { useEventSocket } from '@/hooks/useEventSocket';

// ── Types ────────────────────────────────────────────────────────────────────

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
  scores: Record<string, number>;
}

interface HomePlayer {
  id: string;
  nickname: string;
  avatarColor: string;
  score: number;
  isConnected: boolean;
}

interface GameOption {
  slug: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  description: string;
  categories: string[];
}

// ── Game catalogue ────────────────────────────────────────────────────────────

const GAMES: GameOption[] = [
  {
    slug: 'quizzone',
    name: 'Quizzone',
    icon: <Star className="h-8 w-8" />,
    color: '#F5B642',
    description: 'Domande e risposte su vari temi — come Trivial Pursuit!',
    categories: ['Cultura Generale', 'Sport', 'Cinema & TV', 'Musica', 'Storia', 'Scienza', 'Cucina Italiana', 'Anni 80/90', 'Natura', 'Geografia'],
  },
  {
    slug: 'sfida-ballo',
    name: 'Sfida di Ballo',
    icon: <Music className="h-8 w-8" />,
    color: '#A78BFA',
    description: 'Sfide di ballo con musica — chi ha più energia vince!',
    categories: ['Freestyle', 'Anni 80', 'Latin', 'Hip Hop', 'Pop Italiano', 'Disco', 'Bollywood', 'TikTok Hits'],
  },
  {
    slug: 'percorso-a-risate',
    name: 'Percorso a Risate',
    icon: <Laugh className="h-8 w-8" />,
    color: '#34D399',
    description: 'Sfide di gruppo esilaranti: mimo, reazioni, domande assurde!',
    categories: ['Mix Classico', 'Solo Mimo', 'Domande Folli', 'Sfide Fisiche', 'Solo Reazioni', 'Tema Serata'],
  },
  {
    slug: 'gioco-coppie',
    name: 'Gioco delle Coppie',
    icon: <Zap className="h-8 w-8" />,
    color: '#F472B6',
    description: 'Memory card — trova le coppie prima degli altri!',
    categories: ['Animali', 'Paesi del Mondo', 'Film', 'Cibo', 'Sport', 'Personaggi Famosi'],
  },
];

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Facile', sub: 'Per tutti — domande semplici' },
  { value: 'medium', label: 'Medio', sub: 'Un po\' di sfida' },
  { value: 'hard', label: 'Difficile', sub: 'Solo per esperti!' },
  { value: 'mixed', label: 'Misto', sub: 'Cresce con il gioco' },
];

const ROUND_OPTIONS = [5, 8, 10, 15, 20];

const AVATAR_RING = ['#F5B642','#FF69B4','#60A5FA','#A78BFA','#34D399','#F87171','#F472B6','#FB923C','#22D3EE','#4ADE80'];

// ── Audio ─────────────────────────────────────────────────────────────────────

const GAME_AUDIO: Record<string, string> = {
  'quizzone':          '/audio/jonny-world/quizzone/round_loop.mp3',
  'sfida-ballo':       '/audio/jonny-world/sfida-ballo/round_loop.mp3',
  'percorso-a-risate': '/audio/jonny-world/percorso-a-risate/round_loop.mp3',
  'gioco-coppie':      '/audio/jonny-world/gioco-coppie/tension_loop.mp3',
};

function useBgAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = useCallback((src: string, loop = true, volume = 0.35) => {
    const current = audioRef.current;
    if (current && !current.paused && current.getAttribute('data-src') === src) return;
    if (current) { current.pause(); current.currentTime = 0; }
    const a = new Audio(src);
    a.loop = loop;
    a.volume = volume;
    a.setAttribute('data-src', src);
    audioRef.current = a;
    a.play().catch(() => {});
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
  }, []);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  return { play, stop };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function useHomeSocket(sessionId: string | null) {
  const { on, emit } = useEventSocket(null);

  useEffect(() => {
    if (!sessionId) return;
    const socket = (window as unknown as { _ideagameSocket?: { emit: (e: string, d: unknown) => void } })._ideagameSocket;
    void socket;
    emit('join:home', sessionId);
    return () => { emit('leave:home', sessionId); };
  }, [sessionId, emit]);

  return { on };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HomeGame() {
  const [, navigate] = useLocation();
  const urlParams = new URLSearchParams(window.location.search);
  const urlSessionId = urlParams.get('s');

  const [phase, setPhase] = useState<'welcome' | 'lobby' | 'select-game' | 'select-category' | 'select-difficulty' | 'select-rounds' | 'playing' | 'ended'>(
    urlSessionId ? 'lobby' : 'welcome'
  );
  const [session, setSession] = useState<HomeSession | null>(null);
  const [players, setPlayers] = useState<HomePlayer[]>([]);
  const [selectedGame, setSelectedGame] = useState<GameOption | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('mixed');
  const [selectedRounds, setSelectedRounds] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [jonnyMood, setJonnyMood] = useState<'idle' | 'excited' | 'thinking' | 'winner' | 'scoreboard' | 'correct'>('excited');
  const [jonnyMsg, setJonnyMsg] = useState('Benvenuti a IDEAgame Home!');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { play: playBg } = useBgAudio();

  const { on } = useHomeSocket(session?.id ?? null);
  const { on: socketOn } = useEventSocket(null);

  // ── Audio unlock state ────────────────────────────────────────────────────
  // PlayStation and many mobile browsers block Audio.play() until a real
  // user gesture. We show a visible button overlay so the user can tap it.
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const unlockAudio = useCallback((src = '/audio/jonny-world/global/lobby_loop.mp3') => {
    setAudioUnlocked(true);
    playBg(src);
  }, [playBg]);

  // ── Load session if URL has ?s= ───────────────────────────────────────────
  useEffect(() => {
    if (!urlSessionId) return;
    fetch(`/api/home/sessions/${urlSessionId}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { session: HomeSession; players: HomePlayer[] } | null) => {
        if (!data) { navigate('/home'); return; }
        setSession(data.session);
        setPlayers(data.players);
        if (data.session.status === 'playing') {
          setPhase('playing');
          setRevealed(false);
          startTimer(Number(data.session.roundPayload?.timeLimit ?? 15));
        } else if (data.session.status === 'ended') {
          setPhase('ended');
        } else {
          setPhase('lobby');
        }
      })
      .catch(() => navigate('/home'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSessionId]);

  // ── Socket listeners ───────────────────────────────────────────────────────
  useEffect(() => {
    const u1 = on<{ session: HomeSession; players: HomePlayer[] }>('home:state', (data) => {
      setSession(data.session);
      setPlayers(data.players);
    });
    const u2 = on<{ round: number; payload: Record<string, unknown> }>('home:round', (data) => {
      setSession(prev => prev ? { ...prev, currentRound: data.round, roundPayload: data.payload } : prev);
      setRevealed(false);
      startTimer(Number(data.payload?.timeLimit ?? 15));
      setJonnyMood('thinking');
    });
    const u3 = on<{ session: HomeSession; players: HomePlayer[] }>('home:ended', (data) => {
      setSession(data.session);
      setPlayers(data.players);
      setPhase('ended');
      setJonnyMood('winner');
      setJonnyMsg('Che partita! 🏆');
    });
    const u4 = on<{ payload: Record<string, unknown>; players: HomePlayer[] }>('home:card_flip', (data) => {
      setSession(prev => prev ? { ...prev, roundPayload: data.payload } : prev);
      if (data.players) setPlayers(data.players);
    });
    return () => { u1?.(); u2?.(); u3?.(); u4?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  // Also listen via socketOn for cross-component events
  useEffect(() => {
    const u = socketOn<{ session: HomeSession; players: HomePlayer[] }>('home:state', (data) => {
      setPlayers(data.players);
    });
    return () => { u?.(); };
  }, [socketOn]);

  // ── Timer ──────────────────────────────────────────────────────────────────
  const startTimer = useCallback((seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(seconds);
    setTimerRunning(true);
    let t = seconds;
    timerRef.current = setInterval(() => {
      t -= 1;
      setTimeLeft(t);
      if (t <= 0) {
        clearInterval(timerRef.current!);
        setTimerRunning(false);
        setRevealed(true);
        setJonnyMood('correct');
      }
    }, 1000);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // ── Polling fallback in lobby: refresh player list every 4s ───────────────
  // Socket is the primary path; this ensures TV stays accurate even if
  // the WebSocket drops (transport close) between player joins.
  useEffect(() => {
    if (phase !== 'lobby' || !session?.id) return;
    const sid = session.id;
    const interval = setInterval(() => {
      fetch(`/api/home/sessions/${sid}`)
        .then(r => r.ok ? r.json() : null)
        .then((data: { session: HomeSession; players: HomePlayer[] } | null) => {
          if (data) setPlayers(data.players);
        })
        .catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  }, [phase, session?.id]);

  // ── API helpers ────────────────────────────────────────────────────────────
  const createSession = async () => {
    unlockAudio(); // first user gesture — unlock audio
    setLoading(true);
    try {
      const r = await fetch('/api/home/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostName: 'Casa' }),
      });
      const s: HomeSession = await r.json();
      setSession(s);
      setPhase('lobby');
      navigate(`/home?s=${s.id}`, { replace: true });
      setJonnyMood('excited');
      setJonnyMsg('Aspettiamo i giocatori!');
    } finally {
      setLoading(false);
    }
  };

  const startGame = async () => {
    if (!session || !selectedGame) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/home/sessions/${session.id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameSlug: selectedGame.slug,
          gameConfig: { category: selectedCategory, difficulty: selectedDifficulty },
          totalRounds: selectedRounds,
        }),
      });
      const updated: HomeSession = await r.json();
      setSession(updated);
      setPhase('playing');
      setRevealed(false);
      startTimer(Number(updated.roundPayload?.timeLimit ?? 15));
      setJonnyMood('thinking');
      const gameSrc = GAME_AUDIO[selectedGame.slug] ?? '/audio/jonny-world/global/round_loop.mp3';
      unlockAudio(gameSrc);
    } finally {
      setLoading(false);
    }
  };

  const nextRound = async () => {
    if (!session) return;
    setLoading(true);
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerRunning(false);
    try {
      const r = await fetch(`/api/home/sessions/${session.id}/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await r.json() as { ended: boolean; session: HomeSession; payload?: Record<string, unknown> };
      if (data.ended) {
        setSession(data.session);
        setPhase('ended');
        setJonnyMood('winner');
        unlockAudio('/audio/jonny-world/global/podium_theme.mp3');
      } else {
        setSession(data.session);
        setRevealed(false);
        startTimer(Number(data.payload?.timeLimit ?? 15));
        setJonnyMood('thinking');
      }
    } finally {
      setLoading(false);
    }
  };

  const joinUrl = session ? `${window.location.origin}/home/join?s=${session.joinCode}` : '';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden"
      style={{ background: 'linear-gradient(-45deg,#07061a,#1d0545,#0a1845,#1a0800,#07061a)', backgroundSize: '500% 500%', animation: 'hgAurora 18s ease infinite' }}>

      {/* CSS keyframes injected once */}
      <style>{`
        @keyframes hgAurora {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes hgPulseGold {
          0%,100% { box-shadow: 0 0 24px #F5B64255, 0 0 60px #F5B64218; }
          50%     { box-shadow: 0 0 48px #F5B642aa, 0 0 100px #F5B64235; }
        }
        @keyframes hgFloat {
          0%,100% { transform: translateY(0px) rotate(-1deg); }
          50%     { transform: translateY(-14px) rotate(1deg); }
        }
        @keyframes hgBlink {
          0%,100% { opacity:1; }
          50%     { opacity:0.3; }
        }
        .hg-pulse-gold { animation: hgPulseGold 2.8s ease infinite; }
        .hg-float      { animation: hgFloat 4s ease-in-out infinite; }
        .hg-blink      { animation: hgBlink 1.4s ease infinite; }
      `}</style>

      {/* Hex grid overlay */}
      <div className="pointer-events-none absolute inset-0 z-0"
        style={{ opacity: 0.045, backgroundImage: `url("data:image/svg+xml,%3Csvg width='56' height='48' viewBox='0 0 56 48' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M28 2L54 16L54 44L28 58L2 44L2 16Z' fill='none' stroke='white' stroke-width='1'/%3E%3C/svg%3E")`, backgroundSize: '56px 48px' }} />

      {/* Coloured starfield */}
      <div className="pointer-events-none absolute inset-0 z-0">
        {Array.from({ length: 55 }).map((_, i) => {
          const cs = ['#ffffff','#F5B642','#A855F7','#22D3EE','#F472B6','#34D399'];
          return <div key={i} className="absolute rounded-full"
            style={{ left:`${(i*37+11)%100}%`, top:`${(i*53+7)%100}%`, width:1.5+(i%3), height:1.5+(i%3), background:cs[i%cs.length], opacity:0.10+(i%5)*0.05 }} />;
        })}
      </div>

      {/* Audio unlock CTA */}
      {!audioUnlocked && (
        <button onClick={() => unlockAudio()}
          className="hg-pulse-gold absolute bottom-5 right-5 z-50 flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-black"
          style={{ background:'rgba(245,182,66,0.15)', border:'1px solid rgba(245,182,66,0.6)', color:'#F5B642', backdropFilter:'blur(10px)' }}>
          🎵 Attiva audio
        </button>
      )}

      <AnimatePresence mode="wait">

        {/* ══ WELCOME ══ */}
        {phase === 'welcome' && (
          <motion.div key="welcome" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="relative z-10 flex flex-1 flex-col items-center justify-center gap-10 px-8 text-center">

            <motion.div initial={{ y:-30, opacity:0 }} animate={{ y:0, opacity:1 }} transition={{ type:'spring', stiffness:100 }}>
              <h1 className="text-display font-black leading-none"
                style={{ fontSize:'clamp(4rem,9vw,8rem)', background:'linear-gradient(135deg,#ffffff 0%,#F5B642 50%,#ffffff 100%)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', filter:'drop-shadow(0 0 40px #F5B64250)' }}>
                Jonny's World
              </h1>
              <div className="mt-3 text-base font-black tracking-[0.4em] uppercase"
                style={{ color:'#A855F7', textShadow:'0 0 24px #A855F770' }}>
                Modalità Home
              </div>
            </motion.div>

            <div className="flex items-end gap-8">
              <div className="hg-float">
                <img src="/jonny-master-nobg.png" alt="Jonny" className="h-60 w-auto object-contain"
                  style={{ filter:'drop-shadow(0 0 50px #F5B64255) drop-shadow(0 24px 40px rgba(0,0,0,0.7))' }} />
              </div>
              <motion.div initial={{ x:30, opacity:0 }} animate={{ x:0, opacity:1 }} transition={{ delay:0.3 }}
                className="mb-10 max-w-xs rounded-3xl p-5 text-left"
                style={{ background:'linear-gradient(135deg,rgba(168,85,247,0.22),rgba(245,182,66,0.08))', border:'1px solid rgba(168,85,247,0.45)', backdropFilter:'blur(14px)' }}>
                <div className="text-xs font-black tracking-widest" style={{ color:'#F5B642' }}>JONNY DICE:</div>
                <div className="mt-2 text-base leading-relaxed text-white/90">"{jonnyMsg}"</div>
              </motion.div>
            </div>

            <motion.button whileHover={{ scale:1.07 }} whileTap={{ scale:0.94 }}
              onClick={createSession} disabled={loading}
              className="hg-pulse-gold flex items-center gap-4 rounded-3xl px-14 py-6 text-2xl font-black text-black disabled:opacity-60"
              style={{ background:'linear-gradient(135deg,#F5B642,#FF8C00)', boxShadow:'0 0 70px #F5B64265, 0 10px 32px rgba(0,0,0,0.5)' }}>
              {loading ? <Loader2 className="h-7 w-7 animate-spin" /> : <Sparkles className="h-7 w-7" />}
              Gioca con Jonny
            </motion.button>

            <div className="flex items-center gap-4">
              <button onClick={() => navigate('/')}
                className="flex items-center gap-2 text-sm text-white/30 transition-colors hover:text-white/60">
                <Home className="h-4 w-4" /> Torna all'Hub
              </button>
              <span className="text-white/15">·</span>
              <img src="/logo.png" alt="IDEA Games" className="h-5 w-auto object-contain opacity-25" />
            </div>
          </motion.div>
        )}

        {/* ══ LOBBY ══ */}
        {phase === 'lobby' && session && (
          <motion.div key="lobby" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="relative z-10 flex flex-1 flex-col items-center gap-6 px-8 pt-8">

            <div className="flex w-full max-w-5xl items-center justify-between">
              <div className="flex items-center gap-4">
                <img src="/jonny-master-nobg.png" alt="Jonny" className="h-14 w-auto object-contain"
                  style={{ filter:'drop-shadow(0 0 24px #F5B64250)' }} />
                <div>
                  <div className="text-display text-3xl font-black"
                    style={{ background:'linear-gradient(135deg,#fff,#F5B642)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
                    Jonny's World
                  </div>
                  <div className="text-sm font-semibold" style={{ color:'#A855F7' }}>Sala d'Attesa — scansiona per unirti</div>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl px-5 py-3"
                style={{ background:'linear-gradient(135deg,rgba(245,182,66,0.18),rgba(245,182,66,0.06))', border:'1px solid rgba(245,182,66,0.45)', boxShadow:'0 0 24px rgba(245,182,66,0.18)' }}>
                <Users className="h-5 w-5 text-yellow-400" />
                <span className="text-3xl font-black text-yellow-400">{players.length}</span>
                <span className="text-sm text-white/50">giocatori</span>
              </div>
            </div>

            <div className="flex w-full max-w-5xl flex-1 items-start gap-8 overflow-hidden">

              {/* QR panel */}
              <div className="hg-pulse-gold flex flex-col items-center rounded-3xl p-8"
                style={{ background:'rgba(8,6,24,0.75)', border:'2px solid rgba(245,182,66,0.45)', backdropFilter:'blur(18px)' }}>
                <div className="mb-3 text-xs font-black uppercase tracking-widest" style={{ color:'rgba(245,182,66,0.8)' }}>Scansiona per unirti</div>
                <div className="rounded-2xl bg-white p-2.5 shadow-2xl">
                  <QrPlaceholder text={joinUrl} size={185} />
                </div>
                <div className="mt-5 text-center">
                  <div className="text-xs text-white/35">Codice sessione</div>
                  <div className="mt-1 font-mono text-4xl font-black tracking-widest text-yellow-400">{session.joinCode}</div>
                </div>
                <div className="mt-4 rounded-2xl px-4 py-3 text-center text-xs"
                  style={{ background:'rgba(168,85,247,0.18)', border:'1px solid rgba(168,85,247,0.35)', color:'rgba(255,255,255,0.55)' }}>
                  Vai su:<br />
                  <span className="font-black" style={{ color:'#A855F7' }}>{window.location.origin}/home/join</span>
                </div>
              </div>

              {/* Players */}
              <div className="flex-1 overflow-y-auto">
                <div className="mb-4 text-xs font-black uppercase tracking-widest text-white/25">Giocatori connessi</div>
                {players.length === 0 ? (
                  <div className="flex flex-col items-center gap-4 py-16 text-white/20">
                    <QrCode className="h-16 w-16" />
                    <div className="text-lg">Nessuno ancora — aspettiamo!</div>
                    <div className="hg-blink h-2.5 w-2.5 rounded-full bg-yellow-400" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {players.map((p, i) => (
                      <div key={p.id} className="flex items-center gap-3 rounded-2xl p-4"
                        style={{ background:`linear-gradient(135deg,${AVATAR_RING[i%AVATAR_RING.length]}22,transparent)`, border:`1px solid ${AVATAR_RING[i%AVATAR_RING.length]}45` }}>
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-black text-black"
                          style={{ background:`linear-gradient(135deg,${AVATAR_RING[i%AVATAR_RING.length]},${AVATAR_RING[(i+1)%AVATAR_RING.length]})`, boxShadow:`0 0 18px ${AVATAR_RING[i%AVATAR_RING.length]}55` }}>
                          {p.nickname.slice(0,2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-black text-white">{p.nickname}</div>
                          <div className="text-xs text-white/35">✓ Pronto</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-4 pb-6">
              {players.length >= 1 && (
                <motion.button whileHover={{ scale:1.05 }} whileTap={{ scale:0.96 }}
                  onClick={() => setPhase('select-game')}
                  className="flex items-center gap-3 rounded-2xl px-10 py-5 text-lg font-black text-black"
                  style={{ background:'linear-gradient(135deg,#F5B642,#FF8C00)', boxShadow:'0 0 55px #F5B64255, 0 8px 24px rgba(0,0,0,0.45)' }}>
                  <Play className="h-6 w-6" />
                  Scegli il gioco ({players.length} giocator{players.length===1?'e':'i'})
                </motion.button>
              )}
              <button onClick={() => navigate('/')}
                className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-5 text-sm text-white/35 transition-colors hover:text-white/60">
                <X className="h-4 w-4" /> Esci
              </button>
            </div>
          </motion.div>
        )}

        {/* ══ SELECT GAME ══ */}
        {phase === 'select-game' && (
          <motion.div key="select-game" initial={{ opacity:0, y:30 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-20 }}
            className="relative z-10 flex flex-1 flex-col items-center gap-8 px-8 pt-10">
            <div className="text-center">
              <div className="text-display text-4xl font-black"
                style={{ background:'linear-gradient(135deg,#fff,#F5B642)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
                Scegli il Gioco
              </div>
              <div className="mt-2 text-sm text-white/35">Ogni gioco, le sue regole — scegli la tua battaglia!</div>
            </div>
            <div className="grid w-full max-w-4xl grid-cols-2 gap-5">
              {GAMES.map(g => (
                <motion.button key={g.slug}
                  whileHover={{ scale:1.04, y:-6 }} whileTap={{ scale:0.97 }}
                  onClick={() => { setSelectedGame(g); setSelectedCategory(g.categories[0]??''); setPhase('select-category'); }}
                  className="flex flex-col items-start gap-4 rounded-3xl p-7 text-left"
                  style={{ background:`linear-gradient(135deg,${g.color}1a,${g.color}08)`, border:`2px solid ${g.color}55`, boxShadow:`0 0 35px ${g.color}18` }}>
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl"
                      style={{ background:`linear-gradient(135deg,${g.color}30,${g.color}15)`, border:`1px solid ${g.color}55`, color:g.color, boxShadow:`0 0 24px ${g.color}35` }}>
                      {g.icon}
                    </div>
                    <div className="text-display text-2xl font-black" style={{ color:g.color, textShadow:`0 0 24px ${g.color}65` }}>{g.name}</div>
                  </div>
                  <div className="text-sm leading-relaxed text-white/55">{g.description}</div>
                  <div className="flex items-center gap-2 rounded-xl px-3 py-1 text-xs font-black"
                    style={{ background:`${g.color}18`, color:g.color }}>
                    <ChevronRight className="h-3 w-3" /> {g.categories.length} categorie
                  </div>
                </motion.button>
              ))}
            </div>
            <button onClick={() => setPhase('lobby')} className="text-sm text-white/30 transition-colors hover:text-white/60">← Torna alla lobby</button>
          </motion.div>
        )}

        {/* ══ SELECT CATEGORY ══ */}
        {phase === 'select-category' && selectedGame && (
          <motion.div key="select-category" initial={{ opacity:0, y:30 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
            className="relative z-10 flex flex-1 flex-col items-center gap-8 px-8 pt-10">
            <div className="text-center">
              <div className="text-display text-4xl font-black text-white">Categoria</div>
              <div className="mt-2 text-base font-bold" style={{ color:selectedGame.color }}>{selectedGame.name}</div>
            </div>
            <div className="grid w-full max-w-3xl grid-cols-3 gap-4">
              {selectedGame.categories.map(cat => (
                <motion.button key={cat}
                  whileHover={{ scale:1.05 }} whileTap={{ scale:0.95 }}
                  onClick={() => { setSelectedCategory(cat); setPhase('select-difficulty'); }}
                  className="rounded-2xl px-5 py-5 text-center text-sm font-black transition-all"
                  style={selectedCategory===cat
                    ? { background:`linear-gradient(135deg,${selectedGame.color},${selectedGame.color}cc)`, color:'#000', boxShadow:`0 0 35px ${selectedGame.color}65` }
                    : { background:'rgba(255,255,255,0.05)', border:`1px solid ${selectedGame.color}35`, color:'rgba(255,255,255,0.65)' }}>
                  {cat}
                </motion.button>
              ))}
            </div>
            <button onClick={() => setPhase('select-game')} className="text-sm text-white/30 transition-colors hover:text-white/60">← Indietro</button>
          </motion.div>
        )}

        {/* ══ SELECT DIFFICULTY ══ */}
        {phase === 'select-difficulty' && selectedGame && (
          <motion.div key="select-difficulty" initial={{ opacity:0, y:30 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
            className="relative z-10 flex flex-1 flex-col items-center gap-8 px-8 pt-10">
            <div className="text-center">
              <div className="text-display text-4xl font-black text-white">Difficoltà</div>
              <div className="mt-2 text-sm font-bold" style={{ color:selectedGame.color }}>{selectedGame.name} — {selectedCategory}</div>
            </div>
            <div className="grid w-full max-w-2xl grid-cols-2 gap-5">
              {DIFFICULTY_OPTIONS.map(d => (
                <motion.button key={d.value}
                  whileHover={{ scale:1.04 }} whileTap={{ scale:0.96 }}
                  onClick={() => { setSelectedDifficulty(d.value); setPhase('select-rounds'); }}
                  className="flex flex-col gap-2 rounded-2xl px-7 py-6 text-left transition-all"
                  style={selectedDifficulty===d.value
                    ? { background:`linear-gradient(135deg,${selectedGame.color},${selectedGame.color}bb)`, color:'#000', boxShadow:`0 0 45px ${selectedGame.color}55` }
                    : { background:'rgba(255,255,255,0.05)', border:`1px solid ${selectedGame.color}35`, color:'#fff' }}>
                  <div className="text-xl font-black">{d.label}</div>
                  <div className="text-xs font-normal opacity-65">{d.sub}</div>
                </motion.button>
              ))}
            </div>
            <button onClick={() => setPhase('select-category')} className="text-sm text-white/30 transition-colors hover:text-white/60">← Indietro</button>
          </motion.div>
        )}

        {/* ══ SELECT ROUNDS ══ */}
        {phase === 'select-rounds' && selectedGame && (
          <motion.div key="select-rounds" initial={{ opacity:0, y:30 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
            className="relative z-10 flex flex-1 flex-col items-center gap-8 px-8 pt-10">
            <div className="text-center">
              <div className="text-display text-4xl font-black text-white">Quanti Round?</div>
              <div className="mt-2 text-sm font-bold" style={{ color:selectedGame.color }}>{selectedGame.name} — {selectedCategory} — {DIFFICULTY_OPTIONS.find(d=>d.value===selectedDifficulty)?.label}</div>
            </div>
            <div className="flex w-full max-w-xl flex-wrap justify-center gap-4">
              {ROUND_OPTIONS.map(n => (
                <motion.button key={n}
                  whileHover={{ scale:1.1 }} whileTap={{ scale:0.92 }}
                  onClick={() => setSelectedRounds(n)}
                  className="h-24 w-24 rounded-3xl text-3xl font-black transition-all"
                  style={selectedRounds===n
                    ? { background:`linear-gradient(135deg,${selectedGame.color},${selectedGame.color}cc)`, color:'#000', boxShadow:`0 0 45px ${selectedGame.color}65` }
                    : { background:'rgba(255,255,255,0.06)', border:`2px solid ${selectedGame.color}35`, color:'#fff' }}>
                  {n}
                </motion.button>
              ))}
            </div>
            <div className="text-sm text-white/30">{selectedRounds} round × circa {Math.round(selectedRounds*0.5)} minuti</div>
            <motion.button whileHover={{ scale:1.05 }} whileTap={{ scale:0.96 }}
              onClick={startGame} disabled={loading}
              className="flex items-center gap-4 rounded-3xl px-14 py-6 text-2xl font-black text-black disabled:opacity-60"
              style={{ background:`linear-gradient(135deg,${selectedGame.color},${selectedGame.color}cc)`, boxShadow:`0 0 65px ${selectedGame.color}55, 0 10px 28px rgba(0,0,0,0.45)` }}>
              {loading ? <Loader2 className="h-7 w-7 animate-spin" /> : <Play className="h-7 w-7" />}
              Inizia!
            </motion.button>
            <button onClick={() => setPhase('select-difficulty')} className="text-sm text-white/30 transition-colors hover:text-white/60">← Indietro</button>
          </motion.div>
        )}

        {/* ══ PLAYING ══ */}
        {phase === 'playing' && session && (
          <motion.div key="playing" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="relative z-10 flex flex-1 flex-col">

            {/* Top bar */}
            <div className="flex items-center justify-between px-6 py-4"
              style={{ background:'rgba(0,0,0,0.45)', backdropFilter:'blur(14px)', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-3">
                <JonnyAvatar mood={jonnyMood} size={44} />
                <div>
                  <div className="text-xs uppercase tracking-widest text-white/30">Round</div>
                  <div className="text-2xl font-black text-white">{session.currentRound+1}<span className="text-lg text-white/30"> / {session.totalRounds}</span></div>
                </div>
              </div>

              <div className="rounded-2xl px-7 py-3 text-center transition-all"
                style={timeLeft!==null && timeLeft<=5
                  ? { background:'rgba(239,68,68,0.22)', border:'2px solid rgba(239,68,68,0.65)', boxShadow:'0 0 35px rgba(239,68,68,0.35)' }
                  : { background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.14)' }}>
                <div className="text-xs uppercase tracking-widest text-white/35">Tempo</div>
                <div className="text-4xl font-black tabular-nums"
                  style={{ color:timeLeft!==null&&timeLeft<=5?'#F87171':'#ffffff' }}>
                  {timeLeft ?? '—'}
                </div>
              </div>

              <button onClick={nextRound} disabled={loading}
                className="flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition-all disabled:opacity-40"
                style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.14)', color:'rgba(255,255,255,0.65)' }}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkipForward className="h-4 w-4" />}
                Avanti
              </button>
            </div>

            {/* Content */}
            <div className="flex flex-1 items-center justify-center px-6 py-2">
              <RoundBoard session={session} revealed={revealed}
                onReveal={() => { setRevealed(true); if (timerRef.current) clearInterval(timerRef.current); setTimerRunning(false); setJonnyMood('correct'); }}
                onNext={nextRound} />
            </div>

            {/* Score bar */}
            <div className="flex shrink-0 items-center gap-3 overflow-x-auto px-6 py-3"
              style={{ background:'rgba(0,0,0,0.55)', backdropFilter:'blur(14px)', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
              {players.sort((a,b)=>b.score-a.score).map((p,i) => (
                <div key={p.id} className="flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2"
                  style={{ background:`linear-gradient(135deg,${AVATAR_RING[i%AVATAR_RING.length]}22,transparent)`, border:`1px solid ${AVATAR_RING[i%AVATAR_RING.length]}45` }}>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black text-black"
                    style={{ background:`linear-gradient(135deg,${AVATAR_RING[i%AVATAR_RING.length]},${AVATAR_RING[(i+1)%AVATAR_RING.length]})` }}>
                    {p.nickname.slice(0,2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-black text-white">{p.nickname}</div>
                    <div className="text-xs font-black" style={{ color:'#F5B642' }}>{p.score} pt</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ══ ENDED ══ */}
        {phase === 'ended' && session && (
          <motion.div key="ended" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 px-8 text-center">

            <motion.div initial={{ scale:0, rotate:-20 }} animate={{ scale:1, rotate:0 }}
              transition={{ type:'spring', stiffness:180 }}
              style={{ filter:'drop-shadow(0 0 70px #F5B64285)', animation:'hgPulseGold 2s ease infinite' }}>
              <Trophy className="mx-auto h-28 w-28" style={{ color:'#F5B642' }} />
            </motion.div>

            <div>
              <h2 className="text-display text-6xl font-black"
                style={{ background:'linear-gradient(135deg,#fff,#F5B642)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
                Partita Finita!
              </h2>
              <div className="mt-2 text-xl text-white/45">Classifica Finale</div>
            </div>

            <div className="flex w-full max-w-lg flex-col gap-3">
              {[...players].sort((a,b)=>b.score-a.score).map((p,i) => {
                const MEDALS=['🥇','🥈','🥉'];
                const BG=['linear-gradient(135deg,#F5B642,#FF8C00)','linear-gradient(135deg,#94A3B8,#64748B)','linear-gradient(135deg,#CD7F32,#8B4513)'];
                const GLOW=['rgba(245,182,66,0.35)','rgba(148,163,184,0.22)','rgba(205,127,50,0.22)'];
                return (
                  <motion.div key={p.id}
                    initial={{ x:-60, opacity:0 }} animate={{ x:0, opacity:1 }}
                    transition={{ delay:i*0.12, type:'spring', stiffness:120 }}
                    className="flex items-center gap-4 rounded-2xl px-5 py-4"
                    style={i<3
                      ? { background:BG[i], boxShadow:`0 0 35px ${GLOW[i]}` }
                      : { background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)' }}>
                    <div className="text-3xl w-10 text-center">{MEDALS[i]??`#${i+1}`}</div>
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-base font-black"
                      style={i<3?{ background:'rgba(0,0,0,0.25)', color:'#fff' }:{ background:AVATAR_RING[i%AVATAR_RING.length], color:'#000' }}>
                      {p.nickname.slice(0,2).toUpperCase()}
                    </div>
                    <div className="flex-1 text-left">
                      <div className={`text-lg font-black ${i===0?'text-black':i<3?'text-white':'text-white'}`}>{p.nickname}</div>
                    </div>
                    <div className={`text-2xl font-black ${i===0?'text-black':i<3?'text-white':'text-yellow-400'}`}>{p.score} pt</div>
                  </motion.div>
                );
              })}
            </div>

            <div className="flex gap-4">
              <motion.button whileHover={{ scale:1.05 }} whileTap={{ scale:0.96 }}
                onClick={createSession}
                className="flex items-center gap-3 rounded-2xl px-8 py-4 font-black text-black"
                style={{ background:'linear-gradient(135deg,#F5B642,#FF8C00)', boxShadow:'0 0 45px #F5B64255' }}>
                <Sparkles className="h-5 w-5" /> Nuova Partita
              </motion.button>
              <button onClick={() => navigate('/')}
                className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-sm text-white/35 transition-colors hover:text-white/60">
                <Home className="h-4 w-4" /> Hub
              </button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

// ── RoundBoard — renders the current round based on game mode ─────────────────

function RoundBoard({ session, revealed, onReveal, onNext }: {
  session: HomeSession;
  revealed: boolean;
  onReveal: () => void;
  onNext?: () => void;
}) {
  const p = session.roundPayload;
  const mode = String(p.mode ?? 'home-quiz');

  if (mode === 'home-quiz') {
    return <QuizBoard payload={p} revealed={revealed} onReveal={onReveal} />;
  }
  if (mode === 'home-ballo') {
    return <BalloBoard payload={p} onReveal={onReveal} />;
  }
  if (mode === 'home-percorso') {
    return <PercorsoBoard payload={p} onReveal={onReveal} />;
  }
  if (mode === 'home-coppie') {
    return <CoppieBoard payload={p} onNext={onNext} />;
  }
  return <div className="text-white/40">Caricamento round...</div>;
}

function QuizBoard({ payload, revealed, onReveal }: { payload: Record<string, unknown>; revealed: boolean; onReveal: () => void }) {
  const answers = (payload.answers as string[]) ?? [];
  const correct = Number(payload.correctIndex ?? 0);
  const points = Number(payload.points ?? 200);
  const LETTERS = ['A','B','C','D'];
  const ANS_COLORS = ['#3B82F6','#EC4899','#EAB308','#10B981'];
  const ANS_GLOW   = ['rgba(59,130,246,0.55)','rgba(236,72,153,0.55)','rgba(234,179,8,0.55)','rgba(16,185,129,0.55)'];

  return (
    <div className="flex w-full max-w-3xl flex-col gap-5">

      {/* Question card */}
      <motion.div key={String(payload.roundIndex)}
        initial={{ y:24, opacity:0 }} animate={{ y:0, opacity:1 }}
        className="rounded-3xl p-8 text-center"
        style={{ background:'linear-gradient(135deg,rgba(168,85,247,0.22),rgba(245,182,66,0.08))', border:'1px solid rgba(168,85,247,0.45)', backdropFilter:'blur(14px)' }}>
        <div className="mb-2 text-xs font-black uppercase tracking-widest" style={{ color:'rgba(245,182,66,0.8)' }}>
          {String(payload.category ?? 'Quiz')}
        </div>
        <div className="text-display text-2xl font-black leading-snug text-white">{String(payload.question ?? '')}</div>
        <div className="mt-4">
          <span className="rounded-full px-4 py-1.5 text-sm font-black"
            style={{ background:'rgba(245,182,66,0.18)', color:'#F5B642', border:'1px solid rgba(245,182,66,0.4)' }}>
            {points} punti
          </span>
        </div>
      </motion.div>

      {/* Answers — full-colour tiles */}
      <div className="grid grid-cols-2 gap-4">
        {answers.map((ans, i) => {
          const isCorrect = i === correct;
          let bg: string, border: string, shadow: string, textCol: string;
          if (revealed) {
            if (isCorrect) {
              bg = 'linear-gradient(135deg,#22c55e,#16a34a)';
              border = '2px solid #4ade80';
              shadow = '0 0 45px rgba(34,197,94,0.55)';
              textCol = '#fff';
            } else {
              bg = 'rgba(255,255,255,0.04)';
              border = '2px solid rgba(255,255,255,0.08)';
              shadow = 'none';
              textCol = 'rgba(255,255,255,0.3)';
            }
          } else {
            bg = `linear-gradient(135deg,${ANS_COLORS[i]},${ANS_COLORS[i]}cc)`;
            border = `2px solid ${ANS_COLORS[i]}`;
            shadow = `0 0 35px ${ANS_GLOW[i]}`;
            textCol = '#fff';
          }
          return (
            <motion.button key={i}
              initial={{ scale:0.88, opacity:0 }} animate={{ scale:1, opacity:1 }}
              transition={{ delay:i*0.07 }}
              whileHover={!revealed ? { scale:1.03 } : {}}
              whileTap={!revealed ? { scale:0.96 } : {}}
              onClick={!revealed ? onReveal : undefined}
              className="flex items-center gap-4 rounded-2xl px-6 py-5 text-left transition-all"
              style={{ background:bg, border, boxShadow:shadow }}>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-black"
                style={{ background:'rgba(0,0,0,0.3)', color:revealed&&isCorrect?'#4ade80':textCol }}>
                {LETTERS[i]}
              </div>
              <div className="flex-1 text-base font-black leading-snug" style={{ color:textCol }}>{ans}</div>
              {revealed && isCorrect && <Check className="h-6 w-6 shrink-0 text-white" />}
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
        {revealed && !!payload.explanation && (
          <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
            className="rounded-2xl p-4 text-center text-sm"
            style={{ background:'rgba(34,197,94,0.14)', border:'1px solid rgba(34,197,94,0.35)', color:'#86efac' }}>
            💡 {String(payload.explanation)}
          </motion.div>
        )}
      </AnimatePresence>

      {!revealed && (
        <button onClick={onReveal}
          className="mx-auto flex items-center gap-2 rounded-2xl px-6 py-2.5 text-sm font-bold transition-colors"
          style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.14)', color:'rgba(255,255,255,0.55)' }}>
          <Check className="h-4 w-4" /> Rivela risposta
        </button>
      )}
    </div>
  );
}

function BalloBoard({ payload, onReveal }: { payload: Record<string, unknown>; onReveal: () => void }) {
  return (
    <motion.div key={String(payload.roundIndex)}
      initial={{ scale:0.9, opacity:0 }} animate={{ scale:1, opacity:1 }}
      className="flex w-full max-w-2xl flex-col items-center gap-7 text-center">
      <div className="flex h-28 w-28 items-center justify-center rounded-3xl text-7xl"
        style={{ background:'linear-gradient(135deg,rgba(168,85,247,0.35),rgba(168,85,247,0.15))', border:'2px solid rgba(168,85,247,0.55)', boxShadow:'0 0 60px rgba(168,85,247,0.4)' }}>
        💃
      </div>
      <div className="text-display text-5xl font-black text-white" style={{ textShadow:'0 0 30px rgba(168,85,247,0.5)' }}>
        {String(payload.name ?? 'Sfida di Ballo')}
      </div>
      <div className="max-w-md text-xl text-white/65">{String(payload.description ?? '')}</div>
      {!!payload.musicHint && (
        <div className="flex items-center gap-3 rounded-2xl px-6 py-3"
          style={{ background:'rgba(168,85,247,0.18)', border:'1px solid rgba(168,85,247,0.45)', color:'#c084fc' }}>
          <Music className="h-5 w-5" />
          <span className="text-base font-black">{String(payload.musicHint)}</span>
        </div>
      )}
      <div className="text-6xl font-black" style={{ color:'#A855F7', textShadow:'0 0 30px rgba(168,85,247,0.6)' }}>
        {Number(payload.duration ?? 60)}s
      </div>
      <button onClick={onReveal}
        className="flex items-center gap-3 rounded-2xl px-10 py-5 text-xl font-black text-white"
        style={{ background:'linear-gradient(135deg,#A855F7,#7c3aed)', boxShadow:'0 0 50px rgba(168,85,247,0.55)' }}>
        <Check className="h-6 w-6" /> Sfida completata!
      </button>
    </motion.div>
  );
}

function PercorsoBoard({ payload, onReveal }: { payload: Record<string, unknown>; onReveal: () => void }) {
  const TYPE_ICONS: Record<string,string> = { sfida:'⚡', domanda:'❓', mimo:'🎭', ballo:'💃', veloce:'🏃', coppia:'👫', reazione:'😱', fantasia:'🌟' };
  const icon = TYPE_ICONS[String(payload.challengeType ?? 'sfida')] ?? '⚡';
  return (
    <motion.div key={String(payload.roundIndex)}
      initial={{ scale:0.9, opacity:0 }} animate={{ scale:1, opacity:1 }}
      className="flex w-full max-w-2xl flex-col items-center gap-7 text-center">
      <div className="text-8xl" style={{ filter:'drop-shadow(0 0 30px rgba(52,211,153,0.6))' }}>{icon}</div>
      <div className="rounded-full px-5 py-2 text-xs font-black uppercase tracking-widest"
        style={{ background:'rgba(52,211,153,0.18)', border:'1px solid rgba(52,211,153,0.45)', color:'#34D399' }}>
        {String(payload.challengeType ?? 'sfida')}
      </div>
      <div className="text-display text-5xl font-black text-white" style={{ textShadow:'0 0 30px rgba(52,211,153,0.4)' }}>
        {String(payload.title ?? 'Sfida')}
      </div>
      <div className="max-w-md text-xl text-white/65">{String(payload.description ?? '')}</div>
      <div className="flex items-center gap-5">
        <div className="rounded-2xl px-6 py-3 text-xl font-black"
          style={{ background:'rgba(52,211,153,0.2)', border:'1px solid rgba(52,211,153,0.5)', color:'#34D399' }}>
          {Number(payload.points ?? 150)} pt
        </div>
        <div className="rounded-2xl px-6 py-3 text-xl font-black text-white/50"
          style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)' }}>
          {Number(payload.timeLimit ?? 60)}s
        </div>
      </div>
      <button onClick={onReveal}
        className="flex items-center gap-3 rounded-2xl px-10 py-5 text-xl font-black text-black"
        style={{ background:'linear-gradient(135deg,#34D399,#059669)', boxShadow:'0 0 50px rgba(52,211,153,0.5)' }}>
        <Check className="h-6 w-6" /> Sfida completata!
      </button>
    </motion.div>
  );
}

function CoppieBoard({ payload, onNext }: { payload: Record<string, unknown>; onNext?: () => void }) {
  interface CC { id: string; text: string; pairId: number; flipped: boolean; matched: boolean; }
  const cards = (payload.cards as CC[]) ?? [];
  const matchedPairs = Number(payload.matchedPairs ?? 0);
  const totalPairs   = Number(payload.totalPairs ?? 6);
  const allMatched   = totalPairs > 0 && matchedPairs >= totalPairs;

  return (
    <motion.div key={String(payload.roundIndex)}
      initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }}
      className="flex w-full max-w-3xl flex-col items-center gap-6">

      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl" style={{ filter:'drop-shadow(0 0 12px rgba(244,114,182,0.7))' }}>🃏</span>
          <div className="text-display text-2xl font-black text-white">{String(payload.category ?? 'Coppie')}</div>
        </div>
        <div className="rounded-full px-5 py-2 text-sm font-black"
          style={{ background:'rgba(245,182,66,0.18)', border:'1px solid rgba(245,182,66,0.45)', color:'#F5B642' }}>
          {matchedPairs} / {totalPairs} trovate
        </div>
      </div>

      <div className="grid w-full grid-cols-4 gap-3">
        {cards.map((card) => (
          <div key={card.id}
            className="relative flex aspect-[4/3] items-center justify-center rounded-2xl p-2 text-center text-sm font-bold transition-all"
            style={card.matched
              ? { background:'linear-gradient(135deg,rgba(34,197,94,0.28),rgba(34,197,94,0.12))', border:'2px solid rgba(74,222,128,0.7)', boxShadow:'0 0 24px rgba(34,197,94,0.35)', color:'#86efac' }
              : card.flipped
                ? { background:'linear-gradient(135deg,rgba(245,182,66,0.28),rgba(245,182,66,0.12))', border:'2px solid rgba(245,182,66,0.7)', boxShadow:'0 0 24px rgba(245,182,66,0.35)', color:'#fff' }
                : { background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.2)' }
            }>
            {card.matched && <Check className="absolute right-1.5 top-1.5 h-3 w-3 text-green-400" />}
            {(card.flipped || card.matched) ? <span className="leading-tight">{card.text}</span> : <span className="text-2xl">?</span>}
          </div>
        ))}
      </div>

      <AnimatePresence>
        {allMatched && (
          <motion.div initial={{ scale:0.8, opacity:0 }} animate={{ scale:1, opacity:1 }}
            className="flex flex-col items-center gap-4">
            <div className="text-display text-3xl font-black" style={{ color:'#F5B642', textShadow:'0 0 30px #F5B64255' }}>
              🎉 Tutte le coppie trovate!
            </div>
            <motion.button whileHover={{ scale:1.05 }} whileTap={{ scale:0.97 }}
              onClick={onNext}
              className="flex items-center gap-3 rounded-2xl px-10 py-4 font-black text-black"
              style={{ background:'linear-gradient(135deg,#F5B642,#FF8C00)', boxShadow:'0 0 45px #F5B64255' }}>
              <SkipForward className="h-5 w-5" /> Prossimo round
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
