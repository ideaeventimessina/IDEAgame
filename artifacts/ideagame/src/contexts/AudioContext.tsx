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

interface AudioCtx {
  settings: AudioSettings;
  setMasterVolume: (v: number) => void;
  setMusicVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
  toggleMusic: () => void;
  toggleSfx: () => void;
  toggleMute: () => void;
  resetDefaults: () => void;
}

const Ctx = createContext<AudioCtx | undefined>(undefined);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AudioSettings>(loadSettings);

  const update = useCallback((patch: Partial<AudioSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      AudioManager.applySettings(next);
      return next;
    });
  }, []);

  useEffect(() => {
    AudioManager.applySettings(settings);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable function references — only recreated when `update` changes (never)
  const setMasterVolume = useCallback((v: number) => update({ masterVolume: Math.max(0, Math.min(1, v)) }), [update]);
  const setMusicVolume  = useCallback((v: number) => update({ musicVolume:  Math.max(0, Math.min(1, v)) }), [update]);
  const setSfxVolume    = useCallback((v: number) => update({ sfxVolume:    Math.max(0, Math.min(1, v)) }), [update]);
  const toggleMusic     = useCallback(() => update({ musicEnabled: !settings.musicEnabled }), [update, settings.musicEnabled]);
  const toggleSfx       = useCallback(() => update({ sfxEnabled:   !settings.sfxEnabled   }), [update, settings.sfxEnabled]);
  const toggleMute      = useCallback(() => update({ muted:        !settings.muted        }), [update, settings.muted]);
  const resetDefaults   = useCallback(() => update({ ...DEFAULT_AUDIO_SETTINGS }), [update]);

  // Memoize the context value so consumers only re-render when settings actually change
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
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAudioSettings must be used within AudioProvider');
  return ctx;
}
