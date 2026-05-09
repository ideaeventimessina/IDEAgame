import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { JonnyAvatar } from '@/components/JonnyAvatar';
import { JonnyMessage } from '@/components/JonnyMessage';
import { useJonny, type JonnyMood, type JonnyMode } from '@/contexts/JonnyContext';

type Step = 'loading' | 'join' | 'joining' | 'play' | 'error';
interface GameState {
  sessionId: string | null;
  currentRound: number;
  totalRounds: number;
  status: 'idle' | 'running' | 'paused' | 'ended';
  gameSlug: string | null;
}

interface JonnyLayerProps {
  step: Step;
  gameState: GameState;
  playerName?: string;
  eventName?: string;
}

interface PhaseConfig {
  mood: JonnyMood;
  message: string;
}

function resolvePhase(
  step: Step,
  gameState: GameState,
  jonnyMode: JonnyMode,
  playerName?: string,
  eventName?: string,
): PhaseConfig | null {
  if (step === 'join') {
    if (jonnyMode === 'home') {
      return {
        mood: 'idle',
        message: playerName
          ? `Bentornato, ${playerName}! Pronto per la sfida?`
          : `Ciao! Sono Jonny, il tuo game master${eventName ? ` di "${eventName}"` : ''}! Inserisci il tuo nome 👇`,
      };
    }
    return {
      mood: 'idle',
      message: playerName
        ? `Bentornato, ${playerName}! Dai il massimo!`
        : `Ciao! Sono Jonny, il co-host${eventName ? ` di "${eventName}"` : ''}! Inserisci il tuo nome 👇`,
    };
  }
  if (step === 'joining') {
    return { mood: 'thinking', message: 'Sto registrando il tuo ingresso…' };
  }
  if (step === 'play') {
    if (gameState.status === 'paused') {
      return { mood: 'paused', message: '⏸ Pausa! Torneremo subito…' };
    }
    if (gameState.status === 'ended') {
      return {
        mood: 'bye',
        message: jonnyMode === 'home'
          ? '🏆 Partita finita! Sei stato fantastico!'
          : '🏆 Partita finita! Grazie per aver giocato!',
      };
    }
  }
  return null;
}

export function JonnyLayer({ step, gameState, playerName, eventName }: JonnyLayerProps) {
  const {
    isHostedByJonny, jonnyMode,
    jonnyMood, jonnyMessage,
    setJonnyMood, setJonnyMessage,
    dismissJonny, dismissed,
  } = useJonny();

  const phase = resolvePhase(step, gameState, jonnyMode, playerName, eventName);

  useEffect(() => {
    if (!phase) return;
    setJonnyMood(phase.mood);
    setJonnyMessage(phase.message);
  }, [step, gameState.status, playerName]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = isHostedByJonny && !dismissed && !!jonnyMessage;

  if (!isHostedByJonny) return null;

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            key={`jonny-${step}-${gameState.status}`}
            initial={{ opacity: 0, y: 32, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="pointer-events-auto fixed bottom-28 left-4 right-4 z-50 flex items-end gap-3"
            style={{ maxWidth: 428, margin: '0 auto' }}
          >
            {/* Avatar — animates on mood change */}
            <motion.div
              key={jonnyMood}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 22 }}
              className="shrink-0"
            >
              <JonnyAvatar mood={jonnyMood} size={80} />
            </motion.div>

            {/* Speech bubble */}
            <div className="relative flex-1">
              <div
                className="absolute -left-2 bottom-4 h-0 w-0"
                style={{
                  borderTop: '7px solid transparent',
                  borderBottom: '7px solid transparent',
                  borderRight: '9px solid rgba(212,175,55,0.25)',
                }}
              />
              <div
                className="relative rounded-2xl border px-4 py-3 text-sm font-medium leading-snug"
                style={{
                  background: 'linear-gradient(135deg, rgba(16,12,34,0.97) 0%, rgba(10,8,25,0.97) 100%)',
                  borderColor: 'rgba(212,175,55,0.35)',
                  color: '#e8d5a3',
                  backdropFilter: 'blur(12px)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,175,55,0.08)',
                }}
              >
                <div className="mb-0.5 flex items-center gap-1.5">
                  <span className="text-[10px] font-black tracking-widest" style={{ color: '#D4AF37' }}>JONNY</span>
                  {jonnyMode === 'home' && (
                    <span className="rounded-full border px-1.5 py-0 text-[9px] font-bold tracking-widest"
                      style={{ borderColor: 'rgba(212,175,55,0.4)', color: '#D4AF37' }}>HOME</span>
                  )}
                </div>
                {jonnyMessage}
                <button
                  onClick={dismissJonny}
                  className="absolute right-2 top-2 rounded-full p-0.5 opacity-40 hover:opacity-100 transition-opacity"
                  style={{ color: '#D4AF37' }}
                  aria-label="Chiudi"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick feedback toasts */}
      <JonnyMessage />
    </>
  );
}
