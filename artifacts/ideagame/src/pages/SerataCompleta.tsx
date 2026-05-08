import { useState, useEffect, useCallback } from 'react';
import { useLocation, useSearch } from 'wouter';
import { motion } from 'framer-motion';
import { Home, Trophy, RefreshCw, Loader2, ChevronRight } from 'lucide-react';
import { useEventSocket } from '@/hooks/useEventSocket';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string) {
  const r = await fetch(`${BASE}api${path}`.replace(/\/\//g, '/'), { credentials: 'include' });
  return r.json();
}

interface EveningGame { slug: string; label: string; emoji: string; sessionId: string | null; status: 'pending' | 'running' | 'done'; }
interface EveningMode { id: string; eventId: string; playlist: EveningGame[]; status: string; }
interface TeamScore { id: string; name: string; color: string; byGame: Record<string, number>; total: number; }

const SLUGS = ['percorso-a-risate', 'gioco-coppie', 'quizzone'];
const GAME_LABELS: Record<string, string> = { 'percorso-a-risate': 'Percorso', 'gioco-coppie': 'Coppie', 'quizzone': 'Quizzone' };
const GAME_EMOJIS: Record<string, string> = { 'percorso-a-risate': '🎭', 'gioco-coppie': '🃏', 'quizzone': '❓' };

export default function SerataCompleta() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const eventId = new URLSearchParams(search).get('e') ?? '';
  const [evening, setEvening] = useState<EveningMode | null>(null);
  const [scores, setScores] = useState<TeamScore[]>([]);
  const [loading, setLoading] = useState(true);
  const { on } = useEventSocket(eventId || null);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const [ev, sc] = await Promise.all([
        apiFetch(`/events/${eventId}/evening`),
        apiFetch(`/events/${eventId}/evening/scoreboard`),
      ]);
      setEvening(ev as EveningMode | null);
      setScores(Array.isArray(sc) ? sc as TeamScore[] : []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!eventId) return;
    return on<{ evening: EveningMode }>('evening:updated', ({ evening: ev }) => {
      setEvening(ev);
      void apiFetch(`/events/${eventId}/evening/scoreboard`).then(sc => {
        if (Array.isArray(sc)) setScores(sc as TeamScore[]);
      });
    });
  }, [eventId, on]);

  const gameProg = evening?.playlist ?? [];
  const doneCount = gameProg.filter(g => g.status === 'done').length;

  return (
    <div className="min-h-screen w-full px-4 py-6 sm:px-8"
      style={{ background: 'radial-gradient(ellipse at top, hsl(248 70% 10%), hsl(248 70% 4%))' }}>
      <div className="mx-auto max-w-3xl space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('/')} className="rounded-full border border-border p-2 hover:bg-card">
            <Home className="h-4 w-4" />
          </button>
          <div className="text-center">
            <div className="text-display text-lg font-black">✨ Serata Completa</div>
            <div className={`mt-0.5 text-xs font-bold ${
              evening?.status === 'running' ? 'text-green-400' :
              evening?.status === 'ended'   ? 'text-primary' : 'text-muted-foreground'
            }`}>
              {!evening && '—'}
              {evening?.status === 'idle'   && '⏳ In attesa'}
              {evening?.status === 'running' && `⚡ In corso · ${doneCount}/3 completati`}
              {evening?.status === 'ended'   && '🏁 Serata terminata'}
            </div>
          </div>
          <button onClick={load} disabled={loading} className="rounded-full border border-border p-2 hover:bg-card disabled:opacity-40">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {!loading && !evening && (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Serata non ancora inizializzata — vai al LiveControl e premi <strong>Inizia serata</strong>
          </div>
        )}

        {!loading && evening && (
          <>
            {/* Game sequence */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Scaletta</div>
              <div className="space-y-2">
                {gameProg.map((g, i) => (
                  <motion.div key={g.slug}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                      g.status === 'running' ? 'border-green-500/40 bg-green-500/10' :
                      g.status === 'done'    ? 'border-border/40 bg-background/30 opacity-60' :
                      'border-border/20 bg-background/10 opacity-40'
                    }`}>
                    <span className="text-xl">{g.emoji}</span>
                    <span className="flex-1 font-bold">{g.label}</span>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${
                      g.status === 'running' ? 'border-green-500/60 bg-green-500/15 text-green-400' :
                      g.status === 'done'    ? 'border-border text-muted-foreground'             :
                      'border-border/30 text-muted-foreground/40'
                    }`}>
                      {g.status === 'running' ? '⚡ In corso' : g.status === 'done' ? '✓ Done' : `${i + 1}°`}
                    </span>
                    {g.sessionId && (
                      <a
                        href={`${BASE}${g.slug === 'percorso-a-risate' ? 'percorso-risate' : g.slug}?s=${g.sessionId}&e=${eventId}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-primary hover:underline">
                        <ChevronRight className="h-4 w-4" />
                      </a>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Scoreboard table */}
            {scores.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-primary" />
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Classifica globale</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="pb-2 text-left text-xs text-muted-foreground font-normal">Squadra</th>
                        {SLUGS.map(s => (
                          <th key={s} className="pb-2 px-2 text-center text-xs text-muted-foreground font-normal whitespace-nowrap">
                            {GAME_EMOJIS[s]} {GAME_LABELS[s]}
                          </th>
                        ))}
                        <th className="pb-2 text-right text-xs font-black text-primary">TOT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scores.map((t, i) => (
                        <motion.tr key={t.id}
                          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                          className="border-b border-border/30 last:border-0">
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="h-3 w-3 rounded-full shrink-0" style={{ background: t.color }} />
                              <span className="font-bold truncate max-w-[100px]" style={{ color: t.color }}>{t.name}</span>
                            </div>
                          </td>
                          {SLUGS.map(s => (
                            <td key={s} className="py-2.5 px-2 text-center tabular-nums text-muted-foreground">
                              {t.byGame[s] ?? 0}
                            </td>
                          ))}
                          <td className="py-2.5 text-right">
                            <span className="text-display text-base font-black tabular-nums" style={{ color: t.color }}>
                              {t.total}
                            </span>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Podio finale */}
            {scores.length > 0 && (
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 space-y-4">
                <div className="text-center text-xs uppercase tracking-widest text-muted-foreground">🏆 Podio Finale</div>
                <div className="flex items-end justify-center gap-4">
                  {scores[1] && (
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-3xl">🥈</span>
                      <div className="w-24 rounded-t-xl flex items-end justify-center bg-muted/20 h-16">
                        <span className="text-display text-base font-black pb-2 tabular-nums" style={{ color: scores[1].color }}>{scores[1].total}</span>
                      </div>
                      <span className="text-xs font-bold text-center w-24 truncate" style={{ color: scores[1].color }}>{scores[1].name}</span>
                    </div>
                  )}
                  {scores[0] && (
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-3xl">🥇</span>
                      <div className="w-24 rounded-t-xl flex items-end justify-center bg-primary/20 h-24">
                        <span className="text-display text-base font-black pb-2 tabular-nums" style={{ color: scores[0].color }}>{scores[0].total}</span>
                      </div>
                      <span className="text-xs font-bold text-center w-24 truncate" style={{ color: scores[0].color }}>{scores[0].name}</span>
                    </div>
                  )}
                  {scores[2] && (
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-3xl">🥉</span>
                      <div className="w-24 rounded-t-xl flex items-end justify-center bg-muted/10 h-12">
                        <span className="text-display text-base font-black pb-2 tabular-nums" style={{ color: scores[2].color }}>{scores[2].total}</span>
                      </div>
                      <span className="text-xs font-bold text-center w-24 truncate" style={{ color: scores[2].color }}>{scores[2].name}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {scores.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Nessun punteggio ancora — avvia i giochi per vedere la classifica
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
