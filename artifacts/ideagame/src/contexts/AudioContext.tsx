import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { AudioManager, DEFAULT_AUDIO_SETTINGS, type AudioSettings } from '@/audio/AudioManager';

const LS_KEY = 'ideagame:audio:settings';

function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_AUDIO_SETTINGS, ...JSON.parse(raw) as Partial<AudioSettings> };
  } catch { /* ignore */ }
  return { ...DEFAULT_AUDIO_SETTINGS };
}

function saveSettings(s: AudioSettings) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export interface AudioCtx {
  settings: AudioSettings;
  setMasterVolume: (v: number) => void;
  setMusicVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
  toggleMusic: () => void;
  toggleSfx: () => void;
  toggleMute: () => void;
  resetDefaults: () => void;
}

// Stable no-op default — prevents throws during HMR module-swap transitions
// and in any edge case where the provider tree hasn't mounted yet.
const DEFAULT_CTX: AudioCtx = {
  settings: { ...DEFAULT_AUDIO_SETTINGS },
  setMasterVolume: () => {},
  setMusicVolume:  () => {},
  setSfxVolume:    () => {},
  toggleMusic:     () => {},
  toggleSfx:       () => {},
  toggleMute:      () => {},
  resetDefaults:   () => {},
};

const Ctx = createContext<AudioCtx>(DEFAULT_CTX);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AudioSettings>(loadSettings);

  // Functional updater — always operates on latest prev state (no stale closures)
  const update = useCallback((patch: Partial<AudioSettings> | ((prev: AudioSettings) => Partial<AudioSettings>)) => {
    setSettings(prev => {
      const resolved = typeof patch === 'function' ? patch(prev) : patch;
      const next = { ...prev, ...resolved };
      saveSettings(next);
      AudioManager.applySettings(next);
      return next;
    });
  }, []);

  useEffect(() => {
    AudioManager.applySettings(settings);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable references — none of these depend on current settings values
  // (they use functional updater form to always see latest state)
  const setMasterVolume = useCallback((v: number) => update({ masterVolume: Math.max(0, Math.min(1, v)) }), [update]);
  const setMusicVolume  = useCallback((v: number) => update({ musicVolume:  Math.max(0, Math.min(1, v)) }), [update]);
  const setSfxVolume    = useCallback((v: number) => update({ sfxVolume:    Math.max(0, Math.min(1, v)) }), [update]);
  const toggleMusic     = useCallback(() => update(prev => ({ musicEnabled: !prev.musicEnabled })), [update]);
  const toggleSfx       = useCallback(() => update(prev => ({ sfxEnabled:   !prev.sfxEnabled   })), [update]);
  const toggleMute      = useCallback(() => update(prev => ({ muted:        !prev.muted        })), [update]);
  const resetDefaults   = useCallback(() => update({ ...DEFAULT_AUDIO_SETTINGS }), [update]);

  const value = useMemo<AudioCtx>(() => ({
    settings,
    setMasterVolume,
    setMusicVolume,
    setSfxVolume,
    toggleMusic,
    toggleSfx,
    toggleMute,
    resetDefaults,
  }), [settings, setMasterVolume, setMusicVolume, setSfxVolume, toggleMusic, toggleSfx, toggleMute, resetDefaults]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAudioSettings(): AudioCtx {
  return useContext(Ctx);
}
