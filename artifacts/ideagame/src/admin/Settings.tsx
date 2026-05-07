import { useEffect, useState, type ReactNode } from 'react';
import { AdminLayout } from './AdminLayout';
import { useT, LOCALES } from '@/i18n';
import { Loader2 } from 'lucide-react';
import {
  useListSystemSettings, useUpsertSystemSetting, getListSystemSettingsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

type SettingsValue = {
  brandColor: string;
  defaultLocale: string;
  projectionMode: boolean;
  offlineFirst: boolean;
};

const DEFAULTS: SettingsValue = {
  brandColor: '#F5B642',
  defaultLocale: 'it',
  projectionMode: true,
  offlineFirst: true,
};

export default function Settings() {
  const t = useT();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useListSystemSettings();
  const upsert = useUpsertSystemSetting();
  const [v, setV] = useState<SettingsValue>(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const r = rows.find(r => r.key === 'tenant.settings');
    if (r && typeof r.value === 'object' && r.value !== null) {
      setV({ ...DEFAULTS, ...(r.value as Partial<SettingsValue>) });
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
