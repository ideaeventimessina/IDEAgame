/**
 * GameFlowEngine — TV-side universal pre-game flow.
 * Phases: theme_select → booking → confirm → countdown
 *
 * Pilot: sfida-ballo.
 * Placeholders ready for: adult-only, percorso-a-risate,
 * karaoke-battle, freestyle-battle, parola-alle-spalle.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Play, Loader2 } from 'lucide-react';

// ── Shared flow types (exported for GameFlowPhone) ──────────────────────────────

export interface FlowTheme {
  id: string;
  name: string;
  description: string;
}

export interface FlowBookedPlayer {
  id: string;
  nickname: string;
  avatarColor: string;
}

export interface FlowPayload {
  mode: 'home-flow';
  gameFlowPhase: 'theme_select' | 'booking' | 'confirm' | 'countdown';
  gameSlug: string;
  themes: FlowTheme[];
  selectedTheme: FlowTheme | null;
  bookedPlayers: FlowBookedPlayer[];
  maxPlayers: number;
}

// ── Per-game visual config ───────────────────────────────────────────────────────
// Add a row here when a new game enters the flow.

export const FLOW_GAME_UI: Record<string, { color: string; glow: string; emoji: string; name: string }> = {
  'sfida-ballo':        { color: '#A78BFA', glow: '#C4B5FD', emoji: '💃', name: 'Sfida di Ballo' },
  // ── future pilots ────────────────────────────────────────────────────────────
  'adult-only':         { color: '#F87171', glow: '#FCA5A5', emoji: '🔞', name: 'Adult Only' },
  'percorso-a-risate':  { color: '#34D399', glow: '#6EE7B7', emoji: '😂', name: 'Percorso a Risate' },
  'karaoke-battle':     { color: '#FB923C', glow: '#FDBA74', emoji: '🎤', name: 'Karaoke Battle' },
  'freestyle-battle':   { color: '#22D3EE', glow: '#67E8F9', emoji: '🎧', name: 'Freestyle Battle' },
  'parola-alle-spalle': { color: '#22D3EE', glow: '#67E8F9', emoji: '💬', name: 'Parola alle Spalle' },
};

// ── Countdown hook (shared with GameFlowPhone) ───────────────────────────────────

export function useFlowCountdown(active: boolean) {
  const [num, setNum] = useState(3);
  const [showGo, setShowGo] = useState(false);

  useEffect(() => {
    if (!active) { setNum(3); setShowGo(false); return; }
    setNum(3); setShowGo(false);
    const t1 = setTimeout(() => setNum(2), 1000);
    const t2 = setTimeout(() => setNum(1), 2000);
    const t3 = setTimeout(() => setShowGo(true), 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [active]);

  return { num, showGo };
}

// ── Local types ──────────────────────────────────────────────────────────────────

interface HomeSession {
  id: string;
  gameSlug: string | null;
  roundPayload: Record<string, unknown>;
}

interface HomePlayer {
  id: string;
  nickname: string;
  avatarColor: string;
  score: number;
  isConnected: boolean;
}

// ── Main TV component ────────────────────────────────────────────────────────────

export function GameFlowEngine({
  session,
  players,
  sensorReadyMap = {},
}: {
  session: HomeSession;
  players: HomePlayer[];
  sensorReadyMap?: Record<string, boolean>;
}) {
  const p = session.roundPayload as unknown as FlowPayload;
  const gameUI = FLOW_GAME_UI[p.gameSlug ?? ''] ?? { color: '#A78BFA', glow: '#C4B5FD', emoji: '🎮', name: 'Gioco' };

  const [selecting, setSelecting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const { num, showGo } = useFlowCountdown(p.gameFlowPhase === 'countdown');

  async function selectTheme(theme: FlowTheme) {
    if (selecting) return;
    setSelecting(true);
    console.log('[BalloTheme] selectTheme → id:', theme.id, '| name:', theme.name, '| session:', session.id, '| phase:', p.gameFlowPhase);
    try {
      const res = await fetch(`/api/home/sessions/${session.id}/flow/select-theme`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ themeId: theme.id, themeName: theme.name, themeDescription: theme.description }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error('[BalloTheme] select-theme FAILED:', res.status, body, '| theme.id:', theme.id);
      } else {
        console.log('[BalloTheme] select-theme OK — waiting for home:state socket event');
      }
    } finally { setSelecting(false); }
  }

  async function confirmFlow() {
    if (confirming) return;
    setConfirming(true);
    console.log('[BalloFlow] confirm → calling flow/confirm | session:', session.id);
    try {
      await fetch(`/api/home/sessions/${session.id}/flow/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch { /* server returns 409 if already triggered */ }
    finally { setConfirming(false); }
  }

  const bookedPlayers = (p.bookedPlayers ?? []) as FlowBookedPlayer[];
  const maxPlayers = Number(p.maxPlayers ?? 2);
  const themes = (p.themes ?? []) as FlowTheme[];
  const selectedTheme = p.selectedTheme as FlowTheme | null;
  const canConfirm = bookedPlayers.length >= maxPlayers;

  void players; // used via sensorReadyMap for per-player sensor status badges

  // Diagnostic: log current phase on every render so we can trace loops
  console.log('[BalloFlow] GameFlowEngine render — phase:', p.gameFlowPhase, '| mode:', p.mode, '| session:', session.id);

  return (
    <AnimatePresence mode="wait">

      {/* ── PHASE 1: THEME SELECT ── */}
      {p.gameFlowPhase === 'theme_select' && (
        <motion.div key="theme_select"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.25 }}
          className="flex w-full max-w-3xl flex-col items-center gap-7">

          <div className="flex flex-col items-center gap-2 text-center">
            <motion.div className="text-6xl"
              animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2.2, repeat: Infinity }}>
              {gameUI.emoji}
            </motion.div>
            <div className="text-display text-3xl font-black text-white"
              style={{ textShadow: `0 0 30px ${gameUI.glow}55` }}>
              Scegli il tema
            </div>
            <div className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Tocca un tema per selezionarlo
            </div>
          </div>

          <div className={`grid w-full gap-4 ${themes.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {themes.map((theme) => (
              <motion.button key={theme.id} onClick={() => selectTheme(theme)} disabled={selecting}
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                className="flex flex-col gap-2 rounded-2xl px-5 py-5 text-left disabled:opacity-50"
                style={{
                  background: `linear-gradient(135deg,${gameUI.color}22,${gameUI.color}0a)`,
                  border: `1.5px solid ${gameUI.color}55`,
                }}>
                <div className="font-black text-white" style={{ fontSize: '1.05rem' }}>{theme.name}</div>
                {theme.description && (
                  <div className="text-xs font-medium leading-snug" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    {theme.description}
                  </div>
                )}
              </motion.button>
            ))}
          </div>

          {selecting && (
            <div className="flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Caricamento…</span>
            </div>
          )}
        </motion.div>
      )}

      {/* ── PHASE 2: BOOKING ── */}
      {p.gameFlowPhase === 'booking' && (
        <motion.div key="booking"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.25 }}
          className="flex w-full max-w-2xl flex-col items-center gap-7">

          <div className="flex flex-col items-center gap-2 text-center">
            <div className="text-display text-3xl font-black text-white"
              style={{ textShadow: `0 0 30px ${gameUI.glow}55` }}>
              {gameUI.emoji} {selectedTheme?.name ?? gameUI.name}
            </div>
            <div className="rounded-full px-4 py-1.5 text-sm font-black"
              style={{ background: `${gameUI.color}20`, color: gameUI.color, border: `1px solid ${gameUI.color}44` }}>
              Chi vuole sfidare? Prenotatevi dal telefono!
            </div>
          </div>

          <div className="flex w-full gap-5">
            {Array.from({ length: maxPlayers }).map((_, i) => {
              const booked = bookedPlayers[i];
              return (
                <div key={i}
                  className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl px-4 py-7 transition-all"
                  style={booked
                    ? {
                        background: `linear-gradient(135deg,${booked.avatarColor}28,${booked.avatarColor}0e)`,
                        border: `2px solid ${booked.avatarColor}99`,
                        boxShadow: `0 0 28px ${booked.avatarColor}33`,
                      }
                    : {
                        background: 'rgba(255,255,255,0.025)',
                        border: '2px dashed rgba(255,255,255,0.12)',
                      }
                  }>
                  <AnimatePresence mode="wait">
                    {booked ? (
                      <motion.div key={booked.id}
                        initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 360, damping: 22 }}
                        className="flex flex-col items-center gap-2">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-black"
                          style={{ background: booked.avatarColor, color: '#0a0015', boxShadow: `0 0 22px ${booked.avatarColor}55` }}>
                          {booked.nickname[0]?.toUpperCase()}
                        </div>
                        <div className="font-black text-white text-base">{booked.nickname}</div>
                        <div className="text-xs font-semibold" style={{ color: `${booked.avatarColor}dd` }}>
                          In gara ✓
                        </div>
                        {/* Sensor readiness badge — only shown for sfida-ballo */}
                        {p.gameSlug === 'sfida-ballo' && sensorReadyMap[booked.id] === false && (
                          <div className="rounded-xl px-2 py-1 text-xs font-black text-center"
                            style={{ background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.45)', color: '#f87171' }}>
                            ⚠️ Sensori non disponibili
                          </div>
                        )}
                        {p.gameSlug === 'sfida-ballo' && sensorReadyMap[booked.id] === true && (
                          <div className="rounded-xl px-2 py-1 text-xs font-black"
                            style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', color: '#4ade80' }}>
                            ✅ Sensori pronti
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      <motion.div key={`empty-${i}`} className="flex flex-col items-center gap-2">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full"
                          style={{ border: '2px dashed rgba(255,255,255,0.15)' }}>
                          <Users className="h-7 w-7" style={{ color: 'rgba(255,255,255,0.15)' }} />
                        </div>
                        <div className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.2)' }}>
                          In attesa…
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col items-center gap-2">
            <motion.button onClick={confirmFlow}
              disabled={!canConfirm || confirming}
              whileHover={{ scale: canConfirm ? 1.04 : 1 }}
              whileTap={{ scale: canConfirm ? 0.96 : 1 }}
              className="flex items-center gap-3 rounded-2xl px-10 py-4 text-lg font-black text-white disabled:opacity-25"
              style={{
                background: canConfirm
                  ? `linear-gradient(135deg,${gameUI.color},${gameUI.glow})`
                  : 'rgba(255,255,255,0.07)',
                boxShadow: canConfirm ? `0 0 40px ${gameUI.color}55` : 'none',
                border: canConfirm ? 'none' : '1px solid rgba(255,255,255,0.1)',
                letterSpacing: '0.06em',
              }}>
              {confirming ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
              INIZIA SFIDA
            </motion.button>
            <div className="text-xs font-semibold text-center" style={{ color: 'rgba(255,255,255,0.22)' }}>
              {canConfirm
                ? 'Tutti pronti — avvia!'
                : `Servono ${maxPlayers} giocatori prenotati`}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── PHASE 3: CONFIRM (brief transition while server loads rounds) ── */}
      {p.gameFlowPhase === 'confirm' && (
        <motion.div key="confirm"
          initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          className="flex w-full max-w-xl flex-col items-center gap-7">
          <div className="text-7xl" style={{ filter: `drop-shadow(0 0 30px ${gameUI.color}88)` }}>
            {gameUI.emoji}
          </div>
          <div className="text-display text-4xl font-black text-white text-center"
            style={{ textShadow: `0 0 40px ${gameUI.glow}66` }}>
            {selectedTheme?.name ?? gameUI.name}
          </div>
          <div className="flex gap-5">
            {bookedPlayers.map((bp) => (
              <motion.div key={bp.id}
                initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                className="flex flex-col items-center gap-2">
                <div className="flex items-center justify-center rounded-full text-2xl font-black"
                  style={{ width: 72, height: 72, background: bp.avatarColor, color: '#0a0015', boxShadow: `0 0 24px ${bp.avatarColor}66` }}>
                  {bp.nickname[0]?.toUpperCase()}
                </div>
                <div className="text-sm font-black text-white">{bp.nickname}</div>
              </motion.div>
            ))}
          </div>
          <div className="flex items-center gap-2" style={{ color: gameUI.color }}>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-lg font-black">Avvio in corso…</span>
          </div>
        </motion.div>
      )}

      {/* ── PHASE 4: COUNTDOWN (fullscreen cinematic) ── */}
      {p.gameFlowPhase === 'countdown' && (
        <motion.div key="countdown"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="flex w-full flex-col items-center justify-center gap-6"
          style={{ minHeight: '65vh' }}>
          <AnimatePresence mode="wait">
            {!showGo ? (
              <motion.div key={num}
                initial={{ scale: 2.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.3, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                className="text-display font-black leading-none select-none"
                style={{
                  fontSize: 'clamp(10rem,22vw,16rem)',
                  color: gameUI.color,
                  textShadow: `0 0 80px ${gameUI.color}99, 0 0 200px ${gameUI.color}44`,
                }}>
                {num}
              </motion.div>
            ) : (
              <motion.div key="go"
                initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 340, damping: 16 }}
                className="text-display font-black leading-none select-none"
                style={{
                  fontSize: 'clamp(7rem,16vw,11rem)',
                  color: '#F5B642',
                  textShadow: '0 0 80px rgba(245,182,66,0.9), 0 0 200px rgba(245,182,66,0.4)',
                }}>
                VIA!
              </motion.div>
            )}
          </AnimatePresence>
          <div className="text-xl font-black tracking-wide" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {!showGo ? 'Preparatevi…' : `${gameUI.emoji} La sfida inizia!`}
          </div>
        </motion.div>
      )}

    </AnimatePresence>
  );
}
