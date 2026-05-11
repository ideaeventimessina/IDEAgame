import { useRef, useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { useT } from '@/i18n';
import { Image as ImageIcon, Music, Video, Upload, Trash2, Loader2, Link, Search } from 'lucide-react';
import {
  useListMedia, useCreateMedia, useDeleteMedia,
  getListMediaQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

const ICON = { image: ImageIcon, audio: Music, video: Video } as const;
type MediaKind = 'image' | 'audio' | 'video';

const GAME_SLOTS = [
  { key: 'all',               label: 'Tutti',               emoji: '📁', kinds: ['image','audio','video'] as MediaKind[] },
  { key: 'gioco-coppie',      label: 'Gioco delle Coppie',  emoji: '🃏', kinds: ['image'] as MediaKind[] },
  { key: 'percorso-a-risate', label: 'Percorso a Risate',   emoji: '⚡', kinds: ['image','video'] as MediaKind[] },
  { key: 'karaoke-battle',    label: 'Karaoke Battle',      emoji: '🎤', kinds: ['audio','video'] as MediaKind[] },
  { key: 'quizzone',          label: 'Quizzone',            emoji: '❓', kinds: ['image','video'] as MediaKind[] },
  { key: 'sfida-ballo',       label: 'Sfida di Ballo',      emoji: '💃', kinds: ['audio'] as MediaKind[] },
  { key: 'altro',             label: 'Altro',               emoji: '🗂', kinds: ['image','audio','video'] as MediaKind[] },
];

async function uploadFileToStorage(file: File): Promise<string> {
  const res = await fetch('/api/storage/uploads/request-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || 'application/octet-stream' }),
  });
  if (!res.ok) throw new Error('Errore ottenimento URL di upload');
  const { uploadURL, objectPath } = await res.json() as { uploadURL: string; objectPath: string };

  await fetch(uploadURL, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  });

  return `/api/storage${objectPath}`;
}

export default function Media() {
  const t = useT();
  const qc = useQueryClient();
  const { data: media = [], isLoading } = useListMedia();
  const create = useCreateMedia();
  const del = useDeleteMedia();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeSlot, setActiveSlot] = useState('all');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', kind: 'image' as MediaKind, url: '', tags: '' });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');

  const refresh = () => qc.invalidateQueries({ queryKey: getListMediaQueryKey() });
  const slot = GAME_SLOTS.find(s => s.key === activeSlot) ?? GAME_SLOTS[0]!;

  const filtered = media.filter(m => {
    const tags: string[] = (m.tags ?? []) as string[];
    const matchSlot = activeSlot === 'all' || tags.includes(activeSlot);
    const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase());
    return matchSlot && matchSearch;
  });

  const openAddModal = () => {
    const defaultKind = slot.kinds[0] ?? 'image';
    const defaultTag = activeSlot !== 'all' ? activeSlot : '';
    setForm({ name: '', kind: defaultKind, url: '', tags: defaultTag });
    setUploadMode('file');
    setUploadError(null);
    setOpen(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadFileToStorage(file);
      const kind: MediaKind = file.type.startsWith('audio') ? 'audio' : file.type.startsWith('video') ? 'video' : 'image';
      setForm(f => ({ ...f, url, kind, name: f.name || file.name.replace(/\.[^.]+$/, '') }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload fallito');
    } finally {
      setUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.url) return;
    const tags = form.tags.split(',').map(tg => tg.trim()).filter(Boolean);
    await create.mutateAsync({ data: { name: form.name, kind: form.kind, url: form.url, tags, sizeBytes: 0 } });
    setOpen(false);
    setForm({ name: '', kind: 'image', url: '', tags: '' });
    setUploadError(null);
    refresh();
  };

  return (
    <AdminLayout title={t('admin.media')}>

      {/* Game slot tabs */}
      <div className="mb-5 flex flex-wrap gap-2">
        {GAME_SLOTS.map(s => {
          const count = s.key === 'all' ? media.length : media.filter(m => ((m.tags ?? []) as string[]).includes(s.key)).length;
          return (
            <button key={s.key} onClick={() => setActiveSlot(s.key)}
              className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all"
              style={{
                borderColor: activeSlot === s.key ? 'var(--primary)' : 'var(--border)',
                background: activeSlot === s.key ? 'rgba(245,182,66,0.12)' : 'transparent',
                color: activeSlot === s.key ? 'var(--primary)' : 'var(--muted-foreground)',
              }}>
              {s.emoji} {s.label}
              <span className="ml-1 rounded-md bg-secondary/60 px-1.5 py-0.5 text-[10px]">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca per nome…"
            className="w-full rounded-xl border border-border bg-background/40 pl-9 pr-4 py-2 text-sm outline-none focus:border-primary" />
        </div>
        <button onClick={openAddModal}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground whitespace-nowrap">
          <Upload className="h-4 w-4" />
          {activeSlot !== 'all' ? `+ ${slot.emoji} ${slot.label}` : 'Aggiungi media'}
        </button>
      </div>
      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(m => {
            const I = ICON[m.kind as keyof typeof ICON] ?? ImageIcon;
            const tone = m.kind === 'image' ? '#F5B642' : m.kind === 'audio' ? '#9B5DE5' : '#00F5A0';
            const tags: string[] = (m.tags ?? []) as string[];
            const gameTag = GAME_SLOTS.find(s => s.key !== 'all' && tags.includes(s.key));
            return (
              <div key={m.id} className="rounded-2xl border border-border bg-card overflow-hidden group">
                {m.kind === 'image' && m.url ? (
                  <div className="flex h-36 items-center justify-center overflow-hidden bg-secondary/30">
                    <img src={m.url} alt={m.name} className="h-full w-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                ) : m.kind === 'audio' && m.url ? (
                  <div className="flex h-36 flex-col items-center justify-center gap-2 px-4"
                    style={{ background: `linear-gradient(135deg,${tone}22,transparent)`, color: tone }}>
                    <I className="h-9 w-9" />
                    <audio controls src={m.url} className="w-full h-8" style={{ colorScheme: 'dark' }} />
                  </div>
                ) : m.kind === 'video' && m.url ? (
                  <div className="h-36 overflow-hidden bg-black">
                    <video src={m.url} className="w-full h-full object-cover" muted />
                  </div>
                ) : (
                  <div className="flex h-36 items-center justify-center"
                    style={{ background: `linear-gradient(135deg,${tone}33,transparent)`, color: tone }}>
                    <I className="h-12 w-12" />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-display font-bold truncate">{m.name}</div>
                      {gameTag && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-secondary/60 px-1.5 py-0.5 text-[10px] font-bold">
                          {gameTag.emoji} {gameTag.label}
                        </span>
                      )}
                    </div>
                    <button onClick={async () => { if (confirm('Eliminare?')) { await del.mutateAsync({ id: m.id }); refresh(); } }}
                      className="rounded-lg border border-border p-1.5 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tags.filter(tg => !GAME_SLOTS.some(s => s.key === tg)).map(tg => (
                      <span key={tg} className="rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold">{tg}</span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-border bg-card/40 py-16 text-center">
              <div className="text-4xl mb-2">{slot.emoji}</div>
              <div className="text-sm text-muted-foreground">
                {search ? `Nessun risultato per "${search}"` : `Nessun media per ${slot.label} ancora.`}
              </div>
              <button onClick={openAddModal}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary/15 border border-primary/40 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/25">
                <Upload className="h-3.5 w-3.5" /> Aggiungi il primo
              </button>
            </div>
          )}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-display text-2xl font-black mb-1">Aggiungi media</div>
            {activeSlot !== 'all' && (
              <div className="mb-3 text-sm text-muted-foreground">
                Sezione: <span className="font-bold text-primary">{slot.emoji} {slot.label}</span>
              </div>
            )}

            <div className="flex gap-1 mb-4 rounded-xl border border-border bg-secondary/30 p-1">
              <button onClick={() => setUploadMode('file')}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-1.5 text-sm font-semibold transition-all ${uploadMode === 'file' ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}>
                <Upload className="h-3.5 w-3.5" /> Upload file
              </button>
              <button onClick={() => setUploadMode('url')}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-1.5 text-sm font-semibold transition-all ${uploadMode === 'url' ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}>
                <Link className="h-3.5 w-3.5" /> Incolla URL
              </button>
            </div>

            <div className="space-y-3">
              {uploadMode === 'file' ? (
                <div>
                  <input ref={fileInputRef} type="file"
                    accept={slot.kinds.map(k => k === 'image' ? 'image/*' : k === 'audio' ? 'audio/*' : 'video/*').join(',')}
                    onChange={handleFileChange} className="hidden" />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-secondary/20 py-8 hover:border-primary hover:bg-primary/5 transition-all disabled:opacity-50"
                  >
                    {uploading ? (
                      <><Loader2 className="h-6 w-6 animate-spin text-primary" /><span className="text-sm text-muted-foreground">Upload in corso…</span></>
                    ) : (
                      <><Upload className="h-6 w-6 text-muted-foreground" /><span className="text-sm text-muted-foreground">Clicca per scegliere un file</span><span className="text-xs text-muted-foreground/60">Immagini, audio, video</span></>
                    )}
                  </button>
                  {form.url && (
                    <div className="mt-2 rounded-lg bg-green-500/10 border border-green-500/30 px-3 py-2 text-xs text-green-400 break-all">
                      ✓ {form.url}
                    </div>
                  )}
                  {uploadError && (
                    <div className="mt-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">{uploadError}</div>
                  )}
                </div>
              ) : (
                <input placeholder="https://…" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })}
                       className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-mono text-sm outline-none focus:border-primary" />
              )}

              <input placeholder="Nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                     className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary" />
              <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as MediaKind })}
                      className="w-full rounded-lg border border-border bg-background/40 px-3 py-2">
                <option value="image">🖼 Immagine</option>
                <option value="audio">🎵 Audio</option>
                <option value="video">🎬 Video</option>
              </select>
              <input placeholder="Tag (separati da virgola)" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })}
                     className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary" />
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => { setOpen(false); setUploadError(null); }} className="rounded-xl border border-border px-4 py-2 hover-elevate">Annulla</button>
              <button
                disabled={create.isPending || uploading || !form.name || !form.url}
                onClick={handleSave}
                className="rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50"
              >{create.isPending ? 'Salvo…' : 'Salva'}</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
