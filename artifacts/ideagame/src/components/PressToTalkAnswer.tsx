import { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { JonnyAvatar } from '@/components/JonnyAvatar';

// ── normalize ──────────────────────────────────────────────────────────────────
// Exported so callers can reuse the same normalisation logic server-side style
export function normalizeForMatch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

function isMatch(spoken: string, expected: string): boolean {
  const a = normalizeForMatch(spoken);
  const b = normalizeForMatch(expected);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

// ── waveform bars ──────────────────────────────────────────────────────────────
const AMPS = [0.4, 0.78, 1.0, 0.68, 0.38];

function WaveformBars({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-[3px]" style={{ height: 28 }}>
      {AMPS.map((amp, i) => (
        <motion.div
          key={i}
          style={{
            width: 3,
            borderRadius: 9999,
            background: '#A78BFA',
            originY: 1,
            height: 28,
          }}
          animate={active
            ? { scaleY: [amp, 1, amp * 0.45, 0.9, amp] }
            : { scaleY: amp * 0.25 }}
          transition={active
            ? { duration: 0.45 + i * 0.07, repeat: Infinity, ease: 'easeInOut', delay: i * 0.05 }
            : { duration: 0.25 }}
        />
      ))}
    </div>
  );
}

// ── PressToTalkAnswer ──────────────────────────────────────────────────────────

export interface PressToTalkAnswerProps {
  expectedAnswer: string;
  onCorrect: (answerText: string) => void | Promise<void>;
  onWrong?: (answerText: string) => void;
  language?: string;
  disabled?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySR = any;
// Re-evaluated at render time so SSR/mobile browsers that initialise late are handled
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSR(): AnySR | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;
}

export default function PressToTalkAnswer({
  expectedAnswer,
  onCorrect,
  onWrong,
  language = 'it-IT',
  disabled = false,
}: PressToTalkAnswerProps) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [matchFail, setMatchFail] = useState(false);
  const [permDenied, setPermDenied] = useState(false);
  const [corrected, setCorrected] = useState(false);
  const [textAnswer, setTextAnswer] = useState('');

  const recRef = useRef<AnySR | null>(null);
  const matchedRef = useRef(false);
  const lastTranscriptRef = useRef('');
  const failTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── start recognition on press ─────────────────────────────────────────────
  const startListening = useCallback(() => {
    // Re-resolve SR at call time — avoids stale module-load null on some mobile browsers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SRClass: AnySR | null = typeof window !== 'undefined'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null)
      : null;

    console.log('[PressToTalk] startListening', {
      secureContext: window.isSecureContext,
      speechSupported: !!SRClass,
      listening,
      disabled,
      corrected,
    });

    if (!SRClass || listening || disabled || corrected) return;
    matchedRef.current = false;
    lastTranscriptRef.current = '';
    setTranscript('');
    setMatchFail(false);
    if (failTimerRef.current) clearTimeout(failTimerRef.current);

    const rec = new SRClass();
    recRef.current = rec;
    rec.lang = language;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    // continuous:false is correct for hold-to-talk — continuous:true auto-stops
    // after silence on mobile Chrome/iOS and causes onend to fire mid-hold
    rec.continuous = false;

    // Show overlay IMMEDIATELY — don't wait for async onstart
    setListening(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let current = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          for (let a = 0; a < result.length; a++) {
            const t = result[a].transcript;
            console.log('[PressToTalk] result transcript', { t, isFinal: true, index: a });
            if (isMatch(t, expectedAnswer) && !matchedRef.current) {
              matchedRef.current = true;
              try { rec.stop(); } catch { /* ignore */ }
              setCorrected(true);
              void onCorrect(t);
              return;
            }
          }
          current += result[0].transcript + ' ';
        } else {
          current += result[0].transcript;
        }
      }
      lastTranscriptRef.current = current.trim();
      setTranscript(current.trim());
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      console.log('[PressToTalk] onerror', { error: e.error, message: e.message });
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setPermDenied(true);
      }
      setListening(false);
    };

    rec.onend = () => {
      console.log('[PressToTalk] onend', { matched: matchedRef.current, transcript: lastTranscriptRef.current });
      setListening(false);
      if (!matchedRef.current && lastTranscriptRef.current) {
        setMatchFail(true);
        onWrong?.(lastTranscriptRef.current);
        failTimerRef.current = setTimeout(() => setMatchFail(false), 2200);
      }
    };

    try {
      console.log('[PressToTalk] start called', { lang: language });
      rec.start();
    } catch (err) {
      console.log('[PressToTalk] start error', { err });
      setListening(false);
    }
  }, [listening, disabled, corrected, language, expectedAnswer, onCorrect, onWrong]);

  // ── stop recognition on pointer-up / leave / cancel ────────────────────────
  const stopListening = useCallback(() => {
    if (recRef.current) {
      try { recRef.current.stop(); } catch { /* ignore */ }
      recRef.current = null;
    }
  }, []);

  // ── text fallback submit ────────────────────────────────────────────────────
  const submitText = useCallback(async () => {
    if (!textAnswer.trim() || disabled || corrected) return;
    if (isMatch(textAnswer, expectedAnswer)) {
      setCorrected(true);
      await onCorrect(textAnswer);
    } else {
      setMatchFail(true);
      onWrong?.(textAnswer);
      failTimerRef.current = setTimeout(() => setMatchFail(false), 2200);
    }
  }, [textAnswer, disabled, corrected, expectedAnswer, onCorrect, onWrong]);

  // ── corrected state (parent already handles the success overlay) ────────────
  if (corrected) return null;

  // ── permission denied ───────────────────────────────────────────────────────
  if (permDenied) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl px-5 py-4 text-center"
        style={{background:'rgba(239,68,68,0.12)',border:'1.5px solid rgba(239,68,68,0.4)'}}>
        <div className="text-2xl">🚫</div>
        <div className="text-sm font-black" style={{color:'#f87171'}}>Microfono non autorizzato</div>
        <div className="text-xs text-white/45">Attiva il microfono nelle impostazioni del browser, poi ricarica.</div>
      </div>
    );
  }

  // ── speech recognition available — checked at render time, not module load ──
  if (getSR()) {
    return (
      <div className="flex flex-col items-center gap-4 w-full">

        {/* Jonny listening overlay — visible while holding */}
        <AnimatePresence>
          {listening && (
            <motion.div
              key="jonny-listening"
              initial={{ opacity: 0, scale: 0.88, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 4 }}
              transition={{ duration: 0.2 }}
              className="flex w-full flex-col items-center gap-3 rounded-3xl px-5 py-5"
              style={{
                background: 'linear-gradient(160deg,rgba(167,139,250,0.18),rgba(124,58,237,0.1))',
                border: '2px solid rgba(167,139,250,0.55)',
                boxShadow: '0 0 40px rgba(167,139,250,0.35)',
              }}>
              <div className="flex items-center gap-3">
                <JonnyAvatar mood="thinking" size={52} background="none" />
                <div className="flex flex-col gap-1">
                  <div className="text-sm font-black" style={{ color: '#A78BFA' }}>Jonny ti ascolta…</div>
                  <WaveformBars active={listening} />
                </div>
              </div>
              {transcript && (
                <div className="w-full rounded-xl px-3 py-2 text-center text-sm italic font-semibold"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.75)', minHeight: 34 }}>
                  "{transcript}"
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Match fail feedback */}
        <AnimatePresence>
          {matchFail && !listening && (
            <motion.div
              key="fail"
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="text-sm font-black" style={{ color: '#f87171' }}>
              ❌ Non ancora, riprova!
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hold-to-talk button — pointer + touch + mouse for max mobile compat */}
        <motion.button
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); startListening(); }}
          onPointerUp={stopListening}
          onPointerLeave={stopListening}
          onPointerCancel={stopListening}
          onTouchStart={(e) => { e.preventDefault(); startListening(); }}
          onTouchEnd={(e) => { e.preventDefault(); stopListening(); }}
          onTouchCancel={(e) => { e.preventDefault(); stopListening(); }}
          onMouseDown={startListening}
          onMouseUp={stopListening}
          onMouseLeave={stopListening}
          disabled={disabled}
          whileTap={{ scale: 0.95 }}
          className="w-full select-none rounded-2xl py-5 text-base font-black text-white disabled:opacity-50"
          style={{
            touchAction: 'none',
            userSelect: 'none',
            background: listening
              ? 'linear-gradient(135deg,rgba(167,139,250,0.55),rgba(124,58,237,0.55))'
              : 'linear-gradient(135deg,#A78BFA,#7C3AED)',
            border: `2px solid ${listening ? 'rgba(167,139,250,0.95)' : 'rgba(167,139,250,0.5)'}`,
            boxShadow: listening
              ? '0 0 50px rgba(167,139,250,0.75), 0 0 100px rgba(124,58,237,0.25)'
              : '0 0 30px rgba(167,139,250,0.4)',
          }}>
          {listening ? '🎙️ Rilascia quando finisci…' : '🎤 TIENI PREMUTO E RISPONDI'}
        </motion.button>

        <div className="text-xs text-white/25">Tieni premuto il tasto mentre parli</div>
      </div>
    );
  }

  // ── text fallback ───────────────────────────────────────────────────────────
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="text-xs font-bold text-center text-white/40">
        Il tuo browser non supporta il riconoscimento vocale. Scrivi la risposta:
      </div>
      <AnimatePresence>
        {matchFail && (
          <motion.div
            key="fail-text"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-sm font-black text-center" style={{ color: '#f87171' }}>
            ❌ Non ancora, riprova!
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex gap-2">
        <input
          value={textAnswer}
          onChange={e => setTextAnswer(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void submitText(); }}
          placeholder="Scrivi risposta…"
          disabled={disabled}
          className="flex-1 rounded-xl px-4 py-3 text-base font-bold text-white outline-none disabled:opacity-50"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.2)' }}
        />
        <button
          onClick={() => void submitText()}
          disabled={disabled || !textAnswer.trim()}
          className="rounded-xl px-5 py-3 font-black text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#A78BFA,#7C3AED)' }}>
          Conferma
        </button>
      </div>
    </div>
  );
}
