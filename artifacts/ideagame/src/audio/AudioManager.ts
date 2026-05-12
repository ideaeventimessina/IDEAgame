/**
 * Jonny's World — Soundtrack Engine
 * Singleton AudioManager. Silent fallback on any error or missing file.
 *
 * All audio is MP3-only. If a file doesn't exist for the given slug/type,
 * it silently falls back to global/ then stays silent — no procedural music.
 */

export type AudioSlug =
  | 'global' | 'hub'
  | 'percorso-a-risate' | 'gioco-coppie' | 'quizzone'
  | 'saramusica' | 'adult-only' | 'sfida-ballo'
  | 'parola-alle-spalle' | 'karaoke-battle' | 'freestyle-battle';

export type AudioType =
  | 'intro_5s' | 'lobby_loop' | 'round_loop' | 'tension_loop'
  | 'countdown_10s' | 'correct_stinger' | 'wrong_stinger'
  | 'score_stinger' | 'winner_stinger' | 'transition_whoosh'
  | 'panic_blackout' | 'podium_theme' | 'applause' | 'suspense'
  | 'flip_card' | 'match_correct' | 'match_wrong' | 'crowd_hype'
  | 'booking_ding' | 'success_applause' | 'energy_rise' | 'winner_drop'
  | 'stage_intro' | 'karaoke_bed' | 'boo_soft';

export interface AudioSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  musicEnabled: boolean;
  sfxEnabled: boolean;
  muted: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterVolume: 0.8,
  musicVolume: 0.7,
  sfxVolume: 1.0,
  musicEnabled: true,
  sfxEnabled: true,
  muted: false,
};

const CROSSFADE_DURATION = 1200;
const FADE_STEPS = 20;

function apiAudioUrl(slug: string, type: string): string {
  const base = (import.meta.env.BASE_URL as string | undefined) ?? '/';
  return `${base}api/audio/files/${slug}/${type}`.replace(/([^:])\/\//g, '$1/');
}

async function fileExists(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok;
  } catch {
    return false;
  }
}

class _AudioManager {
  private settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  private currentLoop: HTMLAudioElement | null = null;
  private currentLoopSlug: string | null = null;
  private currentLoopType: string | null = null;
  private knownFiles = new Map<string, boolean>();
  private activeStingers = new Set<HTMLAudioElement>();

  applySettings(s: AudioSettings) {
    this.settings = { ...s };
    if (this.currentLoop) {
      this.currentLoop.volume = this.loopVol();
      this.currentLoop.muted  = s.muted || !s.musicEnabled;
    }
  }

  private loopVol(): number {
    const { masterVolume, musicVolume, muted, musicEnabled } = this.settings;
    if (muted || !musicEnabled) return 0;
    return Math.min(1, masterVolume * musicVolume);
  }

  private sfxVol(): number {
    const { masterVolume, sfxVolume, muted, sfxEnabled } = this.settings;
    if (muted || !sfxEnabled) return 0;
    return Math.min(1, masterVolume * sfxVolume);
  }

  private async resolveUrl(slug: AudioSlug | string, type: AudioType | string): Promise<string | null> {
    const primary = apiAudioUrl(slug, type);
    if (this.knownFiles.has(primary)) {
      return this.knownFiles.get(primary) ? primary : null;
    }
    const exists = await fileExists(primary);
    this.knownFiles.set(primary, exists);
    if (exists) return primary;

    if (slug !== 'global') {
      const fallback = apiAudioUrl('global', type);
      if (this.knownFiles.has(fallback)) {
        return this.knownFiles.get(fallback) ? fallback : null;
      }
      const fExists = await fileExists(fallback);
      this.knownFiles.set(fallback, fExists);
      return fExists ? fallback : null;
    }
    return null;
  }

  async preload(slug: AudioSlug | string) {
    const types: (AudioType | string)[] = [
      'intro_5s', 'countdown_10s', 'correct_stinger', 'wrong_stinger',
      'score_stinger', 'winner_stinger', 'transition_whoosh', 'applause',
    ];
    await Promise.all(types.map(t => this.resolveUrl(slug, t)));
  }

  /**
   * Play a loop. Loads from MP3 file.
   * If no file exists for the slug, tries global/ fallback, then stays silent.
   */
  async playLoop(slug: AudioSlug | string, type: AudioType | string = 'round_loop') {
    if (!this.settings.musicEnabled || this.settings.muted) return;
    if (this.currentLoopSlug === slug && this.currentLoopType === type) return;

    const src = await this.resolveUrl(slug, type);

    // No MP3 found — stop current loop and stay silent
    if (!src) {
      this._stopMp3Loop();
      this.currentLoopSlug = slug;
      this.currentLoopType = type;
      return;
    }

    // MP3 found — crossfade in
    const prev = this.currentLoop;
    const audio = new Audio(src);
    audio.loop   = true;
    audio.volume = 0;

    this.currentLoop     = audio;
    this.currentLoopSlug = slug;
    this.currentLoopType = type;

    try {
      await audio.play();
    } catch {
      this.currentLoop = prev;
      return;
    }

    const targetVol = this.loopVol();
    let step = 0;
    const interval = setInterval(() => {
      step++;
      const t = step / FADE_STEPS;
      audio.volume = Math.min(targetVol, targetVol * t);
      if (prev) prev.volume = Math.max(0, (1 - t) * prev.volume);
      if (step >= FADE_STEPS) {
        clearInterval(interval);
        if (prev) { prev.pause(); prev.src = ''; }
      }
    }, CROSSFADE_DURATION / FADE_STEPS);
  }

  private _stopMp3Loop(immediate = false) {
    const prev = this.currentLoop;
    this.currentLoop = null;
    if (!prev) return;

    if (immediate) {
      prev.pause(); prev.src = '';
      return;
    }

    let step = 0;
    const startVol = prev.volume;
    const interval = setInterval(() => {
      step++;
      prev.volume = Math.max(0, startVol * (1 - step / FADE_STEPS));
      if (step >= FADE_STEPS) {
        clearInterval(interval);
        prev.pause(); prev.src = '';
      }
    }, CROSSFADE_DURATION / FADE_STEPS);
  }

  stopLoop(immediate = false) {
    this.currentLoopSlug = null;
    this.currentLoopType = null;
    this._stopMp3Loop(immediate);
  }

  async playStinger(slug: AudioSlug | string, type: AudioType | string) {
    if (!this.settings.sfxEnabled || this.settings.muted) return;
    const vol = this.sfxVol();
    if (vol === 0) return;

    const src = await this.resolveUrl(slug, type);
    if (!src) return;

    const audio = new Audio(src);
    audio.volume = vol;
    this.activeStingers.add(audio);

    audio.addEventListener('ended', () => {
      this.activeStingers.delete(audio);
      audio.src = '';
    });
    audio.addEventListener('error', () => {
      this.activeStingers.delete(audio);
    });

    try {
      await audio.play();
    } catch {
      this.activeStingers.delete(audio);
    }
  }

  stopAll() {
    this.currentLoopSlug = null;
    this.currentLoopType = null;
    this._stopMp3Loop(true);
    this.activeStingers.forEach(a => { a.pause(); a.src = ''; });
    this.activeStingers.clear();
  }

  playGlobalStinger(type: AudioType | string) {
    void this.playStinger('global', type);
  }

  setMasterVolume(v: number) {
    this.applySettings({ ...this.settings, masterVolume: Math.max(0, Math.min(1, v)) });
  }

  async transitionTo(nextSlug: AudioSlug | string) {
    this.stopLoop();
    await new Promise(r => setTimeout(r, 600));
    await this.playStinger('global', 'transition_whoosh');
    await new Promise(r => setTimeout(r, 800));
    await this.playStinger(nextSlug, 'intro_5s');
    await this.preload(nextSlug);
    setTimeout(() => { void this.playLoop(nextSlug, 'lobby_loop'); }, 5500);
  }

  clearCache() {
    this.knownFiles.clear();
  }

  get isLoopPlaying(): boolean {
    return !!this.currentLoop && !this.currentLoop.paused;
  }
  get activeSlug(): string | null { return this.currentLoopSlug; }
  get activeType(): string | null { return this.currentLoopType; }
}

export const AudioManager = new _AudioManager();
