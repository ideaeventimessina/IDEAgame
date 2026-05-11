/**
 * AudioOrchestrator — global show audio state.
 * Wraps AudioManager + AudioContext settings into one place:
 * – tracks projectorActive (persisted to localStorage)
 * – transitions music on game start/end and hub return
 * – exposes startProjector / stopProjector / setActiveGameSlug
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { AudioManager } from '@/audio/AudioManager';
import { useAudioSettings } from '@/contexts/AudioContext';
import { getSocket } from '@/hooks/useEventSocket';

const LS_ACTIVE = 'ideagame:projector:active';
const LS_SLUG   = 'ideagame:projector:slug';

export interface AudioOrchestratorCtx {
  projectorActive: boolean;
  activeGameSlug: string | null;
  startProjector: () => void;
  stopProjector: () => void;
  setActiveGameSlug: (slug: string | null) => void;
}

const Ctx = createContext<AudioOrchestratorCtx>({
  projectorActive: false,
  activeGameSlug: null,
  startProjector: () => {},
  stopProjector: () => {},
  setActiveGameSlug: () => {},
});

export function AudioOrchestratorProvider({ children }: { children: ReactNode }) {
  const [projectorActive, setProjectorActive] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_ACTIVE) === 'true'; } catch { return false; }
  });
  const [activeGameSlug, setSlugState] = useState<string | null>(() => {
    try { const s = localStorage.getItem(LS_SLUG); return s || null; } catch { return null; }
  });

  const { settings, setMasterVolume } = useAudioSettings();

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
    void AudioManager.playLoop('hub', 'lobby_loop');
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
    <Ctx.Provider value={{ projectorActive, activeGameSlug, startProjector, stopProjector, setActiveGameSlug }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAudioOrchestrator(): AudioOrchestratorCtx {
  return useContext(Ctx);
}
