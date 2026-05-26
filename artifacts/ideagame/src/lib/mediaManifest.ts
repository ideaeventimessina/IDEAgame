/**
 * Media Manifest — centralized slot registry for music & SFX.
 *
 * Rules:
 * - If a file is missing → console.warn once, then continue silently.
 * - AudioManager resolves URLs via DB paths first, then static assets.
 * - This file is the single source of truth for slot names.
 *
 * Usage:
 *   import { MEDIA } from '@/lib/mediaManifest';
 *   AudioManager.playStinger(slug, MEDIA.GLOBAL.SUCCESS);
 */

export const MEDIA = {
  GLOBAL: {
    UI_CLICK:        'ui_click',
    COUNTDOWN:       'countdown_3_2_1',
    ROUND_START:     'round_start',
    ROUND_END:       'round_end',
    SUCCESS:         'success',
    FAIL:            'fail',
    APPLAUSE:        'applause',
    ERROR_BUZZER:    'error_buzzer',
    TRANSITION:      'transition_whoosh',
  },
  KARAOKE: {
    INTRO:           'karaoke_intro',
    VOTING:          'karaoke_voting',
    WINNER:          'karaoke_winner',
    TRANSITION:      'karaoke_transition',
  },
  BALLO: {
    INTRO:           'ballo_intro',
    COUNTDOWN:       'ballo_countdown',
    RESULT:          'ballo_result',
    PODIUM:          'ballo_podium',
  },
  WORDBACK: {
    CORRECT:         'wordback_correct',
    WRONG:           'wordback_wrong',
    TIMEOUT:         'wordback_timeout',
    TABOO_ALARM:     'taboo_alarm',
  },
  PERCORSO: {
    MISSION_INTRO:   'risate_mission_intro',
    SUCCESS:         'risate_success',
    FAIL:            'risate_fail',
    VOTE:            'risate_vote',
  },
  QUIZZONE: {
    QUESTION:        'quiz_question',
    CORRECT:         'quiz_correct',
    WRONG:           'quiz_wrong',
    REVEAL:          'quiz_reveal',
  },
  COPPIE: {
    CARD_FLIP:       'card_flip',
    CARD_MATCH:      'card_match',
    CARD_MISS:       'card_miss',
  },
} as const;

export type MediaSlot = typeof MEDIA[keyof typeof MEDIA][keyof typeof MEDIA[keyof typeof MEDIA]];

/** Tracks which missing-slot warnings have already been printed (once-only). */
const _warnedSlots = new Set<string>();

/**
 * Play a stinger with silent-fallback: if the slot is missing in AudioManager,
 * warn once and continue.
 */
export async function safePlayStinger(
  playStingerFn: (type: string) => void,
  slot: string,
): Promise<void> {
  try {
    playStingerFn(slot);
  } catch {
    if (!_warnedSlots.has(slot)) {
      console.warn(`[MediaManifest] SFX slot "${slot}" non trovato — proseguo in silenzio.`);
      _warnedSlots.add(slot);
    }
  }
}
