/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * Jonny's World — Procedural Music Bed
 *
 * Generatore musicale a tema, 100% Web Audio, senza file. È il "pavimento"
 * garantito della colonna sonora: se il tenant NON ha caricato una traccia (o
 * Suno non ha ancora generato quella scena), qui parte comunque un bed a tema
 * per il gioco corrente — così c'è SEMPRE musica, in ogni parte del gioco.
 *
 * Priorità reale della colonna sonora (gestita da AudioManager):
 *   1) traccia caricata dal tenant / generata da Suno (loopOverride)  → vince
 *   2) file MP3 su API/statico                                        → vince
 *   3) questo bed procedurale                                         → floor
 *
 * Tutto è difensivo: qualsiasi errore → silenzio, mai un throw che rompa il gioco.
 */

type ThemeId =
  | 'hub' | 'quizzone' | 'sfida-ballo' | 'gioco-coppie'
  | 'percorso-a-risate' | 'adult-only' | 'karaoke-battle'
  | 'saramusica' | 'parola-alle-spalle' | 'freestyle-battle' | 'global';

interface Theme {
  /** BPM del bed. */
  bpm: number;
  /** Frequenza della tonica (Hz) per il basso. */
  root: number;
  /** Gradi della scala (semitoni dalla tonica) per arpeggio/melodia. */
  scale: number[];
  /** Forma d'onda del basso. */
  bassWave: OscillatorType;
  /** Forma d'onda dell'arpeggio/lead. */
  leadWave: OscillatorType;
  /** Volume relativo del tema (0..1) — bilancia bed più aggressivi. */
  gain: number;
  /** Densità note per battuta dell'arpeggio (1 = ogni beat, 2 = ottavi). */
  density: number;
  /** true = pad tenuto morbido sotto (romantico/sensuale). */
  pad: boolean;
}

/**
 * Un tema per ogni scena. Scelte pensate per il MOOD, non per essere "canzoni":
 * scale maggiori/luminose per hub e comedy, minore/tesa per quiz e adult, ecc.
 */
const THEMES: Record<ThemeId, Theme> = {
  // Lobby/hub: luminoso, giocoso, invitante (maggiore, arpeggio leggero)
  hub:                 { bpm: 96,  root: 130.81, scale: [0, 4, 7, 11, 12, 16], bassWave: 'triangle', leadWave: 'triangle', gain: 0.55, density: 2, pad: false },
  global:              { bpm: 96,  root: 130.81, scale: [0, 4, 7, 11, 12, 16], bassWave: 'triangle', leadWave: 'triangle', gain: 0.5,  density: 2, pad: false },
  // Quiz: tensione pulsante, minore, pochi acuti (suspense da game-show)
  quizzone:            { bpm: 100, root: 110.00, scale: [0, 3, 5, 7, 10, 12],  bassWave: 'sawtooth', leadWave: 'square',   gain: 0.42, density: 1, pad: false },
  // Ballo: raramente attivo (di solito c'è il video), ma dà energia in lobby
  'sfida-ballo':       { bpm: 124, root: 146.83, scale: [0, 3, 5, 7, 10, 12],  bassWave: 'sawtooth', leadWave: 'square',   gain: 0.5,  density: 2, pad: false },
  // Coppie: caldo, romantico, pad tenuto (maggiore dolce)
  'gioco-coppie':      { bpm: 84,  root: 123.47, scale: [0, 4, 7, 9, 12, 14],  bassWave: 'sine',     leadWave: 'triangle', gain: 0.5,  density: 1, pad: true  },
  // Percorso a risate: rimbalzante, comico, staccato allegro
  'percorso-a-risate': { bpm: 112, root: 138.59, scale: [0, 4, 7, 9, 12, 16],  bassWave: 'triangle', leadWave: 'square',   gain: 0.5,  density: 2, pad: false },
  // Adult: lento, sensuale, minore-blues, pad caldo
  'adult-only':        { bpm: 72,  root: 98.00,  scale: [0, 3, 5, 6, 7, 10],   bassWave: 'sine',     leadWave: 'sine',     gain: 0.5,  density: 1, pad: true  },
  // Karaoke: da palco, energico
  'karaoke-battle':    { bpm: 118, root: 146.83, scale: [0, 4, 7, 11, 12, 14], bassWave: 'sawtooth', leadWave: 'triangle', gain: 0.48, density: 2, pad: false },
  // SaraMusica: musicale, jazzato, settime
  'saramusica':        { bpm: 92,  root: 116.54, scale: [0, 3, 7, 10, 14, 17], bassWave: 'triangle', leadWave: 'sine',     gain: 0.5,  density: 2, pad: false },
  // Parola alle spalle: bizzarro, curioso
  'parola-alle-spalle':{ bpm: 104, root: 130.81, scale: [0, 2, 5, 7, 9, 12],   bassWave: 'triangle', leadWave: 'square',   gain: 0.48, density: 2, pad: false },
  // Freestyle: hip-hop, basso in evidenza, groove
  'freestyle-battle':  { bpm: 90,  root: 87.31,  scale: [0, 3, 5, 7, 10, 12],  bassWave: 'sawtooth', leadWave: 'square',   gain: 0.5,  density: 2, pad: true  },
};

function pickTheme(slug: string | null | undefined): Theme {
  if (slug && slug in THEMES) return THEMES[slug as ThemeId];
  return THEMES.hub;
}

class _ProceduralMusic {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private scheduler: ReturnType<typeof setInterval> | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private theme: Theme = THEMES.hub;
  private slug: string | null = null;
  private running = false;
  /** Volume "musica" richiesto da AudioManager (0..1), prima del ducking. */
  private baseVol = 0.5;
  /** Fattore di ducking (0..1): 1 = pieno, ~0.12 sotto video/karaoke. */
  private duckFactor = 1;

  /** Il bed sta suonando questa scena? */
  isPlaying(slug?: string): boolean {
    if (!this.running) return false;
    if (slug === undefined) return true;
    return this.slug === slug;
  }

  /**
   * Crea/riprende l'AudioContext. Va chiamato dentro un gesto utente (click),
   * così il browser sblocca l'autoplay. Idempotente.
   */
  resume(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch { /* silenzio */ }
  }

  /** Volume musica corrente (0..1) da AudioManager; applica subito col ducking. */
  setBaseVolume(v: number): void {
    this.baseVol = Math.max(0, Math.min(1, v));
    this.applyGain();
  }

  /** Ducking: chiamato quando parte un video/karaoke. factor ~0.12; 1 = pieno. */
  setDuck(factor: number): void {
    this.duckFactor = Math.max(0, Math.min(1, factor));
    this.applyGain();
  }

  private applyGain(): void {
    if (!this.ctx || !this.master) return;
    const target = this.baseVol * this.theme.gain * this.duckFactor;
    try {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(target, now, 0.25);
    } catch { /* ignore */ }
  }

  /**
   * Avvia il bed a tema per lo slug dato. Se già in esecuzione sulla stessa
   * scena, non fa nulla (nessun re-trigger). Cambio scena = crossfade morbido.
   */
  start(slug: string, baseVol: number): void {
    this.resume();
    if (!this.ctx || !this.master) return;
    this.baseVol = Math.max(0, Math.min(1, baseVol));
    if (this.running && this.slug === slug) { this.applyGain(); return; }
    this.slug = slug;
    this.theme = pickTheme(slug);
    if (!this.running) {
      this.running = true;
      this.step = 0;
      this.nextNoteTime = this.ctx.currentTime + 0.08;
      this.scheduler = setInterval(() => this.tick(), 25);
    }
    this.applyGain();
  }

  /** Ferma il bed con una breve dissolvenza. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.scheduler) { clearInterval(this.scheduler); this.scheduler = null; }
    if (this.ctx && this.master) {
      try {
        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setTargetAtTime(0, now, 0.4);
      } catch { /* ignore */ }
    }
    this.slug = null;
  }

  // ── Scheduler lookahead: pianifica le note ~0.1s in anticipo ──────────────
  private tick(): void {
    if (!this.ctx || !this.running) return;
    const secPerBeat = 60 / this.theme.bpm;
    const secPerStep = secPerBeat / this.theme.density;
    while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
      this.scheduleStep(this.step, this.nextNoteTime);
      this.nextNoteTime += secPerStep;
      this.step++;
    }
  }

  private scheduleStep(step: number, time: number): void {
    if (!this.ctx || !this.master) return;
    const t = this.theme;
    const beatsPerBar = 4 * t.density;
    const posInBar = step % beatsPerBar;

    // Basso: sulla tonica/quinta all'inizio di ogni beat "forte"
    if (posInBar % t.density === 0) {
      const beat = Math.floor(posInBar / t.density);
      const bassSemis = beat === 2 ? 7 : 0; // I – I – V – I
      this.playNote(t.root * Math.pow(2, bassSemis / 12), time, secForNote(t, 0.9), t.bassWave, 0.5);
    }

    // Arpeggio/melodia: nota dalla scala, con leggera casualità
    const scaleIdx = (step * 2 + (step % 3)) % t.scale.length;
    const oct = step % (beatsPerBar) < beatsPerBar / 2 ? 1 : 2;
    const semis = t.scale[scaleIdx] + 12 * oct;
    // salta ogni tanto una nota per respiro (comedy/quiz più staccato)
    if (!(step % 7 === 5)) {
      this.playNote(t.root * Math.pow(2, semis / 12), time, secForNote(t, 0.45), t.leadWave, 0.22);
    }

    // Pad tenuto (romantico/sensuale): un accordo lungo a inizio battuta
    if (t.pad && posInBar === 0) {
      const chord = [0, t.scale[2] ?? 7, t.scale[4] ?? 12];
      for (const s of chord) {
        this.playNote(t.root * Math.pow(2, (s + 12) / 12), time, 4 * (60 / t.bpm), 'sine', 0.10);
      }
    }
  }

  private playNote(freq: number, time: number, dur: number, wave: OscillatorType, vol: number): void {
    if (!this.ctx || !this.master) return;
    try {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      // envelope morbida (no click)
      const a = 0.012, r = Math.max(0.05, dur * 0.6);
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(vol, time + a);
      g.gain.setTargetAtTime(0, time + Math.max(a, dur - r), r / 3);
      osc.connect(g);
      g.connect(this.master);
      osc.start(time);
      osc.stop(time + dur + 0.1);
      osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch { /**/ } };
    } catch { /* ignore */ }
  }
}

function secForNote(t: Theme, frac: number): number {
  return (60 / t.bpm) * frac;
}

export const ProceduralMusic = new _ProceduralMusic();
