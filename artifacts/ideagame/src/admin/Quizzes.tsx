import { useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { QUESTIONS } from '@/data/mock';
import { useT, LOCALES } from '@/i18n';
import { Plus, Pencil, Search } from 'lucide-react';
import type { Question } from '@/data/types';

export default function Quizzes() {
  const t = useT();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Question | null>(null);

  const items = QUESTIONS.filter(it =>
    !q || it.translations.it.prompt.toLowerCase().includes(q.toLowerCase()) ||
    it.category.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <AdminLayout title={t('admin.quizzes')}>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('admin.search')}
                 className="w-full bg-transparent outline-none" />
        </div>
        <button className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">
          <Plus className="h-4 w-4" /> {t('admin.add')}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full">
          <thead className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-5 py-3">{t('quiz.prompt_it')}</th>
              <th className="px-5 py-3">{t('quiz.category')}</th>
              <th className="px-5 py-3">{t('quiz.difficulty')}</th>
              <th className="px-5 py-3">{t('quiz.languages')}</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.map(it => (
              <tr key={it.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                <td className="px-5 py-4 text-display font-bold">{it.translations.it.prompt}</td>
                <td className="px-5 py-4">{it.category}</td>
                <td className="px-5 py-4">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold uppercase">{it.difficulty}</span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex gap-1">
                    {LOCALES.map(l => (
                      <span key={l.code} className="rounded-md bg-primary/15 px-2 py-0.5 text-mono text-xs font-bold text-primary">{l.flag}</span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-4 text-right">
                  <button onClick={() => setEdit(it)} className="rounded-lg border border-border p-2 hover-elevate">
                    <Pencil className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={() => setEdit(null)}>
          <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-2xl border border-border bg-card p-6" onClick={e => e.stopPropagation()}>
            <div className="text-display text-2xl font-black">Edit question</div>
            <div className="mt-1 text-sm text-muted-foreground">Multi-language editor</div>
            <div className="mt-5 space-y-4">
              {LOCALES.map(l => {
                const tr = edit.translations[l.code] ?? edit.translations.it;
                return (
                  <div key={l.code} className="rounded-xl border border-border bg-background/40 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded-md bg-primary/15 px-2 py-0.5 text-mono text-xs font-bold text-primary">{l.flag}</span>
                      <span className="font-bold">{l.label}</span>
                    </div>
                    <input defaultValue={tr.prompt} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-display text-lg font-bold outline-none focus:border-primary" />
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {tr.options.map((opt, i) => (
                        <input key={i} defaultValue={opt}
                               className={`rounded-lg border px-3 py-2 outline-none ${
                                 i === tr.correctIndex ? 'border-primary bg-primary/10' : 'border-border bg-card'
                               }`} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setEdit(null)} className="rounded-xl border border-border px-4 py-2 hover-elevate">{t('common.cancel')}</button>
              <button onClick={() => setEdit(null)} className="rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground">{t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
