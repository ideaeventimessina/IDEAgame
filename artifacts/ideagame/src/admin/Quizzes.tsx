import { useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { useT, LOCALES } from '@/i18n';
import { Plus, Trash2, Search, Loader2, Eye } from 'lucide-react';
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

      {filtered.length > 0 && (
        <QuizSlidePreview items={filtered} />
      )}

      {open && <NewQuestionDialog onClose={() => setOpen(false)} onCreate={async (data) => { await create.mutateAsync({ data }); refresh(); }} />}
    </AdminLayout>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   QUIZ SLIDE PREVIEW
══════════════════════════════════════════════════════════════════════════ */
interface QuizItem {
  id: string; category: string; difficulty: string; timeLimit?: number | null;
  correctIndex?: number | null; prompts: unknown; options?: unknown;
}
function QuizSlidePreview({ items }: { items: QuizItem[] }) {
  const [idx, setIdx] = useState(0);
  const safeIdx = Math.min(idx, items.length - 1);
  const item = items[safeIdx]!;
  const prompts = item.prompts as Record<string, string>;
  const options = (item.options ?? []) as Array<Record<string, string>>;
  const correctIndex = (item.correctIndex ?? 0) as number;
  const question = prompts.it ?? prompts.en ?? Object.values(prompts)[0] ?? '';

  const OPTION_COLORS = ['#60a5fa', '#34d399', '#f472b6', '#fb923c'];
  const OPTION_LABELS = ['A', 'B', 'C', 'D'];

  return (
    <div className="mt-6 rounded-2xl border border-primary/20 bg-background/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
          <Eye className="h-3.5 w-3.5" /> Anteprima quiz
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={safeIdx === 0}
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-bold hover-elevate disabled:opacity-30">← Prec</button>
          <span className="text-xs text-muted-foreground font-mono">{safeIdx + 1} / {items.length}</span>
          <button onClick={() => setIdx(i => Math.min(items.length - 1, i + 1))} disabled={safeIdx === items.length - 1}
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-bold hover-elevate disabled:opacity-30">Succ →</button>
        </div>
      </div>

      {/* Slide */}
      <div className="relative flex flex-col items-center gap-5 px-8 py-10"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, #60a5fa18 0%, transparent 60%), linear-gradient(135deg, #0d0d0d 0%, #111 100%)' }}>

        {/* Hex bg */}
        <div className="absolute inset-0 overflow-hidden opacity-5 pointer-events-none select-none">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="absolute text-[140px] leading-none text-[#60a5fa]"
              style={{ top: `${(i % 2) * 50}%`, left: `${(i % 3) * 35}%` }}>⬡</div>
          ))}
        </div>

        {/* Category + difficulty */}
        <div className="relative z-10 flex items-center gap-3">
          <span className="rounded-full border border-[#60a5fa]/40 bg-[#60a5fa]/10 px-3 py-1 text-xs font-bold text-[#60a5fa] uppercase tracking-widest">
            {item.category}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/50 uppercase tracking-widest">
            {item.difficulty}
          </span>
        </div>

        {/* Question */}
        <div className="relative z-10 text-display text-2xl md:text-3xl font-black text-white text-center leading-snug max-w-2xl">
          {question}
        </div>

        {/* Options */}
        {options.length > 0 && (
          <div className="relative z-10 grid grid-cols-2 gap-3 w-full max-w-2xl">
            {options.map((opt, i) => {
              const text = opt.it ?? opt.en ?? Object.values(opt)[0] ?? `Opzione ${i + 1}`;
              const isCorrect = i === correctIndex;
              const color = OPTION_COLORS[i % OPTION_COLORS.length]!;
              return (
                <div key={i}
                  className="flex items-center gap-3 rounded-xl border-2 px-4 py-3 transition-all"
                  style={isCorrect
                    ? { borderColor: color, background: `${color}20`, boxShadow: `0 0 16px ${color}30` }
                    : { borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)' }}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black"
                    style={{ background: isCorrect ? color : 'rgba(255,255,255,0.1)', color: isCorrect ? '#000' : 'rgba(255,255,255,0.5)' }}>
                    {OPTION_LABELS[i]}
                  </span>
                  <span className={`text-sm font-bold ${isCorrect ? 'text-white' : 'text-white/60'}`}>{text}</span>
                  {isCorrect && <span className="ml-auto text-base">✓</span>}
                </div>
              );
            })}
          </div>
        )}

        {/* Timer */}
        <div className="relative z-10 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm text-white/60 font-bold">
          <span>⏱</span> {item.timeLimit ?? 25}s
        </div>
      </div>
    </div>
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
