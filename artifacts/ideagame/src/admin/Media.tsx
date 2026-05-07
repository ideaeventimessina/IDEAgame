import { AdminLayout } from './AdminLayout';
import { MEDIA } from '@/data/mock';
import { useT } from '@/i18n';
import { Image as ImageIcon, Music, Video, Upload } from 'lucide-react';

const ICON = { image: ImageIcon, audio: Music, video: Video } as const;

export default function Media() {
  const t = useT();
  return (
    <AdminLayout title={t('admin.media')}>
      <div className="mb-4 flex justify-end">
        <button className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">
          <Upload className="h-4 w-4" /> Upload
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MEDIA.map(m => {
          const I = ICON[m.kind];
          const tone = m.kind === 'image' ? '#F5B642' : m.kind === 'audio' ? '#9B5DE5' : '#00F5A0';
          return (
            <div key={m.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex h-32 items-center justify-center rounded-xl"
                   style={{ background: `linear-gradient(135deg, ${tone}33, transparent)`, color: tone }}>
                <I className="h-12 w-12" />
              </div>
              <div className="mt-4 text-display text-lg font-bold">{m.name}</div>
              <div className="text-mono text-xs text-muted-foreground">{m.url}</div>
              <div className="mt-3 flex flex-wrap gap-1">
                {m.tags.map(tg => (
                  <span key={tg} className="rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold">{tg}</span>
                ))}
              </div>
              <div className="mt-3 text-xs text-muted-foreground">Used {m.usageCount}×</div>
            </div>
          );
        })}
      </div>
    </AdminLayout>
  );
}
