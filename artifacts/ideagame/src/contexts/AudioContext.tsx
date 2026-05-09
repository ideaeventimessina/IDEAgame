import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
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

  const value: AudioCtx = {
    settings,
    setMasterVolume: v => update({ masterVolume: Math.max(0, Math.min(1, v)) }),
    setMusicVolume:  v => update({ musicVolume:  Math.max(0, Math.min(1, v)) }),
    setSfxVolume:    v => update({ sfxVolume:    Math.max(0, Math.min(1, v)) }),
    toggleMusic:     () => update({ musicEnabled: !settings.musicEnabled }),
    toggleSfx:       () => update({ sfxEnabled:   !settings.sfxEnabled }),
    toggleMute:      () => update({ muted: !settings.muted }),
    resetDefaults:   () => update({ ...DEFAULT_AUDIO_SETTINGS }),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAudioSettings(): AudioCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAudioSettings must be used within AudioProvider');
  return ctx;
}
