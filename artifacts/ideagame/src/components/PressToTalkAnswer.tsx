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

// Verbose status set — each maps to a distinct UI message
type SpeechStatus =
  | 'idle'
  | 'listening'
  | 'no-speech'        // still holding but no audio yet (or restart after early end)
  | 'speak-again'      // onend fired while still holding — restarted
  | 'error';

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
  const [status, setStatus]       = useState<SpeechStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [matchFail, setMatchFail] = useState(false);
  const [errorMsg, setErrorMsg]   = useState('');
  const [lastError, setLastError] = useState('');   // persists for diagnostic badge
  const [permDenied, setPermDenied] = useState(false);
  const [corrected, setCorrected] = useState(false);
  const [textAnswer, setTextAnswer] = useState('');

  // ── Refs — always current inside async SR callbacks ───────────────────────
  const recRef            = useRef<AnySR | null>(null);
  const listeningRef      = useRef(false);   // atomic guard — no React batch delay
  const holdingRef        = useRef(false);   // true while pointer is physically held down
  const matchedRef        = useRef(false);
  const lastTranscriptRef = useRef('');      // accumulates final results
  const interimRef        = useRef('');      // latest interim (fallback on mobile early-end)
  const failTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref to startListening so onend can restart without capturing a stale closure
  const startListeningRef = useRef<(() => void) | null>(null);

  // ── stop ──────────────────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    holdingRef.current = false;
    if (recRef.current) {
      try { recRef.current.stop(); } catch { /* ignore */ }
      // Do NOT null recRef here — onend/onresult still need it
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
      holding: holdingRef.current,
      disabled,
      corrected,
    });

    // Atomic guard — prevents double-fire from pointer+mouse event cascade
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
    // continuous=true prevents iOS Safari from auto-stopping after ~1s of silence mid-hold.
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
            console.log('[PressToTalk] final result', { t, alt: a, conf: result[a]?.confidence });
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
      // Keep latest interim — don't clear; may be all we get on mobile
      if (interimText) interimRef.current = interimText;
      setTranscript((lastTranscriptRef.current + ' ' + interimText).trim());
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      const err = String(e.error ?? '');
      console.log('[PressToTalk] recognition error', { error: err });
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        listeningRef.current = false;
        setPermDenied(true);
        setLastError('not-allowed');
        setStatus('idle');
      } else if (err === 'aborted') {
        // Normal when rec.stop() is called from onPointerUp — not an error
      } else if (err === 'no-speech') {
        // With continuous=true: recognition keeps running, just no audio detected yet
        setStatus('no-speech');
        setLastError('no-speech');
      } else if (err === 'audio-capture') {
        listeningRef.current = false;
        setErrorMsg('Microfono non disponibile');
        setLastError('audio-capture');
        setStatus('error');
      } else if (err === 'network') {
        listeningRef.current = false;
        setErrorMsg('Errore di rete — riprova');
        setLastError('network');
        setStatus('error');
      } else {
        listeningRef.current = false;
        setErrorMsg(err || 'errore sconosciuto');
        setLastError(err || 'unknown');
        setStatus('error');
      }
    };

    rec.onend = () => {
      const best = lastTranscriptRef.current || interimRef.current;
      console.log('[PressToTalk] recognition.end', {
        matched: matchedRef.current,
        holding: holdingRef.current,
        lastTranscript: lastTranscriptRef.current,
        interim: interimRef.current,
        best,
      });

      // Already matched — nothing to do
      if (matchedRef.current) { listeningRef.current = false; return; }

      // ── iOS/Chrome early-end: onend fired while finger still held ─────────
      // This happens when continuous=true but the browser silently stops.
      // Restart recognition immediately so the user doesn't have to re-press.
      if (holdingRef.current) {
        listeningRef.current = false;
        setStatus('speak-again');
        setTranscript('');
        console.log('[PressToTalk] onend while holding — restarting (speak-again)');
        // Small delay prevents "recognition already started" race on Chrome
        setTimeout(() => {
          if (holdingRef.current) {
            startListeningRef.current?.();
          }
        }, 120);
        return;
      }

      // Normal release path
      listeningRef.current = false;
      setStatus('idle');
      recRef.current = null;

      if (best) {
        console.log('[PressToTalk] onend — matching best transcript', { best });
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
      } else {
        console.log('[PressToTalk] onend — no transcript, going idle');
        // No transcript: silently go idle — user can retry without error spam
      }
    };

    try {
      console.log('[PressToTalk] rec.start()', { lang: language, continuous: rec.continuous });
      rec.start();
    } catch (err) {
      console.log('[PressToTalk] start exception', { err: String(err) });
      listeningRef.current = false;
      setStatus('idle');
      setLastError('start-exception: ' + String(err));
      recRef.current = null;
    }
  }, [disabled, corrected, language, expectedAnswer, onCorrect, onWrong]);

  // Keep startListeningRef current so onend can restart without stale closure
  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

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

  // ── cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      holdingRef.current = false;
      if (recRef.current) {
        try { recRef.current.stop(); } catch { /* ignore */ }
        recRef.current = null;
      }
      if (failTimerRef.current) clearTimeout(failTimerRef.current);
    };
  }, []);

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

  const isListening = status === 'listening' || status === 'no-speech' || status === 'speak-again';

  // ── speech API available ────────────────────────────────────────────────────
  if (getSR()) {
    // Status chip — shown below the button when not in full listening overlay
    let statusChip: string | null = null;
    if (status === 'speak-again')                        statusChip = '🔄 Parla di nuovo…';
    else if (isListening && !transcript)                 statusChip = '🎙 Jonny ti ascolta…';
    else if (isListening && transcript)                  statusChip = `Ho sentito: "${transcript}"`;
    else if (status === 'no-speech')                     statusChip = 'Non ho sentito nulla, continua…';
    else if (status === 'error' && errorMsg)             statusChip = `⚠️ ${errorMsg}`;
    else if (matchFail && transcript)                    statusChip = `Ho sentito: "${transcript}" — riprova!`;

    const srSupported = !!getSR();
    const secureCtx   = typeof window !== 'undefined' && window.isSecureContext;

    return (
      <div className="flex flex-col items-center gap-4 w-full">

        {/* Jonny listening overlay — shown while mic is active */}
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
                  <div className="text-sm font-black" style={{color:'#A78BFA'}}>
                    {status === 'speak-again' ? '🔄 Parla di nuovo…' : 'Jonny ti ascolta…'}
                  </div>
                  {/* Waveform animates immediately on press — status='listening' is set
                      synchronously in startListening before rec.start() */}
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

        {/* Status chip — shown when not in full overlay */}
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

        {/* Hold-to-talk button.
            Primary: onPointerDown — subsumes mouse + touch + pen in one event.
            e.preventDefault() + setPointerCapture blocks the synthetic
            mouse/touch cascade that would double-fire startListening before React
            batches the state update. holdingRef is set synchronously here so
            onend can detect an early-end-while-holding and restart. */}
        <motion.button
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            holdingRef.current = true;
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
          {isListening
            ? (status === 'speak-again' ? '🔄 Parla di nuovo…' : '🎙️ Rilascia quando finisci…')
            : '🎤 TIENI PREMUTO E RISPONDI'}
        </motion.button>

        <div className="text-xs text-white/25">Tieni premuto il tasto mentre parli</div>

        {/* Text fallback — always available as backup, compact and secondary */}
        <div className="flex gap-2 w-full">
          <input value={textAnswer} onChange={e => setTextAnswer(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void submitText(); }}
            placeholder="Oppure scrivi la risposta…" disabled={disabled}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white outline-none disabled:opacity-50"
            style={{background:'rgba(255,255,255,0.06)',border:'1.5px solid rgba(255,255,255,0.15)'}}/>
          <button onClick={() => void submitText()} disabled={disabled || !textAnswer.trim()}
            className="rounded-xl px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
            style={{background:'linear-gradient(135deg,#A78BFA,#7C3AED)'}}>OK</button>
        </div>

        {/* Diagnostic badge — tiny, non-intrusive, always visible for debugging */}
        <div className="flex items-center gap-3 select-none"
          style={{opacity:0.28,fontSize:10,fontFamily:'monospace',letterSpacing:'0.03em'}}>
          <span title="Speech API supportato">
            🎙 {srSupported ? '✓' : '✗'}
          </span>
          <span title="Secure context (HTTPS / localhost)">
            🔒 {secureCtx ? '✓' : '✗'}
          </span>
          {lastError && (
            <span title="Ultimo errore" style={{color:'#f87171',opacity:1}}>
              ⚠ {lastError}
            </span>
          )}
        </div>

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
      {/* Diagnostic badge */}
      <div className="flex items-center justify-center gap-3 mt-1"
        style={{opacity:0.25,fontSize:10,fontFamily:'monospace'}}>
        <span>🎙 ✗ (no SR)</span>
        <span>🔒 {typeof window !== 'undefined' && window.isSecureContext ? '✓' : '✗'}</span>
        {lastError && <span style={{color:'#f87171',opacity:1}}>⚠ {lastError}</span>}
      </div>
    </div>
  );
}

// cleanup on unmount — exported for external use (legacy compat)
export function useCleanupSpeech() {
  useEffect(() => {
    return () => { /* component handles its own cleanup */ };
  }, []);
}
