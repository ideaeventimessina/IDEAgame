import { useEffect, useState, useRef, type ReactNode } from 'react';
import { AdminLayout } from './AdminLayout';
import { useT, LOCALES } from '@/i18n';
import { Loader2, Upload, Music, Check, X } from 'lucide-react';
import {
  useListSystemSettings, useUpsertSystemSetting, getListSystemSettingsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useJonny } from '@/contexts/JonnyContext';
import { JonnyAvatar } from '@/components/JonnyAvatar';

type MusicPaths = {
  lobby: string;
  quizzone: string;
  'sfida-ballo': string;
  'percorso-a-risate': string;
  'gioco-coppie': string;
  'percorso-sfida': string;
  'percorso-domanda': string;
  'percorso-mimo': string;
  'percorso-ballo': string;
  'percorso-veloce': string;
  'percorso-coppia': string;
  'percorso-reazione': string;
  'percorso-fantasia': string;
};

type SettingsValue = {
  brandColor: string;
  defaultLocale: string;
  projectionMode: boolean;
  offlineFirst: boolean;
  musicPaths: MusicPaths;
};

const DEFAULTS: SettingsValue = {
  brandColor: '#F5B642',
  defaultLocale: 'it',
  projectionMode: true,
  offlineFirst: true,
  musicPaths: {
    lobby: '', quizzone: '', 'sfida-ballo': '', 'percorso-a-risate': '', 'gioco-coppie': '',
    'percorso-sfida': '', 'percorso-domanda': '', 'percorso-mimo': '', 'percorso-ballo': '',
    'percorso-veloce': '', 'percorso-coppia': '', 'percorso-reazione': '', 'percorso-fantasia': '',
  },
};

const MUSIC_SLOTS: { key: keyof MusicPaths; label: string; icon: string; fallback: string }[] = [
  { key: 'lobby',            label: 'Lobby / Home (sottofondo principale)', icon: '🏠', fallback: '/audio/jonny-world/global/lobby_loop.mp3' },
  { key: 'quizzone',         label: 'Quizzone',                             icon: '❓', fallback: '/audio/jonny-world/quizzone/round_loop.mp3' },
  { key: 'sfida-ballo',      label: 'Sfida di Ballo',                       icon: '💃', fallback: '/audio/jonny-world/sfida-ballo/round_loop.mp3' },
  { key: 'percorso-a-risate',label: 'Percorso a Risate (generale)',          icon: '⚡', fallback: '/audio/jonny-world/percorso-a-risate/round_loop.mp3' },
  { key: 'gioco-coppie',     label: 'Gioco delle Coppie',                   icon: '🃏', fallback: '/audio/jonny-world/gioco-coppie/tension_loop.mp3' },
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

// ── MusicUploader ─────────────────────────────────────────────────────────────

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

      const putRes = await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'audio/mpeg' },
      });
      if (!putRes.ok) throw new Error('Errore caricamento file su storage');

      onUploaded(objectPath);
      setUploadDone(true);
      setTimeout(() => setUploadDone(false), 3000);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Errore upload');
    } finally {
      setUploading(false);
    }
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

      {/* Audio preview */}
      <audio key={audioSrc} controls src={audioSrc} className="w-full h-8" style={{ colorScheme: 'dark' }} />

      {/* Upload button */}
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.mp3,.ogg,.wav,.m4a,.aac,.flac"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 rounded-xl border border-primary/50 bg-primary/10 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/20 disabled:opacity-40 transition-colors"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? 'Caricamento…' : currentPath ? 'Sostituisci file' : 'Carica file audio'}
        </button>
        {currentPath && (
          <span className="text-xs text-muted-foreground truncate max-w-[180px]" title={currentPath}>
            {currentPath.split('/').pop()}
          </span>
        )}
      </div>

      {uploadError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{uploadError}</div>
      )}
    </div>
  );
}

// ── Main Settings ─────────────────────────────────────────────────────────────

export default function Settings() {
  const t = useT();
  const qc = useQueryClient();
  const { isHostedByJonny, setIsHostedByJonny, jonnyMode, setJonnyMode } = useJonny();
  const { data: rows = [], isLoading } = useListSystemSettings();
  const upsert = useUpsertSystemSetting();
  const [v, setV] = useState<SettingsValue>(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const r = rows.find(r => r.key === 'tenant.settings');
    if (r && typeof r.value === 'object' && r.value !== null) {
      const stored = r.value as Partial<SettingsValue>;
      setV({
        ...DEFAULTS,
        ...stored,
        musicPaths: { ...DEFAULTS.musicPaths, ...(stored.musicPaths ?? {}) },
      });
    }
  }, [rows]);

  const onSave = async () => {
    setSaved(false);
    setError(null);
    try {
      await upsert.mutateAsync({ data: { key: 'tenant.settings', value: v } });
      await qc.invalidateQueries({ queryKey: getListSystemSettingsQueryKey() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore salvataggio impostazioni');
    }
  };

  const setMusic = async (key: keyof MusicPaths, objectPath: string) => {
    const next = { ...v, musicPaths: { ...v.musicPaths, [key]: objectPath } };
    setV(next);
    try {
      await upsert.mutateAsync({ data: { key: 'tenant.settings', value: next } });
      await qc.invalidateQueries({ queryKey: getListSystemSettingsQueryKey() });
    } catch { /* silently ignore — user can retry with save button */ }
  };

  const clearMusic = async (key: keyof MusicPaths) => {
    setMusic(key, '');
  };

  const Field = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-2">{children}</div>
    </div>
  );

  return (
    <AdminLayout title={t('admin.settings')}>
      {isLoading ? (
        <div className="grid place-items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* ─── General settings ─────────────────────────────────────── */}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Brand color">
              <div className="flex items-center gap-3">
                <input type="color" value={v.brandColor} onChange={e => setV({ ...v, brandColor: e.target.value })} className="h-10 w-16 cursor-pointer rounded border border-border bg-transparent" />
                <input value={v.brandColor} onChange={e => setV({ ...v, brandColor: e.target.value })} className="flex-1 rounded-md border border-border bg-background/40 px-3 py-2 text-mono outline-none focus:border-primary" />
              </div>
            </Field>
            <Field label="Lingua di default">
              <div className="flex flex-wrap gap-2">
                {LOCALES.map(l => (
                  <button key={l.code} onClick={() => setV({ ...v, defaultLocale: l.code })}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-bold ${
                      v.defaultLocale === l.code ? 'border-primary bg-primary/15 text-primary' : 'border-border'
                    }`}>
                    {l.flag} · {l.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Modalità proiezione">
              <label className="flex items-center justify-between gap-4">
                <span className="text-sm">Ottimizza testo e contrasto per il proiettore</span>
                <input type="checkbox" checked={v.projectionMode} onChange={e => setV({ ...v, projectionMode: e.target.checked })} className="h-5 w-10 cursor-pointer accent-primary" />
              </label>
            </Field>
            <Field label="Rete offline-first">
              <label className="flex items-center justify-between gap-4">
                <span className="text-sm">Avvia gameplay senza connessione internet</span>
                <input type="checkbox" checked={v.offlineFirst} onChange={e => setV({ ...v, offlineFirst: e.target.checked })} className="h-5 w-10 cursor-pointer accent-primary" />
              </label>
            </Field>
          </div>

          {/* ─── Music upload ─────────────────────────────────────────── */}
          <div className="mt-8">
            <div className="mb-4 flex items-center gap-3">
              <Music className="h-5 w-5 text-primary" />
              <div>
                <div className="font-black uppercase tracking-widest text-sm text-primary">Musica per ogni gioco</div>
                <div className="text-xs text-muted-foreground mt-0.5">Carica un file MP3/OGG/WAV direttamente dal tuo computer — viene salvato sullo storage dell'app.</div>
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
                  currentPath={v.musicPaths[slot.key]}
                  onUploaded={path => void setMusic(slot.key, path)}
                  onClear={() => void clearMusic(slot.key)}
                />
              ))}
            </div>
          </div>

          {/* ─── Percorso challenge music ───────────────────────────────── */}
          <div className="mt-8">
            <div className="mb-4 flex items-center gap-3">
              <span className="text-xl">⚡</span>
              <div>
                <div className="font-black uppercase tracking-widest text-sm" style={{ color: '#F5B642' }}>Musica per tipo di sfida (Percorso)</div>
                <div className="text-xs text-muted-foreground mt-0.5">Ogni tipo di sfida può avere la sua musica personalizzata. Lascia vuoto per usare la musica generale del Percorso.</div>
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
                  currentPath={v.musicPaths[slot.key] ?? ''}
                  onUploaded={path => void setMusic(slot.key, path)}
                  onClear={() => void clearMusic(slot.key)}
                />
              ))}
            </div>
          </div>

          {/* ─── Jonny Co-Host ──────────────────────────────────────────── */}
          <div className="mt-8 rounded-2xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-4 px-5 py-4" style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.08), rgba(20,15,40,0.5))' }}>
              <JonnyAvatar mood={isHostedByJonny ? 'excited' : 'idle'} size={56} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-display font-black text-sm tracking-wide" style={{ color: '#D4AF37' }}>JONNY</span>
                  <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-widest"
                    style={{ borderColor: 'rgba(212,175,55,0.4)', color: '#D4AF37' }}>CO-HOST</span>
                </div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  Jonny appare sui telefoni dei giocatori come co-host animato durante onboarding, attesa, gioco e vittoria.
                </div>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2">
                <span className="text-xs text-muted-foreground">{isHostedByJonny ? 'Attivo' : 'Disattivo'}</span>
                <div
                  onClick={() => setIsHostedByJonny(!isHostedByJonny)}
                  className="relative h-6 w-11 rounded-full transition-colors"
                  style={{ background: isHostedByJonny ? '#D4AF37' : 'rgba(255,255,255,0.15)', cursor: 'pointer' }}
                >
                  <div
                    className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
                    style={{ transform: isHostedByJonny ? 'translateX(20px)' : 'translateX(2px)' }}
                  />
                </div>
              </label>
            </div>
            {isHostedByJonny && (
              <div className="border-t border-border/50 px-5 py-4 space-y-3">
                <div>
                  <div className="mb-2 text-[10px] font-bold tracking-widest" style={{ color: '#D4AF37' }}>MODALITÀ</div>
                  <div className="flex gap-2">
                    {(['live', 'home'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setJonnyMode(m)}
                        className="flex-1 rounded-xl border px-3 py-2 text-xs font-bold transition-colors"
                        style={{
                          borderColor: jonnyMode === m ? '#D4AF37' : 'rgba(255,255,255,0.12)',
                          background: jonnyMode === m ? 'rgba(212,175,55,0.12)' : 'transparent',
                          color: jonnyMode === m ? '#D4AF37' : 'var(--muted-foreground)',
                        }}
                      >
                        {m === 'live' ? '🎤 LIVE — co-host' : '🏠 HOME — game master'}
                      </button>
                    ))}
                  </div>
                  <div className="mt-1.5 text-[11px] text-muted-foreground">
                    {jonnyMode === 'live'
                      ? 'Jonny affianca l\'animatore umano: messaggi di supporto, feedback, attesa.'
                      : 'Jonny è il game master autonomo (placeholder — AI automation non ancora attiva).'}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground border-t border-border/30 pt-3">
                  Attivabile via URL: <code className="rounded bg-card/80 px-1 py-0.5 font-mono" style={{ color: '#D4AF37' }}>?jonny=1</code>
                </div>
              </div>
            )}
          </div>

          {error && <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
          <div className="mt-6 flex items-center justify-end gap-3">
            {saved && <span className="text-sm text-emerald-400">Salvato.</span>}
            <button
              disabled={upsert.isPending}
              onClick={onSave}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50"
            >
              {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {t('common.save')}
            </button>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
