import { useState, useEffect, useRef } from 'react';
import { AdminLayout } from './AdminLayout';
import { Volume2, VolumeX, Music, RotateCcw, Upload, Trash2, Check, X, Loader2, Play } from 'lucide-react';
import { useAudioSettings } from '@/contexts/AudioContext';
import { AudioManager } from '@/audio/AudioManager';
import {
  useListSystemSettings, useUpsertSystemSetting, getListSystemSettingsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/([^:])\/\//g, '$1/');
  return fetch(url, { credentials: 'include', ...opts });
}

// ── Effect Slots (stinger per tipo) ─────────────────────────────────────────

const EFFECT_SLOTS: { type: string; label: string; icon: string }[] = [
  { type: 'applause',          label: 'Applausi',              icon: '👏' },
  { type: 'success_applause',  label: 'Applausi successo',     icon: '🎉' },
  { type: 'crowd_hype',        label: 'Crowd Hype',            icon: '🔥' },
  { type: 'correct_stinger',   label: 'Risposta Corretta',     icon: '✅' },
  { type: 'wrong_stinger',     label: 'Risposta Sbagliata',    icon: '❌' },
  { type: 'winner_stinger',    label: 'Vincitore',             icon: '🏆' },
  { type: 'winner_drop',       label: 'Drop Vincitore',        icon: '💫' },
  { type: 'podium_theme',      label: 'Tema Podio',            icon: '🥇' },
  { type: 'suspense',          label: 'Suspense',              icon: '😰' },
  { type: 'score_stinger',     label: 'Punteggio',             icon: '⭐' },
  { type: 'countdown_10s',     label: 'Conto alla Rovescia',   icon: '⏱️' },
  { type: 'transition_whoosh', label: 'Transizione Whoosh',    icon: '💨' },
  { type: 'intro_5s',          label: 'Intro 5s',              icon: '🎬' },
  { type: 'stage_intro',       label: 'Stage Intro',           icon: '🎤' },
  { type: 'flip_card',         label: 'Flip Carta',            icon: '🃏' },
  { type: 'match_correct',     label: 'Match Corretto',        icon: '🎯' },
  { type: 'match_wrong',       label: 'Match Sbagliato',       icon: '💀' },
  { type: 'panic_blackout',    label: 'Panico / Blackout',     icon: '🚨' },
  { type: 'booking_ding',      label: 'Ding Prenotazione',     icon: '🔔' },
  { type: 'energy_rise',       label: 'Energy Rise',           icon: '⚡' },
  { type: 'boo_soft',          label: 'Boo Soft',              icon: '😒' },
];

// ── Music Slots (sottofondo per gioco — object storage) ─────────────────────

type MusicPaths = {
  lobby: string;
  quizzone: string;
  'sfida-ballo': string;
  'percorso-a-risate': string;
  'gioco-coppie': string;
  'adult-only': string;
  'karaoke-battle': string;
  'freestyle-battle': string;
  saramusica: string;
  'parola-alle-spalle': string;
  'percorso-sfida': string;
  'percorso-domanda': string;
  'percorso-mimo': string;
  'percorso-ballo': string;
  'percorso-veloce': string;
  'percorso-coppia': string;
  'percorso-reazione': string;
  'percorso-fantasia': string;
};

const MUSIC_DEFAULTS: MusicPaths = {
  lobby: '', quizzone: '', 'sfida-ballo': '', 'percorso-a-risate': '', 'gioco-coppie': '',
  'adult-only': '', 'karaoke-battle': '', 'freestyle-battle': '', saramusica: '', 'parola-alle-spalle': '',
  'percorso-sfida': '', 'percorso-domanda': '', 'percorso-mimo': '', 'percorso-ballo': '',
  'percorso-veloce': '', 'percorso-coppia': '', 'percorso-reazione': '', 'percorso-fantasia': '',
};

const MUSIC_SLOTS: { key: keyof MusicPaths; label: string; icon: string; fallback: string }[] = [
  { key: 'lobby',              label: 'Lobby / Home (sottofondo principale)', icon: '🏠', fallback: '/audio/jonny-world/global/lobby_loop.mp3' },
  { key: 'quizzone',           label: 'Quizzone',                             icon: '❓', fallback: '/audio/jonny-world/quizzone/round_loop.mp3' },
  { key: 'sfida-ballo',        label: 'Sfida di Ballo',                       icon: '💃', fallback: '/audio/jonny-world/sfida-ballo/round_loop.mp3' },
  { key: 'percorso-a-risate',  label: 'Percorso a Risate (generale)',         icon: '⚡', fallback: '/audio/jonny-world/percorso-a-risate/round_loop.mp3' },
  { key: 'gioco-coppie',       label: 'Gioco delle Coppie',                   icon: '🃏', fallback: '/audio/jonny-world/gioco-coppie/tension_loop.mp3' },
  { key: 'adult-only',         label: 'Adult Only (18+)',                      icon: '🔞', fallback: '' },
  { key: 'karaoke-battle',     label: 'Karaoke Battle',                       icon: '🎤', fallback: '' },
  { key: 'freestyle-battle',   label: 'Freestyle Battle',                     icon: '🎙️', fallback: '' },
  { key: 'saramusica',         label: 'Sara Musica (indovina la canzone)',     icon: '🎵', fallback: '' },
  { key: 'parola-alle-spalle', label: 'Parola alle Spalle',                   icon: '💬', fallback: '' },
];

const PERCORSO_CHALLENGE_SLOTS: { key: keyof MusicPaths; label: string; icon: string }[] = [
  { key: 'percorso-sfida',    label: 'Sfida fisica',  icon: '⚡' },
  { key: 'percorso-domanda',  label: 'Domanda',       icon: '❓' },
  { key: 'percorso-mimo',     label: 'Mimo',          icon: '🎭' },
  { key: 'percorso-ballo',    label: 'Ballo',         icon: '💃' },
  { key: 'percorso-veloce',   label: 'Veloce',        icon: '🏃' },
  { key: 'percorso-coppia',   label: 'Coppia',        icon: '👫' },
  { key: 'percorso-reazione', label: 'Reazione',      icon: '😱' },
  { key: 'percorso-fantasia', label: 'Fantasia',      icon: '🌟' },
];

interface UploadedFile { slug: string; type: string; filename: string; size: number }

// ── EffectUploader — individual box per stinger ──────────────────────────────

function EffectUploader({ type, label, icon, uploaded, onRefresh }: {
  type: string;
  label: string;
  icon: string;
  uploaded: UploadedFile | undefined;
  onRefresh: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [playing, setPlaying] = useState(false);

  const streamUrl = `${BASE}api/audio/files/global/${type}`.replace(/([^:])\/\//g, '$1/');

  const handleFile = async (file: File) => {
    setUploading(true);
    setError(null);
    setDone(false);
    const form = new FormData();
    form.append('slug', 'global');
    form.append('type', type);
    form.append('file', file);
    try {
      const r = await apiFetch('/audio/upload', { method: 'POST', body: form });
      if (r.ok) {
        setDone(true);
        AudioManager.clearCache();
        onRefresh();
        setTimeout(() => setDone(false), 3000);
      } else {
        const e = await r.json() as { error?: string };
        setError(e.error ?? 'Errore upload');
      }
    } catch { setError('Errore di rete'); }
    finally { setUploading(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const r = await apiFetch(`/audio/files/global/${type}`, { method: 'DELETE' });
      if (r.ok) { AudioManager.clearCache(); onRefresh(); }
    } finally { setDeleting(false); }
  };

  const handlePlay = async () => {
    if (playing) { AudioManager.stopAll(); setPlaying(false); return; }
    setPlaying(true);
    try { await AudioManager.playStinger('global', type); }
    catch { /* no file loaded, silent */ }
    finally { setTimeout(() => setPlaying(false), 4000); }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {done && <span className="flex items-center gap-1 text-xs text-emerald-400"><Check className="h-3 w-3" /> OK</span>}
          {uploaded && (
            <span className="h-2 w-2 rounded-full bg-green-400 shrink-0" title="Traccia caricata" />
          )}
          {uploaded && (
            <button onClick={handleDelete} disabled={deleting}
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:border-destructive/60 hover:text-destructive disabled:opacity-40">
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            </button>
          )}
        </div>
      </div>

      {/* Audio player / test */}
      {uploaded ? (
        <audio key={streamUrl} controls src={streamUrl} className="w-full h-8" style={{ colorScheme: 'dark' }} />
      ) : (
        <button onClick={() => void handlePlay()} disabled={playing}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 py-2 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors disabled:opacity-40">
          <Play className="h-3 w-3" /> {playing ? 'In riproduzione…' : 'Nessuna traccia — carica un file'}
        </button>
      )}

      {/* Upload */}
      <div className="flex items-center gap-2">
        <input ref={inputRef} type="file" accept="audio/mpeg,.mp3"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }} />
        <button onClick={() => inputRef.current?.click()} disabled={uploading}
          className="flex items-center gap-2 rounded-xl border border-primary/50 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 disabled:opacity-40 transition-colors">
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {uploading ? 'Caricamento…' : uploaded ? 'Sostituisci' : 'Carica MP3'}
        </button>
        {uploaded && (
          <span className="text-[10px] text-muted-foreground truncate">{uploaded.filename} · {(uploaded.size / 1024).toFixed(0)} KB</span>
        )}
      </div>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{error}</div>}
    </div>
  );
}

// ── MusicUploader (object-storage presigned URL upload) ─────────────────────

function MusicUploader({
  slotKey, label, icon, currentPath, fallback, onUploaded, onClear,
}: {
  slotKey: keyof MusicPaths;
  label: string;
  icon: string;
  currentPath: string;
  fallback: string;
  onUploaded: (objectPath: string) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadDone, setUploadDone] = useState(false);

  const audioSrc = currentPath ? `/api/storage${currentPath}` : fallback;

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|ogg|wav|m4a|aac|flac)$/i)) {
      setUploadError('Seleziona un file audio (mp3, ogg, wav…)');
      return;
    }
    setUploading(true);
    setUploadError(null);
    setUploadDone(false);
    try {
      const urlRes = await fetch('/api/storage/uploads/request-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || 'audio/mpeg' }),
      });
      if (!urlRes.ok) throw new Error('Errore generazione URL di caricamento');
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      const putRes = await fetch(uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'audio/mpeg' } });
      if (!putRes.ok) throw new Error('Errore caricamento file su storage');
      onUploaded(objectPath);
      setUploadDone(true);
      setTimeout(() => setUploadDone(false), 3000);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Errore upload');
    } finally { setUploading(false); }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {uploadDone && <span className="flex items-center gap-1 text-xs text-emerald-400"><Check className="h-3 w-3" /> Caricato!</span>}
          {currentPath && (
            <button onClick={onClear} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:border-destructive/60 hover:text-destructive">
              <X className="h-3 w-3" /> Rimuovi
            </button>
          )}
        </div>
      </div>
      <audio key={audioSrc} controls src={audioSrc} className="w-full h-8" style={{ colorScheme: 'dark' }} />
      <div className="flex items-center gap-3">
        <input ref={inputRef} type="file" accept="audio/*,.mp3,.ogg,.wav,.m4a,.aac,.flac" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }} />
        <button onClick={() => inputRef.current?.click()} disabled={uploading}
          className="flex items-center gap-2 rounded-xl border border-primary/50 bg-primary/10 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/20 disabled:opacity-40 transition-colors">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? 'Caricamento…' : currentPath ? 'Sostituisci file' : 'Carica file audio'}
        </button>
        {currentPath && (
          <span className="text-xs text-muted-foreground truncate max-w-[180px]" title={currentPath}>
            {currentPath.split('/').pop()}
          </span>
        )}
      </div>
      {uploadError && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{uploadError}</div>}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-36 shrink-0 text-sm font-semibold text-muted-foreground">{label}</span>
      <input type="range" min={0} max={100} step={1}
        value={Math.round(value * 100)}
        onChange={e => onChange(Number(e.target.value) / 100)}
        className="flex-1 accent-primary h-2 rounded-full cursor-pointer" />
      <span className="w-10 text-right text-sm font-mono tabular-nums">{Math.round(value * 100)}%</span>
    </div>
  );
}

function Toggle({ label, description, enabled, onToggle }: { label: string; description: string; enabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3">
      <div>
        <div className="text-sm font-bold">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <button onClick={onToggle}
        className={`relative h-7 w-12 rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-muted'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? 'left-6' : 'left-1'}`} />
      </button>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function AudioSettingsPage() {
  const { settings, setMasterVolume, setMusicVolume, setSfxVolume, toggleMusic, toggleSfx, toggleMute, resetDefaults } = useAudioSettings();

  // Stinger list (for EffectUploader)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  // Sottofondo per gioco (object-storage, saved in tenant.settings)
  const qc = useQueryClient();
  const { data: rows = [] } = useListSystemSettings();
  const upsert = useUpsertSystemSetting();
  const [musicPaths, setMusicPaths] = useState<MusicPaths>(MUSIC_DEFAULTS);
  const [fullSettings, setFullSettings] = useState<Record<string, unknown>>({});

  useEffect(() => {
    const r = rows.find(r => r.key === 'tenant.settings');
    if (r && typeof r.value === 'object' && r.value !== null) {
      const stored = r.value as Record<string, unknown>;
      setFullSettings(stored);
      const mp = (stored.musicPaths ?? {}) as Partial<MusicPaths>;
      setMusicPaths({ ...MUSIC_DEFAULTS, ...mp });
    }
  }, [rows]);

  const saveMusic = async (key: keyof MusicPaths, objectPath: string) => {
    const next: MusicPaths = { ...musicPaths, [key]: objectPath };
    setMusicPaths(next);
    try {
      await upsert.mutateAsync({ data: { key: 'tenant.settings', value: { ...fullSettings, musicPaths: next } } });
      await qc.invalidateQueries({ queryKey: getListSystemSettingsQueryKey() });
    } catch { /* silently ignore */ }
  };

  const clearMusic = (key: keyof MusicPaths) => void saveMusic(key, '');

  const loadList = async () => {
    try {
      const r = await apiFetch('/audio/list');
      if (r.ok) setUploadedFiles(await r.json() as UploadedFile[]);
    } catch {}
  };

  useEffect(() => { void loadList(); }, []);

  return (
    <AdminLayout title="Audio Engine">
      <div className="mx-auto max-w-2xl space-y-8">

        {/* ── Controllo Master ─────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-display text-xl font-black flex items-center gap-2">
              {settings.muted ? <VolumeX className="h-5 w-5 text-destructive" /> : <Volume2 className="h-5 w-5 text-primary" />}
              Controllo Master
            </h2>
            <button onClick={toggleMute}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${settings.muted ? 'bg-destructive/20 text-destructive border border-destructive/30' : 'bg-card border border-border hover:bg-accent'}`}>
              {settings.muted ? <><VolumeX className="h-4 w-4" /> Audio muto</> : <><Volume2 className="h-4 w-4" /> Audio attivo</>}
            </button>
          </div>
          <div className="space-y-4">
            <Slider label="Volume Master" value={settings.masterVolume} onChange={setMasterVolume} />
            <Slider label="Volume Musica" value={settings.musicVolume} onChange={setMusicVolume} />
            <Slider label="Volume Effetti" value={settings.sfxVolume} onChange={setSfxVolume} />
          </div>
        </section>

        {/* ── Canali ───────────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-display text-lg font-black flex items-center gap-2">
            <Music className="h-4 w-4 text-primary" /> Canali
          </h2>
          <Toggle label="Musica di sottofondo" description="Loop ambientali per ogni gioco" enabled={settings.musicEnabled} onToggle={toggleMusic} />
          <Toggle label="Effetti sonori" description="Stinger per match, risposte, countdown" enabled={settings.sfxEnabled} onToggle={toggleSfx} />
        </section>

        {/* ── Effetti Sonori — box per stinger ─────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚡</span>
            <div>
              <div className="font-black uppercase tracking-widest text-sm text-primary">Effetti Sonori</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Carica un MP3 per ogni effetto. Il pallino verde indica che la traccia è già caricata.
              </div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {EFFECT_SLOTS.map(slot => (
              <EffectUploader
                key={slot.type}
                type={slot.type}
                label={slot.label}
                icon={slot.icon}
                uploaded={uploadedFiles.find(f => f.slug === 'global' && f.type === slot.type)}
                onRefresh={() => void loadList()}
              />
            ))}
          </div>
        </section>

        {/* ── Sottofondo per gioco ─────────────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <Music className="h-5 w-5 text-primary" />
            <div>
              <div className="font-black uppercase tracking-widest text-sm text-primary">Sottofondo per gioco</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Loop ambientale riprodotto durante ogni gioco.
              </div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {MUSIC_SLOTS.map(slot => (
              <MusicUploader
                key={slot.key}
                slotKey={slot.key}
                label={slot.label}
                icon={slot.icon}
                fallback={slot.fallback}
                currentPath={musicPaths[slot.key]}
                onUploaded={path => void saveMusic(slot.key, path)}
                onClear={() => clearMusic(slot.key)}
              />
            ))}
          </div>
        </section>

        {/* ── Percorso a Risate — sfide ─────────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚡</span>
            <div>
              <div className="font-black uppercase tracking-widest text-sm" style={{ color: '#F5B642' }}>
                Percorso a Risate — per tipo di sfida
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Musica personalizzata per ogni tipo di sfida. Lascia vuoto per usare il sottofondo generale del Percorso.
              </div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {PERCORSO_CHALLENGE_SLOTS.map(slot => (
              <MusicUploader
                key={slot.key}
                slotKey={slot.key}
                label={slot.label}
                icon={slot.icon}
                fallback=""
                currentPath={musicPaths[slot.key] ?? ''}
                onUploaded={path => void saveMusic(slot.key, path)}
                onClear={() => clearMusic(slot.key)}
              />
            ))}
          </div>
        </section>

        {/* ── Reset volumi ─────────────────────────────────────────────────── */}
        <div className="flex justify-end">
          <button onClick={resetDefaults}
            className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-bold hover:bg-accent transition-colors">
            <RotateCcw className="h-3.5 w-3.5" /> Ripristina default volumi
          </button>
        </div>

      </div>
    </AdminLayout>
  );
}
