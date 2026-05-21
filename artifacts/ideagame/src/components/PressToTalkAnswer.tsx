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

// ── Browser detection ─────────────────────────────────────────────────────────
// Detects Chrome/Firefox/Edge on iOS (CriOS/FxiOS/EdgiOS in UA).
// These browsers ship WKWebView which has an unreliable SpeechRecognition shim.
// Safari on iOS/iPadOS uses the native WebKit SR engine and works correctly.
function detectBrowser() {
  if (typeof navigator === 'undefined') {
    return { ua: '', isIOS: false, isSafariIOS: false, isChromeIOS: false, isFirefoxIOS: false, isEdgeIOS: false, isNonSafariIOS: false };
  }
  const ua      = navigator.userAgent;
  // iPad running iPadOS 13+ reports as desktop Safari — check maxTouchPoints
  const isIOS   = /iP(hone|ad|od)/.test(ua) ||
    (typeof navigator.platform === 'string' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafariIOS  = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  const isChromeIOS  = isIOS && /CriOS/.test(ua);
  const isFirefoxIOS = isIOS && /FxiOS/.test(ua);
  const isEdgeIOS    = isIOS && /EdgiOS/.test(ua);
  const isNonSafariIOS = isIOS && !isSafariIOS; // any non-Safari iOS browser
  return { ua, isIOS, isSafariIOS, isChromeIOS, isFirefoxIOS, isEdgeIOS, isNonSafariIOS };
}

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Callers may optionally return a typed result so the component can surface
 * inline server errors (409 duplicate, 422 wrong answer, etc.).
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
  /** Required for the recordAndTranscribe engine (Chrome iOS).
   *  When omitted the component falls back to text-first for Chrome iOS. */
  sessionId?: string;
  playerId?: string;
}

type SpeechStatus =
  | 'idle'
  | 'waiting-mic'   // getUserMedia in flight
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
  sessionId,
  playerId,
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
  const [srUnsupported, setSrUnsupported] = useState(false); // getUserMedia works but SR doesn't

  // ── Mic diagnostics state ──────────────────────────────────────────────────
  const [permState, setPermState]     = useState<'granted'|'prompt'|'denied'|'unknown'>('unknown');
  const [diag, setDiag]               = useState({
    startCalled:       false,
    onstartFired:      false,
    onaudiostartFired: false,
    onspeechstartFired:false,
    gumGranted:        false,
  });
  const [startTimeout, setStartTimeout] = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const recRef            = useRef<AnySR | null>(null);
  const listeningRef      = useRef(false);
  const holdingRef        = useRef(false);
  const matchedRef        = useRef(false);
  const submittingRef     = useRef(false);
  const lastTranscriptRef = useRef('');
  const interimRef        = useRef('');
  const failTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startListeningRef = useRef<(() => void) | null>(null);
  const onstartFiredRef   = useRef(false);
  const startTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef     = useRef(0);

  // ── recordAndTranscribe state (Chrome iOS path) ────────────────────────────
  const [recordStatus, setRecordStatus]       = useState<'idle'|'recording'|'uploading'|'ok'|'fail'|'configErr'|'error'>('idle');
  const [recordTranscript, setRecordTranscript] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const streamRef        = useRef<MediaStream | null>(null);
  const recordHoldingRef = useRef(false);

  // ── Stable prop refs + Chrome iOS shadow mic refs ─────────────────────────
  // Refs let async closures (MediaRecorder.onstop, fetch) see the latest values
  // without needing to be in the useCallback deps array.
  const onCorrectRef    = useRef(onCorrect);
  const onWrongRef      = useRef<typeof onWrong>(onWrong);
  const isChromeIOSRef  = useRef(false);
  const sessionIdRef    = useRef<string | undefined>(sessionId);
  const playerIdRef     = useRef<string | undefined>(playerId);
  // Shadow MediaRecorder: runs alongside SR on Chrome iOS as a Whisper fallback
  const shadowMRRef     = useRef<MediaRecorder | null>(null);
  const shadowChunksRef = useRef<Blob[]>([]);
  const shadowMimeRef   = useRef('');
  const shadowStreamRef = useRef<MediaStream | null>(null);

  // ── Permission query + browser diagnosis — runs once on mount ────────────
  useEffect(() => {
    const b              = detectBrowser();
    const secureCtx      = typeof window !== 'undefined' && window.isSecureContext;
    const srSupported    = !!getSR();
    const mediaSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

    const engine = b.isNonSafariIOS ? 'recordAndTranscribe'
      : srSupported ? 'webSpeech'
      : 'textFallback';

    console.log('[VoiceEngine] selected', {
      engine,
      browser:       b.ua.slice(0, 120),
      isSafariIOS:   b.isSafariIOS,
      isChromeIOS:   b.isChromeIOS,
      isNonSafariIOS: b.isNonSafariIOS,
      speechSupported: srSupported,
      secureContext:   secureCtx,
      mediaDevicesSupported: mediaSupported,
    });
    console.log('[PressToTalkBrowser]', { engine, isSafariIOS: b.isSafariIOS, isChromeIOS: b.isChromeIOS });
    console.log('[MicFix] mount diagnostics', { secureContext: secureCtx, speechSupported: srSupported, mediaDevicesSupported: mediaSupported });

    if (typeof navigator === 'undefined') return;
    navigator.permissions
      ?.query({ name: 'microphone' as PermissionName })
      .then(r => { setPermState(r.state as 'granted'|'prompt'|'denied'); })
      .catch(() => setPermState('unknown'));
  }, []);

  // ── stopListening ─────────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    holdingRef.current = false;
    console.log('[MicFix] release — stopping recognition');
    if (recRef.current) {
      try { recRef.current.stop(); } catch { /* ignore */ }
    }
    // Chrome iOS: stop shadow MediaRecorder — its onstop will attempt Whisper fallback
    if (shadowMRRef.current?.state === 'recording') {
      console.log('[ChromeMic] mediaRecorder stopped');
      try { shadowMRRef.current.stop(); } catch { /* ignore */ }
    }
    shadowMRRef.current = null;
  }, []);

  // ── startListening — called AFTER getUserMedia permission is already granted ──
  // Never call this directly from onPointerDown — always go through the
  // getUserMedia bridge below so the OS permission dialog fires reliably.
  const startListening = useCallback(() => {
    const SRClass: AnySR | null = getSR();

    console.log('[MicFix] recognition.start attempt', {
      secureContext: typeof window !== 'undefined' && window.isSecureContext,
      speechSupported: !!SRClass,
      listening: listeningRef.current,
      holding: holdingRef.current,
      disabled,
    });

    if (listeningRef.current || disabled) return;

    if (!SRClass) {
      console.log('[MicFix] speechSupported=false — falling back to text only');
      setSrUnsupported(true);
      holdingRef.current = false;
      return;
    }

    listeningRef.current = true;

    matchedRef.current = false;
    onstartFiredRef.current = false;
    lastTranscriptRef.current = '';
    interimRef.current = '';
    setTranscript('');
    setMatchFail(false);
    setFallbackError(null);
    setErrorMsg('');
    setStartTimeout(false);
    setDiag(d => ({ ...d, startCalled: true, onstartFired: false, onaudiostartFired: false, onspeechstartFired: false }));
    setStatus('listening');
    if (failTimerRef.current) clearTimeout(failTimerRef.current);
    if (startTimerRef.current) clearTimeout(startTimerRef.current);

    const rec = new SRClass();
    recRef.current = rec;
    rec.lang = language;
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    rec.continuous = true;

    // ── Mic lifecycle hooks ───────────────────────────────────────────────
    rec.onstart = () => {
      onstartFiredRef.current = true;
      if (startTimerRef.current) clearTimeout(startTimerRef.current);
      setStartTimeout(false);
      setDiag(d => ({ ...d, onstartFired: true }));
      console.log('[MicFix] onstart ✓');
    };
    rec.onaudiostart = () => {
      setDiag(d => ({ ...d, onaudiostartFired: true }));
      console.log('[MicFix] onaudiostart ✓');
    };
    rec.onspeechstart = () => {
      setDiag(d => ({ ...d, onspeechstartFired: true }));
      console.log('[MicFix] onspeechstart ✓');
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          for (let a = 0; a < result.length; a++) {
            const t = String(result[a]?.transcript ?? '');
            console.log('[MicFix] onresult final', { t, alt: a, conf: result[a]?.confidence });
            if (isMatch(t, expectedAnswer) && !matchedRef.current) {
              matchedRef.current = true;
              listeningRef.current = false;
              try { rec.stop(); } catch { /* ignore */ }
              console.log('[MicFix] match ✓', { spoken: t, expected: expectedAnswer });
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
      console.log('[MicFix] onerror', { error: err });
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        listeningRef.current = false;
        setPermDenied(true);
        setLastError('not-allowed');
        setStatus('idle');
      } else if (err === 'aborted') {
        // Normal when rec.stop() is called from onPointerUp — ignore
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
      console.log('[MicFix] onend', {
        matched: matchedRef.current,
        holding: holdingRef.current,
        best,
      });

      if (matchedRef.current) { listeningRef.current = false; return; }

      // iOS / Chrome early-end: onend fires while finger still held → restart (max 1 auto-retry per hold)
      if (holdingRef.current && retryCountRef.current < 1) {
        retryCountRef.current += 1;
        listeningRef.current = false;
        setStatus('speak-again');
        setTranscript('');
        console.log('[MicFix] onend while holding — restarting (retry', retryCountRef.current, ')');
        setTimeout(() => {
          if (holdingRef.current) startListeningRef.current?.();
        }, 120);
        return;
      }

      listeningRef.current = false;
      setStatus('idle');
      recRef.current = null;

      if (best) {
        console.log('[MicFix] onend match attempt', { best });
        if (isMatch(best, expectedAnswer)) {
          matchedRef.current = true;
          console.log('[MicFix] match ✓ (onend path)', { spoken: best });
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
      console.log('[MicFix] recognition.start → calling rec.start()');
      rec.start();

      // 800ms guard: if onstart doesn't fire, mic is silently blocked
      startTimerRef.current = setTimeout(() => {
        if (!onstartFiredRef.current) {
          console.warn('[MicFix] start-timeout — onstart did not fire within 800ms');
          setStartTimeout(true);
        }
      }, 800);
    } catch (err) {
      console.log('[MicFix] rec.start() threw exception', { err: String(err) });
      listeningRef.current = false;
      setStatus('idle');
      setLastError('start-exception');
      setStartTimeout(true);
      recRef.current = null;
    }
  }, [disabled, language, expectedAnswer, onCorrect, onWrong]);

  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

  // ── Keep prop refs current (safe to read from async closures) ──────────────
  useEffect(() => { onCorrectRef.current = onCorrect; }, [onCorrect]);
  useEffect(() => { onWrongRef.current = onWrong; }, [onWrong]);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);
  useEffect(() => { isChromeIOSRef.current = detectBrowser().isNonSafariIOS; }, []);

  // ── getUserMedia permission bridge ────────────────────────────────────────
  // Must be called directly from the pointer-down gesture so the browser
  // links the permission prompt to the user action.
  // After the stream is obtained the tracks are immediately stopped — we only
  // need the permission grant; SpeechRecognition opens its own stream.
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    holdingRef.current = true;
    retryCountRef.current = 0;

    const secureCtx      = typeof window !== 'undefined' && window.isSecureContext;
    const srSupported    = !!getSR();
    const mediaSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

    console.log('[MicFix] pointerDown', { secureContext: secureCtx, speechSupported: srSupported, mediaDevicesSupported: mediaSupported });

    if (!srSupported) {
      console.log('[MicFix] speechSupported=false at pointerDown');
      setSrUnsupported(true);
      holdingRef.current = false;
      return;
    }

    if (!mediaSupported) {
      // getUserMedia unavailable (HTTP or very old browser) — try SR directly
      console.log('[MicFix] mediaDevicesSupported=false — skipping getUserMedia bridge');
      startListening();
      return;
    }

    setStatus('waiting-mic');
    console.log('[MicFix] getUserMedia start');
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        setDiag(d => ({ ...d, gumGranted: true }));
        const hasMR = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';
        console.log('[MicFix] getUserMedia granted', { isChromeIOS: isChromeIOSRef.current, hasMR });
        console.log('[ChromeMic] getUserMedia granted', { hasMR, speechRecognitionAvailable: !!getSR() });

        if (isChromeIOSRef.current && hasMR) {
          // Chrome iOS: keep the stream alive so MediaRecorder can use it as a
          // Whisper fallback in case SR gives no transcript.
          shadowChunksRef.current = [];
          shadowStreamRef.current = stream;
          const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
          const mimeType   = candidates.find(f => MediaRecorder.isTypeSupported(f)) ?? '';
          shadowMimeRef.current = mimeType;
          console.log('[ChromeMic] mediaRecorder available, mimeType:', mimeType || '(default)');

          try {
            const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            shadowMRRef.current = mr;

            mr.ondataavailable = (ev: BlobEvent) => {
              if (ev.data.size > 0) shadowChunksRef.current.push(ev.data);
            };

            mr.onstop = async () => {
              // Stop stream tracks — both SR and MR are now done
              stream.getTracks().forEach(t => t.stop());
              shadowStreamRef.current = null;

              // If SR matched first — Whisper not needed
              if (matchedRef.current) {
                console.log('[ChromeMic] shadowMR stopped — SR already matched, skipping Whisper');
                return;
              }

              const blob = new Blob(shadowChunksRef.current, { type: mimeType || 'audio/webm' });
              console.log('[ChromeMic] audio blob size:', blob.size);

              if (blob.size < 500) {
                console.log('[ChromeMic] blob too small — Whisper skipped');
                return;
              }
              const sid = sessionIdRef.current;
              const pid = playerIdRef.current;
              if (!sid || !pid) {
                console.log('[ChromeMic] no sessionId/playerId — Whisper skipped (non-wordback game)');
                return;
              }

              console.log('[ChromeMic] SR gave no transcript — sending to Whisper fallback');
              const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
              const fd  = new FormData();
              fd.append('audio', blob, `answer.${ext}`);
              fd.append('playerId', pid);

              try {
                const resp = await fetch(`/api/home/sessions/${sid}/wordback-transcribe-answer`, {
                  method: 'POST', credentials: 'include', body: fd,
                });
                const data = await resp.json() as {
                  ok?: boolean; correct?: boolean; transcript?: string; error?: string;
                };
                const tx = data.transcript ?? '';
                console.log('[ChromeMic] Whisper transcript:', tx);
                console.log('[ChromeMic] Whisper match result:', { ok: data.ok, status: resp.status });

                if (resp.ok && data.ok) {
                  matchedRef.current = true;
                  void onCorrectRef.current(tx);
                } else if (resp.status === 409) {
                  matchedRef.current = true; // already scored — treat as success
                } else if (!matchedRef.current) {
                  if (tx) { setTranscript(tx); setMatchFail(true); onWrongRef.current?.(tx); }
                  else      { setMatchFail(true); }
                  if (failTimerRef.current) clearTimeout(failTimerRef.current);
                  failTimerRef.current = setTimeout(() => setMatchFail(false), 2200);
                }
              } catch (err) {
                console.log('[ChromeMic] Whisper POST error:', err);
              }
            };

            mr.start(200); // collect 200ms chunks
            console.log('[ChromeMic] mediaRecorder started');
          } catch (err) {
            console.log('[ChromeMic] MediaRecorder init failed — stream will be stopped:', err);
            stream.getTracks().forEach(t => t.stop());
            shadowStreamRef.current = null;
          }

          // Start SR alongside MediaRecorder
          if (holdingRef.current) {
            console.log('[ChromeMic] recognition.start called, speechRecognition:', !!getSR());
            startListening();
          } else {
            console.log('[ChromeMic] pointer released before SR started — aborting');
            stream.getTracks().forEach(t => t.stop());
            shadowStreamRef.current = null;
            setStatus('idle');
          }
        } else {
          // Safari / desktop: stop stream immediately (SR opens its own stream)
          console.log('[MicFix] getUserMedia granted — stopping tracks, starting SR');
          stream.getTracks().forEach(t => t.stop());
          if (holdingRef.current) {
            startListening();
          } else {
            console.log('[MicFix] pointer released before SR could start — aborting');
            setStatus('idle');
          }
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.log('[MicFix] getUserMedia denied/error', { msg });
        holdingRef.current = false;
        setStatus('idle');
        setPermDenied(true);
      });
  }, [startListening]);

  // ── recordAndTranscribe handlers (Chrome iOS path) ────────────────────────
  // pointerDown: getUserMedia → MediaRecorder.start
  // pointerUp:   MediaRecorder.stop → onstop assembles blob → POST to /wordback-transcribe-answer
  const handleTranscribePointerDown = useCallback(async (e: React.PointerEvent) => {
    if (recordHoldingRef.current || recordStatus === 'recording' || recordStatus === 'uploading') return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    recordHoldingRef.current = true;
    chunksRef.current = [];

    console.log('[VoiceRecord] recording started');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const mimeType   = candidates.find(f => MediaRecorder.isTypeSupported(f)) ?? '';

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (ev: BlobEvent) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };

      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        console.log('[VoiceRecord] recording stopped, blob size:', blob.size);

        if (blob.size < 500) { setRecordStatus('idle'); return; }
        if (!sessionId || !playerId) { setRecordStatus('error'); setTimeout(() => setRecordStatus('idle'), 3000); return; }

        setRecordStatus('uploading');
        const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
        const fd  = new FormData();
        fd.append('audio', blob, `answer.${ext}`);
        fd.append('playerId', playerId);
        console.log('[VoiceUpload] sending', { size: blob.size, mimeType });

        try {
          const resp = await fetch(`/api/home/sessions/${sessionId}/wordback-transcribe-answer`, {
            method: 'POST', credentials: 'include', body: fd,
          });
          const data = await resp.json() as { ok?: boolean; correct?: boolean; transcript?: string; error?: string };
          const tx = data.transcript ?? '';
          console.log('[VoiceTranscribe] transcript', tx);
          console.log('[VoiceMatch] result', { ok: data.ok, correct: data.correct, status: resp.status });

          if (resp.status === 503) {
            setRecordStatus('configErr'); setTimeout(() => setRecordStatus('idle'), 4000);
          } else if (resp.ok && data.ok) {
            setRecordStatus('ok');
            void onCorrect(tx);
          } else if (resp.status === 409) {
            setRecordStatus('ok'); // already scored — treat as success
          } else {
            setRecordTranscript(tx);
            setRecordStatus('fail');
            onWrong?.(tx);
            setTimeout(() => setRecordStatus('idle'), 2500);
          }
        } catch (err) {
          console.log('[VoiceUpload] error', err);
          setRecordStatus('error'); setTimeout(() => setRecordStatus('idle'), 3000);
        }
      };

      mr.start(200); // collect chunks every 200ms
      setRecordStatus('recording');
    } catch (err) {
      console.log('[VoiceRecord] getUserMedia failed', err);
      recordHoldingRef.current = false;
      setPermDenied(true);
      setRecordStatus('idle');
    }
  }, [sessionId, playerId, onCorrect, onWrong, recordStatus]);

  const handleTranscribePointerUp = useCallback(() => {
    recordHoldingRef.current = false;
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === 'recording') {
      mr.stop();
      // onstop will set status to 'uploading' after assembling the blob
    } else if (recordStatus !== 'uploading') {
      setRecordStatus('idle');
    }
  }, [recordStatus]);

  // ── submitFallbackAnswer ───────────────────────────────────────────────────
  const submitFallbackAnswer = useCallback(async () => {
    const trimmed = textAnswer.trim();
    if (!trimmed || disabled || submittingRef.current) return;

    const normalizedTyped    = normalizeForMatch(trimmed);
    const normalizedExpected = normalizeForMatch(expectedAnswer);
    const matched = isMatch(trimmed, expectedAnswer);

    console.log('[MicFix] fallback submit', { typedText: trimmed, expectedAnswer, normalizedTyped, normalizedExpected, matched });

    setFallbackError(null);
    setMatchFail(false);

    if (!matched) {
      console.log('[MicFix] fallback local mismatch');
      setMatchFail(true);
      onWrong?.(trimmed);
      failTimerRef.current = setTimeout(() => setMatchFail(false), 2500);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    console.log('[MicFix] fallback POST start', { trimmed });

    try {
      const result = await onCorrect(trimmed);
      console.log('[MicFix] fallback POST result', { result });

      const res = result as AnswerResult | void | undefined;
      if (res && res.ok === false) {
        const code = res.code ?? 'error';
        let msg = res.message ?? 'Errore del server, riprova';
        if (code === '409') msg = 'Risposta già registrata per questo round';
        else if (code === '422') msg = 'Non ancora, riprova!';
        console.log('[MicFix] fallback server rejection', { code, msg });
        setFallbackError(msg);
        submittingRef.current = false;
        setSubmitting(false);
      } else {
        console.log('[MicFix] fallback success');
        submittingRef.current = false;
        setSubmitting(false);
      }
    } catch (err) {
      console.log('[MicFix] fallback POST exception', { err: String(err) });
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
      if (startTimerRef.current) clearTimeout(startTimerRef.current);
      // MediaRecorder cleanup (Chrome iOS path)
      recordHoldingRef.current = false;
      if (mediaRecorderRef.current?.state === 'recording') {
        try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      // Shadow MediaRecorder cleanup (Chrome iOS SR+Whisper dual path)
      if (shadowMRRef.current?.state === 'recording') {
        try { shadowMRRef.current.stop(); } catch { /* ignore */ }
      }
      if (shadowStreamRef.current) {
        shadowStreamRef.current.getTracks().forEach(t => t.stop());
        shadowStreamRef.current = null;
      }
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

  // ── speech API not available (getUserMedia worked but SR missing) ───────────
  if (srUnsupported) {
    return (
      <div className="flex w-full flex-col gap-3">
        <div className="text-xs font-bold text-center rounded-xl px-3 py-2"
          style={{background:'rgba(251,146,60,0.1)',border:'1px solid rgba(251,146,60,0.3)',color:'rgba(251,146,60,0.9)'}}>
          Riconoscimento vocale non supportato — usa risposta scritta
        </div>
        <FallbackInput textAnswer={textAnswer} setTextAnswer={setTextAnswer}
          onSubmit={submitFallbackAnswer} disabled={disabled} submitting={submitting}
          matchFail={matchFail} fallbackError={fallbackError} large />
      </div>
    );
  }

  const isListening = status === 'listening' || status === 'no-speech' || status === 'speak-again';
  const isWaiting   = status === 'waiting-mic';

  // Browser detection — stable across renders (UA doesn't change)
  const browser     = detectBrowser();
  // Non-Safari iOS (Chrome/Firefox/Edge) has unreliable SR in WKWebView → text-first
  const isChromeIOS = browser.isNonSafariIOS;

  // Chrome iOS / non-Safari iOS: falls through to the webSpeech SR path below.
  // handlePointerDown starts a shadow MediaRecorder (Whisper fallback) when
  // isChromeIOSRef.current is true — no separate render branch needed.
  // Logs: [ChromeMic] browser / getUserMedia / mediaRecorder / blob size.
  if (isChromeIOS) {
    console.log('[ChromeMic] browser:', browser.ua.slice(0, 80));
  }

  // ── speech API available (Safari iOS / Chrome iOS / desktop) ───────────────
  if (getSR()) {
    let statusChip: string | null = null;
    if (isWaiting)                           statusChip = '🎤 Autorizzazione…';
    else if (status === 'speak-again')       statusChip = '🔄 Parla di nuovo…';
    else if (isListening && !transcript)     statusChip = '🎙 Jonny ti ascolta…';
    else if (isListening && transcript)      statusChip = `Ho sentito: "${transcript}"`;
    else if (status === 'no-speech')         statusChip = 'Non ho sentito nulla, continua…';
    else if (status === 'error' && errorMsg) statusChip = `⚠️ ${errorMsg}`;
    else if (matchFail && transcript)        statusChip = `Ho sentito: "${transcript}" — riprova!`;

    const srSupported   = !!getSR();
    const secureCtx     = typeof window !== 'undefined' && window.isSecureContext;
    const mediaSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

    return (
      <div className="flex flex-col items-center gap-4 w-full">

        {/* Jonny listening overlay */}
        <AnimatePresence>
          {(isListening || isWaiting) && (
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
                    {isWaiting ? '🎤 Autorizzazione microfono…' : status === 'speak-again' ? '🔄 Parla di nuovo…' : 'Jonny ti ascolta…'}
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
          {!isListening && !isWaiting && statusChip && (
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
            onPointerDown → getUserMedia bridge → rec.start().
            setPointerCapture blocks the synthetic cascade that double-fires startListening.
            holdingRef is set synchronously so onend can detect early-end-while-holding. */}
        <motion.button
          onPointerDown={handlePointerDown}
          onPointerUp={stopListening}
          onPointerLeave={stopListening}
          onPointerCancel={stopListening}
          disabled={disabled}
          whileTap={{scale:0.95}}
          className="w-full select-none rounded-2xl py-5 text-base font-black text-white disabled:opacity-50"
          style={{
            touchAction: 'none',
            userSelect: 'none',
            background: (isListening || isWaiting)
              ? 'linear-gradient(135deg,rgba(167,139,250,0.55),rgba(124,58,237,0.55))'
              : 'linear-gradient(135deg,#A78BFA,#7C3AED)',
            border: `2px solid ${(isListening || isWaiting) ? 'rgba(167,139,250,0.95)' : 'rgba(167,139,250,0.5)'}`,
            boxShadow: (isListening || isWaiting)
              ? '0 0 50px rgba(167,139,250,0.75), 0 0 100px rgba(124,58,237,0.25)'
              : '0 0 30px rgba(167,139,250,0.4)',
          }}>
          {isWaiting
            ? '🎤 Autorizzazione…'
            : isListening
              ? (status === 'speak-again' ? '🔄 Parla di nuovo…' : '🎙️ Rilascia quando finisci…')
              : '🎤 TIENI PREMUTO E RISPONDI'}
        </motion.button>

        <div className="text-xs text-white/25">Tieni premuto il tasto mentre parli</div>

        {/* Text fallback — ALWAYS visible as backup. */}
        <FallbackInput textAnswer={textAnswer} setTextAnswer={setTextAnswer}
          onSubmit={submitFallbackAnswer} disabled={disabled} submitting={submitting}
          matchFail={matchFail} fallbackError={fallbackError} />

        {/* Mic diagnostics panel */}
        <div className="w-full rounded-xl px-3 py-2 select-none"
          style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)'}}>
          <div className="flex items-center justify-between text-xs"
            style={{color:'rgba(255,255,255,0.32)',fontFamily:'monospace',letterSpacing:'0.02em'}}>
            <span title="Secure context (HTTPS)">
              🔒 {secureCtx ? <span style={{color:'#4ade80'}}>HTTPS ✓</span> : <span style={{color:'#f87171'}}>HTTP ✗</span>}
            </span>
            <span title="Speech Recognition API">
              🎙 {srSupported ? <span style={{color:'#4ade80'}}>SR ✓</span> : <span style={{color:'#f87171'}}>SR ✗</span>}
            </span>
            <span title="getUserMedia disponibile">
              🎤 {mediaSupported ? <span style={{color:'#4ade80'}}>GUM ✓</span> : <span style={{color:'#f87171'}}>GUM ✗</span>}
            </span>
            <span title="Permesso microfono">
              <span style={{color: permState === 'granted' ? '#4ade80' : permState === 'denied' ? '#f87171' : 'rgba(255,255,255,0.4)'}}>
                {permState}
              </span>
            </span>
          </div>
          {diag.startCalled && (
            <div className="flex items-center gap-1 mt-1 text-xs"
              style={{color:'rgba(255,255,255,0.25)',fontFamily:'monospace'}}>
              <span style={{color: diag.gumGranted ? '#4ade80' : 'rgba(255,255,255,0.2)'}}>
                gum{diag.gumGranted ? '✓' : '…'}
              </span>
              <span>→</span>
              <span style={{color: diag.onstartFired ? '#4ade80' : 'rgba(255,255,255,0.2)'}}>
                start{diag.onstartFired ? '✓' : '…'}
              </span>
              <span>→</span>
              <span style={{color: diag.onaudiostartFired ? '#4ade80' : 'rgba(255,255,255,0.2)'}}>
                audio{diag.onaudiostartFired ? '✓' : '…'}
              </span>
              <span>→</span>
              <span style={{color: diag.onspeechstartFired ? '#4ade80' : 'rgba(255,255,255,0.2)'}}>
                speech{diag.onspeechstartFired ? '✓' : '…'}
              </span>
              {lastError && (
                <span className="ml-auto" style={{color:'#f87171'}}>⚠ {lastError}</span>
              )}
            </div>
          )}
          {!diag.startCalled && lastError && (
            <div className="mt-1 text-xs" style={{color:'#f87171',fontFamily:'monospace'}}>⚠ {lastError}</div>
          )}
          {startTimeout && !diag.onstartFired && (
            <div className="mt-1 text-xs font-bold" style={{color:'#fb923c'}}>
              ⚠ Microfono non avviato — usa risposta scritta
            </div>
          )}
        </div>

      </div>
    );
  }

  // ── text-only fallback (no speech API at all) ──────────────────────────────
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

// ── FallbackInput ──────────────────────────────────────────────────────────────
// Stacks vertically (no horizontal flex) so the submit button stays on-screen
// when the iOS keyboard appears.  Font sizes are always ≥ 16px to prevent
// the iOS auto-zoom that shifts the viewport and pushes buttons off-screen.
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
  const inputRef = useRef<HTMLInputElement>(null);
  const fontSize = large ? 18 : 16; // ≥ 16px prevents iOS viewport zoom
  const padY     = large ? '12px 14px' : '10px 14px';

  return (
    <div className="flex flex-col gap-2 w-full"
      style={{boxSizing:'border-box', paddingBottom:'env(safe-area-inset-bottom)'}}>

      {/* Inline error banner */}
      <AnimatePresence>
        {(matchFail || fallbackError) && (
          <motion.div key="inline-err"
            initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0}}
            className="rounded-xl px-3 py-2 font-bold text-center"
            style={{
              fontSize: 14,
              background:'rgba(239,68,68,0.12)',
              border:'1px solid rgba(239,68,68,0.3)',
              color:'#f87171',
              boxSizing:'border-box',
            }}>
            {fallbackError ?? 'Non ancora, riprova!'}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vertical stack — input full-width, button full-width below */}
      <input
        ref={inputRef}
        type="text"
        inputMode="text"
        value={textAnswer}
        onChange={e => setTextAnswer(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') void onSubmit(); }}
        onFocus={() => {
          // Delay lets the keyboard fully open before scrolling
          setTimeout(() => {
            inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }, 350);
        }}
        placeholder="Scrivi la risposta…"
        disabled={disabled || submitting}
        className="w-full rounded-xl border bg-white/5 font-semibold text-white placeholder-white/25 outline-none focus:border-purple-500/60 disabled:opacity-40"
        style={{
          fontSize,
          padding: padY,
          borderColor:'rgba(255,255,255,0.12)',
          boxSizing:'border-box',
          width:'100%',
          // Disable iOS font size escalation on inputs
          WebkitTextSizeAdjust: '100%',
        }}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />

      <button
        onClick={() => void onSubmit()}
        disabled={disabled || submitting || !textAnswer.trim()}
        className="w-full rounded-xl font-black text-white transition-all active:scale-95 disabled:opacity-40"
        style={{
          fontSize: 16,
          padding: padY,
          background:'linear-gradient(135deg,#A78BFA,#7C3AED)',
          border:'1px solid rgba(167,139,250,0.4)',
          boxSizing:'border-box',
        }}>
        {submitting ? '…' : 'Invia →'}
      </button>
    </div>
  );
}
