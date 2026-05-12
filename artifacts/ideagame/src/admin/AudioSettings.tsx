import { useState, useEffect, useRef } from 'react';
import { AdminLayout } from './AdminLayout';
import { Volume2, VolumeX, Music, Zap, RotateCcw, Play, Square, Upload, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { useAudioSettings } from '@/contexts/AudioContext';
import { AudioManager, type AudioSlug, type AudioType } from '@/audio/AudioManager';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/([^:])\/\//g, '$1/');
  return fetch(url, { credentials: 'include', ...opts });
}

const SLUGS: { slug: AudioSlug | string; label: string }[] = [
  { slug: 'global', label: 'Globale (fallback per tutti)' },
  { slug: 'hub', label: 'Hub / Lobby' },
  { slug: 'quizzone', label: 'Quizzone' },
  { slug: 'gioco-coppie', label: 'Gioco delle Coppie' },
  { slug: 'percorso-a-risate', label: 'Percorso a Risate' },
  { slug: 'sfida-ballo', label: 'Sfida di Ballo' },
  { slug: 'adult-only', label: 'Adult Only' },
  { slug: 'parola-alle-spalle', label: 'Parola alle Spalle' },
  { slug: 'karaoke-battle', label: 'Karaoke Battle' },
  { slug: 'freestyle-battle', label: 'Freestyle Battle' },
  { slug: 'saramusica', label: 'Sara Musica' },
];

const TYPES: { type: AudioType | string; label: string; category: 'loop' | 'stinger' }[] = [
  { type: 'lobby_loop', label: 'Loop Lobby', category: 'loop' },
  { type: 'round_loop', label: 'Loop Round/Gioco', category: 'loop' },
  { type: 'tension_loop', label: 'Loop Tensione', category: 'loop' },
  { type: 'intro_5s', label: 'Intro 5s', category: 'stinger' },
  { type: 'stage_intro', label: 'Stage Intro', category: 'stinger' },
  { type: 'correct_stinger', label: 'Risposta Corretta ✓', category: 'stinger' },
  { type: 'wrong_stinger', label: 'Risposta Sbagliata ✗', category: 'stinger' },
  { type: 'score_stinger', label: 'Punteggio', category: 'stinger' },
  { type: 'winner_stinger', label: 'Vincitore', category: 'stinger' },
  { type: 'winner_drop', label: 'Drop Vincitore', category: 'stinger' },
  { type: 'applause', label: 'Applausi', category: 'stinger' },
  { type: 'success_applause', label: 'Applausi Successo', category: 'stinger' },
  { type: 'crowd_hype', label: 'Crowd Hype', category: 'stinger' },
  { type: 'transition_whoosh', label: 'Transizione Whoosh', category: 'stinger' },
  { type: 'podium_theme', label: 'Tema Podio', category: 'stinger' },
  { type: 'countdown_10s', label: 'Conto alla Rovescia 10s', category: 'stinger' },
  { type: 'suspense', label: 'Suspense', category: 'stinger' },
  { type: 'flip_card', label: 'Flip Carta', category: 'stinger' },
  { type: 'match_correct', label: 'Match Corretto', category: 'stinger' },
  { type: 'match_wrong', label: 'Match Sbagliato', category: 'stinger' },
  { type: 'panic_blackout', label: 'Panico / Blackout', category: 'stinger' },
  { type: 'booking_ding', label: 'Ding Prenotazione', category: 'stinger' },
  { type: 'energy_rise', label: 'Energy Rise', category: 'stinger' },
  { type: 'boo_soft', label: 'Boo Soft', category: 'stinger' },
  { type: 'karaoke_bed', label: 'Karaoke Bed', category: 'loop' },
];

interface UploadedFile { slug: string; type: string; filename: string; size: number }

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

export default function AudioSettingsPage() {
  const { settings, setMasterVolume, setMusicVolume, setSfxVolume, toggleMusic, toggleSfx, toggleMute, resetDefaults } = useAudioSettings();
  const [testPlaying, setTestPlaying] = useState(false);
  const [testMsg, setTestMsg] = useState('');

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploadSlug, setUploadSlug] = useState<string>('global');
  const [uploadType, setUploadType] = useState<string>('lobby_loop');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadList() {
    try {
      const r = await apiFetch('/audio/list');
      if (r.ok) setUploadedFiles(await r.json() as UploadedFile[]);
    } catch {}
  }

  useEffect(() => { void loadList(); }, []);

  async function handleUpload() {
    if (!fileRef.current?.files?.[0]) { setUploadMsg({ ok: false, text: 'Seleziona un file MP3' }); return; }
    const file = fileRef.current.files[0];
    const form = new FormData();
    form.append('slug', uploadSlug);
    form.append('type', uploadType);
    form.append('file', file);
    setUploading(true);
    setUploadMsg(null);
    try {
      const r = await apiFetch('/audio/upload', { method: 'POST', body: form });
      if (r.ok) {
        setUploadMsg({ ok: true, text: `Caricato: ${uploadSlug} / ${uploadType}` });
        if (fileRef.current) fileRef.current.value = '';
        await loadList();
        AudioManager.clearCache();
      } else {
        const e = await r.json() as { error?: string };
        setUploadMsg({ ok: false, text: e.error ?? 'Errore upload' });
      }
    } catch {
      setUploadMsg({ ok: false, text: 'Errore di rete' });
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(slug: string, type: string) {
    const key = `${slug}/${type}`;
    setDeleting(key);
    try {
      const r = await apiFetch(`/audio/files/${slug}/${type}`, { method: 'DELETE' });
      if (r.ok) { await loadList(); AudioManager.clearCache(); }
    } finally { setDeleting(null); }
  }

  async function testSound(type: string, label: string) {
    setTestMsg(`Test: ${label}…`);
    setTestPlaying(true);
    await AudioManager.playStinger('global', type);
    setTimeout(() => { setTestPlaying(false); setTestMsg(''); }, 3000);
  }

  function testLoop(slug: string, type: string, label: string) {
    setTestMsg(`Loop test: ${label}`);
    setTestPlaying(true);
    void AudioManager.playLoop(slug, type);
    setTimeout(() => { AudioManager.stopLoop(); setTestPlaying(false); setTestMsg(''); }, 5000);
  }

  const uploadedSet = new Set(uploadedFiles.map(f => `${f.slug}/${f.type}`));

  return (
    <AdminLayout title="Audio Engine">
      <div className="mx-auto max-w-2xl space-y-8">

        {/* Mute globale */}
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

        {/* Toggle canali */}
        <section className="space-y-3">
          <h2 className="text-display text-lg font-black flex items-center gap-2">
            <Music className="h-4 w-4 text-primary" /> Canali
          </h2>
          <Toggle label="Musica di sottofondo" description="Loop ambientali per ogni gioco" enabled={settings.musicEnabled} onToggle={toggleMusic} />
          <Toggle label="Effetti sonori" description="Stinger per match, risposte, countdown" enabled={settings.sfxEnabled} onToggle={toggleSfx} />
        </section>

        {/* Upload tracce audio */}
        <section className="rounded-2xl border border-border bg-card p-6 space-y-5">
          <h2 className="text-display text-lg font-black flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" /> Carica Tracce Audio
          </h2>
          <div className="text-xs text-muted-foreground">
            I file caricati sopravvivono ai reset del database. Seleziona gioco e tipo di traccia, poi carica il tuo MP3.
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Gioco</label>
              <select value={uploadSlug} onChange={e => setUploadSlug(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground">
                {SLUGS.map(s => <option key={s.slug} value={s.slug}>{s.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tipo Traccia</label>
              <select value={uploadType} onChange={e => setUploadType(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground">
                <optgroup label="Loop">
                  {TYPES.filter(t => t.category === 'loop').map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                </optgroup>
                <optgroup label="Stinger">
                  {TYPES.filter(t => t.category === 'stinger').map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                </optgroup>
              </select>
            </div>
          </div>

          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">File MP3</label>
              <input ref={fileRef} type="file" accept="audio/mpeg,.mp3"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:font-bold file:text-primary-foreground cursor-pointer" />
            </div>
            <button onClick={() => void handleUpload()} disabled={uploading}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors whitespace-nowrap">
              {uploading ? '…' : <><Upload className="h-4 w-4" /> Carica</>}
            </button>
          </div>

          {uploadMsg && (
            <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold ${uploadMsg.ok ? 'border border-green-500/40 bg-green-500/10 text-green-300' : 'border border-red-500/40 bg-red-500/10 text-red-300'}`}>
              {uploadMsg.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
              {uploadMsg.text}
            </div>
          )}
        </section>

        {/* Tracce caricate */}
        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-display text-lg font-black flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-400" /> Tracce Caricate
            </h2>
            <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-0.5 text-xs font-bold text-green-400">
              {uploadedFiles.length} file
            </span>
          </div>

          {uploadedFiles.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/50 px-6 py-8 text-center text-sm text-muted-foreground/60">
              Nessuna traccia caricata. Usa il pannello sopra per aggiungere le tue tracce MP3.
            </div>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
              {uploadedFiles
                .sort((a, b) => `${a.slug}/${a.type}`.localeCompare(`${b.slug}/${b.type}`))
                .map(f => {
                  const key = `${f.slug}/${f.type}`;
                  const slugLabel = SLUGS.find(s => s.slug === f.slug)?.label ?? f.slug;
                  const typeLabel = TYPES.find(t => t.type === f.type)?.label ?? f.type;
                  return (
                    <div key={key} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold truncate">{slugLabel}</div>
                        <div className="text-[10px] text-muted-foreground">{typeLabel} · {(f.size / 1024).toFixed(0)} KB</div>
                      </div>
                      <button onClick={() => void handleDelete(f.slug, f.type)} disabled={deleting === key}
                        className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </section>

        {/* Test audio */}
        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <h2 className="text-display text-lg font-black flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-400" /> Test Audio
          </h2>
          {testMsg && (
            <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-bold text-primary">{testMsg}</div>
          )}
          <div className="text-xs text-muted-foreground">
            I test usano le tracce caricate. Se una traccia non è stata caricata, il test è silenzioso.
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              { label: 'Applausi', slug: 'global', type: 'applause', loop: false },
              { label: 'Suspense', slug: 'global', type: 'suspense', loop: false },
              { label: 'Vincitore', slug: 'global', type: 'winner_stinger', loop: false },
              { label: 'Corretto ✓', slug: 'global', type: 'correct_stinger', loop: false },
              { label: 'Sbagliato ✗', slug: 'global', type: 'wrong_stinger', loop: false },
              { label: 'Whoosh →', slug: 'global', type: 'transition_whoosh', loop: false },
              { label: 'Hub loop', slug: 'hub', type: 'lobby_loop', loop: true },
              { label: 'Quizzone loop', slug: 'quizzone', type: 'round_loop', loop: true },
              { label: 'Ballo loop', slug: 'sfida-ballo', type: 'round_loop', loop: true },
            ].map(({ label, slug, type, loop }) => (
              <button key={`${slug}-${type}`} disabled={testPlaying}
                onClick={() => loop ? testLoop(slug, type, label) : void testSound(type, label)}
                className={`relative flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold hover:bg-accent disabled:opacity-50 transition-colors ${uploadedSet.has(`${slug}/${type}`) ? 'border-green-500/40 bg-green-500/5 text-green-300' : 'border-border bg-background text-muted-foreground'}`}>
                <Play className="h-3 w-3" /> {label}
                {uploadedSet.has(`${slug}/${type}`) && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-green-400" />}
              </button>
            ))}
          </div>
          <button disabled={!testPlaying} onClick={() => { AudioManager.stopAll(); setTestPlaying(false); setTestMsg(''); }}
            className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-bold text-destructive disabled:opacity-30 hover:bg-destructive/20 transition-colors">
            <Square className="h-3.5 w-3.5" /> Stop tutto
          </button>
        </section>

        {/* Reset */}
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
