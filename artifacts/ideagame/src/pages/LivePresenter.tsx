/**
 * /live-presenter?s=CODE — Mobile-first Presenter Controller
 * No auth required — access by presenter code only.
 * Coppie Live: create 10 real couples (Partner A + Partner B per couple).
 */
import { useEffect, useState, useRef, useCallback, type ChangeEvent } from 'react';
import { getSocket } from '@/hooks/useEventSocket';
import { toast } from 'sonner';
import { Loader2, Camera, Upload, Trash2, CheckCircle2, Wifi, WifiOff, Play, Users } from 'lucide-react';

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
  currentGameSlug: string | null; currentPhase: string; presenterCode: string; role?: string;
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

/** Compress image to max 900px, JPEG quality 0.75 */
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

export default function LivePresenter() {
  const code = useRef(getCode()).current;
  const [session, setSession] = useState<LiveSession | null>(null);
  const [couples, setCouples] = useState<CoupleEntry[]>(EMPTY_COUPLES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [creatingDeck, setCreatingDeck] = useState(false);
  const [deckCreated, setDeckCreated] = useState(false);
  const [connected, setConnected] = useState(false);

  // Upload target: which couple + which partner
  const [uploadTarget, setUploadTarget] = useState<{ coupleIndex: number; partner: 'A' | 'B' } | null>(null);

  // Per-couple name fields (local state, sent on upload)
  const [coupleNames, setCoupleNames] = useState<string[]>(Array(10).fill(''));
  const [partnerANames, setPartnerANames] = useState<string[]>(Array(10).fill(''));
  const [partnerBNames, setPartnerBNames] = useState<string[]>(Array(10).fill(''));

  const socketRef = useRef(getSocket());
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Store upload target for file input onChange (ref to avoid stale closure)
  const uploadTargetRef = useRef<{ coupleIndex: number; partner: 'A' | 'B' } | null>(null);

  const PURPLE = '#A855F7';
  const GOLD = '#F5B642';
  const GREEN = '#34D399';

  const loadCouples = useCallback(async (sessionId: string) => {
    try {
      const data = await apiFetch<CoupleEntry[]>(`/live-sessions/${sessionId}/couples?s=${code}`);
      setCouples(data);
      // Populate name fields from loaded data
      const cNames = [...coupleNames];
      const aNams = [...partnerANames];
      const bNams = [...partnerBNames];
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

  useEffect(() => {
    if (!code) { setError('Codice presenter mancante (?s=CODE)'); setLoading(false); return; }
    apiFetch<LiveSession>(`/live-sessions/by-code/${code}`).then(async sess => {
      if (sess.role === 'tv') {
        setError('Questo codice è per la TV, non per il presenter. Usa il codice presenter.');
        return;
      }
      setSession(sess);
      await loadCouples(sess.id);
    }).catch(() => setError('Sessione non trovata o codice non valido'))
      .finally(() => setLoading(false));
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  // Socket
  useEffect(() => {
    if (!session) return;
    const socket = socketRef.current;
    socket.emit('live:join', { sessionId: session.id, code });
    if (socket.connected) setConnected(true);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onCouplesUpdated = (data: { couples: CoupleEntry[] }) => {
      setCouples(data.couples);
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('live:couples_updated', onCouplesUpdated);
    return () => {
      socket.emit('live:leave', { sessionId: session.id });
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('live:couples_updated', onCouplesUpdated);
    };
  }, [session, code]);

  const triggerUpload = (coupleIndex: number, partner: 'A' | 'B', camera: boolean) => {
    uploadTargetRef.current = { coupleIndex, partner };
    setUploadTarget({ coupleIndex, partner });
    if (camera) cameraInputRef.current?.click();
    else fileInputRef.current?.click();
  };

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = uploadTargetRef.current;
    if (!file || !session || !target) return;
    e.target.value = '';

    const { coupleIndex, partner } = target;
    setUploading(true);
    try {
      const imageData = await compressImage(file);
      const coupleName = coupleNames[coupleIndex]?.trim() || undefined;
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
    const photo = partner === 'A' ? couple?.photoA : couple?.photoB;
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
      toast.success(`Mazzo creato! ${res.pairs} coppie reali — ${res.cards} carte sul tavolo`, {
        description: 'La TV mostra ora il campo da gioco con le foto delle coppie.'
      });
    } catch (err: unknown) {
      toast.error('Errore creazione mazzo', { description: err instanceof Error ? err.message : '' });
    } finally {
      setCreatingDeck(false);
    }
  };

  if (loading) {
    return <Screen><Loader2 className="animate-spin" size={32} style={{ color: PURPLE }} /></Screen>;
  }
  if (error) {
    return (
      <Screen>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>❌</div>
          <div style={{ fontWeight: 900, color: '#EF4444', marginBottom: 8 }}>Errore</div>
          <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>{error}</div>
        </div>
      </Screen>
    );
  }

  const completeCouples = couples.filter(c => c.complete).length;
  const missingPhotos = couples.reduce((acc, c) => acc + (!c.photoA ? 1 : 0) + (!c.photoB ? 1 : 0), 0);
  const canCreate = completeCouples >= 2;
  const allComplete = completeCouples === 10;

  return (
    <div style={{ minHeight: '100dvh', background: '#09050f', fontFamily: "'Outfit','Space Grotesk',sans-serif", color: '#fff', display: 'flex', flexDirection: 'column' }}>

      {/* Hidden file inputs (shared) */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />

      {/* ── Header ────────────────────────────────────────────────── */}
      <div style={{ padding: '14px 18px', background: 'rgba(168,85,247,0.08)', borderBottom: '1px solid rgba(168,85,247,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0, position: 'sticky', top: 0, zIndex: 10 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: '0.85rem', color: PURPLE, letterSpacing: '0.08em' }}>🎤 PRESENTER</div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{session?.title}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {connected
            ? <><Wifi size={13} style={{ color: GREEN }} /><span style={{ fontSize: '0.7rem', color: GREEN }}>live</span></>
            : <><WifiOff size={13} style={{ color: '#6B7280' }} /><span style={{ fontSize: '0.7rem', color: '#6B7280' }}>offline</span></>
          }
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ── Title ─────────────────────────────────────────────── */}
        <div style={{ padding: '14px 16px', background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Users size={18} style={{ color: PURPLE }} />
            <div style={{ fontWeight: 900, fontSize: '1rem', color: PURPLE }}>COPPIE LIVE — CREA LE 10 COPPIE</div>
          </div>
          {/* Progress bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>
              {completeCouples === 10 ? '✅ Tutte le coppie complete!' : `Coppie complete: ${completeCouples}/10`}
            </div>
            <div style={{ fontSize: '0.75rem', fontWeight: 900, color: completeCouples === 10 ? GREEN : GOLD }}>
              {completeCouples}/10
            </div>
          </div>
          <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 100, overflow: 'hidden' }}>
            <div style={{
              height: 6, borderRadius: 100,
              width: `${completeCouples * 10}%`,
              background: completeCouples === 10 ? GREEN : `linear-gradient(90deg,${PURPLE},${GOLD})`,
              transition: 'width 0.4s',
            }} />
          </div>
          {missingPhotos > 0 && (
            <div style={{ marginTop: 6, fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>
              {missingPhotos === 0 ? '' : `Servono ancora ${missingPhotos} foto (${10 - completeCouples} ${10 - completeCouples === 1 ? 'coppia incompleta' : 'coppie incomplete'})`}
            </div>
          )}
        </div>

        {/* ── 10 Couple Cards ───────────────────────────────────── */}
        {couples.map((couple, idx) => {
          const imgA = couple.photoA?.metadata?.imageData ?? couple.photoA?.url ?? null;
          const imgB = couple.photoB?.metadata?.imageData ?? couple.photoB?.url ?? null;
          const isUploadingA = uploading && uploadTarget?.coupleIndex === idx && uploadTarget?.partner === 'A';
          const isUploadingB = uploading && uploadTarget?.coupleIndex === idx && uploadTarget?.partner === 'B';
          const borderColor = couple.complete ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.08)';

          return (
            <div key={idx} style={{ border: `1px solid ${borderColor}`, borderRadius: 14, background: couple.complete ? 'rgba(52,211,153,0.04)' : 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
              {/* Couple header */}
              <div style={{ padding: '10px 14px', background: couple.complete ? 'rgba(52,211,153,0.08)' : 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${borderColor}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontWeight: 900, fontSize: '0.85rem', color: couple.complete ? GREEN : 'rgba(255,255,255,0.6)', minWidth: 80 }}>
                  Coppia #{idx + 1}
                  {couple.complete && <span style={{ marginLeft: 6, fontSize: '0.85rem' }}>✅</span>}
                </div>
                <input
                  value={coupleNames[idx] ?? ''}
                  onChange={e => { const n = [...coupleNames]; n[idx] = e.target.value; setCoupleNames(n); }}
                  placeholder="Nome coppia (opzionale)"
                  style={{ flex: 1, padding: '5px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: '0.75rem', outline: 'none' }}
                />
              </div>

              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* Partner A */}
                <PartnerRow
                  partner="A"
                  label="Partner A"
                  imgSrc={imgA}
                  name={partnerANames[idx] ?? ''}
                  onNameChange={v => { const n = [...partnerANames]; n[idx] = v; setPartnerANames(n); }}
                  uploading={isUploadingA}
                  onCamera={() => triggerUpload(idx, 'A', true)}
                  onFile={() => triggerUpload(idx, 'A', false)}
                  onDelete={() => deletePhoto(idx, 'A')}
                  PURPLE={PURPLE}
                />

                {/* Partner B */}
                <PartnerRow
                  partner="B"
                  label="Partner B"
                  imgSrc={imgB}
                  name={partnerBNames[idx] ?? ''}
                  onNameChange={v => { const n = [...partnerBNames]; n[idx] = v; setPartnerBNames(n); }}
                  uploading={isUploadingB}
                  onCamera={() => triggerUpload(idx, 'B', true)}
                  onFile={() => triggerUpload(idx, 'B', false)}
                  onDelete={() => deletePhoto(idx, 'B')}
                  PURPLE={PURPLE}
                />
              </div>
            </div>
          );
        })}

        {/* ── Create Deck button ──────────────────────────────── */}
        <div style={{ marginTop: 4 }}>
          {deckCreated ? (
            <>
              <div style={{ padding: '16px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 10 }}>
                <CheckCircle2 size={20} style={{ color: GREEN }} />
                <div>
                  <div style={{ fontWeight: 900, color: GREEN, fontSize: '0.88rem' }}>Mazzo pronto!</div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>La TV mostra il campo da gioco con le foto delle coppie reali.</div>
                </div>
              </div>
              <button onClick={createDeck} disabled={creatingDeck || !canCreate}
                style={{ width: '100%', padding: '10px', background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 10, color: PURPLE, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                ↺ Ricrea mazzo ({completeCouples} coppie)
              </button>
            </>
          ) : (
            <button
              onClick={createDeck}
              disabled={!canCreate || creatingDeck}
              style={{
                width: '100%', padding: '18px',
                background: allComplete
                  ? `linear-gradient(135deg,${GREEN},#059669)`
                  : canCreate
                    ? `linear-gradient(135deg,${PURPLE},#7C3AED)`
                    : 'rgba(255,255,255,0.05)',
                border: `1px solid ${allComplete ? 'rgba(52,211,153,0.5)' : canCreate ? PURPLE : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 14,
                color: canCreate ? '#fff' : 'rgba(255,255,255,0.3)',
                fontWeight: 900, fontSize: '1rem',
                cursor: canCreate ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: canCreate ? `0 0 28px ${allComplete ? 'rgba(52,211,153,0.4)' : 'rgba(168,85,247,0.4)'}` : 'none',
                transition: 'all 0.2s',
              }}
            >
              {creatingDeck
                ? <Loader2 size={18} className="animate-spin" />
                : <Play size={18} />}
              {!canCreate
                ? `Servono almeno 2 coppie complete`
                : allComplete
                  ? `🃏 CREA MAZZO LIVE — ${completeCouples} coppie`
                  : `🃏 CREA MAZZO LIVE (${completeCouples}/10 complete)`}
            </button>
          )}
          {!canCreate && (
            <div style={{ marginTop: 8, textAlign: 'center', fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)' }}>
              Servono ancora {10 - completeCouples} {10 - completeCouples === 1 ? 'coppia' : 'coppie'} complete per il set pieno
            </div>
          )}
        </div>

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

// ── PartnerRow ────────────────────────────────────────────────────────────────

function PartnerRow({ partner, label, imgSrc, name, onNameChange, uploading, onCamera, onFile, onDelete, PURPLE }: {
  partner: 'A' | 'B';
  label: string;
  imgSrc: string | null;
  name: string;
  onNameChange: (v: string) => void;
  uploading: boolean;
  onCamera: () => void;
  onFile: () => void;
  onDelete: () => void;
  PURPLE: string;
}) {
  const color = partner === 'A' ? '#60A5FA' : '#F472B6';
  const hasPhoto = !!imgSrc;

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      {/* Photo thumbnail */}
      <div style={{
        width: 64, height: 80, borderRadius: 10, overflow: 'hidden', flexShrink: 0,
        border: `2px solid ${hasPhoto ? `${color}60` : 'rgba(255,255,255,0.1)'}`,
        background: hasPhoto ? 'transparent' : 'rgba(255,255,255,0.03)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
      }}>
        {hasPhoto
          ? <img src={imgSrc!} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: '1.4rem', opacity: 0.3 }}>👤</span>
        }
        {hasPhoto && (
          <button
            onClick={onDelete}
            style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: 'rgba(239,68,68,0.85)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
          >
            <Trash2 size={9} />
          </button>
        )}
        <div style={{ position: 'absolute', bottom: 2, left: 0, right: 0, textAlign: 'center', fontSize: '0.55rem', fontWeight: 900, color: color, letterSpacing: '0.05em' }}>
          {partner}
        </div>
      </div>

      {/* Controls */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color }}>
          {hasPhoto ? `✓ ${label}` : label}
        </div>
        <input
          value={name}
          onChange={e => onNameChange(e.target.value)}
          placeholder={`Nome ${label} (opzionale)`}
          style={{ padding: '5px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#fff', fontSize: '0.72rem', outline: 'none', width: '100%', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
          <button
            onClick={onCamera}
            disabled={uploading}
            style={{ padding: '7px 4px', background: `${PURPLE}18`, border: `1px solid ${PURPLE}35`, borderRadius: 8, color: PURPLE, fontWeight: 700, fontSize: '0.68rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: uploading ? 0.5 : 1 }}
          >
            {uploading ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
            Scatta
          </button>
          <button
            onClick={onFile}
            disabled={uploading}
            style={{ padding: '7px 4px', background: `rgba(96,165,250,0.1)`, border: `1px solid rgba(96,165,250,0.3)`, borderRadius: 8, color: '#60A5FA', fontWeight: 700, fontSize: '0.68rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: uploading ? 0.5 : 1 }}
          >
            {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
            Galleria
          </button>
        </div>
      </div>
    </div>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', background: '#09050f', display: 'grid', placeItems: 'center', fontFamily: "'Outfit','Space Grotesk',sans-serif", color: '#fff' }}>
      {children}
    </div>
  );
}
