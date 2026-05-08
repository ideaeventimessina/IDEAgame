import { useState, useMemo } from 'react';
import { AdminLayout } from './AdminLayout';
import { useT, LOCALES } from '@/i18n';
import { STRINGS } from '@/i18n/strings';
import { Search, Loader2 } from 'lucide-react';
import { useListTranslations, useUpsertTranslation, getListTranslationsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

export default function Translations() {
  const t = useT();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useListTranslations();
  const upsert = useUpsertTranslation();
  const [q, setQ] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);

  // Build map: key -> { locale -> value }
  const overrides = useMemo(() => {
    const m: Record<string, Record<string, string>> = {};
    for (const r of rows) {
      if (!m[r.key]) m[r.key] = {};
      m[r.key]![r.locale] = r.value;
    }
    return m;
  }, [rows]);

  const keys = Object.keys(STRINGS.it);
  const filtered = keys.filter(k => {
    if (q && !k.toLowerCase().includes(q.toLowerCase())) return false;
    if (missingOnly) {
      const hasMissing = LOCALES.some(l => !(STRINGS as any)[l.code]?.[k] && !overrides[k]?.[l.code]);
      if (!hasMissing) return false;
    }
    return true;
  });

  async function save(key: string, locale: string, value: string) {
    if (!value) return;
    const original = (STRINGS as any)[locale]?.[key] ?? '';
    if (value === original && !overrides[key]?.[locale]) return;
    await upsert.mutateAsync({ data: { key, locale, value } });
    qc.invalidateQueries({ queryKey: getListTranslationsQueryKey() });
  }

  return (
    <AdminLayout title={t('admin.translations')}>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('translations.search_keys')} className="w-full bg-transparent outline-none" />
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-sm">
          <input type="checkbox" checked={missingOnly} onChange={e => setMissingOnly(e.target.checked)} />
          {t('translations.show_missing')}
        </label>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Key</th>
                {LOCALES.map(l => <th key={l.code} className="px-5 py-3">{l.flag}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map(k => (
                <tr key={k} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 text-mono text-xs text-muted-foreground">{k}</td>
                  {LOCALES.map(l => {
                    const v = overrides[k]?.[l.code] ?? (STRINGS as any)[l.code]?.[k];
                    const isOverride = overrides[k]?.[l.code] !== undefined;
                    return (
                      <td key={l.code} className="px-5 py-3">
                        <input
                          defaultValue={v ?? ''}
                          placeholder={v ? '' : '— missing —'}
                          onBlur={e => save(k, l.code, e.target.value)}
                          className={`w-full rounded-md border bg-background/40 px-2 py-1.5 text-sm outline-none focus:border-primary ${
                            isOverride ? 'border-primary/50 bg-primary/5' :
                            v ? 'border-border' : 'border-destructive/40 placeholder:text-destructive'
                          }`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
      <div className="mt-3 text-xs text-muted-foreground">
        Edits saved on blur. Highlighted rows have DB overrides over the bundled defaults.
      </div>
    </AdminLayout>
  );
}
