/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * Beat e bip taboo sintetizzati lato client (Web Audio) — nessun file audio.
 *
 * Perché: i FREESTYLE_BEATS hanno tutti audioUrl vuoto (nessuno carica i media
 * slot), quindi il beat non partiva mai. Qui lo generiamo in tempo reale così
 * "il beat parte" sempre; e il bip del taboo è un'onda quadra aspra, anch'essa
 * sintetizzata (richiesta esplicita: niente file, niente Suno).
 */

type Ctx = AudioContext;

function makeNoiseBuffer(ctx: Ctx): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.4);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Beat 4/4 sintetizzato che gira in loop finché non si ferma. */
export class FreestyleBeat {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextStepTime = 0;
  private step = 0;
  private stepDur = 0.125; // 16esimi, ricalcolato dal BPM
  private running = false;

  start(bpm = 90): void {
    if (this.running) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    void this.ctx.resume();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.noise = makeNoiseBuffer(this.ctx);
    this.stepDur = 60 / Math.max(60, Math.min(200, bpm)) / 4; // durata di un 16esimo
    this.step = 0;
    this.nextStepTime = this.ctx.currentTime + 0.06;
    this.running = true;
    // Scheduler a lookahead: pianifica gli step ~100ms avanti.
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    this.running = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.ctx) { const c = this.ctx; this.ctx = null; this.master = null; this.noise = null; setTimeout(() => void c.close().catch(() => {}), 200); }
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.running) return;
    while (this.nextStepTime < ctx.currentTime + 0.1) {
      this.playStep(this.step % 16, this.nextStepTime);
      this.nextStepTime += this.stepDur;
      this.step++;
    }
  }

  private playStep(s: number, t: number): void {
    // kick 0,4,8,12 · snare 4,12 · hihat sui pari · bass 0,8
    if (s % 4 === 0) this.kick(t);
    if (s === 4 || s === 12) this.snare(t);
    if (s % 2 === 0) this.hihat(t);
    if (s === 0 || s === 8) this.bass(t);
  }

  private kick(t: number): void {
    const ctx = this.ctx!, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(this.master!);
    o.start(t); o.stop(t + 0.2);
  }

  private snare(t: number): void {
    const ctx = this.ctx!, src = ctx.createBufferSource(), g = ctx.createGain(), hp = ctx.createBiquadFilter();
    src.buffer = this.noise;
    hp.type = 'highpass'; hp.frequency.value = 1800;
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(hp).connect(g).connect(this.master!);
    src.start(t); src.stop(t + 0.13);
  }

  private hihat(t: number): void {
    const ctx = this.ctx!, src = ctx.createBufferSource(), g = ctx.createGain(), hp = ctx.createBiquadFilter();
    src.buffer = this.noise;
    hp.type = 'highpass'; hp.frequency.value = 7000;
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(hp).connect(g).connect(this.master!);
    src.start(t); src.stop(t + 0.05);
  }

  private bass(t: number): void {
    const ctx = this.ctx!, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(65, t); // ~Do1
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + this.stepDur * 3);
    o.connect(g).connect(this.master!);
    o.start(t); o.stop(t + this.stepDur * 3.2);
  }
}

/** Bip del TABOO: due colpi aspri di onda quadra (fastidioso apposta). */
export function playTabooBeep(): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    void ctx.resume();
    const now = ctx.currentTime;
    const beep = (start: number) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(980, start);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.6, start + 0.01);
      g.gain.setValueAtTime(0.6, start + 0.18);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(start); o.stop(start + 0.24);
    };
    beep(now);
    beep(now + 0.28);
    setTimeout(() => void ctx.close().catch(() => {}), 900);
  } catch { /* audio non disponibile */ }
}
