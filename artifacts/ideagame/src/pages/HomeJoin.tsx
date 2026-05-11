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
  Trophy, Home, Zap, Music, Laugh, Star
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

  // Auto-lookup session when arriving via QR code (?s=CODE in URL)
  useEffect(() => {
    if (!urlCode) return;
    lookupSession(urlCode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Join home socket room when we have a session
  useEffect(() => {
    if (!session?.id) return;
    emit('join:home', session.id);
    return () => { emit('leave:home', session.id); };
  }, [session?.id, emit]);

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
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#07061a] px-4 py-8">
      {/* Stars */}
      <div className="pointer-events-none absolute inset-0 z-0">
        {Array.from({ length: 30 }).map((_, i) => (
          <div key={i} className="absolute rounded-full bg-white"
            style={{ left: `${(i * 47 + 13) % 100}%`, top: `${(i * 59 + 7) % 100}%`, width: 1, height: 1, opacity: 0.08 + (i % 4) * 0.04 }} />
        ))}
      </div>

      <AnimatePresence mode="wait">

        {/* ── ENTER CODE ── */}
        {phase === 'code' && (
          <motion.div key="code" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="relative z-10 flex w-full max-w-sm flex-col items-center gap-8 text-center">
            <img src="/logo.png" alt="IDEA Games" className="h-16 w-auto object-contain" />
            <div>
              <div className="text-display text-3xl font-black text-white">Entra nel Gioco</div>
              <div className="mt-1 text-sm text-white/50">Inserisci il codice che vedi sullo schermo</div>
            </div>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase().trim())}
              onKeyDown={e => e.key === 'Enter' && code.length === 6 && lookupSession(code)}
              placeholder="CODICE"
              maxLength={6}
              className="w-full rounded-2xl border border-border bg-card/70 px-6 py-4 text-center text-3xl font-black uppercase tracking-[0.5em] text-primary placeholder:text-white/20 focus:border-primary focus:outline-none"
            />
            {error && <div className="rounded-xl bg-destructive/20 px-4 py-2 text-sm text-destructive">{error}</div>}
            <button
              onClick={() => lookupSession(code)}
              disabled={loading || code.length < 6}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 text-lg font-black text-black disabled:opacity-40"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ChevronRight className="h-5 w-5" />}
              Avanti
            </button>
            <button onClick={() => navigate('/')} className="flex items-center gap-1 text-xs text-white/30 hover:text-white/60">
              <Home className="h-3 w-3" /> Hub
            </button>
          </motion.div>
        )}

        {/* ── LOADING (QR lookup in progress) ── */}
        {phase === 'nickname' && !session && (
          <motion.div key="loading-qr" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="relative z-10 flex flex-col items-center gap-6 text-center">
            <img src="/jonny-master-nobg.png" alt="Jonny" className="h-28 w-auto object-contain drop-shadow-2xl" />
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-white/60">Caricamento partita...</div>
          </motion.div>
        )}

        {/* ── NICKNAME ── */}
        {phase === 'nickname' && session && (
          <motion.div key="nickname" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="relative z-10 flex w-full max-w-sm flex-col items-center gap-8 text-center">
            <img src="/jonny-master-nobg.png" alt="Jonny" className="h-28 w-auto object-contain drop-shadow-2xl" />
            <div>
              <div className="text-display text-3xl font-black text-white">Come ti chiami?</div>
              <div className="mt-1 text-sm text-white/50">{session.joinCode} — {players.length} giocator{players.length !== 1 ? 'i' : 'e'} connessi</div>
            </div>
            <input
              type="text"
              value={nickname}
              onChange={e => setNickname(e.target.value.slice(0, 20))}
              onKeyDown={e => e.key === 'Enter' && nickname.trim() && joinSession()}
              placeholder="Il tuo nome..."
              autoFocus
              className="w-full rounded-2xl border border-border bg-card/70 px-6 py-4 text-center text-xl font-black text-white placeholder:text-white/20 focus:border-primary focus:outline-none"
            />
            {error && <div className="rounded-xl bg-destructive/20 px-4 py-2 text-sm text-destructive">{error}</div>}
            <button
              onClick={joinSession}
              disabled={loading || !nickname.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 text-lg font-black text-black disabled:opacity-40"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
              Entra!
            </button>
          </motion.div>
        )}

        {/* ── LOBBY ── */}
        {phase === 'lobby' && player && session && (
          <motion.div key="lobby" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="relative z-10 flex w-full max-w-sm flex-col items-center gap-8 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl text-2xl font-black text-black"
              style={{ background: player.avatarColor }}>
              {player.nickname.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="text-display text-3xl font-black text-white">{player.nickname}</div>
              <div className="mt-1 text-sm text-primary">Sei dentro! 🎉</div>
            </div>
            <div className="flex w-full flex-col items-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-6">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-white/70">Aspettiamo che l'host scelga il gioco...</div>
              <div className="text-xs text-white/40">{players.length} giocator{players.length !== 1 ? 'i' : 'e'} connessi</div>
            </div>
            <img src="/jonny-master-nobg.png" alt="Jonny" className="h-24 w-auto object-contain drop-shadow-2xl opacity-80" />
          </motion.div>
        )}

        {/* ── PLAYING ── */}
        {phase === 'playing' && player && session && (
          <motion.div key="playing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="relative z-10 flex w-full max-w-sm flex-col gap-5">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {session.gameSlug && GAME_ICONS[session.gameSlug]}
                <div>
                  <div className="text-xs text-white/40">Round {session.currentRound + 1}/{session.totalRounds}</div>
                  <div className="text-sm font-black text-white">{player.nickname}</div>
                </div>
              </div>
              <div className={`flex items-center gap-1.5 rounded-2xl border px-3 py-1.5 transition-colors ${
                timeLeft !== null && timeLeft <= 5
                  ? 'border-destructive/60 bg-destructive/20 text-destructive'
                  : 'border-white/20 bg-white/5 text-white'
              }`}>
                <Timer className="h-4 w-4" />
                <div className="text-2xl font-black tabular-nums">{timeLeft ?? '—'}</div>
              </div>
            </div>

            {/* Score chip */}
            <div className="flex justify-center">
              <div className="rounded-full border border-primary/40 bg-primary/10 px-4 py-1 text-sm font-black text-primary">
                {player.score} punti
              </div>
            </div>

            {/* Phone controller */}
            <PhoneController session={session} revealed={revealed} answered={answered} player={player}
              onAnswer={(idx) => {
                setAnswered(idx);
                if (timerRef.current) clearInterval(timerRef.current);
                setRevealed(true);
                // Award points for correct answer
                const payload = session.roundPayload;
                if (String(payload.mode) === 'home-quiz' && idx === Number(payload.correctIndex)) {
                  void addScore(Number(payload.points ?? 200));
                }
              }}
              onSkip={skipRound}
            />
          </motion.div>
        )}

        {/* ── ENDED ── */}
        {phase === 'ended' && player && (
          <motion.div key="ended" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6 text-center">
            <img src="/jonny-master-nobg.png" alt="Jonny" className="h-28 w-auto object-contain drop-shadow-2xl" />
            <div>
              <div className="text-display text-3xl font-black text-white">Partita finita!</div>
              <div className="mt-2 text-primary text-xl font-black">{player.score} punti totali</div>
            </div>

            {/* Final ranking */}
            <div className="flex w-full flex-col gap-2">
              {[...players].sort((a, b) => b.score - a.score).map((p, i) => (
                <div key={p.id} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
                  p.id === player.id ? 'border-primary/60 bg-primary/10' : 'border-white/10 bg-white/5'
                }`}>
                  <div className="text-lg font-black text-white/40">#{i + 1}</div>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black text-black"
                    style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                    {p.nickname.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 text-left text-sm font-bold text-white">{p.nickname}</div>
                  <div className="font-black text-primary">{p.score}</div>
                </div>
              ))}
            </div>

            <button onClick={() => navigate('/home')} className="flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 font-black text-black">
              Nuova Partita
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
    const COLORS = ['#60A5FA', '#F472B6', '#F5B642', '#34D399'];
    const LETTERS = ['A', 'B', 'C', 'D'];

    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4 text-center text-sm font-bold text-white/80">
          {String(p.question ?? '')}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {answers.map((ans, i) => {
            const isCorrect = i === correct;
            const isSelected = answered === i;
            return (
              <motion.button key={i}
                whileHover={!revealed ? { scale: 1.04 } : {}}
                whileTap={!revealed ? { scale: 0.94 } : {}}
                onClick={() => !revealed && answered === null && onAnswer(i)}
                disabled={revealed || answered !== null}
                className={`flex flex-col items-center justify-center gap-2 rounded-2xl px-4 py-5 font-bold text-sm transition-all ${
                  revealed
                    ? isCorrect
                      ? 'border-2 border-green-400 bg-green-400/20 text-green-300'
                      : isSelected
                        ? 'border-2 border-destructive/60 bg-destructive/20 text-destructive/70'
                        : 'border border-white/5 bg-white/3 text-white/30'
                    : answered === i
                      ? 'border-2 text-black'
                      : 'border border-white/10 bg-white/5 text-white hover:border-white/30'
                }`}
                style={!revealed && answered === i ? { borderColor: COLORS[i], background: COLORS[i] } : {}}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black text-black"
                  style={{ background: COLORS[i] }}>
                  {LETTERS[i]}
                </div>
                <div className="text-center leading-tight">{ans}</div>
                {revealed && isCorrect && <Check className="h-4 w-4 text-green-400" />}
              </motion.button>
            );
          })}
        </div>
        <button onClick={onSkip} className="flex items-center justify-center gap-1.5 rounded-2xl border border-white/10 py-2 text-xs text-white/30 hover:text-white/60">
          <SkipForward className="h-3 w-3" /> Salta questo round
        </button>
      </div>
    );
  }

  if (mode === 'home-ballo') {
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="text-5xl">💃</div>
        <div className="text-display text-2xl font-black text-white">{String(p.name ?? 'Sfida di Ballo')}</div>
        <div className="text-sm text-white/60">{String(p.description ?? '')}</div>
        {!!p.musicHint && <div className="rounded-xl bg-purple-500/20 px-4 py-2 text-sm text-purple-300">🎵 {String(p.musicHint)}</div>}
        <button onClick={onSkip} className="flex items-center gap-2 rounded-2xl border border-white/10 px-6 py-3 text-sm text-white/40 hover:text-white/70">
          <SkipForward className="h-4 w-4" /> Salta
        </button>
      </div>
    );
  }

  if (mode === 'home-percorso') {
    const TYPE_ICONS: Record<string, string> = { sfida: '⚡', domanda: '❓', mimo: '🎭', reazione: '😱', fantasia: '🌟' };
    const icon = TYPE_ICONS[String(p.challengeType ?? 'sfida')] ?? '⚡';
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="text-5xl">{icon}</div>
        <div className="text-display text-2xl font-black text-white">{String(p.title ?? 'Sfida')}</div>
        <div className="text-sm text-white/60">{String(p.description ?? '')}</div>
        <div className="rounded-xl border border-green-400/30 bg-green-400/10 px-4 py-2 text-sm font-black text-green-400">
          {Number(p.points ?? 150)} punti
        </div>
        <button onClick={onSkip} className="flex items-center gap-2 rounded-2xl border border-white/10 px-6 py-3 text-sm text-white/40">
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
