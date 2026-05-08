import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearch, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Home, Wifi, WifiOff, RotateCcw } from 'lucide-react';
import { useEventSocket } from '@/hooks/useEventSocket';

interface CoppieCard {
  pos: number; cardId: string; pairId: string; imageUrl: string; label: string;
  flipped: boolean; matched: boolean; matchedBy: string | null;
}
interface CoppieTeam { id: string; name: string; color: string; score: number; }
interface CoppieBoard {
  cards: CoppieCard[]; teams: CoppieTeam[];
  mode: 'teams' | 'individual'; currentTeamIdx: number; flipping: number[];
  locked: boolean; status: 'playing' | 'ended'; winner: string | null;
  matchCount: number; totalPairs: number;
}
interface FlashMsg { text: string; color: string; icon?: string }

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

function gridCols(n: number) {
  if (n <= 12) return { cols: 4, rows: 3 };
  if (n <= 20) return { cols: 5, rows: 4 };
  return { cols: 6, rows: 5 };
}

export default function GameCoppie() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const sessionId = params.get('s') ?? '';
  const eventIdParam = params.get('e') ?? '';

  const [board, setBoard] = useState<CoppieBoard | null>(null);
  const [eventId, setEventId] = useState(eventIdParam);
  const [loading, setLoading] = useState(!!sessionId);
  const [flash, setFlash] = useState<FlashMsg | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unflipRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { connected, on } = useEventSocket(eventId || null);

  const showFlash = useCallback((msg: FlashMsg, durationMs = 2200) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(msg);
    flashTimer.current = setTimeout(() => setFlash(null), durationMs);
  }, []);

  const fetchBoard = useCallback(async () => {
    if (!sessionId) return;
    try {
      const b = await apiFetch(`/coppie/sessions/${sessionId}/board`);
      setBoard(b as CoppieBoard);
    } catch { /* silent */ }
  }, [sessionId]);

  const callUnflip = useCallback(async () => {
    if (!sessionId) return;
    try {
      const b = await apiFetch(`/coppie/sessions/${sessionId}/unflip`, { method: 'POST' });
      setBoard(b as CoppieBoard);
    } catch { /* ignore */ }
  }, [sessionId]);

  // Initial board load
  useEffect(() => {
    if (!sessionId) { setLoading(false); return; }
    apiFetch(`/coppie/sessions/${sessionId}/board`)
      .then(b => { setBoard(b as CoppieBoard); setLoading(false); })
      .catch(() => setLoading(false));
    if (!eventIdParam) {
      apiFetch('/events/current').then(e => {
        if (e && (e as { id: string }).id) setEventId((e as { id: string }).id);
      }).catch(() => {});
    }
  }, [sessionId, eventIdParam]);

  // Polling fallback when socket is disconnected
  useEffect(() => {
    if (!sessionId) return;
    if (connected) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    } else {
      pollRef.current = setInterval(fetchBoard, 5000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [connected, sessionId, fetchBoard]);

  // Re-fetch board on socket reconnect
  const prevConnected = useRef(connected);
  useEffect(() => {
    if (!prevConnected.current && connected && sessionId) {
      fetchBoard();
    }
    prevConnected.current = connected;
  }, [connected, sessionId, fetchBoard]);

  // Socket event listeners
  useEffect(() => {
    if (!eventId) return;
    const extractBoard = (data: unknown) =>
      ((data as { board?: CoppieBoard }).board ?? data) as CoppieBoard;

    const unsubs = [
      on('coppie:state', d => setBoard(extractBoard(d))),
      on('coppie:flip',  d => setBoard(extractBoard(d))),
      on('coppie:match', d => {
        const b = extractBoard(d);
        setBoard(b);
        const name = (d as { matchedTeamName?: string }).matchedTeamName;
        showFlash({ text: name ? `🎉 Coppia! ${name}` : '🎉 Coppia trovata!', color: '#22c55e' });
      }),
      on('coppie:mismatch', d => {
        setBoard(extractBoard(d));
        const next = (d as { nextTeamName?: string }).nextTeamName;
        showFlash({ text: next ? `❌ Mismatch → ${next}` : '❌ Cambio turno', color: '#f59e0b' });
        if (unflipRef.current) clearTimeout(unflipRef.current);
        unflipRef.current = setTimeout(callUnflip, 1600);
      }),
      on('coppie:end', d => {
        setBoard(extractBoard(d));
        showFlash({ text: '🏆 Partita conclusa!', color: '#8B5CF6' }, 4000);
      }),
    ];
    return () => {
      unsubs.forEach(u => u());
      if (unflipRef.current) clearTimeout(unflipRef.current);
    };
  }, [eventId, on, callUnflip, showFlash]);

  if (!sessionId) {
    return (
      <div className="flex h-screen items-center justify-center"
           style={{ background: 'radial-gradient(ellipse at top, hsl(248 70% 8%), hsl(248 70% 2%))' }}>
        <div className="text-center">
          <div className="text-display text-5xl font-black mb-2">Gioco delle Coppie</div>
          <div className="text-muted-foreground">Aggiungi <code className="text-primary">?s=SESSION_ID&e=EVENT_ID</code> all'URL</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center"
           style={{ background: 'radial-gradient(ellipse at top, hsl(248 70% 8%), hsl(248 70% 2%))' }}>
        <div className="text-display text-2xl font-black text-muted-foreground animate-pulse">Caricamento board…</div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="flex h-screen items-center justify-center"
           style={{ background: 'radial-gradient(ellipse at top, hsl(248 70% 8%), hsl(248 70% 2%))' }}>
        <div className="text-center space-y-4">
          <div className="text-muted-foreground">Board non ancora inizializzata — usa il pannello di controllo per cominciare.</div>
          <button onClick={fetchBoard} className="flex items-center gap-2 mx-auto text-xs text-muted-foreground/60 hover:text-muted-foreground border border-border/30 rounded-lg px-3 py-2">
            <RotateCcw className="h-3 w-3" /> Riprova
          </button>
          <button onClick={() => navigate('/')} className="flex items-center gap-2 mx-auto text-xs text-muted-foreground/40 hover:text-muted-foreground/60">
            <Home className="h-3 w-3" /> Torna al GameStation
          </button>
        </div>
      </div>
    );
  }

  const currentTeam = board.teams[board.currentTeamIdx];
  const winnerTeam = board.winner ? board.teams.find(t => t.id === board.winner) : null;
  const { cols, rows } = gridCols(board.cards.length);

  return (
    <div className="relative flex h-screen flex-col overflow-hidden"
         style={{ background: 'radial-gradient(ellipse at top, hsl(248 70% 8%), hsl(248 70% 2%))' }}>

      {/* Header */}
      <header className="flex items-center justify-between gap-2 px-3 py-2 sm:px-8 sm:py-3 border-b border-white/5 flex-shrink-0 bg-black/20 backdrop-blur">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button onClick={() => navigate('/')} title="GameStation"
            className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-80 transition-opacity">
            <Home className="h-4 w-4" />
          </button>
          <div className="min-w-0 hidden sm:block">
            <div className="text-display text-lg font-black leading-none">Gioco delle Coppie</div>
            <div className="text-xs text-muted-foreground mt-0.5">{board.matchCount}/{board.totalPairs} coppie • {board.cards.length} carte</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-3">
          {board.teams.map((t, i) => (
            <motion.div
              key={t.id}
              animate={i === board.currentTeamIdx && board.status === 'playing'
                ? { boxShadow: [`0 0 0 0 ${t.color}44`, `0 0 0 8px ${t.color}00`] }
                : { boxShadow: '0 0 0 0 transparent' }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className={`flex items-center gap-1.5 rounded-xl px-2 py-1.5 sm:px-4 sm:py-2 border transition-all ${
                i === board.currentTeamIdx && board.status === 'playing'
                  ? 'border-white/20 bg-white/10'
                  : 'border-white/5 bg-white/5'
              }`}
            >
              <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: t.color }} />
              <span className="font-bold text-xs sm:text-sm truncate max-w-[60px] sm:max-w-none">{t.name}</span>
              <span className="text-display text-lg sm:text-2xl font-black tabular-nums" style={{ color: t.color }}>{t.score}</span>
            </motion.div>
          ))}
          <div className={`h-2 w-2 rounded-full shrink-0 ${connected ? 'bg-green-400' : 'bg-amber-400 animate-pulse'}`}
               title={connected ? 'Connesso' : 'Offline – polling attivo'} />
        </div>
      </header>

      {/* Turn banner */}
      <AnimatePresence mode="wait">
        {board.status === 'playing' && currentTeam && (
          <motion.div
            key={`turn-${board.currentTeamIdx}`}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center py-1.5 flex-shrink-0"
          >
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-1 text-sm font-semibold">
              <motion.div
                animate={{ scale: [1, 1.4, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="h-2 w-2 rounded-full"
                style={{ background: currentTeam.color }}
              />
              Tocca una carta —&nbsp;
              <span className="font-black" style={{ color: currentTeam.color }}>{currentTeam.name}</span>
              {board.locked && <span className="ml-2 text-amber-400 text-xs animate-pulse">— attendi…</span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card grid */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <div
          className="grid gap-2 w-full h-full"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
            maxWidth: '1400px',
            maxHeight: '100%',
          }}
        >
          {board.cards.map(card => (
            <CoppieCardTile key={card.pos} card={card} teams={board.teams} />
          ))}
        </div>
      </div>

      {/* Flash message overlay */}
      <AnimatePresence>
        {flash && (
          <motion.div
            key="flash"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-x-0 top-1/3 z-40 flex justify-center pointer-events-none"
          >
            <div
              className="rounded-3xl px-6 py-4 text-2xl font-black text-white shadow-2xl sm:px-12 sm:py-6 sm:text-5xl"
              style={{
                background: `${flash.color}22`,
                border: `2px solid ${flash.color}66`,
                boxShadow: `0 0 60px ${flash.color}44`,
                backdropFilter: 'blur(12px)',
              }}
            >
              {flash.text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Win overlay */}
      <AnimatePresence>
        {board.status === 'ended' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)' }}
          >
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 180 }}
              className="w-[calc(100vw-2rem)] max-w-lg rounded-3xl border border-primary/30 bg-card p-6 text-center shadow-2xl sm:p-14"
              style={{ boxShadow: `0 0 80px ${winnerTeam?.color ?? '#8B5CF6'}44` }}
            >
              <Trophy className="mx-auto h-12 w-12 text-yellow-400 sm:h-20 sm:w-20" />
              <div className="mt-4 text-display text-3xl font-black sm:mt-5 sm:text-6xl">
                {winnerTeam ? winnerTeam.name : 'Pareggio!'}
              </div>
              {winnerTeam && (
                <div className="mt-2 text-xl text-muted-foreground">
                  vince con{' '}
                  <span className="font-black" style={{ color: winnerTeam.color }}>
                    {winnerTeam.score} coppi{winnerTeam.score === 1 ? 'a' : 'e'}
                  </span>!
                </div>
              )}
              <div className="mt-6 flex flex-wrap justify-center gap-4 sm:mt-8 sm:gap-8">
                {board.teams.map(t => (
                  <div key={t.id} className="text-center">
                    <div className="text-display text-2xl font-black sm:text-4xl" style={{ color: t.color }}>{t.score}</div>
                    <div className="text-xs text-muted-foreground mt-1 sm:text-sm">{t.name}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => navigate('/')}
                className="mt-8 flex items-center gap-2 mx-auto rounded-xl border border-border px-6 py-3 text-sm font-bold hover:bg-secondary/30">
                <Home className="h-4 w-4" /> Torna al GameStation
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Connection status badge */}
      {!connected && (
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-400">
          <WifiOff className="h-3 w-3" /> Offline — polling 5s
        </div>
      )}
    </div>
  );
}

function CoppieCardTile({ card, teams }: { card: CoppieCard; teams: CoppieTeam[] }) {
  const matchedTeam = card.matchedBy ? teams.find(t => t.id === card.matchedBy) : null;
  const isFlipped = card.flipped || card.matched;

  return (
    <div className="relative w-full h-full" style={{ perspective: '900px' }}>
      <motion.div
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
        style={{ transformStyle: 'preserve-3d', width: '100%', height: '100%' }}
        className="relative"
      >
        {/* Back */}
        <div
          className="absolute inset-0 rounded-xl border border-white/10 bg-card flex items-center justify-center overflow-hidden"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='32' viewBox='0 0 28 32'%3E%3Cpolygon points='14,2 26,9 26,23 14,30 2,23 2,9' fill='none' stroke='%238B5CF6' stroke-width='1.5'/%3E%3C/svg%3E")`,
              backgroundSize: '42px 48px',
            }}
          />
          <span className="text-display text-3xl font-black text-primary/25 select-none">{card.pos + 1}</span>
        </div>

        {/* Front */}
        <div
          className="absolute inset-0 rounded-xl overflow-hidden border-2"
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            borderColor: matchedTeam ? matchedTeam.color : 'rgba(255,255,255,0.15)',
          }}
        >
          <img src={card.imageUrl} alt={card.label} className="w-full h-full object-cover" loading="eager" />
          <div
            className="absolute inset-0 flex items-end p-2"
            style={{ background: matchedTeam ? `linear-gradient(to top, ${matchedTeam.color}99, transparent 55%)` : 'linear-gradient(to top, rgba(0,0,0,0.55), transparent 55%)' }}
          >
            {matchedTeam ? (
              <div className="flex items-center gap-1 text-white text-xs font-bold">
                <div className="h-2 w-2 rounded-full bg-white/80" />
                {matchedTeam.name}
              </div>
            ) : (
              <div className="text-white text-xs font-bold truncate">{card.label}</div>
            )}
          </div>
          {card.matched && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-green-400 flex items-center justify-center"
            >
              <span className="text-[10px] font-black text-white">✓</span>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
