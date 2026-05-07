import { useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { useT, LOCALES } from '@/i18n';
import { STRINGS } from '@/i18n/strings';
import { Search } from 'lucide-react';

export default function Translations() {
  const t = useT();
  const [q, setQ] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);

  const keys = Object.keys(STRINGS.it);
  const filtered = keys.filter(k => {
    if (q && !k.toLowerCase().includes(q.toLowerCase())) return false;
    if (missingOnly) {
      const hasMissing = LOCALES.some(l => !STRINGS[l.code]?.[k]);
      if (!hasMissing) return false;
    }
    return true;
  });

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

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full">
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
                  const v = STRINGS[l.code]?.[k];
                  return (
                    <td key={l.code} className="px-5 py-3">
                      <input
                        defaultValue={v ?? ''}
                        placeholder={v ? '' : '— missing —'}
                        className={`w-full rounded-md border bg-background/40 px-2 py-1.5 text-sm outline-none focus:border-primary ${
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
    </AdminLayout>
  );
}
