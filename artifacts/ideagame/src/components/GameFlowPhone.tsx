/**
 * GameFlowPhone — Phone-side universal pre-game flow controller.
 * Phases: theme_select (waiting) → booking → confirm → countdown
 *
 * Pilot: sfida-ballo.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { type FlowPayload, type FlowBookedPlayer, FLOW_GAME_UI, useFlowCountdown } from './GameFlowEngine';

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

export function GameFlowPhone({
  session,
  player,
}: {
  session: HomeSession;
  player: HomePlayer;
}) {
  const p = session.roundPayload as unknown as FlowPayload;
  const gameUI = FLOW_GAME_UI[p.gameSlug ?? ''] ?? { color: '#A78BFA', glow: '#C4B5FD', emoji: '🎮', name: 'Gioco' };

  const bookedPlayers = (p.bookedPlayers ?? []) as FlowBookedPlayer[];
  const maxPlayers = Number(p.maxPlayers ?? 2);
  const isBooked = bookedPlayers.some((b) => b.id === player.id);
  const isFull = bookedPlayers.length >= maxPlayers;
  const selectedTheme = p.selectedTheme as { id: string; name: string } | null;

  const [booking, setBooking] = useState(false);

  const { num, showGo } = useFlowCountdown(p.gameFlowPhase === 'countdown');

  async function book(action: 'book' | 'unbook') {
    if (booking) return;
    setBooking(true);
    try {
      await fetch(`/api/home/sessions/${session.id}/flow/book-player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: player.id,
          nickname: player.nickname,
          avatarColor: player.avatarColor,
          action,
        }),
      });
    } finally { setBooking(false); }
  }

  // ── WAITING FOR THEME ─────────────────────────────────────────────────────────

  if (p.gameFlowPhase === 'theme_select') {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-5 py-4">
        <motion.div className="text-5xl"
          animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 2, repeat: Infinity }}>
          {gameUI.emoji}
        </motion.div>
        <div className="text-display text-2xl font-black text-white">{gameUI.name}</div>
        <div className="rounded-2xl px-5 py-4 text-center"
          style={{ background: `${gameUI.color}14`, border: `1px solid ${gameUI.color}33` }}>
          <div className="text-sm font-black" style={{ color: 'rgba(255,255,255,0.65)' }}>
            L'animatore sta scegliendo il tema…
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs font-semibold">In attesa</span>
        </div>
      </motion.div>
    );
  }

  // ── BOOKING ───────────────────────────────────────────────────────────────────

  if (p.gameFlowPhase === 'booking') {

    if (isBooked) {
      return (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-5 py-4">
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 22 }}
            className="flex h-24 w-24 items-center justify-center rounded-full text-4xl font-black"
            style={{
              background: `linear-gradient(135deg,${gameUI.color},${gameUI.glow})`,
              boxShadow: `0 0 50px ${gameUI.color}66`,
              color: '#0a0015',
            }}>
            ✓
          </motion.div>
          <div className="text-display text-2xl font-black text-white">SEI IN GARA!</div>
          <div className="rounded-2xl px-5 py-3 text-center"
            style={{ background: `${gameUI.color}14`, border: `1px solid ${gameUI.color}33` }}>
            <div className="text-sm font-semibold" style={{ color: gameUI.color }}>
              {selectedTheme?.name ?? gameUI.name}
            </div>
            <div className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Attendi che l'animatore avvii la sfida
            </div>
          </div>
          <button onClick={() => book('unbook')} disabled={booking}
            className="text-xs font-semibold underline disabled:opacity-50"
            style={{ color: 'rgba(255,255,255,0.25)' }}>
            {booking ? 'Annullamento…' : 'Annulla prenotazione'}
          </button>
        </motion.div>
      );
    }

    if (isFull) {
      return (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-5 py-4">
          <div className="text-5xl">👀</div>
          <div className="text-display text-2xl font-black text-white">SEI SPETTATORE</div>
          <div className="text-sm font-semibold text-center" style={{ color: 'rgba(255,255,255,0.45)' }}>
            I posti per questa sfida sono esauriti.<br />Tifa per i tuoi compagni!
          </div>
          <div className="flex gap-2 mt-1">
            {bookedPlayers.map((bp) => (
              <div key={bp.id}
                className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-black"
                style={{ background: bp.avatarColor, color: '#0a0015' }}>
                {bp.nickname[0]?.toUpperCase()}
              </div>
            ))}
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-5 py-4">
        <div className="text-5xl">{gameUI.emoji}</div>
        <div className="text-display text-2xl font-black text-white">{gameUI.name}</div>
        {selectedTheme && (
          <div className="text-sm font-semibold" style={{ color: gameUI.color }}>
            {selectedTheme.name}
          </div>
        )}
        <div className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {bookedPlayers.length}/{maxPlayers} prenotati
        </div>
        {bookedPlayers.length > 0 && (
          <div className="flex gap-2">
            {bookedPlayers.map((bp) => (
              <div key={bp.id} className="flex items-center gap-1.5 rounded-full px-3 py-1"
                style={{ background: `${bp.avatarColor}22`, border: `1px solid ${bp.avatarColor}55` }}>
                <div className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-black"
                  style={{ background: bp.avatarColor, color: '#0a0015' }}>
                  {bp.nickname[0]?.toUpperCase()}
                </div>
                <span className="text-xs font-black" style={{ color: bp.avatarColor }}>{bp.nickname}</span>
              </div>
            ))}
          </div>
        )}
        <motion.button onClick={() => book('book')} disabled={booking}
          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 rounded-2xl px-8 py-4 text-xl font-black text-white disabled:opacity-50"
          style={{
            background: `linear-gradient(135deg,${gameUI.color},${gameUI.glow})`,
            boxShadow: `0 0 45px ${gameUI.color}66`,
            border: 'none',
          }}>
          {booking ? <Loader2 className="h-5 w-5 animate-spin" /> : '🙋'}
          MI PRENOTO!
        </motion.button>
      </motion.div>
    );
  }

  // ── CONFIRM ───────────────────────────────────────────────────────────────────

  if (p.gameFlowPhase === 'confirm') {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-5 py-4">
        <div className="text-5xl">{gameUI.emoji}</div>
        <div className="text-display text-2xl font-black text-white">
          {isBooked ? 'SEI IN GARA!' : 'SEI SPETTATORE'}
        </div>
        <div className="flex items-center gap-2" style={{ color: gameUI.color }}>
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="font-black text-sm">L'animatore sta per avviare…</span>
        </div>
      </motion.div>
    );
  }

  // ── COUNTDOWN ─────────────────────────────────────────────────────────────────

  if (p.gameFlowPhase === 'countdown') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center gap-4 py-8">
        <AnimatePresence mode="wait">
          {!showGo ? (
            <motion.div key={num}
              initial={{ scale: 1.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22 }}
              className="text-display font-black leading-none select-none"
              style={{
                fontSize: '8rem',
                color: gameUI.color,
                textShadow: `0 0 60px ${gameUI.color}88`,
              }}>
              {num}
            </motion.div>
          ) : (
            <motion.div key="go"
              initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 340, damping: 16 }}
              className="text-display font-black leading-none select-none"
              style={{
                fontSize: '5rem',
                color: '#F5B642',
                textShadow: '0 0 60px rgba(245,182,66,0.8)',
              }}>
              VIA!
            </motion.div>
          )}
        </AnimatePresence>
        <div className="text-base font-black" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {isBooked
            ? (showGo ? '💃 BALLA!' : 'Preparati…')
            : (showGo ? '👏 Tifa!' : 'Prendi posizione…')}
        </div>
      </motion.div>
    );
  }

  return null;
}
