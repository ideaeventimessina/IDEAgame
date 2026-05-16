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
 * Maps tenant musicPaths admin keys to ONE OR MORE AudioManager {slug, type} pairs.
 *
 * Keys must match EXACTLY the values stored in home_sessions.gameSlug (and the games table slug).
 * Each key targets two slots:
 *   - lobby_loop  → classic projector / pre-game lobby music
 *   - round_loop  → in-round music (Home Mode TV board)
 *
 * The value stored in DB is an object-storage path like `/uploads/...`.
 * The playback URL is `/api/storage${objectPath}`.
 *
 * WRONG slugs removed: home-quiz, home-ballo, home-coppie, home-percorso,
 *   home-adult, home-karaoke, home-freestyle, home-saramusica, home-wordback.
 * These never appear in session.gameSlug — they were internal loadGameRounds() mode strings.
 */
const MUSIC_PATH_MAP: Record<string, Array<{ slug: string; type: string }>> = {
  lobby:              [
    { slug: 'hub',               type: 'lobby_loop'  },
  ],
  quizzone:           [
    { slug: 'quizzone',          type: 'lobby_loop'  },
    { slug: 'quizzone',          type: 'round_loop'  },
  ],
  'sfida-ballo':      [
    { slug: 'sfida-ballo',       type: 'lobby_loop'  },
    { slug: 'sfida-ballo',       type: 'round_loop'  },
  ],
  'percorso-a-risate':[
    { slug: 'percorso-a-risate', type: 'lobby_loop'  },
    { slug: 'percorso-a-risate', type: 'round_loop'  },
  ],
  'gioco-coppie':     [
    { slug: 'gioco-coppie',      type: 'lobby_loop'  },
    { slug: 'gioco-coppie',      type: 'round_loop'  },
  ],
  'adult-only':       [
    { slug: 'adult-only',        type: 'lobby_loop'  },
    { slug: 'adult-only',        type: 'round_loop'  },
  ],
  'karaoke-battle':   [
    { slug: 'karaoke-battle',    type: 'lobby_loop'  },
    { slug: 'karaoke-battle',    type: 'round_loop'  },
  ],
  'freestyle-battle': [
    { slug: 'freestyle-battle',  type: 'lobby_loop'  },
    { slug: 'freestyle-battle',  type: 'round_loop'  },
  ],
  saramusica:         [
    { slug: 'saramusica',        type: 'lobby_loop'  },
    { slug: 'saramusica',        type: 'round_loop'  },
  ],
  'parola-alle-spalle':[
    { slug: 'parola-alle-spalle',type: 'lobby_loop'  },
    { slug: 'parola-alle-spalle',type: 'round_loop'  },
  ],
};

async function loadMusicOverrides() {
  try {
    // Use the public /home/music-config endpoint so unauthenticated devices
    // (Home Mode TV board, player phones) can load overrides without a session cookie.
    // Pass the current URL's ?s= param so the server can scope to the right tenant.
    const sessionId = new URLSearchParams(window.location.search).get('s');
    const qs = sessionId ? `?s=${encodeURIComponent(sessionId)}` : '';
    const url = `${BASE}api/home/music-config${qs}`.replace(/([^:])\/\//g, '$1/');
    const r = await fetch(url);
    if (!r.ok) return;
    const data = await r.json() as { musicPaths: Record<string, string> };
    const musicPaths = data.musicPaths;
    if (!musicPaths || !Object.keys(musicPaths).length) return;
    AudioManager.clearLoopOverrides();
    let registered = 0;
    for (const [key, objectPath] of Object.entries(musicPaths)) {
      const targets = MUSIC_PATH_MAP[key];
      if (!targets || !objectPath) continue;
      const playbackUrl = `${BASE}api/storage${objectPath}`.replace(/([^:])\/\//g, '$1/');
      for (const { slug, type } of targets) {
        AudioManager.setLoopOverride(slug, type, playbackUrl);
        registered++;
      }
    }
    console.log('[HomeAudio] loaded paths', { musicPaths, registered, sessionId });
    // If a loop is already playing with a now-overridden slot, switch to the custom track
    await AudioManager.reloadCurrentLoop();
  } catch { /* silent */ }
}

const LS_ACTIVE    = 'ideagame:projector:active';
const LS_SLUG      = 'ideagame:projector:slug';
const LS_UNLOCKED  = 'ideagame:audio:unlocked';

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
  /**
   * Set when a loop was requested but no tenant-uploaded track exists.
   * Shown only in regia / presenter UI as a non-blocking warning.
   */
  missingLoopTrack: { slug: string; type: string } | null;
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
  missingLoopTrack: null,
});

export function AudioOrchestratorProvider({ children }: { children: ReactNode }) {
  const [projectorActive, setProjectorActive] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_ACTIVE) === 'true'; } catch { return false; }
  });
  const [activeGameSlug, setSlugState] = useState<string | null>(() => {
    try { const s = localStorage.getItem(LS_SLUG); return s || null; } catch { return null; }
  });
  const [audioUnlocked, setAudioUnlockedState] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_UNLOCKED) === 'true'; } catch { return false; }
  });
  const pendingLoopRef = useRef<{ slug: string; type: string }>({ slug: 'hub', type: 'lobby_loop' });
  const [missingLoopTrack, setMissingLoopTrack] = useState<{ slug: string; type: string } | null>(null);

  const setAudioUnlocked = useCallback((v: boolean) => {
    try { localStorage.setItem(LS_UNLOCKED, v ? 'true' : 'false'); } catch { /* ignore */ }
    setAudioUnlockedState(v);
  }, []);

  const setPendingLoop = useCallback((slug: string, type: string) => {
    pendingLoopRef.current = { slug, type };
  }, []);

  const unlockAudio = useCallback(() => {
    setAudioUnlocked(true);
    const { slug, type } = pendingLoopRef.current;
    void AudioManager.playLoop(slug, type);
  }, [setAudioUnlocked]);

  // On mount: if audio was previously unlocked AND projector is active, attempt to resume.
  // This covers HMR reloads, page refreshes, and socket-driven starts where Hub had
  // a prior user gesture but state was lost.
  useEffect(() => {
    if (!audioUnlocked || !projectorActive) return;
    const { slug, type } = pendingLoopRef.current;
    void (async () => {
      const ok = await AudioManager.playLoop(slug, type);
      if (!ok) {
        // Browser still blocking — clear persisted unlock so the fab re-appears
        setAudioUnlocked(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { settings, setMasterVolume } = useAudioSettings();

  // Load tenant music overrides from DB on mount (and every 30s to pick up changes)
  useEffect(() => {
    void loadMusicOverrides();
    const id = setInterval(() => { void loadMusicOverrides(); }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Poll AudioManager every 2s for missing-loop warnings (regia/presenter only).
  // This is cheap — it's a synchronous getter on a singleton field.
  useEffect(() => {
    const id = setInterval(() => {
      setMissingLoopTrack(AudioManager.getMissingLoop());
    }, 2_000);
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
    <Ctx.Provider value={{ projectorActive, audioUnlocked, activeGameSlug, startProjector, stopProjector, setActiveGameSlug, unlockAudio, setPendingLoop, missingLoopTrack }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAudioOrchestrator(): AudioOrchestratorCtx {
  return useContext(Ctx);
}
