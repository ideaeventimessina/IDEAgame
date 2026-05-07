import { useState, type ReactNode } from 'react';
import { AdminLayout } from './AdminLayout';
import { useT, LOCALES } from '@/i18n';

export default function Settings() {
  const t = useT();
  const [brand, setBrand] = useState('#F5B642');
  const [name, setName] = useState('Mango Events');
  const [defaultLocale, setDefaultLocale] = useState('it');
  const [projection, setProjection] = useState(true);
  const [offline, setOffline] = useState(true);

  const Field = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-2">{children}</div>
    </div>
  );

  return (
    <AdminLayout title={t('admin.settings')}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Tenant name">
          <input value={name} onChange={e => setName(e.target.value)} className="w-full rounded-md border border-border bg-background/40 px-3 py-2 text-display text-lg font-bold outline-none focus:border-primary" />
        </Field>
        <Field label="Brand color">
          <div className="flex items-center gap-3">
            <input type="color" value={brand} onChange={e => setBrand(e.target.value)} className="h-10 w-16 cursor-pointer rounded border border-border bg-transparent" />
            <input value={brand} onChange={e => setBrand(e.target.value)} className="flex-1 rounded-md border border-border bg-background/40 px-3 py-2 text-mono outline-none focus:border-primary" />
          </div>
        </Field>
        <Field label="Default language">
          <div className="flex flex-wrap gap-2">
            {LOCALES.map(l => (
              <button key={l.code} onClick={() => setDefaultLocale(l.code)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-bold ${
                  defaultLocale === l.code ? 'border-primary bg-primary/15 text-primary' : 'border-border'
                }`}>
                {l.flag} · {l.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Projection mode">
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm">Optimize text & contrast for projection</span>
            <input type="checkbox" checked={projection} onChange={e => setProjection(e.target.checked)} className="h-5 w-10 cursor-pointer accent-primary" />
          </label>
        </Field>
        <Field label="Offline-first network">
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm">Run gameplay without internet</span>
            <input type="checkbox" checked={offline} onChange={e => setOffline(e.target.checked)} className="h-5 w-10 cursor-pointer accent-primary" />
          </label>
        </Field>
        <Field label="Logo">
          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border bg-background/40 text-sm text-muted-foreground">
            Drop SVG/PNG here
          </div>
        </Field>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button className="rounded-xl border border-border px-4 py-2 hover-elevate">{t('common.cancel')}</button>
        <button className="rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground">{t('common.save')}</button>
      </div>
    </AdminLayout>
  );
}
