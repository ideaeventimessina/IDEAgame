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

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Callers may optionally return a typed result so the component can surface
 * inline server errors (409 duplicate, 422 wrong answer, etc.).
 * Returning void / undefined is treated as "success — parent will handle UI".
 */
export interface AnswerResult {
  ok: boolean;
  code?: '409' | '422' | 'error' | string;
  message?: string;
}

export interface PressToTalkAnswerProps {
  expectedAnswer: string;
  onCorrect: (answerText: string) => void | AnswerResult | Promise<void | AnswerResult>;
  onWrong?: (answerText: string) => void;
  language?: string;
  disabled?: boolean;
}

type SpeechStatus =
  | 'idle'
  | 'listening'
  | 'no-speech'
  | 'speak-again'   // onend fired while still holding → restarted automatically
  | 'error';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySR = any;

function getSR(): AnySR | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;
}

// ── PressToTalkAnswer ──────────────────────────────────────────────────────────
export default function PressToTalkAnswer({
  expectedAnswer,
  onCorrect,
  onWrong,
  language = 'it-IT',
  disabled = false,
}: PressToTalkAnswerProps) {
  const [status, setStatus]           = useState<SpeechStatus>('idle');
  const [transcript, setTranscript]   = useState('');
  const [matchFail, setMatchFail]     = useState(false);
  const [errorMsg, setErrorMsg]       = useState('');
  const [lastError, setLastError]     = useState('');
  const [permDenied, setPermDenied]   = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [fallbackError, setFallbackError] = useState<string | null>(null);
  const [textAnswer, setTextAnswer]   = useState('');

  // ── Refs ───────────────────────────────────────────────────────────────────
  const recRef            = useRef<AnySR | null>(null);
  const listeningRef      = useRef(false);   // atomic guard — no React batch delay
  const holdingRef        = useRef(false);   // true while pointer is physically held
  const matchedRef        = useRef(false);   // true after speech match — prevents re-match in same session
  const submittingRef     = useRef(false);   // true during text POST — prevents double-submit
  const lastTranscriptRef = useRef('');
  const interimRef        = useRef('');
  const failTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startListeningRef = useRef<(() => void) | null>(null);

  // ── stop ──────────────────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    holdingRef.current = false;
    if (recRef.current) {
      try { recRef.current.stop(); } catch { /* ignore */ }
    }
    // listeningRef reset inside onend
  }, []);

  // ── start ─────────────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    const SRClass: AnySR | null = typeof window !== 'undefined'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null)
      : null;

    console.log('[PressToTalk] pointerDown', {
      secureContext: window.isSecureContext,
      supported: !!SRClass,
      listening: listeningRef.current,
      holding: holdingRef.current,
      disabled,
    });

    if (listeningRef.current || disabled || !SRClass) return;
    listeningRef.current = true;

    matchedRef.current = false;
    lastTranscriptRef.current = '';
    interimRef.current = '';
    setTranscript('');
    setMatchFail(false);
    setFallbackError(null);
    setErrorMsg('');
    // Waveform animates immediately — status set BEFORE rec.start()
    setStatus('listening');
    if (failTimerRef.current) clearTimeout(failTimerRef.current);

    const rec = new SRClass();
    recRef.current = rec;
    rec.lang = language;
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    rec.continuous = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          for (let a = 0; a < result.length; a++) {
            const t = String(result[a]?.transcript ?? '');
            console.log('[PressToTalk] final transcript', { t, alt: a, conf: result[a]?.confidence });
            if (isMatch(t, expectedAnswer) && !matchedRef.current) {
              matchedRef.current = true;
              listeningRef.current = false;
              try { rec.stop(); } catch { /* ignore */ }
              // NOTE: do NOT set corrected=true here.
              // The parent (WordBackController) will unmount this component by
              // setting answered=true which renders the overlay instead.
              // Setting corrected=true before onCorrect resolves caused the
              // stuck-screen bug: if server returned 409/422, the parent reset
              // answered=false but this component stayed null (corrected=true).
              setStatus('idle');
              void onCorrect(t);
              return;
            }
          }
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
      console.log('[PressToTalk] recognition error', { error: err });
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        listeningRef.current = false;
        setPermDenied(true);
        setLastError('not-allowed');
        setStatus('idle');
      } else if (err === 'aborted') {
        // Normal when rec.stop() is called from onPointerUp
      } else if (err === 'no-speech') {
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

      if (matchedRef.current) { listeningRef.current = false; return; }

      // iOS / Chrome early-end: onend while finger still held → restart automatically
      if (holdingRef.current) {
        listeningRef.current = false;
        setStatus('speak-again');
        setTranscript('');
        console.log('[PressToTalk] onend while holding — restarting');
        setTimeout(() => {
          if (holdingRef.current) startListeningRef.current?.();
        }, 120);
        return;
      }

      listeningRef.current = false;
      setStatus('idle');
      recRef.current = null;

      if (best) {
        console.log('[PressToTalk] onend — match attempt', { best });
        if (isMatch(best, expectedAnswer)) {
          matchedRef.current = true;
          void onCorrect(best);
        } else {
          setMatchFail(true);
          setTranscript(best);
          onWrong?.(best);
          failTimerRef.current = setTimeout(() => setMatchFail(false), 2200);
        }
      }
    };

    try {
      console.log('[PressToTalk] recognition.start', { lang: language });
      rec.start();
    } catch (err) {
      console.log('[PressToTalk] start-exception', { err: String(err) });
      listeningRef.current = false;
      setStatus('idle');
      setLastError('start-exception');
      recRef.current = null;
    }
  }, [disabled, language, expectedAnswer, onCorrect, onWrong]);

  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

  // ── submitFallbackAnswer ───────────────────────────────────────────────────
  // Explicit text submission path — completely independent of speech recognition.
  // Guards: empty input, disabled (parent), already in-flight (submittingRef).
  // ─────────────────────────────────────────────────────────────────────────
  const submitFallbackAnswer = useCallback(async () => {
    const trimmed = textAnswer.trim();
    if (!trimmed || disabled || submittingRef.current) return;

    const normalizedTyped    = normalizeForMatch(trimmed);
    const normalizedExpected = normalizeForMatch(expectedAnswer);
    const matched = isMatch(trimmed, expectedAnswer);

    console.log('[PressToTalkFallback] submit', {
      typedText: trimmed,
      expectedAnswer,
      normalizedTyped,
      normalizedExpected,
      matched,
    });

    setFallbackError(null);
    setMatchFail(false);

    if (!matched) {
      // Local mismatch — show inline "Non ancora" without hitting the server
      console.log('[PressToTalkFallback] local mismatch');
      setMatchFail(true);
      onWrong?.(trimmed);
      failTimerRef.current = setTimeout(() => setMatchFail(false), 2500);
      return;
    }

    // Local match — call onCorrect and wait for server verdict
    // IMPORTANT: do NOT set corrected/dismissed state here.
    // The parent controls dismissal: when onCorrect resolves successfully,
    // the parent sets answered=true which unmounts this component entirely.
    // If the server rejects (409, 422), we receive {ok:false} and show the
    // inline error — component stays visible and usable.
    submittingRef.current = true;
    setSubmitting(true);
    console.log('[WordBackAnswer] POST start', { trimmed });

    try {
      const result = await onCorrect(trimmed);
      console.log('[WordBackAnswer] POST result', { result });

      const res = result as AnswerResult | void | undefined;
      if (res && res.ok === false) {
        // Server explicitly rejected — show inline message, stay usable
        const code = res.code ?? 'error';
        let msg = res.message ?? 'Errore del server, riprova';
        if (code === '409') msg = 'Risposta già registrata per questo round';
        else if (code === '422') msg = 'Non ancora, riprova!';
        console.log('[WordBackAnswer] server rejection', { code, msg });
        setFallbackError(msg);
        submittingRef.current = false;
        setSubmitting(false);
      } else {
        // Success (or void/undefined — parent handles UI transition)
        console.log('[WordBackAnswer] success');
        submittingRef.current = false;
        setSubmitting(false);
        // Do NOT set corrected=true — parent will unmount us by rendering
        // the CORRETTO overlay (answered=true in WordBackController).
      }
    } catch (err) {
      console.log('[WordBackAnswer] POST exception', { err: String(err) });
      setFallbackError('Errore di connessione, riprova');
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [textAnswer, disabled, expectedAnswer, onCorrect, onWrong]);

  // ── cleanup on unmount ─────────────────────────────────────────────────────
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

  // ── permission denied ───────────────────────────────────────────────────────
  if (permDenied) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl px-5 py-4 text-center"
        style={{background:'rgba(239,68,68,0.12)',border:'1.5px solid rgba(239,68,68,0.4)'}}>
        <div className="text-2xl">🚫</div>
        <div className="text-sm font-black" style={{color:'#f87171'}}>Microfono non autorizzato</div>
        <div className="text-xs text-white/45">Attiva il microfono nelle impostazioni del browser, poi ricarica.</div>
        <FallbackInput textAnswer={textAnswer} setTextAnswer={setTextAnswer}
          onSubmit={submitFallbackAnswer} disabled={disabled} submitting={submitting}
          matchFail={matchFail} fallbackError={fallbackError} />
      </div>
    );
  }

  const isListening = status === 'listening' || status === 'no-speech' || status === 'speak-again';

  // ── speech API available ────────────────────────────────────────────────────
  if (getSR()) {
    let statusChip: string | null = null;
    if (status === 'speak-again')            statusChip = '🔄 Parla di nuovo…';
    else if (isListening && !transcript)     statusChip = '🎙 Jonny ti ascolta…';
    else if (isListening && transcript)      statusChip = `Ho sentito: "${transcript}"`;
    else if (status === 'no-speech')         statusChip = 'Non ho sentito nulla, continua…';
    else if (status === 'error' && errorMsg) statusChip = `⚠️ ${errorMsg}`;
    else if (matchFail && transcript)        statusChip = `Ho sentito: "${transcript}" — riprova!`;

    const srSupported = !!getSR();
    const secureCtx   = typeof window !== 'undefined' && window.isSecureContext;

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
                  <div className="text-sm font-black" style={{color:'#A78BFA'}}>
                    {status === 'speak-again' ? '🔄 Parla di nuovo…' : 'Jonny ti ascolta…'}
                  </div>
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

        {/* Status chip — when not in full overlay */}
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
            onPointerDown = primary event; subsumes mouse+touch+pen.
            setPointerCapture blocks the synthetic cascade that double-fires startListening.
            holdingRef is set synchronously so onend can detect early-end-while-holding. */}
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

        {/* Text fallback — ALWAYS visible as backup. Never blocked by mic state. */}
        <FallbackInput textAnswer={textAnswer} setTextAnswer={setTextAnswer}
          onSubmit={submitFallbackAnswer} disabled={disabled} submitting={submitting}
          matchFail={matchFail} fallbackError={fallbackError} />

        {/* Tiny diagnostic badge */}
        <div className="flex items-center gap-3 select-none"
          style={{opacity:0.28,fontSize:10,fontFamily:'monospace',letterSpacing:'0.03em'}}>
          <span title="Speech API supportato">🎙 {srSupported ? '✓' : '✗'}</span>
          <span title="Secure context (HTTPS)">🔒 {secureCtx ? '✓' : '✗'}</span>
          {lastError && (
            <span title="Ultimo errore" style={{color:'#f87171',opacity:1}}>⚠ {lastError}</span>
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
      <FallbackInput textAnswer={textAnswer} setTextAnswer={setTextAnswer}
        onSubmit={submitFallbackAnswer} disabled={disabled} submitting={submitting}
        matchFail={matchFail} fallbackError={fallbackError} large />
      <div className="flex items-center justify-center gap-3 mt-1"
        style={{opacity:0.25,fontSize:10,fontFamily:'monospace'}}>
        <span>🎙 ✗</span>
        <span>🔒 {typeof window !== 'undefined' && window.isSecureContext ? '✓' : '✗'}</span>
        {lastError && <span style={{color:'#f87171',opacity:1}}>⚠ {lastError}</span>}
      </div>
    </div>
  );
}

// ── FallbackInput — shared between speech+perm-denied+no-SR branches ──────────
function FallbackInput({
  textAnswer, setTextAnswer, onSubmit, disabled, submitting, matchFail, fallbackError, large,
}: {
  textAnswer: string;
  setTextAnswer: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  submitting: boolean;
  matchFail: boolean;
  fallbackError: string | null;
  large?: boolean;
}) {
  const py = large ? 'py-3' : 'py-2.5';
  const textSz = large ? 'text-base' : 'text-sm';

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Inline error banner */}
      <AnimatePresence>
        {(matchFail || fallbackError) && (
          <motion.div key="inline-err"
            initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0}}
            className="w-full rounded-xl px-3 py-2 text-xs font-bold text-center"
            style={{background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.3)',color:'#f87171'}}>
            {fallbackError ?? '❌ Non ancora, riprova!'}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-2">
        <input
          value={textAnswer}
          onChange={e => setTextAnswer(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSubmit(); }}
          placeholder="Oppure scrivi la risposta…"
          disabled={disabled || submitting}
          className={`flex-1 rounded-xl px-4 ${py} ${textSz} font-bold text-white outline-none disabled:opacity-50`}
          style={{background:'rgba(255,255,255,0.07)',border:'1.5px solid rgba(255,255,255,0.18)'}}
        />
        {/* OK button — disabled ONLY when input is empty or disabled/submitting */}
        <button
          onClick={onSubmit}
          disabled={disabled || !textAnswer.trim() || submitting}
          className={`rounded-xl px-4 ${py} ${textSz} font-black text-white disabled:opacity-50`}
          style={{background:'linear-gradient(135deg,#A78BFA,#7C3AED)',minWidth:52}}>
          {submitting ? '…' : 'OK'}
        </button>
      </div>
    </div>
  );
}

// legacy compat export
export function useCleanupSpeech() {
  useEffect(() => { return () => { /* component handles its own cleanup */ }; }, []);
}
