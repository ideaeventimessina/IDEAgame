import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useEventSocket } from "@/hooks/useEventSocket";

const apiFetch = (path: string, opts?: RequestInit) =>
  fetch(`${import.meta.env.BASE_URL}api${path}`, { credentials: "include", ...opts }).then(async (r) => {
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  });

interface FreestyleWord { id: string; word: string; orderIndex: number; recognized: boolean; }
interface FreestyleTeam { id: string; name: string; color: string; score: number; }
interface FreestyleState {
  setId: string; setName: string; beatUrl: string | null;
  words: FreestyleWord[];
  revealedCount: number;
  revealStartedAt: string | null;
  thinkingStartedAt: string | null;
  thinkingSeconds: number;
  bookings: Array<{ id: string; playerId: string; nickname: string; teamId: string; teamName: string; teamColor: string; status: string; orderIndex: number; wordsRecognized: string[] }>;
  teams: FreestyleTeam[];
  phase: "idle" | "revealing" | "thinking" | "booking" | "performing" | "ended";
  roundIndex: number;
}

function WordChip({ word, index, revealed, recognized }: { word: string; index: number; revealed: boolean; recognized: boolean }) {
  return (
    <AnimatePresence>
      {revealed && (
        <motion.div
          key={word}
          initial={{ opacity: 0, scale: 0.4, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.05 * index }}
          className={`relative rounded-2xl border-2 px-5 py-3 text-center text-display font-black text-xl transition-all duration-500 ${
            recognized
              ? "border-green-400 bg-green-500/20 text-green-300 shadow-[0_0_24px_#22c55e66]"
              : "border-orange-500/50 bg-orange-500/10 text-orange-200"
          }`}
        >
          {recognized && (
            <motion.span
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="absolute -top-2 -right-2 text-base"
            >✅</motion.span>
          )}
          {word}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ThinkingCountdown({ startedAt, seconds }: { startedAt: string; seconds: number }) {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    const tick = () => {
      const elapsed = (Date.now() - new Date(startedAt).getTime()) / 1000;
      setRemaining(Math.max(0, Math.round(seconds - elapsed)));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [startedAt, seconds]);
  const pct = remaining / seconds;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-xs uppercase tracking-widest text-orange-400">Tempo per comporre il testo</div>
      <div className={`text-display text-6xl font-black tabular-nums ${remaining <= 5 ? "text-red-400 animate-pulse" : "text-orange-300"}`}>
        {remaining}
      </div>
      <div className="h-2 w-48 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-orange-400"
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 0.25 }}
        />
      </div>
    </div>
  );
}

export default function GameFreestyle() {
  const [loc] = useLocation();
  const params = new URLSearchParams(loc.split("?")[1] ?? "");
  const sessionId = params.get("s") ?? "";
  const eventId = params.get("e") ?? "";

  const [state, setState] = useState<FreestyleState | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { on } = useEventSocket(eventId || null);

  useEffect(() => {
    if (!sessionId) return;
    apiFetch(`/freestyle/sessions/${sessionId}/state`)
      .then((d) => setState(d as FreestyleState))
      .catch(() => {});
  }, [sessionId]);

  useEffect(() => {
    const unsubs = [
      on<{ state: FreestyleState }>("freestyle:started",       ({ state: s }) => setState(s)),
      on<{ state: FreestyleState }>("freestyle:reveal_started", ({ state: s }) => setState(s)),
      on<{ state: FreestyleState }>("freestyle:word_revealed",  ({ state: s }) => setState(s)),
      on<{ state: FreestyleState }>("freestyle:thinking",       ({ state: s }) => setState(s)),
      on<{ state: FreestyleState }>("freestyle:bookings_open",  ({ state: s }) => setState(s)),
      on<{ state: FreestyleState }>("freestyle:booking_added",  ({ state: s }) => setState(s)),
      on<{ state: FreestyleState }>("freestyle:booking_removed",({ state: s }) => setState(s)),
      on<{ state: FreestyleState }>("freestyle:performer_set",  ({ state: s }) => setState(s)),
      on<{ state: FreestyleState }>("freestyle:word_recognized",({ state: s }) => setState(s)),
      on<{ state: FreestyleState }>("freestyle:score_updated",  ({ state: s }) => setState(s)),
      on<{ state: FreestyleState }>("freestyle:next_round",     ({ state: s }) => setState(s)),
      on<{ state: FreestyleState }>("freestyle:ended",          ({ state: s }) => setState(s)),
    ];
    return () => unsubs.forEach((u) => u());
  }, [on]);

  // Auto-play beat when performing starts
  useEffect(() => {
    if (!state?.beatUrl) return;
    if (state.phase === "performing") {
      if (!audioRef.current) {
        audioRef.current = new Audio(state.beatUrl);
        audioRef.current.loop = true;
      }
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current?.pause();
    }
  }, [state?.phase, state?.beatUrl]);

  if (!state) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0d0b1e]">
        <div className="text-center text-muted-foreground">
          <div className="text-4xl mb-3">🎤</div>
          <div className="text-display text-2xl font-black text-white">Freestyle Battle</div>
          <div className="mt-2 text-sm">In attesa dell'animatore…</div>
        </div>
      </div>
    );
  }

  const revealedWords = state.words.slice(0, state.revealedCount);
  const activeBooking = state.bookings.find((b) => b.status === "active");
  const waitingBookings = state.bookings.filter((b) => b.status === "waiting").sort((a, b) => a.orderIndex - b.orderIndex);

  const phaseLabel: Record<FreestyleState["phase"], string> = {
    idle: "⏳ Pronto",
    revealing: "🎲 Parole in arrivo…",
    thinking: "🧠 Componi il testo!",
    booking: "✋ Prenotazioni aperte",
    performing: "🎤 In esibizione",
    ended: "🏁 Fine gioco",
  };

  return (
    <div className="min-h-screen bg-[#0d0b1e] text-white flex flex-col">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 flex items-center justify-between border-b border-white/10">
        <div>
          <div className="text-xs uppercase tracking-widest text-orange-400">Freestyle Battle</div>
          <div className="text-display text-xl font-black">{state.setName}</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-orange-500/40 bg-orange-500/10 px-3 py-1 text-xs font-bold text-orange-300">
            {phaseLabel[state.phase]}
          </span>
          <span className="text-xs text-muted-foreground">Round {(state.roundIndex ?? 0) + 1}</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-5 p-6 overflow-auto">
        {/* Word grid */}
        {(state.phase === "revealing" || state.phase === "thinking" || state.phase === "booking" || state.phase === "performing") && (
          <div className="flex flex-wrap gap-3 justify-center">
            {state.words.map((w, i) => (
              <WordChip
                key={w.id}
                word={w.word}
                index={i}
                revealed={i < state.revealedCount}
                recognized={w.recognized}
              />
            ))}
          </div>
        )}

        {/* Thinking countdown */}
        {state.phase === "thinking" && state.thinkingStartedAt && (
          <div className="flex justify-center py-4">
            <ThinkingCountdown startedAt={state.thinkingStartedAt} seconds={state.thinkingSeconds} />
          </div>
        )}

        {/* Active performer banner */}
        {state.phase === "performing" && activeBooking && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border-2 border-orange-400 bg-orange-400/10 p-5 text-center"
          >
            <div className="text-4xl mb-2">🎤</div>
            <div className="text-display text-2xl font-black" style={{ color: activeBooking.teamColor }}>
              {activeBooking.nickname}
            </div>
            <div className="text-sm text-muted-foreground mt-1">{activeBooking.teamName}</div>
            <div className="mt-3 text-xs text-white/50">
              {activeBooking.wordsRecognized.length} / {state.words.length} parole riconosciute
            </div>
            {/* Word recognition status bar */}
            <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
              {state.words.map((w) => (
                <span key={w.id} className={`rounded-lg px-2 py-0.5 text-xs font-bold transition-all duration-300 ${
                  w.recognized ? "bg-green-500/30 text-green-300 border border-green-500/50" : "bg-white/5 text-white/30 border border-white/10"
                }`}>{w.word}</span>
              ))}
            </div>
          </motion.div>
        )}

        {/* Idle state */}
        {state.phase === "idle" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center py-10">
            <div className="text-6xl">🎤</div>
            <div className="text-display text-3xl font-black text-orange-300">Freestyle Battle</div>
            <div className="text-muted-foreground max-w-xs">
              L'animatore avvierà la rivelazione delle parole. Preparati a comporre il tuo rap!
            </div>
          </div>
        )}

        {/* Booking queue */}
        {(state.phase === "booking" || state.phase === "performing") && waitingBookings.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Coda performer</div>
            {waitingBookings.map((b, i) => (
              <div key={b.id} className="flex items-center gap-3 rounded-xl border border-border bg-card/40 px-4 py-2">
                <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                <span className="h-3 w-3 rounded-full" style={{ background: b.teamColor }} />
                <span className="flex-1 font-bold text-sm">{b.nickname}</span>
                <span className="text-xs text-muted-foreground">{b.teamName}</span>
              </div>
            ))}
          </div>
        )}

        {/* Team scores */}
        <div className="grid grid-cols-2 gap-2 mt-auto">
          {[...state.teams].sort((a, b) => b.score - a.score).map((tm, i) => (
            <div key={tm.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center">
              <div className="text-[10px] text-muted-foreground truncate">{i === 0 ? "👑 " : ""}{tm.name}</div>
              <div className="text-display text-xl font-black tabular-nums" style={{ color: tm.color }}>{tm.score}</div>
            </div>
          ))}
        </div>

        {/* Ended */}
        {state.phase === "ended" && (
          <div className="text-center py-8">
            <div className="text-display text-3xl font-black text-orange-300">🏁 Fine del Freestyle!</div>
            <div className="mt-2 text-muted-foreground">Controlla il podio</div>
          </div>
        )}
      </div>
    </div>
  );
}
