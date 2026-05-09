import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { JonnyAvatar } from '@/components/JonnyAvatar';
import { useJonny, type JonnyMood } from '@/contexts/JonnyContext';

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

function resolvePhase(step: Step, gameState: GameState, playerName?: string, eventName?: string): PhaseConfig | null {
  if (step === 'join') {
    return {
      mood: 'excited',
      message: playerName
        ? `Bentornato, ${playerName}! Scegli il team e vai!`
        : `Ciao! Sono Jonny, il tuo co-host${eventName ? ` di "${eventName}"` : ''}! Inserisci il tuo nome 👇`,
    };
  }
  if (step === 'joining') {
    return { mood: 'thinking', message: 'Sto registrando il tuo ingresso…' };
  }
  if (step === 'play') {
    if (gameState.status === 'idle') {
      return { mood: 'thinking', message: 'Pronti? Aspettiamo che il gioco inizi… 🎯' };
    }
    if (gameState.status === 'running') {
      return { mood: 'cheering', message: 'Forza! Dai tutto! 💪' };
    }
    if (gameState.status === 'paused') {
      return { mood: 'thinking', message: 'Pausa! Torna subito…' };
    }
    if (gameState.status === 'ended') {
      return { mood: 'celebrating', message: 'Partita finita! Grande prestazione! 🏆' };
    }
  }
  return null;
}

export function JonnyLayer({ step, gameState, playerName, eventName }: JonnyLayerProps) {
  const { isHostedByJonny, jonnyMood, jonnyMessage, setJonnyMood, setJonnyMessage, dismissJonny, dismissed } = useJonny();

  const phase = resolvePhase(step, gameState, playerName, eventName);

  useEffect(() => {
    if (!phase) return;
    setJonnyMood(phase.mood);
    setJonnyMessage(phase.message);
  }, [step, gameState.status, playerName]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = isHostedByJonny && !dismissed && !!jonnyMessage;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={`jonny-${step}-${gameState.status}`}
          initial={{ opacity: 0, y: 32, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          className="pointer-events-auto fixed bottom-28 left-4 right-4 z-50 flex items-end gap-3"
          style={{ maxWidth: 420, margin: '0 auto' }}
        >
          {/* Avatar */}
          <motion.div
            animate={{ rotate: [0, -3, 3, 0] }}
            transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
            className="shrink-0"
          >
            <JonnyAvatar mood={jonnyMood} size={72} />
          </motion.div>

          {/* Speech bubble */}
          <div className="relative flex-1">
            {/* Tail pointing left toward avatar */}
            <div
              className="absolute -left-2 bottom-4 h-0 w-0"
              style={{
                borderTop: '8px solid transparent',
                borderBottom: '8px solid transparent',
                borderRight: '10px solid rgba(212,175,55,0.25)',
              }}
            />
            <div
              className="relative rounded-2xl border px-4 py-3 text-sm font-medium leading-snug"
              style={{
                background: 'linear-gradient(135deg, rgba(20,15,40,0.97) 0%, rgba(10,8,25,0.97) 100%)',
                borderColor: 'rgba(212,175,55,0.35)',
                color: '#e8d5a3',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,175,55,0.1)',
              }}
            >
              <div className="mb-0.5 text-[10px] font-bold tracking-widest" style={{ color: '#D4AF37' }}>
                JONNY
              </div>
              {jonnyMessage}

              {/* Dismiss */}
              <button
                onClick={dismissJonny}
                className="absolute right-2 top-2 rounded-full p-0.5 opacity-50 hover:opacity-100 transition-opacity"
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
  );
}
