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

/**
 * Loop types are continuous background music.
 * For these, we NEVER fall back to static bundled files —
 * either a tenant-uploaded track plays, or there is silence.
 * Stingers/SFX keep their static fallback so gameplay feedback always works.
 */
const LOOP_TYPES = new Set([
  'lobby_loop', 'round_loop', 'tension_loop',
  'podium_theme', 'suspense', 'karaoke_bed',
]);

function apiAudioUrl(slug: string, type: string): string {
  const base = (import.meta.env.BASE_URL as string | undefined) ?? '/';
  return `${base}api/audio/files/${slug}/${type}`.replace(/([^:])\/\//g, '$1/');
}

/** Static Vite asset — bundled permanently in public/audio/jonny-world/ */
function staticAudioUrl(slug: string, type: string): string {
  const base = (import.meta.env.BASE_URL as string | undefined) ?? '/';
  return `${base}audio/jonny-world/${slug}/${type}.mp3`.replace(/([^:])\/\//g, '$1/');
}

async function fileExists(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok;
  } catch {
    return false;
  }
}

async function resolveFirst(urls: string[], cache: Map<string, boolean>): Promise<string | null> {
  for (const url of urls) {
    if (cache.has(url)) {
      if (cache.get(url)) return url;
      continue;
    }
    const exists = await fileExists(url);
    cache.set(url, exists);
    if (exists) return url;
  }
  return null;
}

class _AudioManager {
  private settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  private currentLoop: HTMLAudioElement | null = null;
  private currentLoopSlug: string | null = null;
  private currentLoopType: string | null = null;
  /** The resolved src URL currently playing — used to skip redundant reloads. */
  private currentLoopSrc: string | null = null;
  /** Set when the requested loop has no URL (no tenant upload, no API file). */
  private missingLoop: { slug: string; type: string } | null = null;
  private knownFiles = new Map<string, boolean>();
  private activeStingers = new Set<HTMLAudioElement>();
  /** Tenant-uploaded music overrides: `slug/type` → full URL. Checked before static assets. */
  private loopOverrides = new Map<string, string>();

  /**
   * Register a tenant-uploaded track URL for a specific slot.
   * Pass `null` to remove an override and fall back to static/api assets.
   */
  setLoopOverride(slug: string, type: string, url: string | null) {
    const key = `${slug}/${type}`;
    if (url) {
      this.loopOverrides.set(key, url);
    } else {
      this.loopOverrides.delete(key);
    }
    // Bust the existence cache so the new URL is tried next time
    this.knownFiles.delete(url ?? '');
  }

  clearLoopOverrides() {
    this.loopOverrides.clear();
  }

  /**
   * Call this SYNCHRONOUSLY inside a user-gesture handler (e.g. button onClick) to
   * unlock browser autoplay for this tab. Safe to call multiple times.
   * After this, AudioManager.playLoop() will succeed even after awaits.
   */
  resumeContext() {
    // A tiny silent WAV (1 sample) played synchronously during the gesture
    // convinces the browser this tab has had user interaction with audio.
    const a = new Audio(
      'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA',
    );
    a.volume = 0;
    void a.play().catch(() => {});
  }

  /**
   * If a loop is currently playing and now has a tenant override registered,
   * restart it so the override URL is used immediately.
   */
  async reloadCurrentLoop() {
    const slug = this.currentLoopSlug;
    const type = this.currentLoopType;
    if (!slug || !type) return;
    // Only reload if there is actually an override for this slot
    if (!this.loopOverrides.has(`${slug}/${type}`)) return;
    // Resolve the URL that would play — if it's already playing, do nothing.
    // This prevents the 30-second interval from causing repeated crossfade cycles.
    const newSrc = await this.resolveUrl(slug, type);
    if (!newSrc || newSrc === this.currentLoopSrc) return;
    // Reset the guard so playLoop doesn't short-circuit
    this.currentLoopSlug = null;
    this.currentLoopType = null;
    await this.playLoop(slug, type);
  }

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

  /** Read the currently-missing loop (for regia/presenter warning UI). */
  getMissingLoop(): { slug: string; type: string } | null {
    return this.missingLoop;
  }

  private async resolveUrl(slug: AudioSlug | string, type: AudioType | string): Promise<string | null> {
    // Priority: 1) tenant-uploaded override (object storage — highest priority)
    //           2) API-uploaded file (audio engine uploads)
    //           3) static Vite asset — ONLY for stingers/SFX, NEVER for loops
    //           4) global/ fallback — same rule: static only for stingers
    const override = this.loopOverrides.get(`${slug}/${type}`);
    if (override) return override;

    const isLoop = LOOP_TYPES.has(String(type));

    if (isLoop) {
      // Loops: no static fallback — tenant upload or silence.
      return resolveFirst([
        apiAudioUrl(slug, type),
        ...(slug !== 'global' ? [apiAudioUrl('global', type)] : []),
      ], this.knownFiles);
    }

    // Stingers / SFX: full chain including static bundled files.
    return resolveFirst([
      apiAudioUrl(slug, type),
      staticAudioUrl(slug, type),
      ...(slug !== 'global' ? [apiAudioUrl('global', type), staticAudioUrl('global', type)] : []),
    ], this.knownFiles);
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
  /** Returns true if the loop started, false if blocked by browser autoplay policy or settings. */
  async playLoop(slug: AudioSlug | string, type: AudioType | string = 'round_loop'): Promise<boolean> {
    if (!this.settings.musicEnabled || this.settings.muted) return false;
    if (this.currentLoopSlug === slug && this.currentLoopType === type) return true;

    // Snapshot previous state so we can restore on autoplay block.
    const prev     = this.currentLoop;
    const prevSlug = this.currentLoopSlug;
    const prevType = this.currentLoopType;
    const prevSrc  = this.currentLoopSrc;
    const prevVol  = prev?.volume ?? 0;

    // Claim the slot immediately so concurrent calls don't race.
    this.currentLoopSlug = slug;
    this.currentLoopType = type;
    this.currentLoop     = null;
    this.currentLoopSrc  = null;

    // ── Fade-out the old loop NOW — don't wait for URL resolution ──────────
    // We track the interval so we can cancel it if autoplay is later blocked.
    let fadeOutInterval: ReturnType<typeof setInterval> | null = null;
    if (prev) {
      let step = 0;
      fadeOutInterval = setInterval(() => {
        step++;
        prev.volume = Math.max(0, prevVol * (1 - step / FADE_STEPS));
        if (step >= FADE_STEPS) {
          clearInterval(fadeOutInterval!);
          fadeOutInterval = null;
          prev.pause();
          prev.src = '';
        }
      }, CROSSFADE_DURATION / FADE_STEPS);
    }

    // ── Resolve the new URL concurrently with the fade-out ─────────────────
    const src = await this.resolveUrl(slug, type);

    if (!src) {
      // No file — fade-out already running, just record missing state.
      this.currentLoopSrc = null;
      if (LOOP_TYPES.has(String(type))) {
        this.missingLoop = { slug: String(slug), type: String(type) };
      }
      return true; // intentionally silent
    }

    this.missingLoop = null;

    // ── New track: create element and attempt play ─────────────────────────
    const audio = new Audio(src);
    audio.loop   = true;
    audio.volume = 0;

    this.currentLoop    = audio;
    this.currentLoopSrc = src;

    try {
      await audio.play();
    } catch {
      // Browser blocked autoplay — cancel the fade-out and restore old loop.
      if (fadeOutInterval) {
        clearInterval(fadeOutInterval);
        fadeOutInterval = null;
      }
      if (prev) prev.volume = prevVol;
      this.currentLoop     = prev;
      this.currentLoopSlug = prevSlug;
      this.currentLoopType = prevType;
      this.currentLoopSrc  = prevSrc;
      return false;
    }

    // ── Fade in new track ──────────────────────────────────────────────────
    const targetVol = this.loopVol();
    let fadeInStep = 0;
    const fadeInInterval = setInterval(() => {
      fadeInStep++;
      audio.volume = Math.min(targetVol, targetVol * (fadeInStep / FADE_STEPS));
      if (fadeInStep >= FADE_STEPS) clearInterval(fadeInInterval);
    }, CROSSFADE_DURATION / FADE_STEPS);

    return true;
  }

  private _stopMp3Loop(immediate = false) {
    const prev = this.currentLoop;
    this.currentLoop    = null;
    this.currentLoopSrc = null;
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
