/**
 * AudioOrchestrator — global show audio state.
 * Wraps AudioManager + AudioContext settings into one place:
 * – tracks projectorActive (persisted to localStorage)
 * – transitions music on game start/end and hub return
 * – exposes startProjector / stopProjector / setActiveGameSlug
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { AudioManager } from '@/audio/AudioManager';
import { useAudioSettings } from '@/contexts/AudioContext';
import { getSocket } from '@/hooks/useEventSocket';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';

/**
 * Maps tenant musicPaths keys to the AudioManager slug/type pairs.
 * The value stored in DB is an object-storage path like `/uploads/...`.
 * The playback URL is `/api/storage${objectPath}`.
 */
const MUSIC_PATH_MAP: Record<string, { slug: string; type: string }> = {
  lobby:              { slug: 'hub',               type: 'lobby_loop'   },
  quizzone:           { slug: 'quizzone',          type: 'round_loop'   },
  'sfida-ballo':      { slug: 'sfida-ballo',       type: 'round_loop'   },
  'percorso-a-risate':{ slug: 'percorso-a-risate', type: 'round_loop'   },
  'gioco-coppie':     { slug: 'gioco-coppie',      type: 'tension_loop' },
};

async function loadMusicOverrides() {
  try {
    const url = `${BASE}api/system-settings`.replace(/([^:])\/\//g, '$1/');
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) return;
    const rows = await r.json() as Array<{ key: string; value: unknown }>;
    const tenantRow = rows.find((r: { key: string }) => r.key === 'tenant.settings');
    if (!tenantRow || typeof tenantRow.value !== 'object' || !tenantRow.value) return;
    const musicPaths = (tenantRow.value as Record<string, unknown>).musicPaths as Record<string, string> | undefined;
    if (!musicPaths) return;
    AudioManager.clearLoopOverrides();
    for (const [key, objectPath] of Object.entries(musicPaths)) {
      const mapping = MUSIC_PATH_MAP[key];
      if (!mapping || !objectPath) continue;
      const playbackUrl = `${BASE}api/storage${objectPath}`.replace(/([^:])\/\//g, '$1/');
      AudioManager.setLoopOverride(mapping.slug, mapping.type, playbackUrl);
    }
  } catch { /* silent */ }
}

const LS_ACTIVE = 'ideagame:projector:active';
const LS_SLUG   = 'ideagame:projector:slug';

export interface AudioOrchestratorCtx {
  projectorActive: boolean;
  audioUnlocked: boolean;
  activeGameSlug: string | null;
  startProjector: () => void;
  stopProjector: () => void;
  setActiveGameSlug: (slug: string | null) => void;
  /** Call from a real user-gesture click to resume AudioContext and start music. */
  unlockAudio: () => void;
  /** Register the loop that should play when audio gets unlocked (called by game pages on mount). */
  setPendingLoop: (slug: string, type: string) => void;
}

const Ctx = createContext<AudioOrchestratorCtx>({
  projectorActive: false,
  audioUnlocked: false,
  activeGameSlug: null,
  startProjector: () => {},
  stopProjector: () => {},
  setActiveGameSlug: () => {},
  unlockAudio: () => {},
  setPendingLoop: () => {},
});

export function AudioOrchestratorProvider({ children }: { children: ReactNode }) {
  const [projectorActive, setProjectorActive] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_ACTIVE) === 'true'; } catch { return false; }
  });
  const [activeGameSlug, setSlugState] = useState<string | null>(() => {
    try { const s = localStorage.getItem(LS_SLUG); return s || null; } catch { return null; }
  });
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const pendingLoopRef = useRef<{ slug: string; type: string }>({ slug: 'hub', type: 'lobby_loop' });

  const setPendingLoop = useCallback((slug: string, type: string) => {
    pendingLoopRef.current = { slug, type };
  }, []);

  const unlockAudio = useCallback(() => {
    setAudioUnlocked(true);
    const { slug, type } = pendingLoopRef.current;
    void AudioManager.playLoop(slug, type);
  }, []);

  const { settings, setMasterVolume } = useAudioSettings();

  // Load tenant music overrides from DB on mount (and every 30s to pick up changes)
  useEffect(() => {
    void loadMusicOverrides();
    const id = setInterval(() => { void loadMusicOverrides(); }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Keep AudioManager in sync with AudioContext settings
  useEffect(() => {
    AudioManager.applySettings(settings);
  }, [settings]);

  // Listen for remote volume changes (from VolumeFab on presenter's phone)
  useEffect(() => {
    const socket = getSocket();
    const handler = (data: { volume: number }) => {
      if (typeof data?.volume === 'number') {
        setMasterVolume(data.volume);
      }
    };
    socket.on('volume:set', handler);
    return () => { socket.off('volume:set', handler); };
  }, [setMasterVolume]);

  const startProjector = useCallback(() => {
    setProjectorActive(true);
    try { localStorage.setItem(LS_ACTIVE, 'true'); } catch { /* ignore */ }
    setSlugState(null);
    try { localStorage.setItem(LS_SLUG, ''); } catch { /* ignore */ }
    // Audio is played by the projector page itself (Hub) via socket event or
    // its own projectorActive useEffect — never played on the controller device.
  }, []);

  const stopProjector = useCallback(() => {
    setProjectorActive(false);
    try { localStorage.setItem(LS_ACTIVE, 'false'); } catch { /* ignore */ }
    setSlugState(null);
    try { localStorage.setItem(LS_SLUG, ''); } catch { /* ignore */ }
    AudioManager.stopAll();
  }, []);

  const setActiveGameSlug = useCallback((slug: string | null) => {
    setSlugState(slug);
    try { localStorage.setItem(LS_SLUG, slug ?? ''); } catch { /* ignore */ }
    if (!projectorActive) {
      // Not unlocked yet; will auto-start next time projector starts
      return;
    }
    if (slug) {
      void AudioManager.transitionTo(slug);
    } else {
      void AudioManager.playLoop('hub', 'lobby_loop');
    }
  }, [projectorActive]);

  return (
    <Ctx.Provider value={{ projectorActive, audioUnlocked, activeGameSlug, startProjector, stopProjector, setActiveGameSlug, unlockAudio, setPendingLoop }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAudioOrchestrator(): AudioOrchestratorCtx {
  return useContext(Ctx);
}
