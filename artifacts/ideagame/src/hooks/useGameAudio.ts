import { useEffect, useRef, useCallback } from 'react';
import { AudioManager, type AudioSlug, type AudioType } from '@/audio/AudioManager';

interface UseGameAudioOptions {
  autoLoop?: AudioType | string;
  preload?: boolean;
}

/**
 * Per-game audio hook.
 * Preloads audio for the given slug, starts the default loop on mount,
 * stops everything on unmount.
 */
export function useGameAudio(slug: AudioSlug | string, options: UseGameAudioOptions = {}) {
  const { autoLoop = 'lobby_loop', preload = true } = options;
  const slugRef = useRef(slug);
  slugRef.current = slug;

  useEffect(() => {
    const s = slugRef.current;
    if (preload) void AudioManager.preload(s);
    if (autoLoop) void AudioManager.playLoop(s, autoLoop);
    return () => {
      AudioManager.stopLoop();
    };
  }, [slug, autoLoop, preload]);

  const playLoop = useCallback((type: AudioType | string = 'round_loop') => {
    void AudioManager.playLoop(slugRef.current, type);
  }, []);

  const stopLoop = useCallback((immediate = false) => {
    AudioManager.stopLoop(immediate);
  }, []);

  const playStinger = useCallback((type: AudioType | string) => {
    void AudioManager.playStinger(slugRef.current, type);
  }, []);

  const playGlobalStinger = useCallback((type: AudioType | string) => {
    void AudioManager.playStinger('global', type);
  }, []);

  const stopAll = useCallback(() => {
    AudioManager.stopAll();
  }, []);

  return { playLoop, stopLoop, playStinger, playGlobalStinger, stopAll };
}
