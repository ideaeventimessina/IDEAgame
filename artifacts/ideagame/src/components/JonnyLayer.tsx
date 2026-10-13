/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import { useEffect } from 'react';
import { JonnyMessage } from '@/components/JonnyMessage';
import { JohhyAvatar, moodToState } from '@/jonny/JohhyAvatar';
import { JohhyBubble } from '@/jonny/JohhyBubble';
import { useJonnySpeaking } from '@/hooks/useJonnyVoice';
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
          : `Ciao! Sono Johhy, il tuo game master${eventName ? ` di "${eventName}"` : ''}! Inserisci il tuo nome 👇`,
      };
    }
    return {
      mood: 'idle',
      message: playerName
        ? `Bentornato, ${playerName}! Dai il massimo!`
        : `Ciao! Sono Johhy, il co-host${eventName ? ` di "${eventName}"` : ''}! Inserisci il tuo nome 👇`,
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
  const { speaking } = useJonnySpeaking();

  const phase = resolvePhase(step, gameState, jonnyMode, playerName, eventName);

  useEffect(() => {
    if (!phase) return;
    setJonnyMood(phase.mood);
    setJonnyMessage(phase.message);
  }, [step, gameState.status, playerName]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isHostedByJonny) return null;
  // Visibile quando c'è un messaggio di fase OPPURE Johhy sta parlando (fumetto sincronizzato).
  const show = !dismissed && (!!jonnyMessage || speaking);

  return (
    <>
      {show && (
        <div
          className="pointer-events-auto fixed bottom-28 left-4 right-4 z-50 flex items-end gap-3"
          style={{ maxWidth: 428, margin: '0 auto' }}
        >
          <div className="shrink-0"><JohhyAvatar state={speaking ? 'explaining' : moodToState(jonnyMood)} size={80} /></div>
          {/* Fumetto UNICO: testo ESATTO parlato (sincronizzato) oppure il messaggio di fase. */}
          <JohhyBubble variant="phone" message={jonnyMessage} onClose={dismissJonny} style={{ flex: 1 }} />
        </div>
      )}

      {/* Quick feedback toasts */}
      <JonnyMessage />
    </>
  );
}
