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

  const { on } = useHomeSocket(session?.id ?? null);
  const { on: socketOn } = useEventSocket(null);

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
    return () => { u1?.(); u2?.(); u3?.(); };
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

  // ── API helpers ────────────────────────────────────────────────────────────
  const createSession = async () => {
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
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-[#07061a]">
      {/* Starfield */}
      <div className="pointer-events-none absolute inset-0 z-0">
        {Array.from({ length: 50 }).map((_, i) => (
          <motion.div key={i} className="absolute rounded-full bg-white"
            style={{ left: `${(i * 37 + 11) % 100}%`, top: `${(i * 53 + 7) % 100}%`, width: 1 + (i % 3) * 0.5, height: 1 + (i % 3) * 0.5, opacity: 0.08 + (i % 4) * 0.06 }}
            animate={{ opacity: [0.05, 0.18, 0.05] }}
            transition={{ duration: 2 + (i % 5) * 0.6, delay: -(i * 0.15), repeat: Infinity }} />
        ))}
      </div>

      <AnimatePresence mode="wait">

        {/* ══════════════ WELCOME ══════════════ */}
        {phase === 'welcome' && (
          <motion.div key="welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="relative z-10 flex flex-1 flex-col items-center justify-center gap-10 px-8 text-center">
            <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 120 }}>
              <div className="mb-4 flex items-center justify-center gap-4">
                <img src="/logo.png" alt="IDEA Games" className="h-20 w-auto object-contain" />
              </div>
              <div className="text-display text-5xl font-black text-white">Modalità <span className="text-primary">HOME</span></div>
              <div className="mt-3 text-lg text-white/60">Gioca con Jonny — fino a 10 giocatori, stessa rete</div>
            </motion.div>

            <div className="flex items-center gap-6">
              <JonnyAvatar mood={jonnyMood} size={140} />
              <div className="max-w-xs rounded-2xl border border-primary/30 bg-primary/10 p-5 text-left">
                <div className="text-sm font-bold text-primary">JONNY dice:</div>
                <div className="mt-1 text-white/80">"{jonnyMsg}"</div>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
              onClick={createSession}
              disabled={loading}
              className="flex items-center gap-3 rounded-3xl bg-primary px-10 py-5 text-xl font-black text-black shadow-2xl shadow-primary/40 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Sparkles className="h-6 w-6" />}
              Gioca con Jonny
            </motion.button>

            <button onClick={() => navigate('/')} className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors">
              <Home className="h-4 w-4" /> Torna all'Hub
            </button>
          </motion.div>
        )}

        {/* ══════════════ LOBBY ══════════════ */}
        {phase === 'lobby' && session && (
          <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="relative z-10 flex flex-1 flex-col items-center gap-8 px-8 pt-10">

            {/* Header */}
            <div className="flex w-full max-w-4xl items-center justify-between">
              <div>
                <div className="text-display text-3xl font-black text-white">Sala d'Attesa</div>
                <div className="text-sm text-white/50">I giocatori si uniscono scansionando il QR</div>
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2">
                <Users className="h-4 w-4 text-primary" />
                <span className="text-2xl font-black text-primary">{players.length}</span>
                <span className="text-sm text-white/50">giocatori</span>
              </div>
            </div>

            {/* QR + players */}
            <div className="flex w-full max-w-4xl items-start gap-8">

              {/* QR panel */}
              <div className="flex flex-col items-center rounded-3xl border border-border bg-card/70 p-8 backdrop-blur-md">
                <div className="mb-3 text-xs uppercase tracking-widest text-white/40">Scansiona per unirsi</div>
                <QrPlaceholder text={joinUrl} size={200} />
                <div className="mt-4 text-center">
                  <div className="text-xs text-white/40">Codice</div>
                  <div className="text-mono text-3xl font-black text-primary tracking-widest">{session.joinCode}</div>
                </div>
                <div className="mt-4 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-xs text-white/60 text-center max-w-[200px]">
                  Apri il browser e vai su:<br />
                  <span className="font-bold text-primary">{window.location.origin}/home/join</span>
                </div>
              </div>

              {/* Players list */}
              <div className="flex-1">
                <div className="mb-4 text-sm uppercase tracking-widest text-white/40">Giocatori connessi</div>
                {players.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-12 text-white/30">
                    <QrCode className="h-12 w-12" />
                    <div>Nessuno ancora — aspettiamo!</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <AnimatePresence>
                      {players.map((p, i) => (
                        <motion.div key={p.id}
                          initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                          className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black text-black"
                            style={{ background: AVATAR_RING[i % AVATAR_RING.length] }}>
                            {p.nickname.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-white">{p.nickname}</div>
                            <div className="text-xs text-white/40">Pronto</div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>

            {/* Start button */}
            <div className="flex gap-4">
              {players.length >= 1 && (
                <motion.button
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  onClick={() => setPhase('select-game')}
                  className="flex items-center gap-3 rounded-2xl bg-primary px-8 py-4 text-lg font-black text-black shadow-xl shadow-primary/30"
                >
                  <Play className="h-5 w-5" />
                  Scegli il gioco ({players.length} giocator{players.length === 1 ? 'e' : 'i'})
                </motion.button>
              )}
              <button onClick={() => navigate('/')} className="flex items-center gap-2 rounded-2xl border border-white/10 px-6 py-4 text-sm text-white/40 hover:text-white/70">
                <X className="h-4 w-4" /> Esci
              </button>
            </div>
          </motion.div>
        )}

        {/* ══════════════ SELECT GAME ══════════════ */}
        {phase === 'select-game' && (
          <motion.div key="select-game" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
            className="relative z-10 flex flex-1 flex-col items-center gap-8 px-8 pt-10">
            <div className="text-display text-3xl font-black text-white">Scegli il Gioco</div>
            <div className="grid w-full max-w-4xl grid-cols-2 gap-5">
              {GAMES.map(g => (
                <motion.button key={g.slug}
                  whileHover={{ scale: 1.03, y: -4 }} whileTap={{ scale: 0.97 }}
                  onClick={() => { setSelectedGame(g); setSelectedCategory(g.categories[0] ?? ''); setPhase('select-category'); }}
                  className="flex flex-col items-start gap-3 rounded-3xl border-2 p-6 text-left transition-all"
                  style={{ borderColor: `${g.color}55`, background: `${g.color}10` }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: `${g.color}20`, color: g.color }}>
                      {g.icon}
                    </div>
                    <div className="text-display text-2xl font-black" style={{ color: g.color }}>{g.name}</div>
                  </div>
                  <div className="text-sm text-white/60">{g.description}</div>
                  <div className="flex items-center gap-2 text-xs text-white/40">
                    <ChevronRight className="h-3 w-3" />
                    {g.categories.length} categorie disponibili
                  </div>
                </motion.button>
              ))}
            </div>
            <button onClick={() => setPhase('lobby')} className="text-sm text-white/40 hover:text-white/70">← Indietro</button>
          </motion.div>
        )}

        {/* ══════════════ SELECT CATEGORY ══════════════ */}
        {phase === 'select-category' && selectedGame && (
          <motion.div key="select-category" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
            className="relative z-10 flex flex-1 flex-col items-center gap-8 px-8 pt-10">
            <div>
              <div className="text-display text-3xl font-black text-white">Scegli la Categoria</div>
              <div className="mt-1 text-sm text-white/50" style={{ color: selectedGame.color }}>{selectedGame.name}</div>
            </div>
            <div className="grid w-full max-w-3xl grid-cols-3 gap-4">
              {selectedGame.categories.map(cat => (
                <motion.button key={cat}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                  onClick={() => { setSelectedCategory(cat); setPhase('select-difficulty'); }}
                  className={`rounded-2xl border-2 px-5 py-4 text-center font-bold transition-all ${
                    selectedCategory === cat
                      ? 'text-black'
                      : 'border-white/10 bg-white/5 text-white/70 hover:border-white/30'
                  }`}
                  style={selectedCategory === cat ? { borderColor: selectedGame.color, background: selectedGame.color } : {}}
                >
                  {cat}
                </motion.button>
              ))}
            </div>
            <button onClick={() => setPhase('select-game')} className="text-sm text-white/40 hover:text-white/70">← Indietro</button>
          </motion.div>
        )}

        {/* ══════════════ SELECT DIFFICULTY ══════════════ */}
        {phase === 'select-difficulty' && selectedGame && (
          <motion.div key="select-difficulty" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
            className="relative z-10 flex flex-1 flex-col items-center gap-8 px-8 pt-10">
            <div>
              <div className="text-display text-3xl font-black text-white">Difficoltà</div>
              <div className="mt-1 text-sm" style={{ color: selectedGame.color }}>{selectedGame.name} — {selectedCategory}</div>
            </div>
            <div className="grid w-full max-w-2xl grid-cols-2 gap-4">
              {DIFFICULTY_OPTIONS.map(d => (
                <motion.button key={d.value}
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => { setSelectedDifficulty(d.value); setPhase('select-rounds'); }}
                  className={`flex flex-col gap-1 rounded-2xl border-2 px-6 py-5 text-left transition-all ${
                    selectedDifficulty === d.value ? 'text-black' : 'border-white/10 bg-white/5 text-white'
                  }`}
                  style={selectedDifficulty === d.value ? { borderColor: selectedGame.color, background: selectedGame.color } : {}}
                >
                  <div className="text-lg font-black">{d.label}</div>
                  <div className="text-xs opacity-70">{d.sub}</div>
                </motion.button>
              ))}
            </div>
            <button onClick={() => setPhase('select-category')} className="text-sm text-white/40 hover:text-white/70">← Indietro</button>
          </motion.div>
        )}

        {/* ══════════════ SELECT ROUNDS ══════════════ */}
        {phase === 'select-rounds' && selectedGame && (
          <motion.div key="select-rounds" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
            className="relative z-10 flex flex-1 flex-col items-center gap-8 px-8 pt-10">
            <div>
              <div className="text-display text-3xl font-black text-white">Quanti Round?</div>
              <div className="mt-1 text-sm" style={{ color: selectedGame.color }}>{selectedGame.name} — {selectedCategory} — {DIFFICULTY_OPTIONS.find(d => d.value === selectedDifficulty)?.label}</div>
            </div>
            <div className="flex w-full max-w-xl flex-wrap gap-4 justify-center">
              {ROUND_OPTIONS.map(n => (
                <motion.button key={n}
                  whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }}
                  onClick={() => setSelectedRounds(n)}
                  className={`h-20 w-20 rounded-2xl border-2 text-2xl font-black transition-all ${
                    selectedRounds === n ? 'text-black' : 'border-white/10 bg-white/5 text-white'
                  }`}
                  style={selectedRounds === n ? { borderColor: selectedGame.color, background: selectedGame.color } : {}}
                >
                  {n}
                </motion.button>
              ))}
            </div>
            <div className="text-sm text-white/40">{selectedRounds} round × ~{Math.round(selectedRounds * 0.5)} minuti</div>
            <motion.button
              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
              onClick={startGame}
              disabled={loading}
              className="flex items-center gap-3 rounded-2xl px-10 py-5 text-xl font-black text-black shadow-xl disabled:opacity-60"
              style={{ background: selectedGame.color, boxShadow: `0 0 40px ${selectedGame.color}55` }}
            >
              {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Play className="h-6 w-6" />}
              Inizia!
            </motion.button>
            <button onClick={() => setPhase('select-difficulty')} className="text-sm text-white/40 hover:text-white/70">← Indietro</button>
          </motion.div>
        )}

        {/* ══════════════ PLAYING ══════════════ */}
        {phase === 'playing' && session && (
          <motion.div key="playing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="relative z-10 flex flex-1 flex-col">

            {/* Top bar */}
            <div className="flex items-center justify-between px-8 py-4">
              <div className="flex items-center gap-3">
                <JonnyAvatar mood={jonnyMood} size={48} />
                <div>
                  <div className="text-xs uppercase tracking-widest text-white/40">Round</div>
                  <div className="text-2xl font-black text-white">{session.currentRound + 1} / {session.totalRounds}</div>
                </div>
              </div>

              {/* Timer */}
              <div className={`flex items-center gap-2 rounded-2xl border px-5 py-2 transition-colors ${
                timeLeft !== null && timeLeft <= 5
                  ? 'border-destructive/60 bg-destructive/20 text-destructive'
                  : 'border-white/20 bg-white/5 text-white'
              }`}>
                <Timer className="h-5 w-5" />
                <div className="text-3xl font-black tabular-nums">{timeLeft ?? '—'}</div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={nextRound}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-bold text-white/70 hover:text-white disabled:opacity-40"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkipForward className="h-4 w-4" />}
                  Avanti
                </button>
              </div>
            </div>

            {/* Main content */}
            <div className="flex flex-1 items-center justify-center px-8">
              <RoundBoard session={session} revealed={revealed} onReveal={() => { setRevealed(true); if (timerRef.current) clearInterval(timerRef.current); setTimerRunning(false); setJonnyMood('correct'); }} />
            </div>

            {/* Scoreboard bar */}
            <div className="flex shrink-0 items-center gap-3 overflow-x-auto border-t border-white/10 bg-white/3 px-8 py-3">
              {players.sort((a, b) => b.score - a.score).map((p, i) => (
                <div key={p.id} className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black text-black"
                    style={{ background: AVATAR_RING[i % AVATAR_RING.length] }}>
                    {p.nickname.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">{p.nickname}</div>
                    <div className="text-xs text-primary font-black">{p.score} pt</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ══════════════ ENDED ══════════════ */}
        {phase === 'ended' && session && (
          <motion.div key="ended" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="relative z-10 flex flex-1 flex-col items-center justify-center gap-10 px-8 text-center">

            <motion.div initial={{ scale: 0, rotate: -15 }} animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200 }}>
              <Trophy className="h-24 w-24 text-primary mx-auto" />
            </motion.div>

            <div>
              <div className="text-display text-5xl font-black text-white">Partita Finita!</div>
              <div className="mt-2 text-xl text-white/60">Classifica Finale</div>
            </div>

            <div className="flex flex-col gap-3 w-full max-w-md">
              {[...players].sort((a, b) => b.score - a.score).map((p, i) => (
                <motion.div key={p.id}
                  initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-3">
                  <div className={`text-2xl font-black ${i === 0 ? 'text-primary' : i === 1 ? 'text-white/70' : i === 2 ? 'text-amber-600' : 'text-white/30'}`}>
                    #{i + 1}
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black text-black"
                    style={{ background: AVATAR_RING[i % AVATAR_RING.length] }}>
                    {p.nickname.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-black text-white">{p.nickname}</div>
                  </div>
                  <div className="text-2xl font-black text-primary">{p.score} pt</div>
                </motion.div>
              ))}
            </div>

            <JonnyAvatar mood="winner" size={120} />

            <div className="flex gap-4">
              <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                onClick={createSession}
                className="flex items-center gap-2 rounded-2xl bg-primary px-8 py-4 font-black text-black">
                <Sparkles className="h-5 w-5" /> Nuova Partita
              </motion.button>
              <button onClick={() => navigate('/')} className="flex items-center gap-2 rounded-2xl border border-white/10 px-6 py-4 text-sm text-white/40 hover:text-white/70">
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

function RoundBoard({ session, revealed, onReveal }: {
  session: HomeSession;
  revealed: boolean;
  onReveal: () => void;
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
  return <div className="text-white/40">Caricamento round...</div>;
}

function QuizBoard({ payload, revealed, onReveal }: { payload: Record<string, unknown>; revealed: boolean; onReveal: () => void }) {
  const answers = (payload.answers as string[]) ?? [];
  const correct = Number(payload.correctIndex ?? 0);
  const points = Number(payload.points ?? 200);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      {/* Question */}
      <motion.div key={String(payload.roundIndex)}
        initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="rounded-3xl border border-primary/30 bg-primary/10 p-8 text-center">
        <div className="mb-2 text-xs uppercase tracking-widest text-primary/70">{String(payload.category ?? 'Quiz')}</div>
        <div className="text-display text-2xl font-black text-white leading-snug">{String(payload.question ?? '')}</div>
        <div className="mt-3 flex items-center justify-center gap-2 text-xs text-white/40">
          <div className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-primary font-bold">{points} punti</div>
        </div>
      </motion.div>

      {/* Answers grid */}
      <div className="grid grid-cols-2 gap-4">
        {answers.map((ans, i) => {
          const LETTERS = ['A', 'B', 'C', 'D'];
          const COLORS = ['#60A5FA', '#F472B6', '#F5B642', '#34D399'];
          const isCorrect = i === correct;
          return (
            <motion.button key={i}
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.06 }}
              onClick={!revealed ? onReveal : undefined}
              className={`flex items-center gap-4 rounded-2xl border-2 px-6 py-4 text-left transition-all ${
                revealed
                  ? isCorrect
                    ? 'border-green-400 bg-green-400/20 text-white'
                    : 'border-white/10 bg-white/5 text-white/40'
                  : 'border-white/10 bg-white/5 text-white hover:border-white/30'
              }`}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-black text-black"
                style={{ background: COLORS[i] }}>
                {LETTERS[i]}
              </div>
              <div className="flex-1 font-bold">{ans}</div>
              {revealed && isCorrect && <Check className="h-5 w-5 text-green-400" />}
            </motion.button>
          );
        })}
      </div>

      {/* Reveal / Explanation */}
      <AnimatePresence>
        {revealed && !!payload.explanation && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-center text-sm text-green-300">
            💡 {String(payload.explanation)}
          </motion.div>
        )}
      </AnimatePresence>

      {!revealed && (
        <button onClick={onReveal} className="mx-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-2 text-sm text-white/50 hover:text-white">
          <Check className="h-4 w-4" /> Rivela risposta
        </button>
      )}
    </div>
  );
}

function BalloBoard({ payload, onReveal }: { payload: Record<string, unknown>; onReveal: () => void }) {
  return (
    <motion.div key={String(payload.roundIndex)}
      initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className="flex w-full max-w-2xl flex-col items-center gap-6 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-purple-500/20 text-6xl">
        💃
      </div>
      <div className="text-display text-4xl font-black text-white">{String(payload.name ?? 'Sfida di Ballo')}</div>
      <div className="max-w-md text-lg text-white/70">{String(payload.description ?? '')}</div>
      {!!payload.musicHint && (
        <div className="flex items-center gap-2 rounded-2xl border border-purple-400/30 bg-purple-400/10 px-5 py-3 text-purple-300">
          <Music className="h-4 w-4" />
          <span className="font-bold">{String(payload.musicHint)}</span>
        </div>
      )}
      <div className="text-5xl font-black text-purple-400">{Number(payload.duration ?? 60)}s</div>
      <button onClick={onReveal} className="flex items-center gap-2 rounded-2xl bg-purple-500 px-6 py-3 font-black text-white">
        <Check className="h-4 w-4" /> Sfida completata
      </button>
    </motion.div>
  );
}

function PercorsoBoard({ payload, onReveal }: { payload: Record<string, unknown>; onReveal: () => void }) {
  const TYPE_ICONS: Record<string, string> = { sfida: '⚡', domanda: '❓', mimo: '🎭', ballo: '💃', veloce: '🏃', coppia: '👫', reazione: '😱', fantasia: '🌟' };
  const icon = TYPE_ICONS[String(payload.challengeType ?? 'sfida')] ?? '⚡';
  return (
    <motion.div key={String(payload.roundIndex)}
      initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className="flex w-full max-w-2xl flex-col items-center gap-6 text-center">
      <div className="text-6xl">{icon}</div>
      <div className="text-xs uppercase tracking-widest text-green-400">{String(payload.challengeType ?? 'sfida')}</div>
      <div className="text-display text-4xl font-black text-white">{String(payload.title ?? 'Sfida')}</div>
      <div className="max-w-md text-lg text-white/70">{String(payload.description ?? '')}</div>
      <div className="flex items-center gap-4">
        <div className="rounded-2xl border border-green-400/30 bg-green-400/10 px-5 py-2 font-black text-green-400">{Number(payload.points ?? 150)} pt</div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-2 text-white/60">{Number(payload.timeLimit ?? 60)}s</div>
      </div>
      <button onClick={onReveal} className="flex items-center gap-2 rounded-2xl bg-green-500 px-6 py-3 font-black text-black">
        <Check className="h-4 w-4" /> Sfida completata
      </button>
    </motion.div>
  );
}
