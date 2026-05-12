import { useEffect, useRef, useCallback } from 'react';
import { AudioManager, type AudioSlug, type AudioType } from '@/audio/AudioManager';
import { useAudioOrchestrator } from '@/contexts/AudioOrchestrator';

interface UseGameAudioOptions {
  autoLoop?: AudioType | string;
  preload?: boolean;
}

/**
 * Per-game audio hook.
 * Preloads audio for the given slug, starts the default loop on mount,
 * stops everything on unmount.
 * Registers the pending loop so the global AudioUnlockFab can play it on first tap.
 */
export function useGameAudio(slug: AudioSlug | string, options: UseGameAudioOptions = {}) {
  const { autoLoop = 'lobby_loop', preload = true } = options;
  const slugRef = useRef(slug);
  slugRef.current = slug;

  const { audioUnlocked, setPendingLoop } = useAudioOrchestrator();

  // Tell AudioOrchestrator which loop to play when audio is unlocked
  useEffect(() => {
    if (autoLoop) setPendingLoop(slug, autoLoop);
  }, [slug, autoLoop, setPendingLoop]);

  useEffect(() => {
    const s = slugRef.current;
    if (preload) void AudioManager.preload(s);
    if (autoLoop) void AudioManager.playLoop(s, autoLoop);
    return () => {
      AudioManager.stopLoop();
    };
  }, [slug, autoLoop, preload]);

  // Re-trigger loop when AudioContext gets unlocked (was suspended on mount)
  useEffect(() => {
    if (!audioUnlocked || !autoLoop) return;
    void AudioManager.playLoop(slugRef.current, autoLoop);
  }, [audioUnlocked, autoLoop]);

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
