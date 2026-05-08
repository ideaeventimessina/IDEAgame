import { useState, useEffect, useRef } from 'react';
import { useSearch, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Home, Wifi, WifiOff, SkipForward } from 'lucide-react';
import { useEventSocket } from '@/hooks/useEventSocket';

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface AdultCard {
  id: string; title: string; body: string; category: string;
  points: number; timeLimit: number; level: string; orderIndex: number;
}
interface AdultTeam { id: string; name: string; color: string; score: number; }
interface AdultState {
  deckId: string; deckName: string; cards: AdultCard[];
  currentCardIdx: number; teams: AdultTeam[];
  status: 'idle' | 'running' | 'ended';
  timerStartedAt: string | null; skipped: number[];
}

/* ─── Category config ────────────────────────────────────────────────────── */
const CAT_CONFIG: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  'domande-piccanti-leggere': { emoji: '🔥', label: 'Domanda Piccante',   color: '#f472b6', bg: 'rgba(244,114,182,0.12)' },
  'vero-falso':               { emoji: '✅', label: 'Vero / Falso',        color: '#4ade80', bg: 'rgba(74,222,128,0.12)'  },
  'mondo-animale-curioso':    { emoji: '🦁', label: 'Mondo Animale',       color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'  },
  'coppie-challenge':         { emoji: '💑', label: 'Coppie Challenge',    color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  'yoga-pose-ironiche':       { emoji: '🧘', label: 'Yoga Ironico',        color: '#60a5fa', bg: 'rgba(96,165,250,0.12)'  },
  'imitazioni-vocali-soft':   { emoji: '🎙️', label: 'Imitazione Vocale', color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
};
function getCat(c: string) {
  return CAT_CONFIG[c] ?? { emoji: '🎯', label: c, color: '#F5B642', bg: 'rgba(245,182,66,0.12)' };
}

const LEVEL_CONFIG: Record<string, { emoji: string; label: string; glow: string }> = {
  soft:    { emoji: '🌶️',       label: 'Soft',    glow: '#4ade80' },
  spicy:   { emoji: '🌶️🌶️',   label: 'Spicy',   glow: '#fbbf24' },
  extreme: { emoji: '🌶️🌶️🌶️', label: 'Extreme', glow: '#f472b6' },
};
function getLevel(l: string) {
  return LEVEL_CONFIG[l] ?? LEVEL_CONFIG['soft']!;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

/* ─── Timer hook ─────────────────────────────────────────────────────────── */
function useTimer(timerStartedAt: string | null, timeLimit: number) {
  const [timeLeft, setTimeLeft] = useState(timeLimit);
  useEffect(() => {
    if (!timerStartedAt) { setTimeLeft(timeLimit); return; }
    const update = () => {
      const elapsed = (Date.now() - new Date(timerStartedAt).getTime()) / 1000;
      setTimeLeft(Math.max(0, timeLimit - elapsed));
    };
    update();
    const i = setInterval(update, 250);
    return () => clearInterval(i);
  }, [timerStartedAt, timeLimit]);
  return timeLeft;
}

/* ─── Age Gate ───────────────────────────────────────────────────────────── */
function AgeGate({ onAccept, onBack }: { onAccept: () => void; onBack: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-lg rounded-3xl border border-pink-500/30 bg-[#0d0a1a] p-8 text-center shadow-2xl"
        style={{ boxShadow: '0 0 60px rgba(244,114,182,0.15)' }}
      >
        <div className="text-8xl mb-4">🔞</div>
        <h1 className="text-display text-3xl font-black text-white mb-2">
          Contenuto per adulti
        </h1>
        <p className="text-pink-300/80 text-lg font-bold mb-1">Adult Only</p>
        <p className="text-muted-foreground text-sm mt-4 leading-relaxed max-w-sm mx-auto">
          Questo gioco contiene contenuti pensati esclusivamente per un pubblico
          adulto (18+). Nessun contenuto esplicito o volgare — solo ironia, 
          eleganza e spettacolo.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onAccept}
            className="w-full rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 py-4 text-lg font-black text-white shadow-lg"
            style={{ boxShadow: '0 8px 32px rgba(244,114,182,0.35)' }}
          >
            ✓ Accetto — sono maggiorenne
          </motion.button>
          <button
            onClick={onBack}
            className="w-full rounded-2xl border border-border py-3 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Torna indietro
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN PROJECTOR COMPONENT
══════════════════════════════════════════════════════════════════════════ */
export default function GameAdultOnly() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const sessionId = params.get('s') ?? '';
  const eventIdParam = params.get('e') ?? '';

  const [ageConfirmed, setAgeConfirmed] = useState(() =>
    typeof window !== 'undefined' && sessionStorage.getItem('adult-only-age-ok') === '1'
  );
  const [state, setState] = useState<AdultState | null>(null);
  const [eventId, setEventId] = useState(eventIdParam);
  const [loading, setLoading] = useState(!!sessionId);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { connected, on } = useEventSocket(eventId || null);

  const triggerFlash = (msg: string) => {
    setFlash(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2000);
  };

  // Initial load
  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    apiFetch(`/adult-only/sessions/${sessionId}/state`)
      .then(d => { setState(d as AdultState); setLoading(false); })
      .catch(() => setLoading(false));
  }, [sessionId]);

  // Polling fallback
  useEffect(() => {
    if (!sessionId || !ageConfirmed) return;
    pollRef.current = setInterval(async () => {
      try {
        const d = await apiFetch(`/adult-only/sessions/${sessionId}/state`) as AdultState;
        setState(d);
      } catch { /* silent */ }
    }, connected ? 15000 : 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [sessionId, connected, ageConfirmed]);

  // Socket events
  useEffect(() => {
    if (!eventId) return;
    const unsubs = [
      on<{ state: AdultState }>('adult:started', ({ state: s }) => { setState(s); triggerFlash('🎮 Gioco avviato!'); }),
      on<{ state: AdultState }>('adult:card_changed', ({ state: s }) => { setState(s); }),
      on<{ state: AdultState }>('adult:score_updated', ({ state: s }) => { setState(s); triggerFlash('⭐ Punti aggiornati!'); }),
      on<{ state: AdultState }>('adult:ended', ({ state: s }) => { setState(s); }),
    ];
    return () => unsubs.forEach(u => u());
  }, [eventId, on]);

  const handleAcceptAge = () => {
    sessionStorage.setItem('adult-only-age-ok', '1');
    setAgeConfirmed(true);
  };

  const currentCard = state && state.currentCardIdx >= 0
    ? state.cards[state.currentCardIdx] ?? null
    : null;
  const timeLeft = useTimer(state?.timerStartedAt ?? null, currentCard?.timeLimit ?? 30);
  const sortedTeams = state ? [...state.teams].sort((a, b) => b.score - a.score) : [];
  const cat = currentCard ? getCat(currentCard.category) : null;
  const lev = currentCard ? getLevel(currentCard.level) : null;
  const timerPct = currentCard && currentCard.timeLimit > 0 ? (timeLeft / currentCard.timeLimit) * 100 : 0;
  const timerColor = timerPct > 50 ? '#4ade80' : timerPct > 25 ? '#fbbf24' : '#f87171';

  if (!ageConfirmed) {
    return <AgeGate onAccept={handleAcceptAge} onBack={() => navigate('/')} />;
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#06040f]">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">🔞</div>
          <div className="text-display text-xl font-black text-white">Caricamento…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[#06040f]"
      style={{ background: 'radial-gradient(ellipse 90% 70% at 50% 0%, #1a0a2e 0%, #06040f 100%)' }}>

      {/* Flash overlay */}
      <AnimatePresence>
        {flash && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="absolute top-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-pink-500/40 bg-pink-500/20 px-8 py-3 text-xl font-black text-pink-300">
            {flash}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="text-2xl">🔞</div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-pink-400/70">Adult Only</div>
            <div className="text-display text-sm font-black text-white/80">{state?.deckName ?? '—'}</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {state && state.currentCardIdx >= 0 && (
            <div className="text-sm font-bold text-muted-foreground tabular-nums">
              {state.currentCardIdx + 1}/{state.cards.length}
            </div>
          )}
          <div className={`flex items-center gap-1.5 text-xs ${connected ? 'text-green-400' : 'text-amber-400'}`}>
            {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {connected ? 'Live' : 'Offline'}
          </div>
          <button onClick={() => navigate('/')}
            className="rounded-xl border border-border p-2 text-muted-foreground hover:text-white">
            <Home className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center px-8 py-4 min-h-0">

        {/* IDLE */}
        {(!state || state.status === 'idle') && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="text-center max-w-2xl">
            <div className="text-9xl mb-6">🔞</div>
            <h1 className="text-display text-5xl font-black text-white mb-4">Adult Only</h1>
            <p className="text-xl text-pink-300/70">
              {state ? `${state.deckName} · ${state.cards.length} carte` : 'In attesa dell\'animatore…'}
            </p>
            <div className="mt-8 text-sm text-muted-foreground/50">
              Contenuti ironici ed eleganti per serate adulte — nessun contenuto esplicito
            </div>
          </motion.div>
        )}

        {/* RUNNING — current card */}
        {state?.status === 'running' && currentCard && cat && lev && (
          <AnimatePresence mode="wait">
            <motion.div
              key={state.currentCardIdx}
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -30, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="w-full max-w-3xl"
            >
              {/* Category + level badges */}
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-bold"
                  style={{ borderColor: `${cat.color}40`, background: cat.bg, color: cat.color }}>
                  <span>{cat.emoji}</span>
                  <span>{cat.label}</span>
                </div>
                <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-bold text-white/60">
                  <span>{lev.emoji}</span>
                  <span>{lev.label}</span>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-bold text-white/60">
                  {currentCard.points} pt
                </div>
              </div>

              {/* Card */}
              <div className="rounded-3xl border px-10 py-10 text-center"
                style={{
                  borderColor: `${cat.color}30`,
                  background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${cat.bg}, rgba(13,10,26,0.95))`,
                  boxShadow: `0 0 80px ${cat.color}20, inset 0 0 40px ${cat.bg}`,
                }}>
                <h2 className="text-display text-5xl font-black leading-tight text-white mb-4"
                  style={{ textShadow: `0 0 40px ${cat.color}80` }}>
                  {currentCard.title}
                </h2>
                <p className="text-xl text-white/70 leading-relaxed max-w-2xl mx-auto">
                  {currentCard.body}
                </p>
              </div>

              {/* Timer bar */}
              {currentCard.timeLimit > 0 && (
                <div className="mt-6 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tempo</span>
                    <span className="font-black tabular-nums text-display" style={{ color: timerColor }}>
                      {Math.ceil(timeLeft)}s
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: timerColor, boxShadow: `0 0 12px ${timerColor}80` }}
                      animate={{ width: `${timerPct}%` }}
                      transition={{ duration: 0.25, ease: 'linear' }}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}

        {/* ENDED */}
        {state?.status === 'ended' && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="text-center max-w-2xl w-full">
            <div className="text-8xl mb-4">🏆</div>
            <h1 className="text-display text-5xl font-black text-white mb-2">Fine partita!</h1>
            <p className="text-xl text-pink-300/60 mb-8">Classifica finale</p>
            <div className="space-y-3">
              {sortedTeams.map((tm, i) => (
                <motion.div key={tm.id}
                  initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-4 rounded-2xl border px-6 py-4"
                  style={{ borderColor: `${tm.color}40`, background: `${tm.color}10` }}>
                  <span className="text-display text-3xl font-black w-10 text-center"
                    style={{ color: tm.color }}>
                    {i === 0 ? '👑' : `${i + 1}.`}
                  </span>
                  <span className="flex-1 text-display text-xl font-black text-white text-left">{tm.name}</span>
                  <span className="text-display text-3xl font-black tabular-nums"
                    style={{ color: tm.color }}>{tm.score}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* ── Team scores bar ──────────────────────────────────────────────── */}
      {state && state.teams.length > 0 && state.status !== 'ended' && (
        <div className="shrink-0 border-t border-white/10 px-6 py-3">
          <div className="flex items-center justify-center gap-4 flex-wrap">
            {sortedTeams.map((tm, i) => (
              <div key={tm.id} className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: tm.color }} />
                <span className="text-sm font-bold text-white/70">{tm.name}</span>
                <span className="text-display text-lg font-black tabular-nums" style={{ color: tm.color }}>
                  {tm.score}
                </span>
                {i < sortedTeams.length - 1 && <span className="text-border">·</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
