import { useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { useT } from '@/i18n';
import { Image as ImageIcon, Music, Video, Upload, Trash2, Loader2 } from 'lucide-react';
import {
  useListMedia, useCreateMedia, useDeleteMedia,
  getListMediaQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

const ICON = { image: ImageIcon, audio: Music, video: Video } as const;

export default function Media() {
  const t = useT();
  const qc = useQueryClient();
  const { data: media = [], isLoading } = useListMedia();
  const create = useCreateMedia();
  const del = useDeleteMedia();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', kind: 'image' as 'image' | 'audio' | 'video', url: '', tags: '' });

  const refresh = () => qc.invalidateQueries({ queryKey: getListMediaQueryKey() });

  return (
    <AdminLayout title={t('admin.media')}>
      <div className="mb-4 flex justify-end">
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">
          <Upload className="h-4 w-4" /> Add media
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
                <div className="flex h-32 items-center justify-center rounded-xl"
                     style={{ background: `linear-gradient(135deg, ${tone}33, transparent)`, color: tone }}>
                  <I className="h-12 w-12" />
                </div>
                <div className="mt-4 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-display text-lg font-bold truncate">{m.name}</div>
                    <div className="text-mono text-xs text-muted-foreground truncate">{m.url}</div>
                  </div>
                  <button
                    onClick={async () => { if (confirm('Delete?')) { await del.mutateAsync({ id: m.id }); refresh(); } }}
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
            <div className="col-span-full text-center text-sm text-muted-foreground py-10">No media yet.</div>
          )}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6" onClick={e => e.stopPropagation()}>
            <div className="text-display text-2xl font-black">Add media</div>
            <div className="mt-4 space-y-3">
              <input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                     className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary" />
              <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as any })}
                      className="w-full rounded-lg border border-border bg-background/40 px-3 py-2">
                <option value="image">image</option><option value="audio">audio</option><option value="video">video</option>
              </select>
              <input placeholder="URL" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })}
                     className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-mono outline-none focus:border-primary" />
              <input placeholder="Tags (comma separated)" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })}
                     className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary" />
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="rounded-xl border border-border px-4 py-2">Cancel</button>
              <button
                disabled={create.isPending || !form.name || !form.url}
                onClick={async () => {
                  await create.mutateAsync({ data: { name: form.name, kind: form.kind, url: form.url, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean), sizeBytes: 0 } });
                  setOpen(false);
                  refresh();
                }}
                className="rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50"
              >{create.isPending ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
