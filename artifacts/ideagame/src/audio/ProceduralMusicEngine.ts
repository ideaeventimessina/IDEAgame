/**
 * ProceduralMusicEngine — Web Audio API musical loop generator
 *
 * Replaces the Python-synthesized MP3 loops with real harmonic music.
 * Three voices per bar: sustained chord pad + bass line + arpeggio.
 * A short delay feedback adds depth without external reverb plugins.
 *
 * Usage: ProceduralMusicEngine.play('lobby', 0.56) / .stop() / .setVolume(v)
 */

const NOTES: Record<string, number> = {
  C2: 65.41,  D2: 73.42,  E2: 82.41,  F2: 87.31,  G2: 98.00,
  A2: 110.00, Bb2: 116.54, B2: 123.47,
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00,
  Gs3: 207.65, A3: 220.00, Bb3: 233.08, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00,
  Gs4: 415.30, A4: 440.00, Bb4: 466.16, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00,
};

export type Mood = 'lobby' | 'round' | 'tension' | 'podium';

interface BarDef {
  chordNotes: string[];
  bassNote: string;
}

interface MoodConfig {
  bpm: number;
  bars: BarDef[];
  arpPattern: number[];
  padVol: number;
  arpVol: number;
  bassVol: number;
  arpWave: OscillatorType;
  padWave: OscillatorType;
  delayFeedback: number;
  delayWet: number;
}

const MOODS: Record<Mood, MoodConfig> = {
  /** Lounge jazz feel — Fmaj7 → Bbmaj7 → Gm7 → C7, 108 BPM */
  lobby: {
    bpm: 108,
    bars: [
      { chordNotes: ['F4', 'A4', 'C5', 'E5'], bassNote: 'F2' },
      { chordNotes: ['Bb3', 'D4', 'F4', 'A4'], bassNote: 'Bb2' },
      { chordNotes: ['G3', 'Bb3', 'D4', 'F4'], bassNote: 'G2' },
      { chordNotes: ['C4', 'E4', 'G4', 'Bb4'], bassNote: 'C3' },
    ],
    arpPattern: [0, 1, 2, 3, 2, 1, 0, 1],
    padVol: 0.05,
    arpVol: 0.09,
    bassVol: 0.20,
    arpWave: 'triangle',
    padWave: 'triangle',
    delayFeedback: 0.22,
    delayWet: 0.16,
  },

  /** Energetic pop — C → G → Am → F (I-V-vi-IV), 126 BPM */
  round: {
    bpm: 126,
    bars: [
      { chordNotes: ['C4', 'E4', 'G4'], bassNote: 'C2' },
      { chordNotes: ['G3', 'B3', 'D4'], bassNote: 'G2' },
      { chordNotes: ['A3', 'C4', 'E4'], bassNote: 'A2' },
      { chordNotes: ['F3', 'A3', 'C4'], bassNote: 'F2' },
    ],
    arpPattern: [0, 2, 1, 2, 0, 1, 2, 1],
    padVol: 0.04,
    arpVol: 0.11,
    bassVol: 0.24,
    arpWave: 'sawtooth',
    padWave: 'triangle',
    delayFeedback: 0.15,
    delayWet: 0.10,
  },

  /** Suspenseful minor — Am → E → Dm → E, 84 BPM */
  tension: {
    bpm: 84,
    bars: [
      { chordNotes: ['A3', 'C4', 'E4'], bassNote: 'A2' },
      { chordNotes: ['E3', 'Gs3', 'B3'], bassNote: 'E2' },
      { chordNotes: ['D3', 'F3', 'A3'], bassNote: 'D2' },
      { chordNotes: ['E3', 'Gs3', 'B3'], bassNote: 'E2' },
    ],
    arpPattern: [0, 1, 2, 1],
    padVol: 0.07,
    arpVol: 0.06,
    bassVol: 0.26,
    arpWave: 'sine',
    padWave: 'sine',
    delayFeedback: 0.28,
    delayWet: 0.20,
  },

  /** Triumphant — C → F → G → C, 96 BPM */
  podium: {
    bpm: 96,
    bars: [
      { chordNotes: ['C4', 'E4', 'G4'], bassNote: 'C3' },
      { chordNotes: ['F3', 'A3', 'C4'], bassNote: 'F2' },
      { chordNotes: ['G3', 'B3', 'D4'], bassNote: 'G2' },
      { chordNotes: ['C4', 'E4', 'G4'], bassNote: 'C3' },
    ],
    arpPattern: [0, 1, 2, 1, 0, 2, 1, 2],
    padVol: 0.06,
    arpVol: 0.12,
    bassVol: 0.20,
    arpWave: 'triangle',
    padWave: 'triangle',
    delayFeedback: 0.20,
    delayWet: 0.14,
  },
};

/** Maps AudioManager loop-type strings → Mood */
export const LOOP_TYPE_TO_MOOD: Record<string, Mood> = {
  lobby_loop:   'lobby',
  round_loop:   'round',
  tension_loop: 'tension',
  suspense:     'tension',
  podium_theme: 'podium',
};

class _ProceduralMusicEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private currentMood: Mood | null = null;
  private playing = false;
  private barIndex = 0;
  private nextBarTime = 0;
  private timerHandle: ReturnType<typeof setInterval> | null = null;

  private readonly LOOKAHEAD = 0.18;
  private readonly TICK_MS  = 60;

  private buildGraph(cfg: MoodConfig): void {
    this.ctx = new AudioContext();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0;

    const delay = this.ctx.createDelay(0.5);
    delay.delayTime.value = 60 / cfg.bpm / 2; // delay time = eighth note at current BPM

    const fb = this.ctx.createGain();
    fb.gain.value = cfg.delayFeedback;

    const wet = this.ctx.createGain();
    wet.gain.value = cfg.delayWet;

    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(this.ctx.destination);

    this.masterGain.connect(delay);
    this.masterGain.connect(this.ctx.destination);
  }

  private freq(name: string): number {
    return NOTES[name] ?? 0;
  }

  private note(
    freq: number,
    t: number,
    dur: number,
    vol: number,
    wave: OscillatorType,
    attack  = 0.02,
    release = 0.06,
  ): void {
    if (!this.ctx || !this.masterGain || freq <= 0) return;
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + attack);
    gain.gain.setValueAtTime(vol, Math.max(t + attack + 0.001, t + dur - release));
    gain.gain.linearRampToValueAtTime(0, t + dur + release * 0.4);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + dur + release + 0.02);
  }

  private scheduleBar(cfg: MoodConfig, bar: BarDef, t0: number): void {
    const beat   = 60 / cfg.bpm;
    const barDur = beat * 4;
    const eighth = beat / 2;

    // Pad — each chord tone sustained for the full bar
    bar.chordNotes.forEach((name, i) => {
      const f = this.freq(name);
      if (f) this.note(f, t0, barDur - 0.05, cfg.padVol * (1 - i * 0.008), cfg.padWave, 0.10, 0.20);
    });

    // Bass — root on beat 1, chord-root-an-octave-down approximation on beat 3
    const bassF = this.freq(bar.bassNote);
    if (bassF) {
      this.note(bassF, t0,            beat * 1.75, cfg.bassVol,        'sine', 0.015, 0.08);
      const beat3F = bar.chordNotes[2]
        ? this.freq(bar.chordNotes[2]) / 2
        : bassF * 1.498;
      this.note(beat3F, t0 + beat * 2, beat * 1.75, cfg.bassVol * 0.82, 'sine', 0.015, 0.08);
    }

    // Arpeggio — 8th-note pattern
    cfg.arpPattern.forEach((idx, i) => {
      const tNote = t0 + i * eighth;
      if (tNote >= t0 + barDur) return;
      const name = bar.chordNotes[idx % bar.chordNotes.length];
      if (!name) return;
      const f = this.freq(name);
      if (f) this.note(f, tNote, eighth * 0.62, cfg.arpVol, cfg.arpWave, 0.005, 0.012);
    });
  }

  play(mood: Mood, volume: number): void {
    if (this.playing && this.currentMood === mood) {
      this.setVolume(volume);
      return;
    }
    this.stop();

    this.currentMood = mood;
    this.playing     = true;
    this.barIndex    = 0;

    const cfg = MOODS[mood];
    this.buildGraph(cfg);

    const ctx = this.ctx!;
    if (ctx.state === 'suspended') void ctx.resume();

    this.nextBarTime = ctx.currentTime + 0.06;
    this.masterGain!.gain.linearRampToValueAtTime(volume, ctx.currentTime + 1.0);

    this.timerHandle = setInterval(() => {
      if (!this.ctx || !this.playing) return;
      const now = this.ctx.currentTime;
      while (this.nextBarTime < now + this.LOOKAHEAD) {
        const bar = cfg.bars[this.barIndex % cfg.bars.length]!;
        this.scheduleBar(cfg, bar, this.nextBarTime);
        this.nextBarTime += (60 / cfg.bpm) * 4;
        this.barIndex++;
      }
    }, this.TICK_MS) as unknown as ReturnType<typeof setInterval>;
  }

  setVolume(v: number): void {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.linearRampToValueAtTime(v, this.ctx.currentTime + 0.3);
    }
  }

  stop(): void {
    this.playing     = false;
    this.currentMood = null;

    if (this.timerHandle !== null) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }

    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.linearRampToValueAtTime(0, now + 1.4);
      const ref = this.ctx;
      setTimeout(() => { ref.close().catch(() => {}); }, 2000);
    }

    this.ctx = null;
    this.masterGain = null;
  }

  stopImmediate(): void {
    this.playing     = false;
    this.currentMood = null;

    if (this.timerHandle !== null) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx        = null;
      this.masterGain = null;
    }
  }

  get isPlaying()   { return this.playing; }
  get activeMood()  { return this.currentMood; }
}

export const ProceduralMusicEngine = new _ProceduralMusicEngine();
