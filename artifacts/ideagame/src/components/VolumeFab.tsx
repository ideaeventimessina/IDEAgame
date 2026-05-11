/**
 * VolumeFab — floating volume control for the Presenter page.
 *
 * Features:
 * – Big +/– buttons (easy to tap without looking)
 * – Vertical slider for fine control
 * – Keyboard shortcuts: ArrowUp/] = +5%, ArrowDown/[ = -5%, M = mute
 * – Socket relay: emits "volume:set" so the projector mirrors the change
 * – Silent MediaSession keepalive: once active the phone's hardware volume
 *   buttons switch to "media mode" (visual OS overlay) rather than ringer mode
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX, ChevronUp, ChevronDown, X } from 'lucide-react';
import { useAudioSettings } from '@/contexts/AudioContext';

interface VolumeFabProps {
  /** emit + on from useEventSocket – pass null/undefined to skip socket relay */
  emit?: (event: string, data?: unknown) => void;
  on?: <T = unknown>(event: string, handler: (data: T) => void) => () => void;
}

// Minimal 1-second silence encoded as a data URI (44100Hz 16-bit mono)
// Keeps an HTMLAudio element "playing" so the OS shows Media-volume overlay
// when hardware buttons are pressed instead of Ringer-volume.
const SILENCE_SRC =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAA' +
  'EAAQAAwF0AAIC7AAACABAAZGF0YQAAAAA=';

export function VolumeFab({ emit, on }: VolumeFabProps) {
  const [open, setOpen] = useState(false);
  const { settings, setMasterVolume, toggleMute } = useAudioSettings();
  const silentRef = useRef<HTMLAudioElement | null>(null);

  // ── MediaSession keepalive ─────────────────────────────────────────────────
  useEffect(() => {
    const audio = new Audio(SILENCE_SRC);
    audio.loop = true;
    audio.volume = 0.01; // near-silent
    silentRef.current = audio;

    // Play (may be blocked until a gesture; we try anyway)
    audio.play().catch(() => { /* blocked – that's fine */ });

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'IDEAgame — Show Audio',
        artist: 'Presentatore',
      });
      // Register no-op handlers so the OS shows the media overlay
      navigator.mediaSession.setActionHandler('play',  () => {});
      navigator.mediaSession.setActionHandler('pause', () => {});
    }

    return () => {
      audio.pause();
      audio.src = '';
      silentRef.current = null;
    };
  }, []);

  // ── Volume adjustment helper ───────────────────────────────────────────────
  const adjustVolume = useCallback((delta: number) => {
    const next = Math.max(0, Math.min(1, settings.masterVolume + delta));
    setMasterVolume(next);
    emit?.('volume:set', { volume: next });
  }, [settings.masterVolume, setMasterVolume, emit]);

  const setVolume = useCallback((v: number) => {
    const next = Math.max(0, Math.min(1, v));
    setMasterVolume(next);
    emit?.('volume:set', { volume: next });
  }, [setMasterVolume, emit]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowUp'   || e.key === ']') { e.preventDefault(); adjustVolume(+0.05); }
      if (e.key === 'ArrowDown' || e.key === '[') { e.preventDefault(); adjustVolume(-0.05); }
      if (e.key === 'm' || e.key === 'M') { e.preventDefault(); toggleMute(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [adjustVolume, toggleMute]);

  // ── Listen for volume changes from other devices ───────────────────────────
  useEffect(() => {
    if (!on) return;
    const unsub = on<{ volume: number }>('volume:set', ({ volume }) => {
      setMasterVolume(volume);
    });
    return unsub;
  }, [on, setMasterVolume]);

  const vol  = settings.muted ? 0 : settings.masterVolume;
  const pct  = Math.round(settings.masterVolume * 100);
  const muted = settings.muted;

  return (
    <div className="fixed bottom-6 right-4 z-50 flex flex-col items-end gap-2 pointer-events-none">

      {/* Expanded panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 12 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{ opacity: 0, scale: 0.85, y: 12 }}
            transition={{ type: 'spring', stiffness: 340, damping: 26 }}
            className="pointer-events-auto rounded-3xl border border-white/15 shadow-2xl flex flex-col items-center gap-2 px-4 py-4 w-[72px]"
            style={{ background: 'rgba(6,2,19,0.92)', backdropFilter: 'blur(20px)' }}
          >
            {/* Close */}
            <button
              onClick={() => setOpen(false)}
              className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors active:scale-90"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            {/* Vol UP */}
            <button
              onClick={() => adjustVolume(+0.1)}
              className="w-12 h-12 rounded-2xl flex items-center justify-center border active:scale-90 transition-transform"
              style={{ background: 'rgba(245,182,66,0.15)', borderColor: 'rgba(245,182,66,0.35)' }}
            >
              <ChevronUp className="h-6 w-6" style={{ color: '#F5B642' }} />
            </button>

            {/* Percentage */}
            <div className="text-display text-sm font-black" style={{ color: '#F5B642' }}>
              {pct}%
            </div>

            {/* Vertical slider */}
            <div className="h-32 flex items-center justify-center">
              <input
                type="range"
                min={0}
                max={100}
                value={pct}
                onChange={e => setVolume(Number(e.target.value) / 100)}
                className="cursor-pointer"
                style={{
                  writingMode: 'vertical-lr',
                  direction: 'rtl',
                  width: 44,
                  height: 128,
                  accentColor: '#F5B642',
                } as React.CSSProperties}
              />
            </div>

            {/* Vol DOWN */}
            <button
              onClick={() => adjustVolume(-0.1)}
              className="w-12 h-12 rounded-2xl flex items-center justify-center border border-border bg-white/5 active:scale-90 transition-transform"
            >
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            </button>

            {/* Mute toggle */}
            <button
              onClick={() => { toggleMute(); emit?.('volume:set', { volume: muted ? settings.masterVolume : 0 }); }}
              className={`w-12 h-8 rounded-xl flex items-center justify-center text-xs font-black transition-colors active:scale-90 ${
                muted ? 'bg-red-500/20 border border-red-500/40 text-red-400' : 'bg-white/5 border border-border text-muted-foreground'
              }`}
            >
              {muted ? 'MUTE' : 'M'}
            </button>

            {/* Shortcut hint */}
            <div className="text-[9px] text-muted-foreground/50 text-center leading-tight">
              ↑↓ tasti
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB button */}
      <motion.button
        onClick={() => setOpen(v => !v)}
        whileTap={{ scale: 0.88 }}
        className="pointer-events-auto h-14 w-14 rounded-2xl shadow-2xl flex flex-col items-center justify-center gap-0.5 border border-white/20 transition-colors"
        style={{
          background: muted
            ? 'rgba(239,68,68,0.25)'
            : open
              ? 'rgba(245,182,66,0.30)'
              : 'rgba(245,182,66,0.18)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
        title="Volume — apri controllo (↑↓ o ]/[  per cambiare)"
      >
        {muted || vol === 0
          ? <VolumeX className="h-5 w-5 text-red-400" />
          : <Volume2 className="h-5 w-5" style={{ color: '#F5B642' }} />
        }
        <span
          className="text-[9px] font-black tabular-nums leading-none"
          style={{ color: muted ? '#f87171' : '#F5B642' }}
        >
          {muted ? 'MUTE' : `${pct}%`}
        </span>
      </motion.button>
    </div>
  );
}
