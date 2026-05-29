/**
 * /live-presenter?s=CODE — Mobile-first Presenter Controller
 * Dashboard-first: big control buttons (game select, start, pause, next, reveal, classifica).
 * "🃏 Coppie LIVE" section only when in coppie game or manually opened.
 */
import { useEffect, useState, useRef, useCallback, type ChangeEvent } from 'react';
import { getSocket } from '@/hooks/useEventSocket';
import { toast } from 'sonner';
import {
  Loader2, Camera, Upload, Trash2, CheckCircle2, Wifi, WifiOff,
  Play, Users, ChevronLeft, Eye, Trophy, VolumeX,
  MonitorOff, SkipForward, Pause, Power, Zap,
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
  { slug: 'gioco-coppie',      emoji: '🃏', label: 'Coppie LIVE',    color: '#A855F7' },
  { slug: 'percorso-a-risate', emoji: '🎲', label: 'Percorso',        color: '#F59E0B' },
  { slug: 'quizzone',          emoji: '❓', label: 'Quizzone',         color: '#60A5FA' },
  { slug: 'sfida-ballo',       emoji: '💃', label: 'Ballo',           color: '#EC4899' },
  { slug: 'sara-musica',       emoji: '🎵', label: "Sara'Musica",      color: '#34D399' },
];

const GAME_LABELS: Record<string, string> = Object.fromEntries(
  LIVE_GAMES.map(g => [g.slug, `${g.emoji} ${g.label}`])
);

const PURPLE = '#A855F7';
const GOLD   = '#F5B642';
const GREEN  = '#34D399';

type View = 'dashboard' | 'coppie';

export default function LivePresenter() {
  const code = useRef(getCode()).current;
  const [session, setSession]         = useState<LiveSession | null>(null);
  const [view, setView]               = useState<View>('dashboard');
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [connected, setConnected]     = useState(false);
  const [cmdLoading, setCmdLoading]   = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<string>('gioco-coppie');

  // Coppie state
  const [couples, setCouples]         = useState<CoupleEntry[]>(EMPTY_COUPLES);
  const [uploading, setUploading]     = useState(false);
  const [creatingDeck, setCreatingDeck] = useState(false);
  const [deckCreated, setDeckCreated] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<{ coupleIndex: number; partner: 'A' | 'B' } | null>(null);
  const [coupleNames, setCoupleNames]   = useState<string[]>(Array(10).fill(''));
  const [partnerANames, setPartnerANames] = useState<string[]>(Array(10).fill(''));
  const [partnerBNames, setPartnerBNames] = useState<string[]>(Array(10).fill(''));

  const socketRef      = useRef(getSocket());
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<{ coupleIndex: number; partner: 'A' | 'B' } | null>(null);
  const pollRef        = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── API helpers ──────────────────────────────────────────────────────────
  const refreshSession = useCallback(async (sessionId: string) => {
    try {
      const data = await apiFetch<LiveSession[]>(`/live-sessions`);
      const updated = data.find(s => s.id === sessionId);
      if (updated) setSession(updated);
    } catch { /* noop — use code fallback */ }
  }, []);

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
    if (!session || cmdLoading) return;
    const key = command;
    setCmdLoading(key);
    try {
      await apiFetch(`/live-sessions/${session.id}/command?s=${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, payload }),
      });
      // Refresh session state after command
      await apiFetch<LiveSession>(`/live-sessions/by-code/${code}`).then(setSession).catch(() => {});
      toast.success(command.replace(/_/g, ' '));
    } catch (err: unknown) {
      toast.error('Comando fallito', { description: err instanceof Error ? err.message : '' });
    } finally {
      setCmdLoading(null);
    }
  };

  // ── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!code) { setError('Codice presenter mancante (?s=CODE)'); setLoading(false); return; }
    apiFetch<LiveSession>(`/live-sessions/by-code/${code}`).then(async sess => {
      if (sess.role === 'tv') {
        setError('Questo codice è per la TV. Usa il codice presenter.');
        return;
      }
      setSession(sess);
      if (sess.currentGameSlug) setSelectedGame(sess.currentGameSlug);
      await loadCouples(sess.id);
    }).catch(() => setError('Sessione non trovata o codice non valido'))
      .finally(() => setLoading(false));
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

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
    };
    const onCouplesUpd = (data: { couples: CoupleEntry[] }) => setCouples(data.couples);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('live:session_updated', onSessionUpd);
    socket.on('live:couples_updated', onCouplesUpd);

    // Poll session every 6s
    pollRef.current = setInterval(() => {
      apiFetch<LiveSession>(`/live-sessions/by-code/${code}`).then(setSession).catch(() => {});
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
    const missingPhotos   = couples.reduce((acc, c) => acc + (!c.photoA ? 1 : 0) + (!c.photoB ? 1 : 0), 0);
    const canCreate  = completeCouples >= 2;
    const allComplete = completeCouples === 10;

    return (
      <div style={{ minHeight: '100dvh', background: '#120920', fontFamily: "'Outfit','Space Grotesk',sans-serif", color: '#fff', display: 'flex', flexDirection: 'column' }}>
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
        <input ref={fileInputRef}   type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />

        <Header back={() => setView('dashboard')} backLabel="Dashboard" />

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Progress bar */}
          <div style={{ padding: '12px 14px', background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.22)', borderRadius: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={16} style={{ color: PURPLE }} />
                <span style={{ fontWeight: 900, fontSize: '0.9rem', color: PURPLE }}>COPPIE LIVE</span>
              </div>
              <span style={{ fontWeight: 900, fontSize: '0.85rem', color: completeCouples === 10 ? GREEN : GOLD }}>{completeCouples}/10</span>
            </div>
            <div style={{ width: '100%', height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 100, overflow: 'hidden' }}>
              <div style={{ height: 5, borderRadius: 100, width: `${completeCouples * 10}%`, background: completeCouples === 10 ? GREEN : `linear-gradient(90deg,${PURPLE},${GOLD})`, transition: 'width 0.4s' }} />
            </div>
            {missingPhotos > 0 && <div style={{ marginTop: 5, fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)' }}>Servono ancora {missingPhotos} foto</div>}
          </div>

          {/* 10 Couple cards */}
          {couples.map((couple, idx) => {
            const imgA = couple.photoA?.metadata?.imageData ?? couple.photoA?.url ?? null;
            const imgB = couple.photoB?.metadata?.imageData ?? couple.photoB?.url ?? null;
            const isUploadingA = uploading && uploadTarget?.coupleIndex === idx && uploadTarget?.partner === 'A';
            const isUploadingB = uploading && uploadTarget?.coupleIndex === idx && uploadTarget?.partner === 'B';
            const borderColor = couple.complete ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.08)';
            return (
              <div key={idx} style={{ border: `1px solid ${borderColor}`, borderRadius: 13, background: couple.complete ? 'rgba(52,211,153,0.04)' : 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
                <div style={{ padding: '9px 12px', background: couple.complete ? 'rgba(52,211,153,0.08)' : 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${borderColor}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontWeight: 900, fontSize: '0.82rem', color: couple.complete ? GREEN : 'rgba(255,255,255,0.55)', minWidth: 76 }}>
                    Coppia #{idx + 1}{couple.complete && ' ✅'}
                  </div>
                  <input value={coupleNames[idx] ?? ''} onChange={e => { const n = [...coupleNames]; n[idx] = e.target.value; setCoupleNames(n); }}
                    placeholder="Nome coppia (opz.)"
                    style={{ flex: 1, padding: '4px 9px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#fff', fontSize: '0.73rem', outline: 'none' }} />
                </div>
                <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <PartnerRow partner="A" label="Partner A" imgSrc={imgA} name={partnerANames[idx] ?? ''} onNameChange={v => { const n = [...partnerANames]; n[idx] = v; setPartnerANames(n); }} uploading={isUploadingA} onCamera={() => triggerUpload(idx, 'A', true)} onFile={() => triggerUpload(idx, 'A', false)} onDelete={() => deletePhoto(idx, 'A')} PURPLE={PURPLE} />
                  <PartnerRow partner="B" label="Partner B" imgSrc={imgB} name={partnerBNames[idx] ?? ''} onNameChange={v => { const n = [...partnerBNames]; n[idx] = v; setPartnerBNames(n); }} uploading={isUploadingB} onCamera={() => triggerUpload(idx, 'B', true)} onFile={() => triggerUpload(idx, 'B', false)} onDelete={() => deletePhoto(idx, 'B')} PURPLE={PURPLE} />
                </div>
              </div>
            );
          })}

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
  const currentGame    = LIVE_GAMES.find(g => g.slug === session?.currentGameSlug);
  const isPaused       = session?.status === 'paused';
  const isActive       = session?.status === 'active';
  const isCoppie       = session?.currentGameSlug === 'gioco-coppie';
  const completeCouples = couples.filter(c => c.complete).length;

  type BigBtn = { cmd: string; emoji: string; label: string; color: string; payload?: unknown; disabled?: boolean };
  const BIG_BTNS: BigBtn[] = [
    { cmd: 'start_game',    emoji: '▶',  label: 'AVVIA',       color: GREEN,     payload: { gameSlug: selectedGame }, disabled: !selectedGame },
    isPaused
      ? { cmd: 'resume',    emoji: '▶',  label: 'RIPRENDI',    color: GREEN }
      : { cmd: 'pause',     emoji: '⏸', label: 'PAUSA',        color: '#F59E0B' },
    { cmd: 'next_phase',    emoji: '→',  label: 'AVANTI',      color: PURPLE },
    { cmd: 'force_reveal',  emoji: '👁', label: 'RIVELA',      color: '#60A5FA' },
    { cmd: 'force_ranking', emoji: '🏆', label: 'CLASSIFICA',  color: GOLD },
    { cmd: '__coppie__',    emoji: '🃏', label: 'COPPIE LIVE', color: PURPLE,
      ...(completeCouples > 0 ? { emoji: `🃏`, label: `COPPIE (${completeCouples}/10)` } : {}) },
    { cmd: 'blackout',      emoji: '⬛', label: 'BLACKOUT',    color: '#EF4444' },
    { cmd: 'stop_audio',    emoji: '🔇', label: 'STOP AUDIO',  color: '#6B7280' },
  ];

  return (
    <div style={{ minHeight: '100dvh', background: '#120920', fontFamily: "'Outfit','Space Grotesk',sans-serif", color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <Header />

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ── Status card ──────────────────────────────────────── */}
        <div style={{ padding: '14px', background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: '2rem' }}>{currentGame?.emoji ?? '🎮'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: '0.9rem', color: currentGame?.color ?? 'rgba(255,255,255,0.6)' }}>
              {currentGame ? `${currentGame.label}` : '— nessun gioco attivo —'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              {session?.currentPhase ?? 'standby'}
            </div>
          </div>
          <StatusDot status={session?.status ?? 'draft'} />
        </div>

        {/* ── Game selector ────────────────────────────────────── */}
        <div style={{ padding: '12px 14px', background: 'rgba(168,85,247,0.13)', border: '1px solid rgba(168,85,247,0.35)', borderRadius: 14 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 900, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', marginBottom: 10 }}>SCEGLI GIOCO</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {LIVE_GAMES.map(g => {
              const sel = selectedGame === g.slug;
              return (
                <button key={g.slug} onClick={() => setSelectedGame(g.slug)}
                  style={{ padding: '10px 8px', background: sel ? `${g.color}22` : 'rgba(255,255,255,0.04)', border: `1.5px solid ${sel ? g.color : 'rgba(255,255,255,0.1)'}`, borderRadius: 10, color: sel ? g.color : 'rgba(255,255,255,0.65)', fontWeight: 900, fontSize: '0.75rem', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s' }}>
                  {g.emoji} {g.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Command buttons ───────────────────────────────────── */}
        <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 14 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 900, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', marginBottom: 10 }}>CONTROLLI SHOW</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
            {BIG_BTNS.map(btn => {
              const isLoading = cmdLoading === btn.cmd;
              const isCoppieBtn = btn.cmd === '__coppie__';
              return (
                <button key={btn.cmd + btn.label}
                  onClick={() => {
                    if (isCoppieBtn) { setView('coppie'); return; }
                    if (!btn.disabled) void sendCommand(btn.cmd, btn.payload);
                  }}
                  disabled={!isCoppieBtn && (!!btn.disabled || !!cmdLoading)}
                  style={{
                    padding: '16px 8px',
                    background: isCoppie && isCoppieBtn ? `${btn.color}35` : `${btn.color}28`,
                    border: `1.5px solid ${btn.color}${isCoppie && isCoppieBtn ? 'AA' : '70'}`,
                    borderRadius: 12,
                    color: btn.disabled ? 'rgba(255,255,255,0.25)' : btn.color,
                    fontWeight: 900,
                    fontSize: '0.84rem',
                    cursor: (btn.disabled && !isCoppieBtn) ? 'default' : 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    opacity: btn.disabled && !isCoppieBtn ? 0.4 : 1,
                    transition: 'all 0.15s',
                    boxShadow: isActive && btn.cmd === 'start_game' ? `0 0 20px ${btn.color}55`
                      : isCoppie && isCoppieBtn ? `0 0 18px ${btn.color}44` : 'none',
                  }}>
                  {isLoading
                    ? <Loader2 size={18} className="animate-spin" />
                    : <span style={{ fontSize: '1.3rem' }}>{btn.emoji}</span>}
                  <span style={{ fontSize: '0.7rem', letterSpacing: '0.05em' }}>{btn.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ height: 16 }} />
      </div>
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

// ── PartnerRow ────────────────────────────────────────────────────────────────

function PartnerRow({ partner, label, imgSrc, name, onNameChange, uploading, onCamera, onFile, onDelete, PURPLE }: {
  partner: 'A' | 'B'; label: string; imgSrc: string | null; name: string;
  onNameChange: (v: string) => void; uploading: boolean;
  onCamera: () => void; onFile: () => void; onDelete: () => void; PURPLE: string;
}) {
  const color    = partner === 'A' ? '#60A5FA' : '#F472B6';
  const hasPhoto = !!imgSrc;
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ width: 60, height: 75, borderRadius: 9, overflow: 'hidden', flexShrink: 0, border: `2px solid ${hasPhoto ? `${color}60` : 'rgba(255,255,255,0.1)'}`, background: hasPhoto ? 'transparent' : 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {hasPhoto
          ? <img src={imgSrc!} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: '1.3rem', opacity: 0.3 }}>👤</span>}
        {hasPhoto && (
          <button onClick={onDelete} style={{ position: 'absolute', top: 2, right: 2, width: 17, height: 17, borderRadius: '50%', background: 'rgba(239,68,68,0.85)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <Trash2 size={8} />
          </button>
        )}
        <div style={{ position: 'absolute', bottom: 2, left: 0, right: 0, textAlign: 'center', fontSize: '0.52rem', fontWeight: 900, color, letterSpacing: '0.05em' }}>{partner}</div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 700, color }}>{hasPhoto ? `✓ ${label}` : label}</div>
        <input value={name} onChange={e => onNameChange(e.target.value)} placeholder={`Nome ${label} (opz.)`}
          style={{ padding: '4px 7px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', fontSize: '0.7rem', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
          <button onClick={onCamera} disabled={uploading} style={{ padding: '6px 4px', background: `${PURPLE}18`, border: `1px solid ${PURPLE}35`, borderRadius: 7, color: PURPLE, fontWeight: 700, fontSize: '0.66rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: uploading ? 0.5 : 1 }}>
            {uploading ? <Loader2 size={10} className="animate-spin" /> : <Camera size={10} />} Scatta
          </button>
          <button onClick={onFile} disabled={uploading} style={{ padding: '6px 4px', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 7, color: '#60A5FA', fontWeight: 700, fontSize: '0.66rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: uploading ? 0.5 : 1 }}>
            {uploading ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />} Galleria
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Screen wrapper ────────────────────────────────────────────────────────────

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', background: '#120920', display: 'grid', placeItems: 'center', fontFamily: "'Outfit','Space Grotesk',sans-serif", color: '#fff' }}>
      {children}
    </div>
  );
}

// ── Unused but kept for TS ────────────────────────────────────────────────────
const _iconRefs = { Eye, Trophy, VolumeX, MonitorOff, SkipForward, Pause, Power, Zap };
void _iconRefs;
