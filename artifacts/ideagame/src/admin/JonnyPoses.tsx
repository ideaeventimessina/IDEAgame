import { useState, useEffect, useCallback } from 'react';
import { AdminLayout } from './AdminLayout';
import { Save, Trash2, Image, ChevronDown } from 'lucide-react';

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
  { slug: 'global',            label: '🌐 Globale (tutti i giochi)' },
  { slug: 'percorso-a-risate', label: '😂 Percorso a Risate' },
  { slug: 'gioco-coppie',      label: '👫 Gioco delle Coppie' },
  { slug: 'quizzone',          label: '🧠 Quizzone' },
  { slug: 'adult-only',        label: '🔞 Adult Only' },
  { slug: 'sfida-ballo',       label: '💃 Sfida di Ballo' },
  { slug: 'saramusica',        label: '🎵 SaraMusica' },
  { slug: 'parola-alle-spalle',label: '🔤 Parola alle Spalle' },
  { slug: 'karaoke-battle',    label: '🎤 Karaoke Battle' },
  { slug: 'freestyle-battle',  label: '🎙 Freestyle Battle' },
];

function PoseCard({
  mood,
  pose,
  onSave,
  onDelete,
}: {
  mood: typeof MOODS[number];
  pose: JonnyPose | undefined;
  onSave: (mood: string, url: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [url, setUrl] = useState(pose?.imageUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setUrl(pose?.imageUrl ?? ''); }, [pose?.imageUrl]);

  const handleSave = async () => {
    if (!url.trim()) return;
    setSaving(true);
    try {
      await onSave(mood.key, url.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!pose?.id) return;
    setDeleting(true);
    try { await onDelete(pose.id); setUrl(''); }
    finally { setDeleting(false); }
  };

  const hasImage = !!url.trim();

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden"
      style={{ boxShadow: '0 2px 16px rgba(0,0,0,0.3)' }}>
      {/* Image preview */}
      <div className="relative w-full aspect-square bg-black/40 flex items-center justify-center overflow-hidden">
        {hasImage ? (
          <img
            src={url}
            alt={mood.label}
            className="w-full h-full object-contain"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Image className="h-8 w-8 opacity-30" />
            <span className="text-xs opacity-50">Nessuna immagine</span>
          </div>
        )}
        {/* Mood badge */}
        <div className="absolute top-2 left-2 rounded-lg px-2 py-1 text-xs font-bold"
          style={{ background: 'rgba(10,7,20,0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(212,175,55,0.3)', color: '#D4AF37' }}>
          {mood.emoji} {mood.label}
        </div>
      </div>

      {/* URL input + actions */}
      <div className="p-3 space-y-2">
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://... URL immagine"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !url.trim()}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all disabled:opacity-40"
            style={{
              background: saved ? 'rgba(34,197,94,0.2)' : 'linear-gradient(135deg, rgba(212,175,55,0.25) 0%, rgba(245,182,66,0.15) 100%)',
              border: `1px solid ${saved ? 'rgba(34,197,94,0.5)' : 'rgba(212,175,55,0.35)'}`,
              color: saved ? '#22c55e' : '#D4AF37',
            }}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Salvo…' : saved ? 'Salvato ✓' : 'Salva'}
          </button>
          {pose?.id && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center justify-center rounded-lg px-2.5 py-2 transition-colors disabled:opacity-40"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function JonnyPosesPage() {
  const [selectedGame, setSelectedGame] = useState('global');
  const [poses, setPoses] = useState<JonnyPose[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const existing = prev.findIndex(p => p.gameSlug === selectedGame && p.mood === mood);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = updated;
        return next;
      }
      return [...prev, updated];
    });
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/jonny-poses/${id}`, { method: 'DELETE' });
    setPoses(prev => prev.filter(p => p.id !== id));
  };

  const currentPoses = poses.filter(p => p.gameSlug === selectedGame);
  const getPose = (moodKey: string) => currentPoses.find(p => p.mood === moodKey);
  const selectedGameLabel = GAMES.find(g => g.slug === selectedGame)?.label ?? selectedGame;

  return (
    <AdminLayout title="Jonny — Pose per Gioco">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* Header */}
        <div className="rounded-2xl border border-border bg-card p-5"
          style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(10,7,20,0.95) 100%)' }}>
          <div className="flex items-start gap-4">
            <div className="text-4xl">🎭</div>
            <div>
              <h2 className="text-lg font-black text-foreground">Pose di Jonny per Mood</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Carica un'immagine per ogni mood di Jonny, per gioco specifico o globale.<br />
                Le immagini globali vengono usate su tutti i giochi se non è impostata una versione specifica.
              </p>
            </div>
          </div>
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
            {currentPoses.length} pose configurate per <strong>{selectedGameLabel}</strong>
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Grid of mood cards */}
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
                mood={mood}
                pose={getPose(mood.key)}
                onSave={handleSave}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {/* Usage tip */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-muted-foreground">
          <strong className="text-primary">Come funziona:</strong> incolla l'URL dell'immagine (JPG, PNG, WebP) nel campo.
          Le immagini caricate verranno usate al posto dell'immagine SVG predefinita di Jonny.
          Usa immagini con sfondo trasparente (PNG) per i migliori risultati.
        </div>
      </div>
    </AdminLayout>
  );
}
