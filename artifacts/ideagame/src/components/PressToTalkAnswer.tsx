import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { JonnyAvatar } from '@/components/JonnyAvatar';

// ── normalize ──────────────────────────────────────────────────────────────────
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
        <motion.div key={i}
          style={{ width: 3, borderRadius: 9999, background: '#A78BFA', originY: 1, height: 28 }}
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

type SpeechStatus = 'idle' | 'listening' | 'no-speech' | 'error';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySR = any;

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
  const [status, setStatus] = useState<SpeechStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [matchFail, setMatchFail] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [permDenied, setPermDenied] = useState(false);
  const [corrected, setCorrected] = useState(false);
  const [textAnswer, setTextAnswer] = useState('');

  // ── Refs — always current inside async callbacks ───────────────────────────
  const recRef            = useRef<AnySR | null>(null);
  const listeningRef      = useRef(false);   // atomic guard — no React batch delay
  const matchedRef        = useRef(false);
  const lastTranscriptRef = useRef('');      // accumulates final results
  const interimRef        = useRef('');      // latest interim (may be all we get on mobile)
  const failTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── stop ──────────────────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    if (recRef.current) {
      try { recRef.current.stop(); } catch { /* ignore */ }
      // Do NOT null recRef here — onend/onresult still need it for closure matching
    }
    // listeningRef reset inside onend
  }, []);

  // ── start ─────────────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SRClass: AnySR | null = typeof window !== 'undefined'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null)
      : null;

    console.log('[PressToTalk] start', {
      secureContext: window.isSecureContext,
      speechSupported: !!SRClass,
      listening: listeningRef.current,
      disabled,
      corrected,
    });

    // Atomic guard — prevents double-fire from pointer+mouse event cascade on Chrome/iOS
    if (listeningRef.current || disabled || corrected || !SRClass) return;
    listeningRef.current = true;  // set BEFORE any setState — cannot race

    matchedRef.current = false;
    lastTranscriptRef.current = '';
    interimRef.current = '';
    setTranscript('');
    setMatchFail(false);
    setErrorMsg('');
    setStatus('listening');
    if (failTimerRef.current) clearTimeout(failTimerRef.current);

    const rec = new SRClass();
    recRef.current = rec;
    rec.lang = language;
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    // continuous=true prevents iOS Safari from auto-stopping after ~1 s of silence mid-hold.
    // With continuous=false, onend fires while finger is still down → empty transcript.
    rec.continuous = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          // Check ALL alternatives for a match
          for (let a = 0; a < result.length; a++) {
            const t = String(result[a]?.transcript ?? '');
            console.log('[PressToTalk] result final', { t, alt: a, conf: result[a]?.confidence });
            if (isMatch(t, expectedAnswer) && !matchedRef.current) {
              matchedRef.current = true;
              listeningRef.current = false;
              try { rec.stop(); } catch { /* ignore */ }
              setCorrected(true);
              setStatus('idle');
              void onCorrect(t);
              return;
            }
          }
          // Accumulate final text for post-onend matching
          lastTranscriptRef.current = (lastTranscriptRef.current + ' ' + String(result[0]?.transcript ?? '')).trim();
        } else {
          interimText += String(result[0]?.transcript ?? '');
        }
      }
      if (interimText) interimRef.current = interimText;
      setTranscript((lastTranscriptRef.current + ' ' + interimText).trim());
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      const err = String(e.error ?? '');
      console.log('[PressToTalk] error', { error: err, message: e.message });
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        listeningRef.current = false;
        setPermDenied(true);
        setStatus('idle');
      } else if (err === 'aborted') {
        // Normal when rec.stop() is called from onPointerUp — ignore
      } else if (err === 'no-speech') {
        // With continuous=true: recognition keeps running, just no audio captured yet
        setStatus('no-speech');
      } else if (err === 'audio-capture') {
        listeningRef.current = false;
        setErrorMsg('Microfono non disponibile');
        setStatus('error');
      } else if (err === 'network') {
        listeningRef.current = false;
        setErrorMsg('Errore di rete — riprova');
        setStatus('error');
      } else {
        listeningRef.current = false;
        setErrorMsg(err || 'errore sconosciuto');
        setStatus('error');
      }
    };

    rec.onend = () => {
      const best = lastTranscriptRef.current || interimRef.current;
      console.log('[PressToTalk] onend', {
        matched: matchedRef.current,
        lastTranscript: lastTranscriptRef.current,
        interim: interimRef.current,
        best,
      });

      if (matchedRef.current) { listeningRef.current = false; return; }

      listeningRef.current = false;
      setStatus('idle');
      recRef.current = null;

      if (best) {
        // Try matching with best available transcript — final OR interim
        if (isMatch(best, expectedAnswer)) {
          matchedRef.current = true;
          setCorrected(true);
          void onCorrect(best);
        } else {
          setMatchFail(true);
          setTranscript(best);
          onWrong?.(best);
          failTimerRef.current = setTimeout(() => setMatchFail(false), 2200);
        }
      }
      // No transcript at all: just go idle (no error spam — user can retry)
    };

    try {
      console.log('[PressToTalk] rec.start()', { lang: language, continuous: rec.continuous });
      rec.start();
    } catch (err) {
      console.log('[PressToTalk] start error', { err: String(err) });
      listeningRef.current = false;
      setStatus('idle');
      recRef.current = null;
    }
  }, [disabled, corrected, language, expectedAnswer, onCorrect, onWrong]);

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

  if (corrected) return null;

  // ── permission denied ───────────────────────────────────────────────────────
  if (permDenied) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl px-5 py-4 text-center"
        style={{background:'rgba(239,68,68,0.12)',border:'1.5px solid rgba(239,68,68,0.4)'}}>
        <div className="text-2xl">🚫</div>
        <div className="text-sm font-black" style={{color:'#f87171'}}>Microfono non autorizzato</div>
        <div className="text-xs text-white/45">Attiva il microfono nelle impostazioni del browser, poi ricarica.</div>
        <div className="mt-2 flex gap-2 w-full">
          <input value={textAnswer} onChange={e => setTextAnswer(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void submitText(); }}
            placeholder="Scrivi risposta…" disabled={disabled}
            className="flex-1 rounded-xl px-4 py-2 text-sm font-bold text-white outline-none disabled:opacity-50"
            style={{background:'rgba(255,255,255,0.08)',border:'1.5px solid rgba(255,255,255,0.2)'}}/>
          <button onClick={() => void submitText()} disabled={disabled || !textAnswer.trim()}
            className="rounded-xl px-4 py-2 text-sm font-black text-white disabled:opacity-50"
            style={{background:'linear-gradient(135deg,#A78BFA,#7C3AED)'}}>OK</button>
        </div>
      </div>
    );
  }

  const isListening = status === 'listening' || status === 'no-speech';

  // ── speech API available ────────────────────────────────────────────────────
  if (getSR()) {
    // Status chip — shown below the button when not listening
    let statusChip: string | null = null;
    if (isListening && !transcript) statusChip = 'Microfono attivo — sto ascoltando…';
    else if (isListening && transcript) statusChip = `Ho sentito: "${transcript}"`;
    else if (status === 'no-speech') statusChip = 'Non ho sentito nulla, continua a parlare…';
    else if (status === 'error' && errorMsg) statusChip = `⚠️ ${errorMsg}`;
    else if (matchFail && transcript) statusChip = `Ho sentito: "${transcript}" — riprova!`;

    const showFallback = matchFail || status === 'error';

    return (
      <div className="flex flex-col items-center gap-4 w-full">

        {/* Jonny listening overlay */}
        <AnimatePresence>
          {isListening && (
            <motion.div key="jonny-listening"
              initial={{opacity:0,scale:0.88,y:8}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:0.9,y:4}}
              transition={{duration:0.2}}
              className="flex w-full flex-col items-center gap-3 rounded-3xl px-5 py-5"
              style={{
                background:'linear-gradient(160deg,rgba(167,139,250,0.18),rgba(124,58,237,0.1))',
                border:'2px solid rgba(167,139,250,0.55)',
                boxShadow:'0 0 40px rgba(167,139,250,0.35)',
              }}>
              <div className="flex items-center gap-3">
                <JonnyAvatar mood="thinking" size={52} background="none" />
                <div className="flex flex-col gap-1">
                  <div className="text-sm font-black" style={{color:'#A78BFA'}}>Jonny ti ascolta…</div>
                  <WaveformBars active={isListening} />
                </div>
              </div>
              {transcript && (
                <div className="w-full rounded-xl px-3 py-2 text-center text-sm italic font-semibold"
                  style={{background:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.75)',minHeight:34}}>
                  "{transcript}"
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status chip — shown when not in overlay */}
        <AnimatePresence>
          {!isListening && statusChip && (
            <motion.div key="status-chip"
              initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0}}
              className="w-full rounded-xl px-3 py-2 text-xs font-bold text-center"
              style={{
                background: (matchFail || status === 'error') ? 'rgba(239,68,68,0.12)' : 'rgba(167,139,250,0.1)',
                border: `1px solid ${(matchFail || status === 'error') ? 'rgba(239,68,68,0.3)' : 'rgba(167,139,250,0.25)'}`,
                color: (matchFail || status === 'error') ? '#f87171' : 'rgba(167,139,250,0.85)',
              }}>
              {matchFail ? `❌ ${statusChip}` : statusChip}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hold-to-talk button — pointer events ONLY (subsumes mouse + touch + pen).
            e.preventDefault() blocks the synthetic mouse/touch event cascade that would
            otherwise fire startListening() a second time before React batches setListening. */}
        <motion.button
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            startListening();
          }}
          onPointerUp={stopListening}
          onPointerLeave={stopListening}
          onPointerCancel={stopListening}
          disabled={disabled}
          whileTap={{scale:0.95}}
          className="w-full select-none rounded-2xl py-5 text-base font-black text-white disabled:opacity-50"
          style={{
            touchAction: 'none',
            userSelect: 'none',
            background: isListening
              ? 'linear-gradient(135deg,rgba(167,139,250,0.55),rgba(124,58,237,0.55))'
              : 'linear-gradient(135deg,#A78BFA,#7C3AED)',
            border: `2px solid ${isListening ? 'rgba(167,139,250,0.95)' : 'rgba(167,139,250,0.5)'}`,
            boxShadow: isListening
              ? '0 0 50px rgba(167,139,250,0.75), 0 0 100px rgba(124,58,237,0.25)'
              : '0 0 30px rgba(167,139,250,0.4)',
          }}>
          {isListening ? '🎙️ Rilascia quando finisci…' : '🎤 TIENI PREMUTO E RISPONDI'}
        </motion.button>

        <div className="text-xs text-white/25">Tieni premuto il tasto mentre parli</div>

        {/* Text fallback — appears automatically after a failed attempt */}
        {showFallback && (
          <div className="flex gap-2 w-full mt-1">
            <input value={textAnswer} onChange={e => setTextAnswer(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void submitText(); }}
              placeholder="Oppure scrivi la risposta…" disabled={disabled}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white outline-none disabled:opacity-50"
              style={{background:'rgba(255,255,255,0.08)',border:'1.5px solid rgba(255,255,255,0.2)'}}/>
            <button onClick={() => void submitText()} disabled={disabled || !textAnswer.trim()}
              className="rounded-xl px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
              style={{background:'linear-gradient(135deg,#A78BFA,#7C3AED)'}}>OK</button>
          </div>
        )}
      </div>
    );
  }

  // ── text-only fallback (no speech API) ─────────────────────────────────────
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="text-xs font-bold text-center text-white/40">
        Il tuo browser non supporta il riconoscimento vocale. Scrivi la risposta:
      </div>
      <AnimatePresence>
        {matchFail && (
          <motion.div key="fail-text" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="text-sm font-black text-center" style={{color:'#f87171'}}>
            ❌ Non ancora, riprova!
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex gap-2">
        <input value={textAnswer} onChange={e => setTextAnswer(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void submitText(); }}
          placeholder="Scrivi risposta…" disabled={disabled}
          className="flex-1 rounded-xl px-4 py-3 text-base font-bold text-white outline-none disabled:opacity-50"
          style={{background:'rgba(255,255,255,0.08)',border:'1.5px solid rgba(255,255,255,0.2)'}}/>
        <button onClick={() => void submitText()} disabled={disabled || !textAnswer.trim()}
          className="rounded-xl px-5 py-3 font-black text-white disabled:opacity-50"
          style={{background:'linear-gradient(135deg,#A78BFA,#7C3AED)'}}>Conferma</button>
      </div>
    </div>
  );
}

// cleanup on unmount — exported for external use
export function useCleanupSpeech() {
  useEffect(() => {
    return () => {
      // nothing to do — component handles its own cleanup
    };
  }, []);
}
