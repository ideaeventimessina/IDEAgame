import { useRef, useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { useT } from '@/i18n';
import { Image as ImageIcon, Music, Video, Upload, Trash2, Loader2, Link } from 'lucide-react';
import {
  useListMedia, useCreateMedia, useDeleteMedia,
  getListMediaQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

const ICON = { image: ImageIcon, audio: Music, video: Video } as const;

type MediaKind = 'image' | 'audio' | 'video';

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
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', kind: 'image' as MediaKind, url: '', tags: '' });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');

  const refresh = () => qc.invalidateQueries({ queryKey: getListMediaQueryKey() });

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
    await create.mutateAsync({ data: {
      name: form.name,
      kind: form.kind,
      url: form.url,
      tags: form.tags.split(',').map(tg => tg.trim()).filter(Boolean),
      sizeBytes: 0,
    }});
    setOpen(false);
    setForm({ name: '', kind: 'image', url: '', tags: '' });
    setUploadError(null);
    refresh();
  };

  return (
    <AdminLayout title={t('admin.media')}>
      <div className="mb-4 flex justify-end">
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">
          <Upload className="h-4 w-4" /> Aggiungi media
        </button>
      </div>
      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {media.map(m => {
            const I = ICON[m.kind as keyof typeof ICON] ?? ImageIcon;
            const tone = m.kind === 'image' ? '#F5B642' : m.kind === 'audio' ? '#9B5DE5' : '#00F5A0';
            return (
              <div key={m.id} className="rounded-2xl border border-border bg-card p-5">
                {m.kind === 'image' && m.url ? (
                  <div className="flex h-32 items-center justify-center rounded-xl overflow-hidden bg-secondary/30">
                    <img src={m.url} alt={m.name} className="h-full w-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                ) : (
                  <div className="flex h-32 items-center justify-center rounded-xl"
                       style={{ background: `linear-gradient(135deg, ${tone}33, transparent)`, color: tone }}>
                    <I className="h-12 w-12" />
                  </div>
                )}
                <div className="mt-4 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-display text-lg font-bold truncate">{m.name}</div>
                    <div className="text-mono text-xs text-muted-foreground truncate">{m.url}</div>
                  </div>
                  <button
                    onClick={async () => { if (confirm('Eliminare questo media?')) { await del.mutateAsync({ id: m.id }); refresh(); } }}
                    className="rounded-lg border border-border p-1.5 hover-elevate text-destructive"
                  ><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {(m.tags ?? []).map((tg: string) => (
                    <span key={tg} className="rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold">{tg}</span>
                  ))}
                </div>
              </div>
            );
          })}
          {media.length === 0 && (
            <div className="col-span-full text-center text-sm text-muted-foreground py-10">Nessun media ancora.</div>
          )}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-display text-2xl font-black mb-4">Aggiungi media</div>

            {/* Tab switcher */}
            <div className="flex gap-1 mb-4 rounded-xl border border-border bg-secondary/30 p-1">
              <button
                onClick={() => setUploadMode('file')}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-1.5 text-sm font-semibold transition-all ${uploadMode === 'file' ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}
              >
                <Upload className="h-3.5 w-3.5" /> Upload file
              </button>
              <button
                onClick={() => setUploadMode('url')}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-1.5 text-sm font-semibold transition-all ${uploadMode === 'url' ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}
              >
                <Link className="h-3.5 w-3.5" /> Incolla URL
              </button>
            </div>

            <div className="space-y-3">
              {uploadMode === 'file' ? (
                <div>
                  <input ref={fileInputRef} type="file" accept="image/*,audio/*,video/*" onChange={handleFileChange} className="hidden" />
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
