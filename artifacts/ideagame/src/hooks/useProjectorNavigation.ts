import { useEffect } from 'react';
import { useLocation } from 'wouter';
import type { SocketEventHandler } from './useEventSocket';

type OnFn = <T = unknown>(event: string, handler: SocketEventHandler<T>) => () => void;

/**
 * Shared hook for all game board projector pages.
 * Listens for projector commands and game lifecycle events,
 * then navigates accordingly so the big screen always shows
 * the right view without requiring manual intervention.
 *
 * - game:ended           → /  (back to Hub default image)
 * - projector:go-hub     → /  (explicit Hub command, used when allZero)
 * - projector:go-scoreboard → /scoreboard?e=...  (standard session end)
 */
export function useProjectorNavigation(
  eventId: string | null | undefined,
  on: OnFn,
) {
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!eventId) return;
    const unsubs = [
      on<{ session: { id: string }; eventId: string }>('game:ended', () => {
        navigate('/');
      }),
      on<{ eventId?: string }>('projector:go-scoreboard', (payload) => {
        const eid = (payload as { eventId?: string })?.eventId ?? eventId;
        navigate(`/scoreboard?e=${eid}`);
      }),
      on<Record<string, unknown>>('projector:go-hub', () => {
        navigate('/');
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, [eventId, on, navigate]);
}
