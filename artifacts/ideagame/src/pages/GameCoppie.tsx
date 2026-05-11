import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearch, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { useEventSocket } from '@/hooks/useEventSocket';
import { useProjectorNavigation } from '@/hooks/useProjectorNavigation';
import { ArenaBg, ArenaHeader, JonnyWaitingScreen, ArenaScoreBar, SocketBadge, FlashOverlay, ARENA } from '@/components/JonnyWorldTheme';
import { useGameAudio } from '@/hooks/useGameAudio';

interface CoppieCard {
  pos: number; cardId: string; pairId: string; imageUrl: string; label: string;
  flipped: boolean; matched: boolean; matchedBy: string | null;
}
interface CoppieTeam { id: string; name: string; color: string; score: number; }
interface CoppieBoard {
  cards: CoppieCard[]; teams: CoppieTeam[];
  mode: 'teams' | 'individual'; currentTeamIdx: number; flipping: number[];
  locked: boolean; status: 'preview' | 'playing' | 'ended'; winner: string | null;
  matchCount: number; totalPairs: number;
  votes?: Record<string, number>;
}
interface FlashMsg { text: string; color: string }

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

const T = ARENA.coppie;

export default function GameCoppie() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const sessionId    = params.get('s') ?? '';
  const eventIdParam = params.get('e') ?? '';

  const [board, setBoard]   = useState<CoppieBoard | null>(null);
  const [eventId, setEventId] = useState(eventIdParam);
  const [loading, setLoading] = useState(!!sessionId);
  const [flash, setFlash]   = useState<FlashMsg | null>(null);
  const [previewCountdown, setPreviewCountdown] = useState<number | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flashTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unflipRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  const { playLoop, playStinger } = useGameAudio('gioco-coppie', { autoLoop: 'lobby_loop' });

  const { connected, on } = useEventSocket(eventId || null);
  useProjectorNavigation(eventId, on);

  const showFlash = useCallback((msg: FlashMsg, durationMs = 2200) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(msg);
    flashTimer.current = setTimeout(() => setFlash(null), durationMs);
  }, []);

  const fetchBoard = useCallback(async () => {
    if (!sessionId) return;
    try { const b = await apiFetch(`/coppie/sessions/${sessionId}/board`); setBoard(b as CoppieBoard); }
    catch { /* silent */ }
  }, [sessionId]);

  const callUnflip = useCallback(async () => {
    if (!sessionId) return;
    try { const b = await apiFetch(`/coppie/sessions/${sessionId}/unflip`, { method: 'POST' }); setBoard(b as CoppieBoard); }
    catch { /* ignore */ }
  }, [sessionId]);

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

  useEffect(() => {
    if (!sessionId) return;
    if (connected) { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }
    else { pollRef.current = setInterval(fetchBoard, 5000); }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [connected, sessionId, fetchBoard]);

  const prevConnected = useRef(connected);
  useEffect(() => {
    if (!prevConnected.current && connected && sessionId) fetchBoard();
    prevConnected.current = connected;
  }, [connected, sessionId, fetchBoard]);

  const startPreviewCountdown = useCallback((sId: string, eId: string) => {
    if (previewTimerRef.current) clearInterval(previewTimerRef.current);
    setPreviewCountdown(5);
    let remaining = 5;
    previewTimerRef.current = setInterval(() => {
      remaining -= 1;
      setPreviewCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(previewTimerRef.current!);
        previewTimerRef.current = null;
        setPreviewCountdown(null);
        apiFetch(`/coppie/sessions/${sId}/start`, { method: 'POST' })
          .then(b => setBoard(b as CoppieBoard))
          .catch(() => {});
        void eId;
      }
    }, 1000);
  }, []);

  useEffect(() => {
    if (board?.status === 'preview' && sessionId && previewCountdown === null && !previewTimerRef.current) {
      startPreviewCountdown(sessionId, eventId);
    }
  }, [board?.status, sessionId, eventId, previewCountdown, startPreviewCountdown]);

  useEffect(() => {
    return () => { if (previewTimerRef.current) clearInterval(previewTimerRef.current); };
  }, []);

  useEffect(() => {
    if (!eventId) return;
    const extractBoard = (data: unknown) =>
      ((data as { board?: CoppieBoard }).board ?? data) as CoppieBoard;
    const unsubs = [
      on('coppie:preview', d => {
        const b = extractBoard(d);
        setBoard(b);
        if (sessionId) startPreviewCountdown(sessionId, eventId);
      }),
      on('coppie:state', d => { setBoard(extractBoard(d)); setPreviewCountdown(null); }),
      on('coppie:vote', d => {
        const b = (d as { board?: CoppieBoard }).board;
        if (b) setBoard(b);
      }),
      on('coppie:match', d => {
        const b = extractBoard(d);
        setBoard(b);
        const name = (d as { matchedTeamName?: string }).matchedTeamName;
        showFlash({ text: name ? `Coppia! ${name}` : 'Coppia trovata!', color: '#22c55e' });
        playStinger('match_correct');
      }),
      on('coppie:mismatch', d => {
        setBoard(extractBoard(d));
        const next = (d as { nextTeamName?: string }).nextTeamName;
        showFlash({ text: next ? `Cambio turno → ${next}` : 'Cambio turno', color: '#f59e0b' });
        playStinger('match_wrong');
        if (unflipRef.current) clearTimeout(unflipRef.current);
        unflipRef.current = setTimeout(callUnflip, 1600);
      }),
      on('coppie:end', d => {
        setBoard(extractBoard(d));
        showFlash({ text: 'Partita conclusa!', color: T.accent }, 4000);
        playStinger('winner_stinger');
      }),
      on('coppie:flip', d => {
        setBoard(extractBoard(d));
        playStinger('flip_card');
      }),
    ];
    return () => {
      unsubs.forEach(u => u());
      if (unflipRef.current) clearTimeout(unflipRef.current);
    };
  }, [eventId, on, callUnflip, showFlash, sessionId, startPreviewCountdown]);

  if (!sessionId) {
    return (
      <ArenaBg theme={T}>
        <JonnyWaitingScreen theme={T} subtitle="Aggiungi ?s=SESSION_ID&e=EVENT_ID all'URL" />
      </ArenaBg>
    );
  }
  if (loading) {
    return (
      <ArenaBg theme={T}>
        <JonnyWaitingScreen theme={T} label="Caricamento board…" />
      </ArenaBg>
    );
  }
  if (!board) {
    return (
      <ArenaBg theme={T}>
        <div className="flex flex-1 flex-col items-center justify-center gap-5">
          <JonnyWaitingScreen theme={T} label="Board non ancora inizializzata" />
          <button onClick={fetchBoard}
            className="flex items-center gap-2 text-xs text-white/50 border border-white/20 rounded-xl px-4 py-2 hover:text-white">
            <RotateCcw className="h-3 w-3" /> Riprova
          </button>
        </div>
      </ArenaBg>
    );
  }

  const currentTeam = board.teams[board.currentTeamIdx];
  const winnerTeam  = board.winner ? board.teams.find(t => t.id === board.winner) : null;
  const { cols, rows } = gridCols(board.cards.length);

  /* ── Preview overlay ─────────────────────────────────────── */
  if (board.status === 'preview') {
    return (
      <ArenaBg theme={T}>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 relative">
          {/* countdown ring */}
          <div className="relative flex items-center justify-center">
            <svg className="absolute" width={160} height={160} viewBox="0 0 160 160">
              <circle cx={80} cy={80} r={70} fill="none" stroke={`${T.accent}20`} strokeWidth={8} />
              {previewCountdown !== null && (
                <circle cx={80} cy={80} r={70} fill="none" stroke={T.accent} strokeWidth={8}
                  strokeDasharray={`${2 * Math.PI * 70}`}
                  strokeDashoffset={`${2 * Math.PI * 70 * (1 - previewCountdown / 5)}`}
                  strokeLinecap="round" transform="rotate(-90 80 80)"
                  style={{ transition: 'stroke-dashoffset 0.9s linear' }} />
              )}
            </svg>
            <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 1, repeat: Infinity }}
              className="text-display text-7xl font-black tabular-nums" style={{ color: T.accent }}>
              {previewCountdown ?? 5}
            </motion.div>
          </div>

          <div className="text-center space-y-1">
            <div className="text-display text-3xl font-black text-white">Memorizza le coppie!</div>
            <div className="text-white/50 text-sm">Il gioco inizia tra {previewCountdown ?? 5} second{previewCountdown === 1 ? 'o' : 'i'}…</div>
          </div>

          {/* Card grid shown during preview — all face-up */}
          <div className="w-full max-w-5xl">
            <div className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, maxWidth: '100%' }}>
              {board.cards.map(card => (
                <motion.div key={card.pos}
                  initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: card.pos * 0.03 }}
                  className="relative aspect-square rounded-xl overflow-hidden border-2"
                  style={{ borderColor: `${T.accent}44` }}>
                  <img src={card.imageUrl} alt={card.label} className="w-full h-full object-cover" loading="eager" />
                  <div className="absolute inset-0 flex items-end p-1.5"
                    style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent 55%)' }}>
                    <div className="text-white text-[10px] font-bold truncate">{card.label}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </ArenaBg>
    );
  }

  return (
    <ArenaBg theme={T}>
      {/* Header */}
      <ArenaHeader theme={T}
        left={
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} title="Torna al parco"
              className="flex h-7 w-7 items-center justify-center rounded-lg border transition-all"
              style={{ borderColor: `${T.accent}44`, background: `${T.accent}12` }}>
              <img src="/logo.png" alt="" className="h-4 w-4 object-contain" />
            </button>
            <span className="text-xs font-black uppercase tracking-[0.25em]" style={{ color: T.accent }}>{T.title}</span>
            <span className="text-xs text-white/35">{board.matchCount}/{board.totalPairs} coppie</span>
          </div>
        }
        right={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {board.teams.map((t, i) => (
              <motion.div key={t.id}
                animate={i === board.currentTeamIdx && board.status === 'playing'
                  ? { boxShadow: [`0 0 0 0 ${t.color}55`, `0 0 0 10px ${t.color}00`] }
                  : { boxShadow: '0 0 0 0 transparent' }}
                transition={{ duration: 1.2, repeat: Infinity }}
                className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 border transition-all"
                style={{
                  borderColor: `${t.color}${i === board.currentTeamIdx ? '80' : '30'}`,
                  background: `${t.color}${i === board.currentTeamIdx ? '18' : '08'}`,
                }}>
                <div className="h-2 w-2 rounded-full" style={{ background: t.color }} />
                <span className="text-xs font-bold truncate max-w-[55px]">{t.name}</span>
                <span className="text-display text-base font-black tabular-nums" style={{ color: t.color }}>{t.score}</span>
              </motion.div>
            ))}
            <SocketBadge connected={connected} />
          </div>
        }
      />

      {/* Turn banner */}
      <AnimatePresence mode="wait">
        {board.status === 'playing' && currentTeam && (
          <motion.div key={`turn-${board.currentTeamIdx}`}
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center justify-center py-1.5 shrink-0">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-1.5 text-sm font-bold">
              <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ duration: 1, repeat: Infinity }}
                className="h-2 w-2 rounded-full" style={{ background: currentTeam.color }} />
              Tocca una carta —&nbsp;
              <span className="font-black" style={{ color: currentTeam.color }}>{currentTeam.name}</span>
              {board.locked && <span className="ml-2 text-amber-400 text-xs animate-pulse">attendi…</span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Flash overlay */}
      <FlashOverlay flash={flash?.text ?? null} color={flash?.color ?? T.accent} />

      {/* Card grid */}
      <div className="flex-1 flex items-center justify-center p-3 overflow-hidden">
        <div className="grid gap-2 w-full h-full"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`, maxWidth: '1400px', maxHeight: '100%' }}>
          {board.cards.map(card => (
            <CoppieCardTile key={card.pos} card={card} teams={board.teams} accent={T.accent} />
          ))}
        </div>
      </div>

      {/* Win overlay */}
      <AnimatePresence>
        {board.status === 'ended' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(20px)' }}>
            <motion.div initial={{ scale: 0.75, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
              className="flex flex-col items-center gap-5 text-center px-8">
              <motion.img src="/jonny-master.jpg" alt="Jonny"
                style={{ height: 140, filter: `drop-shadow(0 8px 32px ${T.glow}99)` }}
                animate={{ y: [0, -10, 0] }} transition={{ duration: 2.5, repeat: Infinity }} />
              <div className="text-display text-4xl sm:text-6xl font-black"
                style={{ color: winnerTeam?.color ?? T.accent, textShadow: `0 0 40px ${winnerTeam?.color ?? T.glow}88` }}>
                {winnerTeam ? winnerTeam.name : 'Pareggio!'}
              </div>
              {winnerTeam && (
                <div className="text-xl text-white/60">
                  vince con <span className="font-black" style={{ color: winnerTeam.color }}>{winnerTeam.score} coppi{winnerTeam.score === 1 ? 'a' : 'e'}</span>
                </div>
              )}
              <div className="flex flex-wrap justify-center gap-4">
                {board.teams.map(t => (
                  <div key={t.id} className="text-center">
                    <div className="text-display text-3xl font-black" style={{ color: t.color }}>{t.score}</div>
                    <div className="text-xs text-white/50 mt-1">{t.name}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => navigate('/')}
                className="mt-2 rounded-2xl border px-8 py-3 text-sm font-black text-white/70 hover:text-white"
                style={{ borderColor: `${T.accent}55`, background: `${T.accent}10` }}>
                Torna al parco
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ArenaBg>
  );
}

function CoppieCardTile({ card, teams, accent }: { card: CoppieCard; teams: CoppieTeam[]; accent: string }) {
  const matchedTeam = card.matchedBy ? teams.find(t => t.id === card.matchedBy) : null;
  const isFlipped   = card.flipped || card.matched;
  return (
    <div className="relative w-full h-full" style={{ perspective: '900px' }}>
      <motion.div animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
        style={{ transformStyle: 'preserve-3d', width: '100%', height: '100%' }}
        className="relative">
        {/* Card back */}
        <div className="absolute inset-0 rounded-xl border flex items-center justify-center overflow-hidden"
          style={{ backfaceVisibility: 'hidden', borderColor: `${accent}22`, background: `${accent}08` }}>
          <div className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='32' viewBox='0 0 28 32'%3E%3Cpolygon points='14,2 26,9 26,23 14,30 2,23 2,9' fill='none' stroke='%23FF69B4' stroke-width='1.5'/%3E%3C/svg%3E")`,
              backgroundSize: '42px 48px',
            }} />
          <span className="text-display text-2xl font-black select-none" style={{ color: `${accent}40` }}>{card.pos + 1}</span>
        </div>
        {/* Card front */}
        <div className="absolute inset-0 rounded-xl overflow-hidden border-2"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', borderColor: matchedTeam ? matchedTeam.color : 'rgba(255,255,255,0.2)' }}>
          <img src={card.imageUrl} alt={card.label} className="w-full h-full object-cover" loading="eager" />
          <div className="absolute inset-0 flex items-end p-2"
            style={{ background: matchedTeam ? `linear-gradient(to top, ${matchedTeam.color}cc, transparent 60%)` : 'linear-gradient(to top, rgba(0,0,0,0.65), transparent 55%)' }}>
            {matchedTeam
              ? <div className="flex items-center gap-1 text-white text-xs font-black"><div className="h-2 w-2 rounded-full bg-white/80" />{matchedTeam.name}</div>
              : <div className="text-white text-xs font-bold truncate">{card.label}</div>}
          </div>
          {card.matched && (
            <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
              className="absolute top-1 right-1 h-5 w-5 rounded-full bg-green-400 flex items-center justify-center">
              <span className="text-[10px] font-black text-white">✓</span>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
