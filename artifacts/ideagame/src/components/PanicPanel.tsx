import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import {
  X, QrCode, Home, Trophy, Monitor, Snowflake, SkipForward,
  RotateCcw, Wifi, Layers, PowerOff, AlertTriangle, Loader2,
  Sun,
} from 'lucide-react';
import { QrPlaceholder } from './QrPlaceholder';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';
async function apiFetch(path: string, opts?: RequestInit) {
  const url = `${BASE}api${path}`.replace(/\/\//g, '/');
  const r = await fetch(url, { credentials: 'include', ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body;
}

interface Session {
  id: string;
  gameSlug: string;
  status: string;
}

interface ConfirmState {
  title: string;
  message: string;
  label: string;
  onConfirm: () => Promise<void>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  eventId: string;
  joinCode: string;
  joinUrl: string;
  session: Session | undefined;
}

export function PanicPanel({ open, onClose, eventId, joinCode, joinUrl, session }: Props) {
  const [, navigate] = useLocation();
  const [showQR, setShowQR] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);
  const [blackActive, setBlackActive] = useState(false);
  const [frozenActive, setFrozenActive] = useState(false);

  const flash = (msg: string, ok = true) => {
    setFeedback({ msg, ok });
    setTimeout(() => setFeedback(null), 2500);
  };

  const emit = useCallback(async (event: string) => {
    if (!eventId) return;
    await apiFetch(`/panic/events/${eventId}/emit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event }),
    });
  }, [eventId]);

  const run = useCallback(async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      flash((e as Error).message, false);
    } finally {
      setBusy(null);
    }
  }, [busy]);

  const SKIP_ROUTES: Record<string, string> = {
    'percorso-a-risate': `/percorso/sessions/${session?.id}/next`,
    'quizzone':          `/quizzone/sessions/${session?.id}/next-question`,
    'adult-only':        `/adult-only/sessions/${session?.id}/next`,
    'parola-alle-spalle':`/word-back/sessions/${session?.id}/next`,
    'saramusica':        `/saramusica/sessions/${session?.id}/next`,
    'karaoke-battle':    `/karaoke/sessions/${session?.id}/next`,
  };

  const canSkip = !!session && !!SKIP_ROUTES[session.gameSlug];

  const actions = [
    // ── Navigazione ──────────────────────────────────────
    {
      key: 'qr',
      label: 'Mostra QR',
      icon: QrCode,
      color: 'border-sky-500/60 bg-sky-500/15 text-sky-300',
      description: 'QR gigante per i giocatori',
      confirm: false,
      action: async () => { setShowQR(true); },
    },
    {
      key: 'hub',
      label: 'Torna al Cockpit',
      icon: Home,
      color: 'border-sky-500/60 bg-sky-500/15 text-sky-300',
      description: 'Chiudi emergenza e torna al controllo',
      confirm: false,
      action: async () => { onClose(); navigate('/control'); },
    },
    {
      key: 'podio',
      label: 'Mostra Podio',
      icon: Trophy,
      color: 'border-amber-500/60 bg-amber-500/15 text-amber-300',
      description: 'Classifica e podio globale',
      confirm: false,
      action: async () => {
        window.open(`${BASE}scoreboard?e=${eventId}`.replace(/\/\//g, '/'), '_blank');
        flash('Podio aperto in nuova scheda');
      },
    },
    // ── Controllo proiettore ──────────────────────────────
    {
      key: 'black',
      label: blackActive ? 'Disattiva Black' : 'Black Screen',
      icon: blackActive ? Sun : Monitor,
      color: blackActive
        ? 'border-green-500/60 bg-green-500/15 text-green-300'
        : 'border-zinc-500/60 bg-zinc-700/40 text-zinc-200',
      description: blackActive ? 'Ripristina schermo proiettore' : 'Schermo nero sul proiettore',
      confirm: false,
      action: async () => {
        const ev = blackActive ? 'projector:black-off' : 'projector:black';
        await emit(ev);
        setBlackActive(b => !b);
        flash(blackActive ? 'Schermo ripristinato' : 'Schermo nero attivato');
      },
    },
    {
      key: 'freeze',
      label: frozenActive ? 'Sblocca Timer' : 'Freeze Timer',
      icon: Snowflake,
      color: frozenActive
        ? 'border-green-500/60 bg-green-500/15 text-green-300'
        : 'border-cyan-500/60 bg-cyan-500/15 text-cyan-300',
      description: frozenActive ? 'Riprendi il countdown' : 'Blocca tutti i countdown',
      confirm: false,
      action: async () => {
        const ev = frozenActive ? 'game:unfreeze-timer' : 'game:freeze-timer';
        await emit(ev);
        setFrozenActive(f => !f);
        flash(frozenActive ? 'Timer sbloccato' : 'Timer congelato su tutti i dispositivi');
      },
    },
    {
      key: 'closeOverlays',
      label: 'Chiudi Overlay',
      icon: Layers,
      color: 'border-violet-500/60 bg-violet-500/15 text-violet-300',
      description: 'Chiude popup aperti sul proiettore',
      confirm: false,
      action: async () => {
        await emit('projector:close-overlays');
        flash('Overlay chiusi sul proiettore');
      },
    },
    // ── Giocatori ─────────────────────────────────────────
    {
      key: 'reconnect',
      label: 'Force Reconnect',
      icon: Wifi,
      color: 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300',
      description: 'Aggiorna stato su tutti i telefoni',
      confirm: false,
      action: async () => {
        await emit('players:force-refresh');
        flash('Refresh inviato a tutti i telefoni');
      },
    },
    // ── Controllo gioco ───────────────────────────────────
    {
      key: 'skip',
      label: 'Skip Round',
      icon: SkipForward,
      color: canSkip
        ? 'border-orange-500/60 bg-orange-500/15 text-orange-300'
        : 'border-border bg-card/40 text-muted-foreground opacity-50 cursor-not-allowed',
      description: canSkip ? `Passa alla sfida successiva (${session?.gameSlug})` : 'Nessuna sessione attiva',
      confirm: false,
      action: async () => {
        if (!canSkip || !session) return;
        const route = SKIP_ROUTES[session.gameSlug];
        if (!route) return;
        await apiFetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        flash('Round saltato');
      },
    },
    {
      key: 'reset',
      label: 'Reset Gioco',
      icon: RotateCcw,
      color: session
        ? 'border-red-500/60 bg-red-500/10 text-red-300'
        : 'border-border bg-card/40 text-muted-foreground opacity-50 cursor-not-allowed',
      description: session ? 'Termina sessione e svuota la board' : 'Nessuna sessione attiva',
      confirm: true,
      confirmMsg: `Terminare la sessione "${session?.gameSlug}" e resettare il gioco?`,
      action: async () => {
        if (!session) return;
        await apiFetch(`/sessions/${session.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'ended' }),
        });
        await emit('projector:close-overlays');
        flash('Gioco resettato — crea una nuova sessione dal Cockpit');
      },
    },
    {
      key: 'end',
      label: 'End Game',
      icon: PowerOff,
      color: session
        ? 'border-red-600/80 bg-red-600/20 text-red-200'
        : 'border-border bg-card/40 text-muted-foreground opacity-50 cursor-not-allowed',
      description: session ? 'Chiudi il gioco e vai al podio' : 'Nessuna sessione attiva',
      confirm: true,
      confirmMsg: `Terminare immediatamente "${session?.gameSlug}" e andare al podio?`,
      action: async () => {
        if (!session) return;
        const END_ROUTES: Record<string, string> = {
          'percorso-a-risate': `/percorso/sessions/${session.id}/end`,
          'adult-only':        `/adult-only/sessions/${session.id}/end`,
          'sfida-ballo':       `/dance/sessions/${session.id}/end`,
          'parola-alle-spalle':`/word-back/sessions/${session.id}/end`,
          'saramusica':        `/saramusica/sessions/${session.id}/end`,
          'karaoke-battle':    `/karaoke/sessions/${session.id}/end`,
        };
        const endRoute = END_ROUTES[session.gameSlug];
        if (endRoute) {
          await apiFetch(endRoute, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => null);
        }
        await apiFetch(`/sessions/${session.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'ended' }),
        });
        // Tell the projector (Hub) to navigate to scoreboard automatically
        await apiFetch(`/panic/events/${eventId}/emit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'projector:go-scoreboard', payload: { eventId } }),
        }).catch(() => null);
        // Close panel and navigate to scoreboard
        onClose();
        navigate(`/scoreboard?e=${eventId}`);
      },
    },
  ];

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="panic-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[150] flex flex-col bg-black/95 backdrop-blur-xl overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-red-900/50">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-600/30 border border-red-500/50">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <div className="text-display text-lg font-black text-red-400 uppercase tracking-widest">
                PANNELLO EMERGENZA
              </div>
              <div className="text-xs text-muted-foreground">
                {session ? `Sessione: ${session.gameSlug} · ${session.status}` : 'Nessuna sessione attiva'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/80 hover:border-border/80 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Feedback toast */}
        <AnimatePresence>
          {feedback && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className={`mx-6 mt-4 rounded-xl px-4 py-3 text-sm font-bold ${
                feedback.ok
                  ? 'border border-green-500/40 bg-green-500/15 text-green-300'
                  : 'border border-red-500/40 bg-red-500/15 text-red-300'
              }`}
            >
              {feedback.msg}
            </motion.div>
          )}
        </AnimatePresence>

        {/* QR sub-panel */}
        <AnimatePresence>
          {showQR && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center justify-center px-6 py-8 gap-6"
            >
              <div className="rounded-3xl border border-sky-500/30 bg-sky-950/40 p-8 flex flex-col items-center gap-6">
                <QrPlaceholder text={joinUrl} size={260} />
                <div className="text-center">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Codice accesso</div>
                  <div className="text-display text-5xl font-black text-sky-300 tracking-widest">{joinCode}</div>
                  <div className="mt-2 text-xs text-muted-foreground truncate max-w-xs">{joinUrl}</div>
                </div>
              </div>
              <button
                onClick={() => setShowQR(false)}
                className="rounded-xl border border-border px-6 py-3 text-sm font-bold hover:bg-secondary/30"
              >
                ← Torna al pannello
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Button grid */}
        {!showQR && (
          <div className="flex-1 p-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 max-w-3xl mx-auto">
              {actions.map(({ key, label, icon: Icon, color, description, confirm: needsConfirm, confirmMsg, action }) => (
                <motion.button
                  key={key}
                  whileTap={{ scale: 0.97 }}
                  disabled={busy === key}
                  onClick={() => {
                    if (needsConfirm) {
                      setConfirm({
                        title: label,
                        message: confirmMsg ?? '¿Sei sicuro?',
                        label: 'Conferma',
                        onConfirm: () => run(key, action),
                      });
                    } else {
                      void run(key, action);
                    }
                  }}
                  className={`flex flex-col items-start gap-3 rounded-2xl border p-5 text-left transition-all hover:brightness-110 active:brightness-90 ${color}`}
                >
                  <div className="flex w-full items-center justify-between">
                    {busy === key
                      ? <Loader2 className="h-7 w-7 animate-spin opacity-60" />
                      : <Icon className="h-7 w-7" strokeWidth={1.8} />
                    }
                    {needsConfirm && (
                      <div className="rounded-full border border-current/30 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest opacity-60">
                        ⚠ confirm
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-display text-base font-black leading-tight">{label}</div>
                    <div className="mt-1 text-[11px] opacity-60 leading-snug">{description}</div>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* Confirm dialog */}
        <AnimatePresence>
          {confirm && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 px-6"
            >
              <motion.div
                initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
                className="w-full max-w-sm rounded-3xl border border-red-900/60 bg-zinc-900 p-7 space-y-5"
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-6 w-6 text-red-400 shrink-0" />
                  <div className="text-display text-lg font-black text-red-400">{confirm.title}</div>
                </div>
                <div className="text-sm text-muted-foreground leading-relaxed">{confirm.message}</div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirm(null)}
                    className="flex-1 rounded-xl border border-border py-3 text-sm font-bold hover:bg-secondary/30"
                  >
                    Annulla
                  </button>
                  <button
                    onClick={async () => {
                      const fn = confirm.onConfirm;
                      setConfirm(null);
                      await fn();
                    }}
                    className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-black text-white hover:bg-red-500"
                  >
                    {confirm.label}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
