import { Music } from 'lucide-react';
import { useAudioOrchestrator } from '@/contexts/AudioOrchestrator';

const SLUG_LABEL: Record<string, string> = {
  hub:               'Lobby / Selezione Giochi',
  quizzone:          'Quizzone',
  'gioco-coppie':    'Gioco delle Coppie',
  'percorso-a-risate': 'Percorso a Risate',
  'sfida-ballo':     'Sfida di Ballo',
  'saramusica':      'Saramusica',
  'adult-only':      'Adult Only',
  'parola-alle-spalle': 'Parola alle Spalle',
  'karaoke-battle':  'Karaoke Battle',
  'freestyle-battle':'Freestyle Battle',
};

const TYPE_LABEL: Record<string, string> = {
  lobby_loop:   'musica di attesa',
  round_loop:   'musica di round',
  tension_loop: 'musica di tensione',
  podium_theme: 'tema podio',
  suspense:     'suspense',
  karaoke_bed:  'base karaoke',
};

/**
 * Shown only in regia / presentatore views.
 * Warns that a background music loop is missing for the current room —
 * so the audio will be silent until a tenant track is uploaded.
 */
export function MissingLoopBanner() {
  const { missingLoopTrack } = useAudioOrchestrator();
  if (!missingLoopTrack) return null;

  const roomLabel = SLUG_LABEL[missingLoopTrack.slug] ?? missingLoopTrack.slug;
  const typeLabel = TYPE_LABEL[missingLoopTrack.type] ?? missingLoopTrack.type;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
      <Music className="h-4 w-4 shrink-0 text-amber-400" />
      <span>
        <span className="font-semibold">Traccia audio mancante</span> —{' '}
        nessuna {typeLabel} caricata per <span className="font-semibold">{roomLabel}</span>.
        Il proiettore è in silenzio. Carica una traccia in{' '}
        <span className="font-semibold">Admin → Impostazioni Audio</span>.
      </span>
    </div>
  );
}
