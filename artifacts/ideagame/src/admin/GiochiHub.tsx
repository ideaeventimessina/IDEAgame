import { useLocation } from 'wouter';
import { AdminLayout } from './AdminLayout';
import { ChevronRight } from 'lucide-react';

const GAMES = [
  {
    id: 'adult-only',
    label: 'Adult Only',
    emoji: '🔞',
    route: '/admin/adult-only',
    desc: 'Verità e obblighi per livello 1–5',
    color: '#EF4444',
    tags: ['Verità', 'Obbligo', 'Livelli'],
  },
  {
    id: 'percorso-risate',
    label: 'Percorso a Risate',
    emoji: '⚡',
    route: '/admin/percorso-risate',
    desc: 'Set di sfide: mimo, ballo, veloce…',
    color: '#F59E0B',
    tags: ['Set', 'Sfide', 'Squadre'],
  },
  {
    id: 'parola-alle-spalle',
    label: 'Parola alle Spalle',
    emoji: '🗣️',
    route: '/admin/parola-alle-spalle',
    desc: 'Parole e categorie per indovinare',
    color: '#8B5CF6',
    tags: ['Parole', 'Categorie'],
  },
  {
    id: 'saramusica',
    label: 'SaraMusica',
    emoji: '🎵',
    route: '/admin/saramusica',
    desc: 'Round musicali e clip YouTube',
    color: '#60A5FA',
    tags: ['Quiz', 'Musica', 'Clip'],
  },
  {
    id: 'quizzes',
    label: 'Quiz',
    emoji: '❓',
    route: '/admin/quizzes',
    desc: 'Domande multi-lingua per il Quizzone',
    color: '#10B981',
    tags: ['Domande', 'Categorie', 'AI'],
  },
  {
    id: 'card-sets',
    label: 'Gioco delle Coppie',
    emoji: '🃏',
    route: '/admin/card-sets',
    desc: 'Deck di carte immagine per il memory',
    color: '#EC4899',
    tags: ['Carte', 'Immagini', 'Coppie'],
  },
  {
    id: 'karaoke-battle',
    label: 'Karaoke Battle',
    emoji: '🎤',
    route: '/admin/karaoke-battle',
    desc: 'Canzoni e testi per il karaoke',
    color: '#F97316',
    tags: ['Canzoni', 'Testi'],
  },
  {
    id: 'sfida-ballo',
    label: 'Sfida di Ballo',
    emoji: '💃',
    route: '/admin/sfida-ballo',
    desc: 'Challenge con accelerometro',
    color: '#A855F7',
    tags: ['Ballo', 'Accelerometro'],
  },
] as const;

export default function GiochiHub() {
  const [, navigate] = useLocation();

  return (
    <AdminLayout title="Giochi 🎮">
      <div className="max-w-5xl mx-auto space-y-6">

        <div className="flex items-center gap-3">
          <div>
            <p className="text-muted-foreground text-sm">
              Seleziona un gioco per gestirne i contenuti.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {GAMES.map(game => (
            <button
              key={game.id}
              onClick={() => navigate(game.route)}
              className="group relative flex flex-col text-left rounded-2xl p-5 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] overflow-hidden border"
              style={{
                background: `linear-gradient(135deg, ${game.color}18, ${game.color}08, rgba(0,0,0,0.4))`,
                borderColor: `${game.color}35`,
                boxShadow: `0 4px 24px ${game.color}15`,
              }}
            >
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"
                style={{ background: `radial-gradient(ellipse at 50% 0%, ${game.color}20, transparent 70%)` }}
              />

              <div className="relative flex items-start justify-between mb-4">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl shrink-0"
                  style={{ background: `${game.color}22`, border: `1.5px solid ${game.color}44` }}
                >
                  {game.emoji}
                </div>
                <ChevronRight
                  className="h-5 w-5 mt-1 opacity-30 group-hover:opacity-80 transition-opacity"
                  style={{ color: game.color }}
                />
              </div>

              <div className="relative flex-1">
                <div className="font-black text-base text-foreground mb-1">{game.label}</div>
                <div className="text-xs text-muted-foreground leading-relaxed mb-3">{game.desc}</div>
                <div className="flex flex-wrap gap-1.5">
                  {game.tags.map(tag => (
                    <span
                      key={tag}
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                      style={{ background: `${game.color}18`, color: game.color, border: `1px solid ${game.color}35` }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div
                className="absolute bottom-0 left-0 right-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${game.color}50, transparent)` }}
              />
            </button>
          ))}
        </div>

        <div
          className="rounded-2xl p-4 flex items-center gap-4"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="text-2xl shrink-0">💡</div>
          <div>
            <div className="text-sm font-bold text-foreground">Gestione contenuti centralizzata</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              I contenuti creati qui vengono utilizzati automaticamente durante il gioco in LiveControl.
              Ogni gioco mostra solo i contenuti attivi.
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
