import { useState, useEffect, useCallback, useRef } from 'react';
import { AdminLayout } from './AdminLayout';
import { Save, Trash2, Upload, Link2, ChevronDown, X, RefreshCw, CheckCircle2 } from 'lucide-react';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

interface JonnyPose {
  id: string;
  tenantId: string | null;
  gameSlug: string;
  mood: string;
  imageUrl: string;
}

const MOODS: { key: string; emoji: string; label: string }[] = [
  { key: 'idle',        emoji: '😊', label: 'Idle / Default' },
  { key: 'excited',     emoji: '🤩', label: 'Eccitato' },
  { key: 'thinking',    emoji: '🤔', label: 'Pensieroso' },
  { key: 'cheering',    emoji: '🎉', label: 'Festeggia' },
  { key: 'celebrating', emoji: '🏆', label: 'Celebrazione' },
  { key: 'winner',      emoji: '🥇', label: 'Vincitore' },
  { key: 'correct',     emoji: '✅', label: 'Risposta giusta' },
  { key: 'wrong',       emoji: '❌', label: 'Sbagliato' },
  { key: 'countdown',   emoji: '⏱',  label: 'Countdown' },
  { key: 'question',    emoji: '❓', label: 'Domanda' },
  { key: 'scoreboard',  emoji: '📊', label: 'Classifica' },
  { key: 'paused',      emoji: '⏸',  label: 'Pausa' },
  { key: 'waiting',     emoji: '⏳', label: 'In attesa' },
  { key: 'your_turn',   emoji: '👉', label: 'Il tuo turno' },
  { key: 'points',      emoji: '⭐', label: 'Punti assegnati' },
  { key: 'round_done',  emoji: '✨', label: 'Round terminato' },
  { key: 'bye',         emoji: '👋', label: 'Arrivederci' },
];

const GAMES: { slug: string; label: string }[] = [
  { slug: 'global',             label: '🌐 Globale (tutti i giochi)' },
  { slug: 'percorso-a-risate',  label: '😂 Percorso a Risate' },
  { slug: 'gioco-coppie',       label: '👫 Gioco delle Coppie' },
  { slug: 'quizzone',           label: '🧠 Quizzone' },
  { slug: 'adult-only',         label: '🔞 Adult Only' },
  { slug: 'sfida-ballo',        label: '💃 Sfida di Ballo' },
  { slug: 'saramusica',         label: '🎵 SaraMusica' },
  { slug: 'parola-alle-spalle', label: '🔤 Parola alle Spalle' },
  { slug: 'karaoke-battle',     label: '🎤 Karaoke Battle' },
  { slug: 'freestyle-battle',   label: '🎙 Freestyle Battle' },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Lettura file fallita'));
    reader.readAsDataURL(file);
  });
}

// ── PoseCard ─────────────────────────────────────────────────────────────────
function PoseCard({
  gameSlug,
  mood,
  pose,
  onSave,
  onDelete,
}: {
  gameSlug: string;
  mood: typeof MOODS[number];
  pose: JonnyPose | undefined;
  onSave: (mood: string, url: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [url, setUrl] = useState(pose?.imageUrl ?? '');
  const [inputMode, setInputMode] = useState<'url' | 'file'>('url');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previewSrc, setPreviewSrc] = useState(pose?.imageUrl ?? '');
  const [imgError, setImgError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUrl(pose?.imageUrl ?? '');
    setPreviewSrc(pose?.imageUrl ?? '');
    setImgError(false);
  }, [pose?.imageUrl]);

  const handleSave = async (urlToSave = url) => {
    if (!urlToSave.trim()) return;
    setSaving(true);
    try {
      await onSave(mood.key, urlToSave.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setPreviewSrc(objectUrl);
    setImgError(false);

    setUploading(true);
    try {
      // Convert to base64 data URI — stored directly in DB, never lost on server restart
      const dataUri = await fileToBase64(file);
      setUrl(dataUri);
      setPreviewSrc(dataUri);
      await handleSave(dataUri);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const hasImage = !!previewSrc;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col"
      style={{ boxShadow: '0 2px 16px rgba(0,0,0,0.3)' }}>

      {/* Image preview */}
      <div className="relative w-full aspect-square bg-black/40 flex items-center justify-center overflow-hidden shrink-0"
        style={{ minHeight: 120 }}>
        {hasImage && !imgError ? (
          <img
            src={previewSrc}
            alt={mood.label}
            className="w-full h-full object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground py-4">
            <span className="text-3xl">{mood.emoji}</span>
            <span className="text-xs opacity-50">Nessuna immagine</span>
          </div>
        )}
        {/* Mood badge */}
        <div className="absolute top-2 left-2 rounded-lg px-2 py-0.5 text-xs font-bold"
          style={{ background: 'rgba(10,7,20,0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(212,175,55,0.3)', color: '#D4AF37' }}>
          {mood.emoji} {mood.label}
        </div>
        {/* Loading overlay */}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="h-8 w-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-3 space-y-2 flex-1 flex flex-col">
        {/* Mode toggle */}
        <div className="flex rounded-lg overflow-hidden border border-border text-xs font-bold">
          <button
            onClick={() => setInputMode('url')}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 transition-colors"
            style={{
              background: inputMode === 'url' ? 'rgba(212,175,55,0.2)' : 'transparent',
              color: inputMode === 'url' ? '#D4AF37' : 'rgba(255,255,255,0.4)',
            }}
          >
            <Link2 className="h-3 w-3" /> URL
          </button>
          <button
            onClick={() => { setInputMode('file'); fileRef.current?.click(); }}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 transition-colors"
            style={{
              background: inputMode === 'file' ? 'rgba(212,175,55,0.2)' : 'transparent',
              color: inputMode === 'file' ? '#D4AF37' : 'rgba(255,255,255,0.4)',
            }}
          >
            <Upload className="h-3 w-3" /> Upload
          </button>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* URL input (shown in url mode) */}
        {inputMode === 'url' && (
          <input
            type="url"
            value={url.startsWith('data:') ? '' : url}
            onChange={e => { setUrl(e.target.value); setPreviewSrc(e.target.value); setImgError(false); }}
            onKeyDown={e => { if (e.key === 'Enter') void handleSave(); }}
            placeholder={url.startsWith('data:') ? '(immagine caricata ✓)' : 'https://…'}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        )}

        {/* Upload hint (shown in file mode) */}
        {inputMode === 'file' && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full rounded-lg border border-dashed border-primary/40 py-3 text-xs text-primary/70 hover:bg-primary/5 transition-colors disabled:opacity-50"
          >
            {uploading ? 'Salvataggio nel DB…' : '📂 Scegli immagine dal dispositivo'}
          </button>
        )}

        {/* Save / Delete row */}
        <div className="flex gap-2 mt-auto">
          {inputMode === 'url' && (
            <button
              onClick={() => void handleSave()}
              disabled={saving || !url.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all disabled:opacity-40"
              style={{
                background: saved ? 'rgba(34,197,94,0.2)' : 'linear-gradient(135deg, rgba(212,175,55,0.25) 0%, rgba(245,182,66,0.15) 100%)',
                border: `1px solid ${saved ? 'rgba(34,197,94,0.5)' : 'rgba(212,175,55,0.35)'}`,
                color: saved ? '#22c55e' : '#D4AF37',
              }}
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Salvo…' : saved ? 'Salvato ✓' : 'Salva nel DB'}
            </button>
          )}
          {pose?.id && (
            <button
              onClick={async () => {
                if (!pose.id) return;
                setDeleting(true);
                try {
                  await onDelete(pose.id);
                  setUrl('');
                  setPreviewSrc('');
                  setImgError(false);
                } finally { setDeleting(false); }
              }}
              disabled={deleting}
              title="Elimina"
              className="flex items-center justify-center rounded-lg px-2.5 py-2 transition-colors disabled:opacity-40"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}
            >
              {deleting ? <X className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function JonnyPosesPage() {
  const [selectedGame, setSelectedGame] = useState('global');
  const [poses, setPoses] = useState<JonnyPose[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [savedAllMsg, setSavedAllMsg] = useState<string | null>(null);

  const loadPoses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch('/jonny-poses') as JonnyPose[];
      setPoses(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadPoses(); }, [loadPoses]);

  const handleSave = async (mood: string, imageUrl: string) => {
    const updated = await apiFetch('/jonny-poses', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameSlug: selectedGame, mood, imageUrl }),
    }) as JonnyPose;
    setPoses(prev => {
      const idx = prev.findIndex(p => p.gameSlug === selectedGame && p.mood === mood);
      if (idx >= 0) { const next = [...prev]; next[idx] = updated; return next; }
      return [...prev, updated];
    });
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/jonny-poses/${id}`, { method: 'DELETE' });
    setPoses(prev => prev.filter(p => p.id !== id));
  };

  // ── "Salva tutto nel DB" — force-upsert all poses that have an imageUrl ──
  const handleSaveAll = async () => {
    const toSave = poses.filter(p => p.imageUrl);
    if (toSave.length === 0) {
      setSavedAllMsg('Nessuna posa da salvare.');
      setTimeout(() => setSavedAllMsg(null), 3000);
      return;
    }
    setSavingAll(true);
    setSavedAllMsg(null);
    let ok = 0;
    let fail = 0;
    for (const p of toSave) {
      try {
        await apiFetch('/jonny-poses', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameSlug: p.gameSlug, mood: p.mood, imageUrl: p.imageUrl }),
        });
        ok++;
      } catch { fail++; }
    }
    setSavingAll(false);
    setSavedAllMsg(fail === 0
      ? `✅ ${ok} pose salvate nel DB con successo!`
      : `⚠️ ${ok} salvate, ${fail} errori`
    );
    setTimeout(() => setSavedAllMsg(null), 5000);
  };

  const currentPoses = poses.filter(p => p.gameSlug === selectedGame);
  const getPose = (moodKey: string) => currentPoses.find(p => p.mood === moodKey);
  const selectedGameLabel = GAMES.find(g => g.slug === selectedGame)?.label ?? selectedGame;
  const totalPoses = poses.filter(p => p.imageUrl).length;

  return (
    <AdminLayout title="Jonny — Pose per Gioco">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* Header */}
        <div className="rounded-2xl border border-border bg-card p-5"
          style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(10,7,20,0.95) 100%)' }}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4">
              <div className="text-4xl">🎭</div>
              <div>
                <h2 className="text-lg font-black text-foreground">Action Figure di Jonny per Mood</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Carica un'immagine per ogni mood. Le immagini vengono <strong>salvate direttamente nel DB</strong> e non si perdono mai al riavvio del server.<br />
                  <span className="text-amber-400 font-bold">{totalPoses} pose salvate nel DB.</span>
                </p>
              </div>
            </div>

            {/* ── SALVA TUTTO NEL DB ─────────────────────────────── */}
            <div className="flex flex-col items-end gap-2 shrink-0">
              <button
                onClick={() => void handleSaveAll()}
                disabled={savingAll || poses.length === 0}
                className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-black transition-all disabled:opacity-40"
                style={{
                  background: 'linear-gradient(135deg, #D4AF37 0%, #F5B642 100%)',
                  color: '#0a0714',
                  boxShadow: '0 4px 20px rgba(212,175,55,0.4)',
                }}
              >
                {savingAll
                  ? <><RefreshCw className="h-4 w-4 animate-spin" /> Salvataggio…</>
                  : <><Save className="h-4 w-4" /> Salva tutto nel DB</>
                }
              </button>
              <button
                onClick={() => void loadPoses()}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold border border-border hover:bg-accent transition-colors disabled:opacity-40"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Ricarica
              </button>
            </div>
          </div>

          {/* Feedback "Salva tutto" */}
          {savedAllMsg && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-2.5 text-sm font-bold text-green-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {savedAllMsg}
            </div>
          )}
        </div>

        {/* Info box — persistenza */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-300/80">
          <strong className="text-amber-400">💾 Persistenza garantita:</strong> le immagini caricate via &quot;Upload&quot; vengono convertite in base64 e salvate direttamente nel database —
          non dipendono da file su disco e <strong>non si perdono mai</strong> al riavvio del server.
          Per le immagini esterne usa la modalità <strong>URL</strong> e clicca <strong>Salva nel DB</strong>.
        </div>

        {/* Game selector */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Gioco</label>
          <div className="relative">
            <select
              value={selectedGame}
              onChange={e => setSelectedGame(e.target.value)}
              className="w-full appearance-none rounded-xl border border-border bg-card px-4 py-3 pr-10 font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {GAMES.map(g => (
                <option key={g.slug} value={g.slug}>{g.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground">
            {currentPoses.length}/{MOODS.length} mood configurati per <strong>{selectedGameLabel}</strong>
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin mr-3" />
            Caricamento pose…
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {MOODS.map(mood => (
              <PoseCard
                key={`${selectedGame}-${mood.key}`}
                gameSlug={selectedGame}
                mood={mood}
                pose={getPose(mood.key)}
                onSave={handleSave}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

      </div>
    </AdminLayout>
  );
}
