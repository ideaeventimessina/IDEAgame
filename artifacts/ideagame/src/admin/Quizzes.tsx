import { useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { useT, LOCALES } from '@/i18n';
import { Plus, Trash2, Search, Loader2 } from 'lucide-react';
import {
  useListQuestions, useCreateQuestion, useDeleteQuestion,
  getListQuestionsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

export default function Quizzes() {
  const t = useT();
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useListQuestions();
  const create = useCreateQuestion();
  const del = useDeleteQuestion();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = items.filter(it => {
    if (!q) return true;
    const lower = q.toLowerCase();
    return it.category.toLowerCase().includes(lower) ||
      Object.values(it.prompts as Record<string, string>).some(p => p.toLowerCase().includes(lower));
  });

  const refresh = () => qc.invalidateQueries({ queryKey: getListQuestionsQueryKey() });

  return (
    <AdminLayout title={t('admin.quizzes')}>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('admin.search')}
                 className="w-full bg-transparent outline-none" />
        </div>
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">
          <Plus className="h-4 w-4" /> {t('admin.add')}
        </button>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
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
              {filtered.map(it => {
                const prompts = it.prompts as Record<string, string>;
                return (
                  <tr key={it.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                    <td className="px-5 py-4 text-display font-bold">{prompts.it ?? prompts.en ?? Object.values(prompts)[0]}</td>
                    <td className="px-5 py-4">{it.category}</td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold uppercase">{it.difficulty}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-1">
                        {LOCALES.filter(l => prompts[l.code]).map(l => (
                          <span key={l.code} className="rounded-md bg-primary/15 px-2 py-0.5 text-mono text-xs font-bold text-primary">{l.flag}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={async () => { if (confirm('Delete?')) { await del.mutateAsync({ id: it.id }); refresh(); } }}
                        className="rounded-lg border border-border p-2 hover-elevate text-destructive"
                      ><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-muted-foreground">No questions.</td></tr>}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {open && <NewQuestionDialog onClose={() => setOpen(false)} onCreate={async (data) => { await create.mutateAsync({ data }); refresh(); }} />}
    </AdminLayout>
  );
}

function NewQuestionDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (d: any) => Promise<void> }) {
  const [category, setCategory] = useState('Generale');
  const [difficulty, setDifficulty] = useState('medium');
  const [promptIt, setPromptIt] = useState('');
  const [promptEn, setPromptEn] = useState('');
  const [opts, setOpts] = useState(['', '', '', '']);
  const [correct, setCorrect] = useState(0);
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-xl overflow-auto rounded-2xl border border-border bg-card p-6" onClick={e => e.stopPropagation()}>
        <div className="text-display text-2xl font-black">New question</div>
        <div className="mt-4 grid gap-3">
          <input placeholder="Category" value={category} onChange={e => setCategory(e.target.value)}
                 className="rounded-lg border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary" />
          <select value={difficulty} onChange={e => setDifficulty(e.target.value)}
                  className="rounded-lg border border-border bg-background/40 px-3 py-2">
            <option value="easy">easy</option><option value="medium">medium</option><option value="hard">hard</option>
          </select>
          <input placeholder="Prompt (it)" value={promptIt} onChange={e => setPromptIt(e.target.value)}
                 className="rounded-lg border border-border bg-background/40 px-3 py-2 text-display font-bold outline-none focus:border-primary" />
          <input placeholder="Prompt (en)" value={promptEn} onChange={e => setPromptEn(e.target.value)}
                 className="rounded-lg border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary" />
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Options (mark the correct one)</div>
          {opts.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" checked={correct === i} onChange={() => setCorrect(i)} />
              <input value={o} onChange={e => setOpts(opts.map((x, j) => j === i ? e.target.value : x))}
                     placeholder={`Option ${i + 1}`}
                     className={`flex-1 rounded-lg border px-3 py-2 outline-none ${correct === i ? 'border-primary bg-primary/10' : 'border-border bg-background/40'}`} />
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl border border-border px-4 py-2">Cancel</button>
          <button
            disabled={busy || !promptIt || opts.some(o => !o)}
            onClick={async () => {
              setBusy(true);
              try {
                await onCreate({
                  category, difficulty, timeLimit: 25, correctIndex: correct,
                  prompts: { it: promptIt, en: promptEn || promptIt },
                  options: opts.map(o => ({ it: o, en: o })),
                });
                onClose();
              } finally { setBusy(false); }
            }}
            className="rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50"
          >{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
