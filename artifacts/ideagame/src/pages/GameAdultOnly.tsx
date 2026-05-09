import { useState, useEffect, useRef } from 'react';
import { useSearch, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { useEventSocket } from '@/hooks/useEventSocket';
import {
  ArenaBg, ArenaHeader, JonnyWaitingScreen, ArenaScoreBar, WinPodium,
  SocketBadge, FlashOverlay, NeonTimerBar, ARENA,
} from '@/components/JonnyWorldTheme';

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

const CAT_CONFIG: Record<string, { label: string; color: string }> = {
  'domande-piccanti-leggere': { label: 'Domanda Piccante',   color: '#f472b6' },
  'vero-falso':               { label: 'Vero / Falso',       color: '#4ade80' },
  'mondo-animale-curioso':    { label: 'Mondo Animale',      color: '#fbbf24' },
  'coppie-challenge':         { label: 'Coppie Challenge',   color: '#a78bfa' },
  'yoga-pose-ironiche':       { label: 'Yoga Ironico',       color: '#60a5fa' },
  'imitazioni-vocali-soft':   { label: 'Imitazione Vocale',  color: '#34d399' },
};
function getCat(c: string) {
  return CAT_CONFIG[c] ?? { label: c, color: '#F87171' };
}

const LEVEL_COLORS: Record<string, string> = {
  soft: '#4ade80', spicy: '#fbbf24', extreme: '#f472b6',
};
const LEVEL_LABELS: Record<string, string> = {
  soft: 'Soft', spicy: 'Spicy', extreme: 'Extreme',
};

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

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

function AgeGate({ onAccept, onBack }: { onAccept: () => void; onBack: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(20px)' }}>
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl border-2 p-8 text-center shadow-2xl"
        style={{ borderColor: '#F87171aa', background: 'radial-gradient(ellipse at top, #1a0010, #0a0006)', boxShadow: '0 0 80px #F8717133' }}>
        <div className="mx-auto mb-4 h-20 w-20 flex items-center justify-center rounded-full border-2 border-red-500/40 bg-red-500/10">
          <span className="text-4xl font-black text-red-400">18+</span>
        </div>
        <h1 className="text-display text-3xl font-black text-white mb-2">Contenuto per adulti</h1>
        <p className="text-red-300/70 font-bold mb-4">Adult Only</p>
        <p className="text-white/50 text-sm leading-relaxed max-w-sm mx-auto">
          Questo gioco contiene contenuti pensati esclusivamente per un pubblico adulto (18+).
          Nessun contenuto esplicito — solo ironia, eleganza e spettacolo.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <motion.button whileTap={{ scale: 0.97 }} onClick={onAccept}
            className="w-full rounded-2xl py-4 text-lg font-black text-white"
            style={{ background: 'linear-gradient(135deg, #F87171, #DC2626)', boxShadow: '0 8px 32px rgba(248,113,113,0.4)' }}>
            Accetto — sono maggiorenne
          </motion.button>
          <button onClick={onBack}
            className="w-full rounded-2xl border border-white/15 py-3 text-sm font-bold text-white/50 hover:text-white/80 transition-colors">
            Torna indietro
          </button>
        </div>
      </motion.div>
    </div>
  );
}

const T = ARENA.adult;

export default function GameAdultOnly() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const sessionId    = params.get('s') ?? '';
  const eventIdParam = params.get('e') ?? '';

  const [ageConfirmed, setAgeConfirmed] = useState(() =>
    typeof window !== 'undefined' && sessionStorage.getItem('adult-only-age-ok') === '1'
  );
  const [state, setState]   = useState<AdultState | null>(null);
  const [eventId, setEventId] = useState(eventIdParam);
  const [loading, setLoading] = useState(!!sessionId);
  const [flash, setFlash]   = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const { connected, on } = useEventSocket(eventId || null);

  const triggerFlash = (msg: string) => {
    setFlash(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2200);
  };

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    apiFetch(`/adult-only/sessions/${sessionId}/state`)
      .then(d => { setState(d as AdultState); setLoading(false); })
      .catch(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !ageConfirmed) return;
    pollRef.current = setInterval(async () => {
      try { const d = await apiFetch(`/adult-only/sessions/${sessionId}/state`); setState(d as AdultState); }
      catch { /* silent */ }
    }, connected ? 15000 : 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [sessionId, connected, ageConfirmed]);

  useEffect(() => {
    if (!eventId) return;
    const unsubs = [
      on<{ state: AdultState }>('adult:started',       ({ state: s }) => { setState(s); triggerFlash('Gioco avviato!'); }),
      on<{ state: AdultState }>('adult:card_changed',  ({ state: s }) => setState(s)),
      on<{ state: AdultState }>('adult:score_updated', ({ state: s }) => { setState(s); triggerFlash('Punti aggiornati!'); }),
      on<{ state: AdultState }>('adult:ended',         ({ state: s }) => setState(s)),
    ];
    return () => unsubs.forEach(u => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, on]);

  const handleAcceptAge = () => { sessionStorage.setItem('adult-only-age-ok', '1'); setAgeConfirmed(true); };

  const currentCard = state && state.currentCardIdx >= 0 ? state.cards[state.currentCardIdx] ?? null : null;
  const timeLeft    = useTimer(state?.timerStartedAt ?? null, currentCard?.timeLimit ?? 30);
  const sortedTeams = state ? [...state.teams].sort((a, b) => b.score - a.score) : [];
  const cat  = currentCard ? getCat(currentCard.category) : null;
  const levColor = currentCard ? (LEVEL_COLORS[currentCard.level] ?? T.accent) : T.accent;
  const levLabel = currentCard ? (LEVEL_LABELS[currentCard.level] ?? currentCard.level) : '';
  const timerPct   = currentCard && currentCard.timeLimit > 0 ? (timeLeft / currentCard.timeLimit) * 100 : 0;
  const timerColor = timerPct > 50 ? '#4ade80' : timerPct > 25 ? '#fbbf24' : '#f87171';

  if (!ageConfirmed) {
    return <AgeGate onAccept={handleAcceptAge} onBack={() => navigate('/')} />;
  }

  if (loading) {
    return <ArenaBg theme={T}><JonnyWaitingScreen theme={T} label="Caricamento…" /></ArenaBg>;
  }

  if (state?.status === 'ended') {
    return (
      <ArenaBg theme={T}>
        <WinPodium theme={T} teams={state.teams} winnerName={sortedTeams[0]?.name ?? null} onHome={() => navigate('/')} />
      </ArenaBg>
    );
  }

  return (
    <ArenaBg theme={T}>
      {currentCard?.timeLimit && currentCard.timeLimit > 0 && (
        <NeonTimerBar pct={timerPct} color={timerColor} />
      )}

      {/* Flash */}
      <FlashOverlay flash={flash} color={T.accent} />

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
            {state && <span className="text-xs text-white/35">{state.deckName}</span>}
          </div>
        }
        right={
          <div className="flex items-center gap-3">
            {state && state.currentCardIdx >= 0 && (
              <span className="text-xs tabular-nums text-white/40">
                {state.currentCardIdx + 1}/{state.cards.length}
              </span>
            )}
            <SocketBadge connected={connected} />
          </div>
        }
      />

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-4 min-h-0 overflow-hidden">

        {/* IDLE */}
        {(!state || state.status === 'idle') && (
          <JonnyWaitingScreen theme={T}
            subtitle={state ? `${state.deckName} · ${state.cards.length} carte` : 'In attesa dell\'animatore…'} />
        )}

        {/* RUNNING */}
        {state?.status === 'running' && currentCard && cat && (
          <AnimatePresence mode="wait">
            <motion.div key={state.currentCardIdx}
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -30, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="w-full max-w-3xl flex flex-col items-center gap-5">

              {/* Badges */}
              <div className="flex items-center gap-3 flex-wrap justify-center">
                <div className="rounded-full border px-4 py-1.5 text-sm font-bold"
                  style={{ borderColor: `${cat.color}55`, background: `${cat.color}12`, color: cat.color }}>
                  {cat.label}
                </div>
                <div className="rounded-full border border-white/15 bg-white/08 px-3 py-1.5 text-sm font-bold"
                  style={{ color: levColor }}>
                  {levLabel}
                </div>
                <div className="rounded-full border border-white/15 bg-white/08 px-3 py-1.5 text-sm font-bold text-white/55">
                  {currentCard.points} pt
                </div>
              </div>

              {/* Card */}
              <div className="w-full rounded-3xl border-2 px-8 py-10 text-center"
                style={{
                  borderColor: `${cat.color}44`,
                  background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${cat.color}12, rgba(0,0,0,0.6))`,
                  boxShadow: `0 0 60px ${cat.color}18`,
                }}>
                <h2 className="text-display text-4xl sm:text-5xl font-black leading-tight text-white mb-5"
                  style={{ textShadow: `0 0 40px ${cat.color}66` }}>
                  {currentCard.title}
                </h2>
                <p className="text-lg sm:text-xl text-white/65 leading-relaxed">
                  {currentCard.body}
                </p>
              </div>

              {/* Timer */}
              {currentCard.timeLimit > 0 && (
                <div className="w-full max-w-sm space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/35">Tempo</span>
                    <span className="text-display font-black tabular-nums" style={{ color: timerColor }}>{Math.ceil(timeLeft)}s</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <motion.div className="h-full rounded-full"
                      style={{ background: timerColor, boxShadow: `0 0 12px ${timerColor}88` }}
                      animate={{ width: `${timerPct}%` }} transition={{ duration: 0.25 }} />
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Score bar */}
      {state && state.teams.length > 0 && (
        <ArenaScoreBar teams={state.teams} accent={T.accent} />
      )}
    </ArenaBg>
  );
}
