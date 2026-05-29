/**
 * /live-presenter?s=CODE — Mobile-first Presenter Controller
 * No auth required — access by presenter code only.
 * Coppie Live: capture/upload 10 guest photos + create deck.
 */
import { useEffect, useState, useRef, useCallback, type ChangeEvent } from 'react';
import { getSocket } from '@/hooks/useEventSocket';
import { toast } from 'sonner';
import { Loader2, Camera, Upload, Trash2, CheckCircle2, Wifi, WifiOff, Play } from 'lucide-react';

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
interface PhotoAsset {
  id: string; label: string | null; url: string | null; metadata: Record<string, unknown>;
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

export default function LivePresenter() {
  const code = useRef(getCode()).current;
  const [session, setSession] = useState<LiveSession | null>(null);
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [creatingDeck, setCreatingDeck] = useState(false);
  const [deckCreated, setDeckCreated] = useState(false);
  const [connected, setConnected] = useState(false);
  const [labelInput, setLabelInput] = useState('');
  const socketRef = useRef(getSocket());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const PURPLE = '#A855F7';
  const GOLD = '#F5B642';

  const loadPhotos = useCallback(async (sessionId: string) => {
    const data = await apiFetch<PhotoAsset[]>(`/live-sessions/${sessionId}/photos?s=${code}`);
    setPhotos(data);
  }, [code]);

  useEffect(() => {
    if (!code) { setError('Codice presenter mancante (?s=CODE)'); setLoading(false); return; }
    apiFetch<LiveSession>(`/live-sessions/by-code/${code}`).then(async sess => {
      if (sess.role === 'tv') {
        setError('Questo codice è per la TV, non per il presenter. Usa il codice presenter.');
        return;
      }
      setSession(sess);
      await loadPhotos(sess.id);
    }).catch(() => setError('Sessione non trovata o codice non valido'))
      .finally(() => setLoading(false));
  }, [code]);

  // Socket
  useEffect(() => {
    if (!session) return;
    const socket = socketRef.current;
    socket.emit('live:join', { sessionId: session.id, code });
    if (socket.connected) setConnected(true);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onPhotos = (data: { photos: PhotoAsset[] }) => setPhotos(data.photos);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('live:photos_updated', onPhotos);
    return () => {
      socket.emit('live:leave', { sessionId: session.id });
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('live:photos_updated', onPhotos);
    };
  }, [session, code]);

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session) return;
    e.target.value = '';

    if (photos.length >= 10) {
      toast.error('Hai già 10 foto. Crea il mazzo prima di aggiungerne altre.');
      return;
    }

    setUploading(true);
    try {
      const imageData = await compressImage(file);
      const label = labelInput.trim() || null;
      await apiFetch(`/live-sessions/${session.id}/photos?s=${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, imageData }),
      });
      setLabelInput('');
      await loadPhotos(session.id);
      toast.success('Foto aggiunta!');
    } catch (err: unknown) {
      toast.error('Errore upload', { description: err instanceof Error ? err.message : 'Riprovare' });
    } finally {
      setUploading(false);
    }
  };

  const deletePhoto = async (photoId: string) => {
    if (!session) return;
    try {
      await apiFetch(`/live-sessions/${session.id}/photos/${photoId}?s=${code}`, { method: 'DELETE' });
      await loadPhotos(session.id);
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
      toast.success(`Mazzo creato! ${res.pairs} coppie, ${res.cards} carte`, {
        description: 'La TV mostra ora il campo da gioco con le foto reali.'
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

  const isCoppie = session?.currentGameSlug === 'gioco-coppie' || true; // Default to Coppie flow
  const photoCount = photos.length;
  const needed = Math.max(0, 10 - photoCount);
  const canCreate = photoCount >= 2;

  return (
    <div style={{ minHeight: '100dvh', background: '#09050f', fontFamily: "'Outfit','Space Grotesk',sans-serif", color: '#fff', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ────────────────────────────────────────────────── */}
      <div style={{ padding: '14px 18px', background: 'rgba(168,85,247,0.08)', borderBottom: '1px solid rgba(168,85,247,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: '0.85rem', color: PURPLE, letterSpacing: '0.08em' }}>🎤 PRESENTER</div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{session?.title}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {connected
            ? <><Wifi size={13} style={{ color: '#34D399' }} /><span style={{ fontSize: '0.7rem', color: '#34D399' }}>live</span></>
            : <><WifiOff size={13} style={{ color: '#6B7280' }} /><span style={{ fontSize: '0.7rem', color: '#6B7280' }}>offline</span></>
          }
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Status banner ─────────────────────────────────────── */}
        <div style={{ padding: '12px 16px', background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 12 }}>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>GIOCO CORRENTE</div>
          <div style={{ fontWeight: 900, fontSize: '1rem', color: '#fff' }}>
            {session?.currentGameSlug ? session.currentGameSlug : '🃏 Gioco delle Coppie LIVE'}
          </div>
          <div style={{ fontSize: '0.75rem', color: PURPLE, marginTop: 4 }}>
            Fase: {session?.currentPhase ?? 'standby'}
          </div>
        </div>

        {/* ── Coppie Live Photo Flow ─────────────────────────────── */}
        {isCoppie && (
          <>
            {/* Progress bar */}
            <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontWeight: 900, fontSize: '0.82rem' }}>Foto ospiti</div>
                <div style={{ fontSize: '0.82rem', fontWeight: 900, color: photoCount >= 10 ? '#34D399' : GOLD }}>
                  {photoCount}/10
                </div>
              </div>
              <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 100, overflow: 'hidden' }}>
                <div style={{ height: 6, borderRadius: 100, width: `${Math.min(100, photoCount * 10)}%`, background: photoCount >= 10 ? '#34D399' : `linear-gradient(90deg,${PURPLE},${GOLD})`, transition: 'width 0.4s' }} />
              </div>
              {needed > 0 && (
                <div style={{ marginTop: 6, fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>
                  {needed === 0 ? '✅ Foto complete! Crea il mazzo.' : `Servono ancora ${needed} foto per il set completo (min 2 per giocare)`}
                </div>
              )}
            </div>

            {/* Label input */}
            <div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>Nome ospite (opzionale)</div>
              <input
                value={labelInput}
                onChange={e => setLabelInput(e.target.value)}
                placeholder="es. Marco e Sofia..."
                style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#fff', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* Upload buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />

              <button onClick={() => cameraInputRef.current?.click()} disabled={uploading || photoCount >= 20}
                style={{ padding: '14px 10px', background: `${PURPLE}18`, border: `1px solid ${PURPLE}40`, borderRadius: 12, color: PURPLE, fontWeight: 900, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: uploading || photoCount >= 20 ? 0.5 : 1 }}>
                {uploading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
                Scatta foto
              </button>

              <button onClick={() => fileInputRef.current?.click()} disabled={uploading || photoCount >= 20}
                style={{ padding: '14px 10px', background: `${GOLD}12`, border: `1px solid ${GOLD}35`, borderRadius: 12, color: GOLD, fontWeight: 900, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: uploading || photoCount >= 20 ? 0.5 : 1 }}>
                {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                Da galleria
              </button>
            </div>

            {/* Photo grid */}
            {photos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(90px,1fr))', gap: 8 }}>
                {photos.map((p, i) => {
                  const imgSrc = (p.metadata?.imageData as string | undefined) ?? p.url ?? '';
                  return (
                    <div key={p.id} style={{ position: 'relative', aspectRatio: '3/4', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(168,85,247,0.3)' }}>
                      {imgSrc && <img src={imgSrc} alt={p.label ?? `Foto ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                      {!imgSrc && <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: 'rgba(168,85,247,0.08)', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>Foto {i+1}</div>}
                      {p.label && (
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.75)', padding: '3px 6px', fontSize: '0.6rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.label}
                        </div>
                      )}
                      <button onClick={() => deletePhoto(p.id)}
                        style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', background: 'rgba(239,68,68,0.8)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                        <Trash2 size={10} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Create Deck button */}
            {deckCreated ? (
              <div style={{ padding: '16px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
                <CheckCircle2 size={20} style={{ color: '#34D399' }} />
                <div>
                  <div style={{ fontWeight: 900, color: '#34D399', fontSize: '0.88rem' }}>Mazzo pronto!</div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>La TV mostra il campo da gioco con le foto reali.</div>
                </div>
              </div>
            ) : (
              <button onClick={createDeck} disabled={!canCreate || creatingDeck}
                style={{ width: '100%', padding: '16px', background: canCreate ? `linear-gradient(135deg,${PURPLE},#7C3AED)` : 'rgba(255,255,255,0.06)', border: `1px solid ${canCreate ? PURPLE : 'rgba(255,255,255,0.1)'}`, borderRadius: 14, color: canCreate ? '#fff' : 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.95rem', cursor: canCreate ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: canCreate ? `0 0 24px ${PURPLE}50` : 'none', transition: 'all 0.2s' }}>
                {creatingDeck ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                {canCreate ? `🃏 CREA MAZZO LIVE (${photoCount} foto → ${photoCount * 2} carte)` : `Carica almeno 2 foto per creare il mazzo`}
              </button>
            )}

            {deckCreated && canCreate && (
              <button onClick={createDeck} disabled={creatingDeck}
                style={{ width: '100%', padding: '10px', background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 10, color: PURPLE, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                ↺ Ricrea mazzo con le {photoCount} foto
              </button>
            )}
          </>
        )}

        {/* ── Other game placeholder ─────────────────────────── */}
        {!isCoppie && (
          <div style={{ padding: '32px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, color: 'rgba(255,255,255,0.35)' }}>
            <div style={{ fontSize: '2rem', marginBottom: 10 }}>🚧</div>
            <div style={{ fontWeight: 900, fontSize: '0.88rem' }}>Live version coming soon</div>
            <div style={{ fontSize: '0.75rem', marginTop: 4 }}>Questo gioco non ha ancora un controller presenter dedicato.</div>
          </div>
        )}
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
