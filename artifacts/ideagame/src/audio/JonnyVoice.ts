/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * Voce di Johhy (lato client).
 *
 * Chiede al server l'MP3 con la voce di Johhy per una battuta del copione
 * (GET /api/home/voice/:key), lo riproduce e nel frattempo:
 *  - fa il DUCKING della musica di fondo (AudioManager.duck) così la base si
 *    abbassa mentre Johhy parla, e risale quando ha finito;
 *  - pubblica lo stato "sta parlando" + un livello di ampiezza (0..1) letto con
 *    un AnalyserNode, così l'avatar può muovere la bocca a tempo con la voce.
 *
 * Difensivo: se la voce non è disponibile (404, rete, audio bloccato) non
 * succede nulla — il gioco continua senza voce.
 */

import { AudioManager } from './AudioManager';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';

/** Stato pubblicato a ogni frame mentre Johhy parla. `text` = testo ESATTO pronunciato
 *  (fonte unica di voce e fumetto); `timeMs`/`durMs` = clock dell'audio reale, per
 *  sincronizzare i segmenti del fumetto senza finto effetto macchina da scrivere. */
export type JohhyVoiceState = {
  speaking: boolean;
  level: number;
  key: string | null;
  text: string | null;
  timeMs: number;
  durMs: number;
};
type Listener = (state: JohhyVoiceState) => void;
type Clip = { url: string; text: string };

class _JonnyVoice {
  private clipCache = new Map<string, Clip | null>();
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private raf = 0;
  private listeners = new Set<Listener>();
  private _speaking = false;
  private _level = 0;
  private _key: string | null = null;
  private _text: string | null = null;

  get speaking(): boolean { return this._speaking; }
  get level(): number { return this._level; }
  get text(): string | null { return this._text; }

  private snapshot(): JohhyVoiceState {
    const a = this.audio;
    return {
      speaking: this._speaking, level: this._level, key: this._key, text: this._text,
      timeMs: a ? a.currentTime * 1000 : 0,
      durMs: a && isFinite(a.duration) ? a.duration * 1000 : 0,
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => { this.listeners.delete(fn); };
  }

  private emit(): void {
    const s = this.snapshot();
    this.listeners.forEach((fn) => { try { fn(s); } catch { /* ignore */ } });
  }

  /** Testo ESATTO di una battuta (per il fumetto) — dal catalogo server, in cache. */
  textFor(key: string): string | null { return this.clipCache.get(key)?.text ?? null; }

  private async resolveClip(key: string): Promise<Clip | null> {
    if (this.clipCache.has(key)) return this.clipCache.get(key) ?? null;
    try {
      const u = `${BASE}api/home/voice/${encodeURIComponent(key)}`.replace(/([^:])\/\//g, '$1/');
      const r = await fetch(u);
      if (!r.ok) { this.clipCache.set(key, null); return null; }
      const j = await r.json() as { url?: string; text?: string };
      const raw = j?.url ?? '';
      // URL assoluti/data/blob passano intatti; i path relativi prendono il BASE
      const url = raw
        ? (/^(data:|https?:|blob:)/.test(raw) ? raw : `${BASE}${raw.replace(/^\//, '')}`.replace(/([^:])\/\//g, '$1/'))
        : null;
      const clip = url ? { url, text: (j.text ?? '').trim() } : null;
      this.clipCache.set(key, clip);
      return clip;
    } catch { this.clipCache.set(key, null); return null; }
  }

  /** Precarica (genera lato server) una o più battute, senza riprodurle. */
  prefetch(keys: string[]): void {
    keys.forEach((k) => { void this.resolveClip(k); });
  }

  /**
   * Fai parlare Johhy con la battuta `key`. Interrompe l'eventuale battuta in
   * corso. Ritorna quando l'audio è partito (non quando è finito).
   */
  async speak(key: string): Promise<void> {
    const clip = await this.resolveClip(key);
    if (!clip) return;
    this.stop(); // interrompe la precedente

    const audio = new Audio(clip.url);
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    this.audio = audio;
    this._key = key;
    this._text = clip.text || null;

    // Analyser per l'ampiezza (best-effort: se fallisce, niente lip-sync)
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        this.ctx = this.ctx ?? new Ctor();
        if (this.ctx.state === 'suspended') void this.ctx.resume();
        const srcNode = this.ctx.createMediaElementSource(audio);
        const an = this.ctx.createAnalyser();
        an.fftSize = 256;
        srcNode.connect(an);
        an.connect(this.ctx.destination);
        this.analyser = an;
      }
    } catch { this.analyser = null; }

    const done = () => this.stop();
    audio.addEventListener('ended', done);
    audio.addEventListener('error', done);

    AudioManager.duck();
    this._speaking = true;
    this.emit();
    this.loopLevel();

    try {
      await audio.play();
    } catch {
      // autoplay bloccato: niente voce, ripristina
      this.stop();
    }
  }

  private loopLevel(): void {
    const tick = () => {
      if (!this._speaking) return;
      if (this.analyser) {
        const buf = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / buf.length);
        this._level = Math.min(1, rms * 3.2);
      } else {
        // Nessun analyser: bocca "finta" pseudo-casuale così sembra comunque parlare
        this._level = 0.25 + Math.random() * 0.5;
      }
      this.emit();
      this.raf = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(tick);
  }

  /** Ferma la voce in corso (se presente) e ripristina musica/stato. */
  stop(): void {
    cancelAnimationFrame(this.raf);
    if (this.audio) {
      try { this.audio.pause(); this.audio.src = ''; } catch { /* ignore */ }
      this.audio = null;
    }
    try { this.analyser?.disconnect(); } catch { /* ignore */ }
    this.analyser = null;
    if (this._speaking) {
      this._speaking = false;
      this._level = 0;
      this._key = null;
      this._text = null;
      AudioManager.unduck();
      this.emit();
    }
  }
}

export const JonnyVoice = new _JonnyVoice();
