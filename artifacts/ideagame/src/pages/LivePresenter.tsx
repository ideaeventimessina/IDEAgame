/**
 * /live-presenter?s=CODE — Mobile-first Presenter Controller
 * Dashboard: game launcher + show controls.
 * Coppie LIVE: 10-couple photo capture UI.
 */
import { useEffect, useState, useRef, useCallback, type ChangeEvent } from 'react';
import { getSocket } from '@/hooks/useEventSocket';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import {
  Loader2, Camera, Upload, CheckCircle2, Wifi, WifiOff,
  Play, Users, ChevronLeft, Eye, Trophy, VolumeX, Volume2,
  MonitorOff, SkipForward, Pause, Zap,
} from 'lucide-react';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body as T;
}

function getCode() {
  return new URLSearchParams(window.location.search).get('s') ?? '';
}

interface LiveSession {
  id: string; title: string; status: string;
  currentGameSlug: string | null; currentPhase: string;
  presenterCode: string; tvCode: string; role?: string;
}

interface LiveRuntimeState {
  liveSessionId: string;
  currentPhase: string;
  currentGameSlug?: string | null;
  payload: {
    homeSessionId?: string;
    [key: string]: unknown;
  };
}

interface CouplePhoto {
  id: string;
  label: string | null;
  url: string | null;
  metadata: { coupleIndex?: number; partner?: string; imageData?: string; coupleName?: string; partnerName?: string; };
}

interface CoupleEntry {
  coupleIndex: number;
  coupleId: string;
  coupleName?: string;
  photoA: CouplePhoto | null;
  photoB: CouplePhoto | null;
  complete: boolean;
}

async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      let w = img.naturalWidth, h = img.naturalHeight;
      const MAX = 900;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      else if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = reject;
    img.src = objUrl;
  });
}

const EMPTY_COUPLES: CoupleEntry[] = Array.from({ length: 10 }, (_, i) => ({
  coupleIndex: i, coupleId: `couple-${i}`, photoA: null, photoB: null, complete: false,
}));

const LIVE_GAMES = [
  { slug: 'gioco-coppie',      emoji: '🃏', label: 'Coppie LIVE',       color: '#A855F7' },
  { slug: 'percorso-a-risate', emoji: '🎲', label: 'Percorso',           color: '#F59E0B' },
  { slug: 'quizzone',          emoji: '❓', label: 'Quizzone',            color: '#60A5FA' },
  { slug: 'sfida-ballo',       emoji: '💃', label: 'Ballo',              color: '#EC4899' },
  { slug: 'saramusica',        emoji: '🎵', label: "Sara'Musica",         color: '#34D399' },
  { slug: 'karaoke-battle',    emoji: '🎤', label: 'Karaoke',            color: '#F97316' },
  { slug: 'parola-alle-spalle',emoji: '💬', label: 'Parola alle Spalle', color: '#06B6D4' },
  { slug: 'adult-only',        emoji: '🔞', label: 'Adult Only',          color: '#EF4444' },
];

const PURPLE = '#A855F7';
const GOLD   = '#F5B642';
const GREEN  = '#34D399';

type View = 'dashboard' | 'coppie';

export default function LivePresenter() {
  const code = useRef(getCode()).current;
  const [session, setSession]           = useState<LiveSession | null>(null);
  const [runtimeState, setRuntimeState] = useState<LiveRuntimeState | null>(null);
  const [view, setView]                 = useState<View>('dashboard');
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [connected, setConnected]       = useState(false);
  const [cmdLoading, setCmdLoading]     = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<string>('gioco-coppie');
  const [roomGames, setRoomGames]       = useState<string[]>([]); // slugs enabled for this room
  const [activeCoupleIdx, setActiveCoupleIdx] = useState<number | null>(null); // focused couple in editor

  // Coppie state
  const [couples, setCouples]           = useState<CoupleEntry[]>(EMPTY_COUPLES);
  const [uploading, setUploading]       = useState(false);
  const [creatingDeck, setCreatingDeck] = useState(false);
  const [deckCreated, setDeckCreated]   = useState(false);
  const [uploadTarget, setUploadTarget] = useState<{ coupleIndex: number; partner: 'A' | 'B' } | null>(null);
  const [coupleNames, setCoupleNames]   = useState<string[]>(Array(10).fill(''));
  const [partnerANames, setPartnerANames] = useState<string[]>(Array(10).fill(''));
  const [partnerBNames, setPartnerBNames] = useState<string[]>(Array(10).fill(''));

  const [homeSession, setHomeSession]   = useState<{ id: string; joinCode: string } | null>(null);
  const [audioMuted, setAudioMuted]     = useState(false);
  const [previewBusy, setPreviewBusy]   = useState(false);

  const socketRef       = useRef(getSocket());
  const cameraInputRef  = useRef<HTMLInputElement>(null);
  const fileInputRef    = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<{ coupleIndex: number; partner: 'A' | 'B' } | null>(null);
  const pollRef         = useRef<ReturnType<typeof setInterval> | null>(null);

  // Derived state
  const activeGameSlug = runtimeState?.currentGameSlug ?? session?.currentGameSlug ?? null;
  const activePhase    = runtimeState?.currentPhase    ?? session?.currentPhase    ?? 'standby';
  const homeSessionId  = runtimeState?.payload?.homeSessionId ?? null;

  // ── API helpers ──────────────────────────────────────────────────────────

  const loadRuntimeState = useCallback(async (sessionId: string) => {
    try {
      const state = await apiFetch<LiveRuntimeState>(`/live-sessions/${sessionId}/state?s=${code}`);
      setRuntimeState(state);
      if (state.currentGameSlug) setSelectedGame(state.currentGameSlug);
    } catch { /* no state yet — standby */ }
  }, [code]);

  const sendHomeCommand = async (command: string, payload?: unknown) => {
    if (!session) return;
    const key = `home:${command}`;
    setCmdLoading(key);
    console.log('[LivePresenterCommand]', { command, payload, liveSessionId: session.id, homeSessionId });
    try {
      await apiFetch(`/live-sessions/${session.id}/home-command?s=${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, payload }),
      });
      await Promise.all([
        apiFetch<LiveSession>(`/live-sessions/by-code/${code}`).then(s => setSession(s)).catch(() => {}),
        loadRuntimeState(session.id),
      ]);
      toast.success('Comando inviato');
      console.log('[LivePresenterCommand]', { command, result: 'ok', homeSessionId });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      toast.error('Comando fallito', { description: msg });
      console.error('[LivePresenterCommand] error', { command, error: msg });
    } finally {
      setCmdLoading(null);
    }
  };

  const loadCouples = useCallback(async (sessionId: string) => {
    try {
      const data = await apiFetch<CoupleEntry[]>(`/live-sessions/${sessionId}/couples?s=${code}`);
      setCouples(data);
      const cNames = [...coupleNames];
      const aNams  = [...partnerANames];
      const bNams  = [...partnerBNames];
      for (const c of data) {
        if (c.coupleName) cNames[c.coupleIndex] = c.coupleName;
        if (c.photoA?.metadata?.partnerName) aNams[c.coupleIndex] = c.photoA.metadata.partnerName;
        if (c.photoB?.metadata?.partnerName) bNams[c.coupleIndex] = c.photoB.metadata.partnerName;
      }
      setCoupleNames(cNames);
      setPartnerANames(aNams);
      setPartnerBNames(bNams);
    } catch { /* noop */ }
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendCommand = async (command: string, payload?: unknown) => {
    if (!session) return;
    const key = command;
    setCmdLoading(key);
    console.log('[LivePresenterAction]', { command, payload, sessionId: session.id, selectedGame });
    try {
      await apiFetch(`/live-sessions/${session.id}/command?s=${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, payload }),
      });
      // Refresh session + runtime state
      const [updatedSess] = await Promise.all([
        apiFetch<LiveSession>(`/live-sessions/by-code/${code}`).catch(() => null),
        loadRuntimeState(session.id),
      ]);
      if (updatedSess) setSession(updatedSess);
      toast.success(command.replace(/_/g, ' '));
      console.log('[LivePresenterAction]', { command, result: 'ok' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      toast.error('Comando fallito', { description: msg });
      console.error('[LivePresenterAction] error', { command, error: msg });
    } finally {
      setCmdLoading(null);
    }
  };

  // ── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!code) { setError('Codice presenter mancante (?s=CODE)'); setLoading(false); return; }
    (async () => {
      try {
        const sess = await apiFetch<LiveSession>(`/live-sessions/by-code/${code}`);
        if (sess.role === 'tv') {
          setError('Questo codice è per la TV. Usa il codice presenter.');
          return;
        }
        setSession(sess);
        if (sess.currentGameSlug) setSelectedGame(sess.currentGameSlug);
        // Load runtime state + couples in parallel
        await Promise.all([
          loadRuntimeState(sess.id),
          loadCouples(sess.id),
        ]);
        console.log('[LivePresenter]', {
          presenterCode: code,
          liveSessionId: sess.id,
          homeSessionId: null, // will be set after loadRuntimeState
          currentGameSlug: sess.currentGameSlug,
          currentPhase: sess.currentPhase,
          availableGames: LIVE_GAMES.map(g => g.slug),
        });
      } catch {
        setError('Sessione non trovata o codice non valido');
      } finally {
        setLoading(false);
      }
    })();
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  // Log after runtimeState is available
  useEffect(() => {
    if (!session || !runtimeState) return;
    console.log('[LivePresenter] runtimeState loaded', {
      presenterCode: code,
      liveSessionId: session.id,
      homeSessionId: runtimeState.payload?.homeSessionId ?? null,
      currentGameSlug: runtimeState.currentGameSlug ?? session.currentGameSlug,
      currentPhase: runtimeState.currentPhase,
      roomGames,
    });
  }, [runtimeState?.currentPhase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch home session for joinCode + enabled games ───────────────────────
  useEffect(() => {
    if (!homeSessionId) return;
    (async () => {
      try {
        const data = await apiFetch<{ session: { id: string; joinCode: string; gameConfig?: { selectedGames?: string[] } } }>(`/home/sessions/${homeSessionId}`);
        if (data?.session) {
          setHomeSession({ id: data.session.id, joinCode: data.session.joinCode });
          console.log('[LivePresenter] homeSession loaded', { homeSessionId, joinCode: data.session.joinCode });
        }
        const selected = data?.session?.gameConfig?.selectedGames;
        if (Array.isArray(selected) && selected.length > 0) {
          setRoomGames(selected);
        }
      } catch { /* home session fetch optional — fall back to all games */ }
    })();
  }, [homeSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Socket ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    const socket = socketRef.current;
    socket.emit('live:join', { sessionId: session.id, code });
    if (socket.connected) setConnected(true);
    const onConnect    = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onSessionUpd = (data: Partial<LiveSession>) => {
      setSession(prev => prev ? { ...prev, ...data } : prev);
      if (data.currentGameSlug) setSelectedGame(data.currentGameSlug);
      // Also reload runtime state when session updates
      void loadRuntimeState(session.id);
    };
    const onCouplesUpd = (data: { couples: CoupleEntry[] }) => setCouples(data.couples);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('live:session_updated', onSessionUpd);
    socket.on('live:couples_updated', onCouplesUpd);

    // Poll every 6s
    pollRef.current = setInterval(() => {
      apiFetch<LiveSession>(`/live-sessions/by-code/${code}`).then(s => {
        setSession(s);
        if (s.currentGameSlug) setSelectedGame(s.currentGameSlug);
      }).catch(() => {});
      void loadRuntimeState(session.id);
    }, 6000);

    return () => {
      socket.emit('live:leave', { sessionId: session.id });
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('live:session_updated', onSessionUpd);
      socket.off('live:couples_updated', onCouplesUpd);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [session?.id, code]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Coppie upload helpers ─────────────────────────────────────────────────
  const triggerUpload = (coupleIndex: number, partner: 'A' | 'B', camera: boolean) => {
    uploadTargetRef.current = { coupleIndex, partner };
    setUploadTarget({ coupleIndex, partner });
    if (camera) cameraInputRef.current?.click();
    else fileInputRef.current?.click();
  };

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file   = e.target.files?.[0];
    const target = uploadTargetRef.current;
    if (!file || !session || !target) return;
    e.target.value = '';
    const { coupleIndex, partner } = target;
    setUploading(true);
    try {
      const imageData   = await compressImage(file);
      const coupleName  = coupleNames[coupleIndex]?.trim() || undefined;
      const partnerName = (partner === 'A' ? partnerANames[coupleIndex] : partnerBNames[coupleIndex])?.trim() || undefined;
      await apiFetch(`/live-sessions/${session.id}/photos?s=${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coupleIndex, partner, imageData, coupleName, partnerName }),
      });
      await loadCouples(session.id);
      toast.success(`Coppia ${coupleIndex + 1} — partner ${partner} aggiunto!`);
    } catch (err: unknown) {
      toast.error('Errore upload', { description: err instanceof Error ? err.message : 'Riprovare' });
    } finally {
      setUploading(false);
      setUploadTarget(null);
      uploadTargetRef.current = null;
    }
  };

  const deletePhoto = async (coupleIndex: number, partner: 'A' | 'B') => {
    if (!session) return;
    const couple = couples[coupleIndex];
    const photo  = partner === 'A' ? couple?.photoA : couple?.photoB;
    if (!photo) return;
    try {
      await apiFetch(`/live-sessions/${session.id}/photos/${photo.id}?s=${code}`, { method: 'DELETE' });
      await loadCouples(session.id);
    } catch (err: unknown) {
      toast.error('Errore eliminazione', { description: err instanceof Error ? err.message : '' });
    }
  };

  const createDeck = async () => {
    if (!session || creatingDeck) return;
    setCreatingDeck(true);
    try {
      const res = await apiFetch<{ ok: boolean; pairs: number; cards: number }>(
        `/live-sessions/${session.id}/create-deck?s=${code}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      );
      setDeckCreated(true);
      toast.success(`Mazzo creato! ${res.pairs} coppie — ${res.cards} carte`);
    } catch (err: unknown) {
      toast.error('Errore mazzo', { description: err instanceof Error ? err.message : '' });
    } finally {
      setCreatingDeck(false);
    }
  };

  // ── Open Coppie view — always opens, no API call required ────────────────
  const openCoppie = () => {
    setSelectedGame('gioco-coppie');
    setView('coppie');
    console.log('[LivePresenterAction]', { action: 'open_coppie', gameSlug: 'gioco-coppie' });
  };

  // ── Coppie preview — broadcast 10-second board visibility to all phones ──
  const sendCoppiePreview = async () => {
    if (!homeSession || previewBusy) return;
    setPreviewBusy(true);
    try {
      await apiFetch(`/home/sessions/${homeSession.id}/coppie-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      toast.success('👁 Campo visibile sui telefoni per 10 secondi');
    } catch (err: unknown) {
      toast.error('Errore visibilità', { description: err instanceof Error ? err.message : '' });
    } finally {
      setTimeout(() => setPreviewBusy(false), 10_000);
    }
  };

  // ── Loading / Error ───────────────────────────────────────────────────────
  if (loading) return <Screen><Loader2 className="animate-spin" size={32} style={{ color: PURPLE }} /></Screen>;
  if (error) return (
    <Screen>
      <div style={{ textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>❌</div>
        <div style={{ fontWeight: 900, color: '#EF4444', marginBottom: 8 }}>Errore</div>
        <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>{error}</div>
      </div>
    </Screen>
  );

  // ── Shared header ─────────────────────────────────────────────────────────
  const Header = ({ back, backLabel }: { back?: () => void; backLabel?: string }) => (
    <div style={{ padding: '12px 16px', background: 'rgba(168,85,247,0.12)', borderBottom: '1px solid rgba(168,85,247,0.3)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, position: 'sticky', top: 0, zIndex: 10 }}>
      {back && (
        <button onClick={back}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>
          <ChevronLeft size={14} /> {backLabel ?? 'Indietro'}
        </button>
      )}
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 900, fontSize: '0.85rem', color: PURPLE, letterSpacing: '0.08em' }}>🎤 PRESENTER</div>
        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{session?.title}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {connected
          ? <><Wifi size={13} style={{ color: GREEN }} /><span style={{ fontSize: '0.7rem', color: GREEN }}>live</span></>
          : <><WifiOff size={13} style={{ color: '#6B7280' }} /><span style={{ fontSize: '0.7rem', color: '#6B7280' }}>offline</span></>}
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // COPPIE VIEW
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'coppie') {
    const completeCouples = couples.filter(c => c.complete).length;
    const canCreate   = completeCouples >= 2;
    const allComplete = completeCouples === 10;

    // ── Focused couple editor ──────────────────────────────────────────────
    if (activeCoupleIdx !== null) {
      const cpl         = couples[activeCoupleIdx]!;
      const imgA        = cpl.photoA?.metadata?.imageData ?? cpl.photoA?.url ?? null;
      const imgB        = cpl.photoB?.metadata?.imageData ?? cpl.photoB?.url ?? null;
      const loadingA    = uploading && uploadTarget?.coupleIndex === activeCoupleIdx && uploadTarget?.partner === 'A';
      const loadingB    = uploading && uploadTarget?.coupleIndex === activeCoupleIdx && uploadTarget?.partner === 'B';
      const bothDone    = !!imgA && !!imgB;

      return (
        <div style={{ minHeight: '100dvh', background: '#120920', fontFamily: "'Outfit','Space Grotesk',sans-serif", color: '#fff', display: 'flex', flexDirection: 'column' }}>
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
          <input ref={fileInputRef}   type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />

          {/* Editor header */}
          <div style={{ padding: '12px 16px', background: 'rgba(168,85,247,0.12)', borderBottom: '1px solid rgba(168,85,247,0.3)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <button onClick={() => setActiveCoupleIdx(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>
              <ChevronLeft size={14} /> Coppie
            </button>
            <div style={{ flex: 1, fontWeight: 900, fontSize: '0.95rem', color: '#fff' }}>
              Coppia {activeCoupleIdx + 1}
            </div>
            {bothDone && <span style={{ fontSize: '0.75rem', color: GREEN, fontWeight: 700 }}>✅ pronta</span>}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Photo A slot */}
            <div style={{ borderRadius: 16, background: imgA ? 'rgba(52,211,153,0.06)' : 'rgba(255,255,255,0.07)', border: `2px solid ${imgA ? 'rgba(52,211,153,0.45)' : 'rgba(255,255,255,0.18)'}`, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', background: imgA ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: imgA ? GREEN : PURPLE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.75rem', color: '#fff', flexShrink: 0 }}>A</div>
                <span style={{ fontWeight: 900, fontSize: '0.85rem', color: imgA ? GREEN : 'rgba(255,255,255,0.8)' }}>
                  {imgA ? 'Foto A ✓' : 'Foto A — primo partecipante'}
                </span>
              </div>
              <div style={{ padding: '14px', display: 'flex', gap: 12, alignItems: 'center' }}>
                {/* Thumbnail */}
                <div style={{ width: 90, height: 90, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.1)', border: `1.5px solid ${imgA ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {loadingA
                    ? <Loader2 size={24} className="animate-spin" style={{ color: PURPLE }} />
                    : imgA
                      ? <img src={imgA} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <Camera size={28} style={{ color: 'rgba(255,255,255,0.25)' }} />}
                </div>
                {/* Action buttons */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button disabled={loadingA} onClick={() => triggerUpload(activeCoupleIdx, 'A', true)}
                    style={{ width: '100%', padding: '10px', background: `linear-gradient(135deg,${PURPLE},#7C3AED)`, border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Camera size={15} /> {imgA ? 'Riprendi' : 'Scatta foto'}
                  </button>
                  <button disabled={loadingA} onClick={() => triggerUpload(activeCoupleIdx, 'A', false)}
                    style={{ width: '100%', padding: '10px', background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.35)', borderRadius: 10, color: '#60A5FA', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Upload size={15} /> {imgA ? 'Sostituisci' : 'Carica da libreria'}
                  </button>
                  {imgA && (
                    <button onClick={() => deletePhoto(activeCoupleIdx, 'A')}
                      style={{ width: '100%', padding: '7px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, color: '#EF4444', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>
                      Elimina
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Photo B slot */}
            <div style={{ borderRadius: 16, background: imgB ? 'rgba(52,211,153,0.06)' : 'rgba(255,255,255,0.07)', border: `2px solid ${imgB ? 'rgba(52,211,153,0.45)' : imgA ? 'rgba(168,85,247,0.45)' : 'rgba(255,255,255,0.18)'}`, overflow: 'hidden', opacity: !imgA ? 0.55 : 1 }}>
              <div style={{ padding: '10px 14px', background: imgB ? 'rgba(52,211,153,0.1)' : imgA ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: imgB ? GREEN : imgA ? PURPLE : 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.75rem', color: '#fff', flexShrink: 0 }}>B</div>
                <span style={{ fontWeight: 900, fontSize: '0.85rem', color: imgB ? GREEN : imgA ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)' }}>
                  {imgB ? 'Foto B ✓' : imgA ? 'Foto B — secondo partecipante' : 'Foto B — prima aggiungi A'}
                </span>
              </div>
              <div style={{ padding: '14px', display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 90, height: 90, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.1)', border: `1.5px solid ${imgB ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {loadingB
                    ? <Loader2 size={24} className="animate-spin" style={{ color: PURPLE }} />
                    : imgB
                      ? <img src={imgB} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <Camera size={28} style={{ color: 'rgba(255,255,255,0.25)' }} />}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button disabled={!imgA || loadingB} onClick={() => triggerUpload(activeCoupleIdx, 'B', true)}
                    style={{ width: '100%', padding: '10px', background: imgA ? `linear-gradient(135deg,${PURPLE},#7C3AED)` : 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 10, color: imgA ? '#fff' : 'rgba(255,255,255,0.3)', fontWeight: 800, fontSize: '0.82rem', cursor: imgA ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Camera size={15} /> {imgB ? 'Riprendi' : 'Scatta foto'}
                  </button>
                  <button disabled={!imgA || loadingB} onClick={() => triggerUpload(activeCoupleIdx, 'B', false)}
                    style={{ width: '100%', padding: '10px', background: imgA ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${imgA ? 'rgba(96,165,250,0.35)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, color: imgA ? '#60A5FA' : 'rgba(255,255,255,0.2)', fontWeight: 800, fontSize: '0.82rem', cursor: imgA ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Upload size={15} /> {imgB ? 'Sostituisci' : 'Carica da libreria'}
                  </button>
                  {imgB && (
                    <button onClick={() => deletePhoto(activeCoupleIdx, 'B')}
                      style={{ width: '100%', padding: '7px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, color: '#EF4444', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>
                      Elimina
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Confirm button */}
            {bothDone && (
              <button onClick={() => {
                const next = activeCoupleIdx < 9 ? activeCoupleIdx + 1 : null;
                setActiveCoupleIdx(next);
              }}
                style={{ width: '100%', padding: '16px', background: `linear-gradient(135deg,${GREEN},#059669)`, border: 'none', borderRadius: 14, color: '#fff', fontWeight: 900, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 0 28px rgba(52,211,153,0.4)' }}>
                <CheckCircle2 size={20} />
                {activeCoupleIdx < 9 ? `✅ Conferma — vai a Coppia ${activeCoupleIdx + 2}` : '✅ Conferma — tutte le coppie!'}
              </button>
            )}

            <div style={{ paddingBottom: 24 }} />
          </div>
        </div>
      );
    }

    // ── Grid view (10 couple tiles) ────────────────────────────────────────
    return (
      <div style={{ minHeight: '100dvh', background: '#120920', fontFamily: "'Outfit','Space Grotesk',sans-serif", color: '#fff', display: 'flex', flexDirection: 'column' }}>
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
        <input ref={fileInputRef}   type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />

        <Header back={() => setView('dashboard')} backLabel="Dashboard" />

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Progress */}
          <div style={{ padding: '12px 14px', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={15} style={{ color: PURPLE }} />
                <span style={{ fontWeight: 900, fontSize: '0.82rem', color: PURPLE, letterSpacing: '0.06em' }}>🃏 COPPIE LIVE</span>
              </div>
              <span style={{ fontWeight: 900, fontSize: '0.9rem', color: completeCouples === 10 ? GREEN : GOLD }}>{completeCouples}/10</span>
            </div>
            <div style={{ width: '100%', height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 100, overflow: 'hidden' }}>
              <div style={{ height: 5, borderRadius: 100, width: `${completeCouples * 10}%`, background: completeCouples === 10 ? GREEN : `linear-gradient(90deg,${PURPLE},${GOLD})`, transition: 'width 0.4s' }} />
            </div>
            <div style={{ marginTop: 5, fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)' }}>Tocca un blocco per aggiungere le foto</div>
          </div>

          {/* 10-tile grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {couples.map((couple, idx) => {
              const imgA = couple.photoA?.metadata?.imageData ?? couple.photoA?.url ?? null;
              const imgB = couple.photoB?.metadata?.imageData ?? couple.photoB?.url ?? null;
              const hasA = !!imgA, hasB = !!imgB;
              const done = couple.complete;
              const partial = (hasA || hasB) && !done;
              const borderCol = done ? 'rgba(52,211,153,0.5)' : partial ? 'rgba(245,182,66,0.45)' : 'rgba(255,255,255,0.13)';
              const bgCol     = done ? 'rgba(52,211,153,0.08)' : partial ? 'rgba(245,182,66,0.06)' : 'rgba(255,255,255,0.05)';
              return (
                <button key={idx} onClick={() => setActiveCoupleIdx(idx)}
                  style={{ border: `2px solid ${borderCol}`, borderRadius: 14, background: bgCol, padding: '12px 10px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative', minHeight: 110 }}>
                  {/* Status badge */}
                  {done && <div style={{ position: 'absolute', top: 6, right: 7, fontSize: '0.65rem', background: 'rgba(52,211,153,0.2)', color: GREEN, fontWeight: 700, padding: '1px 6px', borderRadius: 20 }}>✓</div>}
                  {partial && <div style={{ position: 'absolute', top: 6, right: 7, fontSize: '0.6rem', background: 'rgba(245,182,66,0.2)', color: GOLD, fontWeight: 700, padding: '1px 6px', borderRadius: 20 }}>1/2</div>}
                  {/* Two photo circles */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[{ img: imgA, label: 'A' }, { img: imgB, label: 'B' }].map(({ img, label }) => (
                      <div key={label} style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', background: img ? 'transparent' : 'rgba(255,255,255,0.08)', border: `1.5px solid ${img ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.15)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {img
                          ? <img src={img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>{label}</span>}
                      </div>
                    ))}
                  </div>
                  {/* Label */}
                  <div style={{ fontWeight: 900, fontSize: '0.78rem', color: done ? GREEN : partial ? GOLD : 'rgba(255,255,255,0.55)' }}>
                    Coppia {idx + 1}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Create deck button */}
          <div style={{ marginTop: 4, paddingBottom: 24 }}>
            {deckCreated ? (
              <>
                <div style={{ padding: '14px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 10 }}>
                  <CheckCircle2 size={18} style={{ color: GREEN }} />
                  <div>
                    <div style={{ fontWeight: 900, color: GREEN, fontSize: '0.85rem' }}>Mazzo pronto!</div>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>La TV mostra il campo da gioco.</div>
                  </div>
                </div>
                <button onClick={createDeck} disabled={creatingDeck || !canCreate}
                  style={{ width: '100%', padding: '9px', background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 10, color: PURPLE, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                  ↺ Ricrea mazzo ({completeCouples} coppie)
                </button>
              </>
            ) : (
              <button onClick={createDeck} disabled={!canCreate || creatingDeck}
                style={{ width: '100%', padding: '16px', background: allComplete ? `linear-gradient(135deg,${GREEN},#059669)` : canCreate ? `linear-gradient(135deg,${PURPLE},#7C3AED)` : 'rgba(255,255,255,0.05)', border: `1px solid ${allComplete ? 'rgba(52,211,153,0.5)' : canCreate ? PURPLE : 'rgba(255,255,255,0.1)'}`, borderRadius: 14, color: canCreate ? '#fff' : 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.95rem', cursor: canCreate ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: canCreate ? `0 0 28px ${allComplete ? 'rgba(52,211,153,0.4)' : 'rgba(168,85,247,0.4)'}` : 'none' }}>
                {creatingDeck ? <Loader2 size={17} className="animate-spin" /> : <Play size={17} />}
                {!canCreate ? 'Servono almeno 2 coppie complete' : allComplete ? `🃏 CREA MAZZO — ${completeCouples} coppie` : `🃏 CREA MAZZO (${completeCouples}/10)`}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DASHBOARD VIEW
  // ══════════════════════════════════════════════════════════════════════════
  const currentGame     = LIVE_GAMES.find(g => g.slug === activeGameSlug);
  const isPaused        = session?.status === 'paused';
  const completeCouples = couples.filter(c => c.complete).length;
  const filteredGames   = roomGames.length > 0 ? LIVE_GAMES.filter(g => roomGames.includes(g.slug)) : LIVE_GAMES;

  // Short IDs for session card
  const shortLive = session?.id.slice(0, 8) ?? '—';
  const shortHome = homeSession?.id.slice(0, 8) ?? homeSessionId?.slice(0, 8) ?? '—';
  const joinUrl   = homeSession?.joinCode
    ? `${window.location.origin}${BASE}home-v4?join=${homeSession.joinCode}`.replace(/\/\//g, '/')
    : null;

  return (
    <div style={{ minHeight: '100dvh', background: '#120920', fontFamily: "'Outfit','Space Grotesk',sans-serif", color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <Header />

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* ═══════════════════════════════════════════════════════════════════
            SESSION CARD — live + home IDs, codes, QR
        ═══════════════════════════════════════════════════════════════════ */}
        <div style={{ borderRadius: 16, background: 'rgba(168,85,247,0.1)', border: `1.5px solid ${connected ? 'rgba(52,211,153,0.45)' : 'rgba(255,255,255,0.12)'}`, overflow: 'hidden' }}>
          {/* Header row */}
          <div style={{ padding: '10px 14px', background: 'rgba(168,85,247,0.15)', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: '0.85rem', color: PURPLE }}>Modalità LIVE</div>
              <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>
                collegata alla stanza <span style={{ color: '#fff', fontWeight: 700 }}>{session?.title ?? '—'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {connected
                ? <><Wifi size={13} style={{ color: GREEN }} /><span style={{ fontSize: '0.68rem', color: GREEN, fontWeight: 700 }}>LIVE</span></>
                : <><WifiOff size={13} style={{ color: '#6B7280' }} /><span style={{ fontSize: '0.68rem', color: '#6B7280' }}>offline</span></>}
            </div>
          </div>
          {/* IDs + codes */}
          <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
            <CodeRow label="Live ID" value={shortLive} />
            <CodeRow label="Home ID" value={shortHome} />
            <CodeRow label="TV code" value={session?.tvCode ?? '—'} />
            <CodeRow label="Presenter" value={session?.presenterCode ?? '—'} />
            {homeSession?.joinCode && <CodeRow label="Join code" value={homeSession.joinCode} highlight />}
            {activeGameSlug && <CodeRow label="Gioco" value={currentGame?.label ?? activeGameSlug} />}
          </div>
          {/* QR join */}
          {joinUrl && (
            <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ background: '#fff', padding: 5, borderRadius: 8, flexShrink: 0 }}>
                <QRCodeSVG value={joinUrl} size={72} bgColor="#ffffff" fgColor="#03000f" level="M" />
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 900, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>QR GIOCATORI</div>
                <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)', wordBreak: 'break-all' }}>{joinUrl}</div>
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            GIOCO ATTIVO badge
        ═══════════════════════════════════════════════════════════════════ */}
        <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: '1.6rem' }}>{currentGame?.emoji ?? '🎮'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: '0.88rem', color: currentGame?.color ?? 'rgba(255,255,255,0.5)' }}>
              {currentGame ? currentGame.label : '— nessun gioco attivo —'}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{activePhase}</div>
          </div>
          <StatusDot status={session?.status ?? 'draft'} />
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            GAME LAUNCHER — filteredGames from home session config
        ═══════════════════════════════════════════════════════════════════ */}
        <div style={{ padding: '12px 14px', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 14 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 900, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', marginBottom: 10 }}>🎮 LANCIA GIOCO → TV</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {filteredGames.map(g => {
              const sel = selectedGame === g.slug || activeGameSlug === g.slug;
              const isCoppie = g.slug === 'gioco-coppie';
              const key = `home:select_game`;
              return (
                <button key={g.slug}
                  onClick={() => {
                    setSelectedGame(g.slug);
                    if (isCoppie) { openCoppie(); }
                    else { void sendHomeCommand('select_game', { gameSlug: g.slug }); }
                  }}
                  disabled={!!cmdLoading}
                  style={{
                    padding: '10px 8px',
                    background: sel ? `${g.color}22` : 'rgba(255,255,255,0.04)',
                    border: `1.5px solid ${sel ? g.color : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 10, color: sel ? g.color : 'rgba(255,255,255,0.65)',
                    fontWeight: 900, fontSize: '0.73rem',
                    cursor: cmdLoading ? 'default' : 'pointer',
                    textAlign: 'center', transition: 'all 0.15s',
                    opacity: cmdLoading ? 0.6 : 1,
                    boxShadow: sel ? `0 0 14px ${g.color}44` : 'none',
                  }}>
                  {cmdLoading === key && sel
                    ? <Loader2 size={14} className="animate-spin" style={{ display: 'inline' }} />
                    : `${g.emoji} ${g.label}`}
                </button>
              );
            })}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            FLOW CONTROLS — target home session
        ═══════════════════════════════════════════════════════════════════ */}
        <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 900, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', marginBottom: 10 }}>FLOW → HOME SESSION</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
            {/* AVANTI */}
            <HomeBtn cmd="next_phase" emoji="→" label="AVANTI" color={PURPLE}
              loading={cmdLoading === 'home:next_phase'} onSend={sendHomeCommand} />
            {/* RIVELA */}
            <HomeBtn cmd="force_reveal" emoji="👁" label="RIVELA" color="#60A5FA"
              loading={cmdLoading === 'home:force_reveal'} onSend={sendHomeCommand} />
            {/* CLASSIFICA */}
            <HomeBtn cmd="force_ranking" emoji="🏆" label="CLASSIFICA" color={GOLD}
              loading={cmdLoading === 'home:force_ranking'} onSend={sendHomeCommand} />
            {/* FINE GIOCO */}
            <HomeBtn cmd="end_game" emoji="⏹" label="FINE GIOCO" color="#EF4444"
              loading={cmdLoading === 'home:end_game'} onSend={sendHomeCommand} />
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SHOW CONTROLS — live session / overlay / audio
        ═══════════════════════════════════════════════════════════════════ */}
        <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 900, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', marginBottom: 10 }}>SHOW CONTROLS → LIVE</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
            {/* PAUSA / RIPRENDI */}
            {isPaused
              ? <ShowBtn cmd="resume" emoji="▶" label="RIPRENDI" color={GREEN}  loading={cmdLoading === 'resume'} onSend={sendCommand} />
              : <ShowBtn cmd="pause"  emoji="⏸" label="PAUSA"    color="#F59E0B" loading={cmdLoading === 'pause'} onSend={sendCommand} />}
            {/* BLACKOUT */}
            <ShowBtn cmd="blackout" emoji="⬛" label="BLACKOUT" color="#EF4444" loading={cmdLoading === 'blackout'} onSend={sendCommand} />
            {/* AUDIO TOGGLE — single stateful button */}
            <button
              onClick={async () => {
                const nextMuted = !audioMuted;
                setAudioMuted(nextMuted);
                const cmdKey = `home:set_audio_muted`;
                setCmdLoading(cmdKey);
                try {
                  await apiFetch(`/live-sessions/${session!.id}/home-command?s=${code}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command: 'set_audio_muted', payload: { muted: nextMuted } }),
                  });
                  toast.success(nextMuted ? 'Audio silenziato' : 'Audio riattivato');
                } catch (err: unknown) {
                  setAudioMuted(!nextMuted); // rollback
                  toast.error('Comando audio fallito', { description: err instanceof Error ? err.message : '' });
                } finally {
                  setCmdLoading(null);
                }
              }}
              disabled={cmdLoading === 'home:set_audio_muted' || !session}
              style={{
                padding: '16px 8px',
                background: audioMuted ? 'rgba(239,68,68,0.18)' : 'rgba(16,185,129,0.15)',
                border: `1.5px solid ${audioMuted ? 'rgba(239,68,68,0.5)' : 'rgba(16,185,129,0.45)'}`,
                borderRadius: 12,
                color: audioMuted ? '#FCA5A5' : '#6EE7B7',
                fontWeight: 900, fontSize: '0.84rem',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                gridColumn: 'span 2',
                transition: 'all 0.15s',
              }}>
              {cmdLoading === 'home:set_audio_muted'
                ? <Loader2 size={18} className="animate-spin" />
                : audioMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              <span style={{ fontSize: '0.7rem', letterSpacing: '0.05em' }}>
                {audioMuted ? 'RIATTIVA AUDIO' : 'SILENZIA AUDIO'}
              </span>
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            COPPIE LIVE — always accessible
        ═══════════════════════════════════════════════════════════════════ */}
        <button
          onClick={openCoppie}
          style={{
            width: '100%', padding: '16px',
            background: `linear-gradient(135deg,${PURPLE}33,#7C3AED22)`,
            border: `1.5px solid ${PURPLE}88`,
            borderRadius: 14, color: PURPLE,
            fontWeight: 900, fontSize: '1rem',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: selectedGame === 'gioco-coppie' ? `0 0 22px ${PURPLE}44` : 'none',
            transition: 'all 0.15s',
          }}>
          <span style={{ fontSize: '1.4rem' }}>🃏</span>
          <span>COPPIE LIVE {completeCouples > 0 ? `— ${completeCouples}/10 coppie` : ''}</span>
          <Zap size={15} style={{ marginLeft: 'auto', opacity: 0.6 }} />
        </button>

        {/* Coppie preview — 10-second board visibility for phones */}
        {homeSession && (
          <button
            onClick={() => void sendCoppiePreview()}
            disabled={previewBusy}
            style={{
              width: '100%', padding: '13px',
              background: previewBusy ? 'rgba(96,165,250,0.18)' : 'rgba(96,165,250,0.1)',
              border: `1.5px solid ${previewBusy ? 'rgba(96,165,250,0.7)' : 'rgba(96,165,250,0.35)'}`,
              borderRadius: 12, color: previewBusy ? '#93C5FD' : '#60A5FA',
              fontWeight: 900, fontSize: '0.85rem',
              cursor: previewBusy ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 0.15s',
              opacity: previewBusy ? 0.7 : 1,
            }}>
            {previewBusy
              ? <><Loader2 size={15} className="animate-spin" /> Visibile sui telefoni… (10s)</>
              : <><Eye size={15} /> 👁 Mostra campo 10 secondi</>}
          </button>
        )}

        <div style={{ height: 16 }} />
      </div>
    </div>
  );
}

// ── HomeBtn — sends to home session via /home-command ─────────────────────────
function HomeBtn({ cmd, emoji, label, color, loading, onSend }: {
  cmd: string; emoji: string; label: string; color: string;
  loading: boolean; onSend: (cmd: string, payload?: unknown) => void;
}) {
  return (
    <button onClick={() => onSend(cmd)}
      disabled={loading}
      style={{
        padding: '16px 8px',
        background: `${color}22`,
        border: `1.5px solid ${color}66`,
        borderRadius: 12, color,
        fontWeight: 900, fontSize: '0.84rem',
        cursor: loading ? 'default' : 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        opacity: loading ? 0.6 : 1, transition: 'all 0.15s',
      }}>
      {loading ? <Loader2 size={18} className="animate-spin" /> : <span style={{ fontSize: '1.3rem' }}>{emoji}</span>}
      <span style={{ fontSize: '0.7rem', letterSpacing: '0.05em' }}>{label}</span>
    </button>
  );
}

// ── ShowBtn — sends to live session ──────────────────────────────────────────
function ShowBtn({ cmd, emoji, label, color, payload, loading, onSend }: {
  cmd: string; emoji: string; label: string; color: string;
  payload?: unknown; loading: boolean;
  onSend: (cmd: string, payload?: unknown) => void;
}) {
  return (
    <button onClick={() => onSend(cmd, payload)} disabled={loading}
      style={{
        padding: '16px 8px',
        background: `${color}22`,
        border: `1.5px solid ${color}66`,
        borderRadius: 12, color,
        fontWeight: 900, fontSize: '0.84rem',
        cursor: loading ? 'default' : 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        opacity: loading ? 0.6 : 1, transition: 'all 0.15s',
      }}>
      {loading ? <Loader2 size={18} className="animate-spin" /> : <span style={{ fontSize: '1.3rem' }}>{emoji}</span>}
      <span style={{ fontSize: '0.7rem', letterSpacing: '0.05em' }}>{label}</span>
    </button>
  );
}

// ── CodeRow — label + value in session card ───────────────────────────────────
function CodeRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.35)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: '0.8rem', fontWeight: 900, color: highlight ? '#F5B642' : 'rgba(255,255,255,0.85)', fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}

// ── StatusDot ────────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = { active: '#34D399', paused: '#F59E0B', ended: '#EF4444', draft: '#6B7280' };
  const c = colors[status] ?? '#6B7280';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <div style={{ width: 9, height: 9, borderRadius: '50%', background: c, boxShadow: `0 0 8px ${c}` }} />
      <span style={{ fontSize: '0.58rem', fontWeight: 700, color: c, letterSpacing: '0.05em' }}>{status.toUpperCase()}</span>
    </div>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', background: '#120920', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Outfit','Space Grotesk',sans-serif" }}>
      {children}
    </div>
  );
}

// ── ActionBtn ─────────────────────────────────────────────────────────────────
function ActionBtn({ onClick, color, title, children }: { onClick: () => void; color: string; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}22`, border: `1px solid ${color}55`, borderRadius: 7, color, cursor: 'pointer' }}>
      {children}
    </button>
  );
}
