import type {
  Tenant, User, Subscription, Plan, EventItem, Team, Player,
  Game, Question, MediaAsset, Score, GameSlug
} from './types';

export const GAMES: Game[] = [
  {
    id: 'g1', slug: 'percorso-a-risate', name: 'Percorso a Risate',
    tagline: 'Il grande percorso a sfide su schermo gigante.',
    accentColor: '#F5B642', icon: 'route', enabled: true,
    settings: { rounds: 6, timeLimit: 45, scoringWeight: 1 }
  },
  {
    id: 'g2', slug: 'gioco-delle-coppie', name: 'Gioco delle Coppie',
    tagline: 'Quanto vi conoscete davvero? Scopritelo live.',
    accentColor: '#E84A8E', icon: 'heart', enabled: true,
    settings: { rounds: 5, timeLimit: 30, scoringWeight: 1 }
  },
  {
    id: 'g3', slug: 'quizzone', name: 'Quizzone',
    tagline: 'Il quiz di gruppo più adrenalinico della serata.',
    accentColor: '#5BC0EB', icon: 'brain', enabled: true,
    settings: { rounds: 10, timeLimit: 25, scoringWeight: 1.2 }
  },
  {
    id: 'g4', slug: 'saramusica', name: 'SaraMusica',
    tagline: 'Indovina la canzone e vinci la stanza.',
    accentColor: '#9B5DE5', icon: 'music', enabled: true,
    settings: { rounds: 8, timeLimit: 20, scoringWeight: 1.1 }
  },
  {
    id: 'g5', slug: 'adult-only', name: 'Adult Only',
    tagline: 'Per i coraggiosi. Notte fonda, guanti giù.',
    accentColor: '#FF1F6D', icon: 'flame', enabled: true, adultOnly: true,
    settings: { rounds: 6, timeLimit: 40, scoringWeight: 1 }
  },
  {
    id: 'g6', slug: 'sfida-di-ballo', name: 'Sfida di Ballo',
    tagline: 'Muoviti, spingi il limite, conquista la pista.',
    accentColor: '#00F5A0', icon: 'sparkles', enabled: true,
    settings: { rounds: 5, timeLimit: 60, scoringWeight: 1.3 }
  },
];

export const PLANS: Plan[] = [
  { id: 'p1', name: 'Starter', priceMonthly: 49, features: ['1 entertainer seat', 'Up to 8 players', '3 games', 'Local play only'], maxPlayers: 8, maxGames: 3, highlight: false },
  { id: 'p2', name: 'Pro', priceMonthly: 149, features: ['3 entertainer seats', 'Up to 20 players', 'All 6 games', 'Cloud sync', 'Custom quizzes'], maxPlayers: 20, maxGames: 6, highlight: true },
  { id: 'p3', name: 'Studio', priceMonthly: 349, features: ['10 seats', 'Multi-event scheduler', 'Branded GameStation', 'Priority support'], maxPlayers: 20, maxGames: 6, highlight: false },
  { id: 'p4', name: 'Enterprise', priceMonthly: 0, features: ['Unlimited seats', 'White-label SaaS', 'SLA & on-site setup', 'Custom games'], maxPlayers: 999, maxGames: 99, highlight: false },
];

export const TENANTS: Tenant[] = [
  { id: 't1', name: 'Mango Events', plan: 'pro', status: 'active', seats: 3, mrr: 149, locale: 'it', brandColor: '#F5B642', createdAt: '2025-09-12' },
  { id: 't2', name: 'Aurora Wedding Studio', plan: 'studio', status: 'active', seats: 8, mrr: 349, locale: 'it', brandColor: '#E84A8E', createdAt: '2025-08-03' },
  { id: 't3', name: 'NightOwl Bars', plan: 'pro', status: 'active', seats: 4, mrr: 149, locale: 'en', brandColor: '#9B5DE5', createdAt: '2026-01-21' },
  { id: 't4', name: 'Fiesta Madrid', plan: 'starter', status: 'active', seats: 1, mrr: 49, locale: 'es', brandColor: '#00F5A0', createdAt: '2026-02-10' },
  { id: 't5', name: 'Brasserie Lumière', plan: 'studio', status: 'active', seats: 6, mrr: 349, locale: 'fr', brandColor: '#5BC0EB', createdAt: '2025-11-30' },
  { id: 't6', name: 'Casa Allegra', plan: 'pro', status: 'suspended', seats: 2, mrr: 0, locale: 'it', brandColor: '#FF1F6D', createdAt: '2025-07-19' },
];

export const USERS: User[] = [
  { id: 'u1', name: 'Marco Rossi', email: 'marco@ideagame.app', role: 'super_admin', tenantId: 't1', avatarColor: '#F5B642' },
  { id: 'u2', name: 'Giulia Conte', email: 'giulia@mango.events', role: 'tenant_owner', tenantId: 't1', avatarColor: '#E84A8E' },
  { id: 'u3', name: 'Luca Ferraro', email: 'luca@mango.events', role: 'game_manager', tenantId: 't1', avatarColor: '#5BC0EB' },
  { id: 'u4', name: 'Sara De Luca', email: 'sara@mango.events', role: 'entertainer', tenantId: 't1', avatarColor: '#9B5DE5' },
  { id: 'u5', name: 'Tom Vega', email: 'tom@nightowl.bar', role: 'tenant_owner', tenantId: 't3', avatarColor: '#00F5A0' },
  { id: 'u6', name: 'Inés López', email: 'ines@fiestamadrid.es', role: 'entertainer', tenantId: 't4', avatarColor: '#FF1F6D' },
  { id: 'u7', name: 'Camille Roux', email: 'camille@lumiere.fr', role: 'game_manager', tenantId: 't5', avatarColor: '#F5B642' },
];

export const SUBSCRIPTIONS: Subscription[] = TENANTS.map((t, i) => ({
  id: `s${i + 1}`,
  tenantId: t.id,
  plan: t.plan,
  status: t.status === 'suspended' ? 'past_due' : 'active',
  renewsAt: '2026-06-01',
  seats: t.seats,
  priceMonthly: t.mrr,
}));

export const EVENTS: EventItem[] = [
  { id: 'e1', tenantId: 't1', name: 'Compleanno Sorrento 40', venue: 'Hotel Mediterraneo', scheduledAt: '2026-05-07T20:30:00', status: 'live', entertainerId: 'u4' },
  { id: 'e2', tenantId: 't2', name: 'Matrimonio Conte–Bianchi', venue: 'Villa Aurora', scheduledAt: '2026-05-09T19:00:00', status: 'draft', entertainerId: 'u4' },
  { id: 'e3', tenantId: 't3', name: 'Friday Night Trivia', venue: 'NightOwl SoHo', scheduledAt: '2026-05-08T21:00:00', status: 'draft', entertainerId: 'u5' },
];

export const TEAMS: Team[] = [
  { id: 'tm1', eventId: 'e1', name: 'I Falchi', color: '#F5B642', captainPlayerId: 'pl1', score: 8400 },
  { id: 'tm2', eventId: 'e1', name: 'Le Pantere', color: '#E84A8E', captainPlayerId: 'pl4', score: 9200 },
  { id: 'tm3', eventId: 'e1', name: 'I Lupi', color: '#5BC0EB', captainPlayerId: 'pl7', score: 7150 },
  { id: 'tm4', eventId: 'e1', name: 'Le Volpi', color: '#00F5A0', captainPlayerId: 'pl10', score: 6800 },
];

const NICKS = ['Anna', 'Marco', 'Giulia', 'Luca', 'Chiara', 'Davide', 'Elena', 'Federico', 'Greta', 'Hugo', 'Irene', 'Jacopo', 'Kira', 'Leo', 'Mira', 'Niko', 'Ondina', 'Pietro', 'Quinn', 'Rosa'];

export const PLAYERS: Player[] = NICKS.map((n, i) => {
  const tm = TEAMS[i % TEAMS.length]!;
  return {
    id: `pl${i + 1}`,
    sessionId: 'sess1',
    nickname: n,
    teamId: tm.id,
    avatarColor: tm.color,
    connected: i < 17,
    score: Math.floor(Math.random() * 2000),
  };
});

export const QUESTIONS: Question[] = [
  {
    id: 'q1', category: 'Geografia', difficulty: 'easy',
    translations: {
      it: { prompt: 'Qual è la capitale dell\'Australia?', options: ['Sydney', 'Melbourne', 'Canberra', 'Perth'], correctIndex: 2 },
      en: { prompt: 'What is the capital of Australia?', options: ['Sydney', 'Melbourne', 'Canberra', 'Perth'], correctIndex: 2 },
      es: { prompt: '¿Cuál es la capital de Australia?', options: ['Sídney', 'Melbourne', 'Canberra', 'Perth'], correctIndex: 2 },
      fr: { prompt: 'Quelle est la capitale de l\'Australie ?', options: ['Sydney', 'Melbourne', 'Canberra', 'Perth'], correctIndex: 2 },
    }
  },
  {
    id: 'q2', category: 'Musica', difficulty: 'medium',
    translations: {
      it: { prompt: 'Chi ha composto la Quarta Sinfonia "Italiana"?', options: ['Mozart', 'Mendelssohn', 'Verdi', 'Puccini'], correctIndex: 1 },
      en: { prompt: 'Who composed the "Italian" Fourth Symphony?', options: ['Mozart', 'Mendelssohn', 'Verdi', 'Puccini'], correctIndex: 1 },
      es: { prompt: '¿Quién compuso la Cuarta Sinfonía "Italiana"?', options: ['Mozart', 'Mendelssohn', 'Verdi', 'Puccini'], correctIndex: 1 },
      fr: { prompt: 'Qui a composé la Quatrième Symphonie « Italienne » ?', options: ['Mozart', 'Mendelssohn', 'Verdi', 'Puccini'], correctIndex: 1 },
    }
  },
  {
    id: 'q3', category: 'Cinema', difficulty: 'hard',
    translations: {
      it: { prompt: 'Anno di uscita di "C\'era una volta in America"?', options: ['1982', '1984', '1986', '1988'], correctIndex: 1 },
      en: { prompt: 'Release year of "Once Upon a Time in America"?', options: ['1982', '1984', '1986', '1988'], correctIndex: 1 },
      es: { prompt: 'Año de estreno de "Érase una vez en América"?', options: ['1982', '1984', '1986', '1988'], correctIndex: 1 },
      fr: { prompt: 'Année de sortie de "Il était une fois en Amérique" ?', options: ['1982', '1984', '1986', '1988'], correctIndex: 1 },
    }
  },
  {
    id: 'q4', category: 'Sport', difficulty: 'easy',
    translations: {
      it: { prompt: 'In quale anno l\'Italia ha vinto Euro 2020?', options: ['2019', '2020', '2021', '2022'], correctIndex: 2 },
      en: { prompt: 'When did Italy win Euro 2020?', options: ['2019', '2020', '2021', '2022'], correctIndex: 2 },
      es: { prompt: '¿Cuándo ganó Italia la Euro 2020?', options: ['2019', '2020', '2021', '2022'], correctIndex: 2 },
      fr: { prompt: 'Quand l\'Italie a-t-elle remporté l\'Euro 2020 ?', options: ['2019', '2020', '2021', '2022'], correctIndex: 2 },
    }
  },
];

export const MEDIA: MediaAsset[] = [
  { id: 'm1', kind: 'audio', name: 'Quizzone Intro Sting', url: '/audio/intro.mp3', tags: ['intro', 'quizzone'], usageCount: 124 },
  { id: 'm2', kind: 'audio', name: 'Drumroll Reveal', url: '/audio/drumroll.mp3', tags: ['reveal', 'tension'], usageCount: 88 },
  { id: 'm3', kind: 'image', name: 'Hexagon Backdrop', url: '/img/hex.jpg', tags: ['backdrop', 'hub'], usageCount: 47 },
  { id: 'm4', kind: 'video', name: 'Disco Floor Loop', url: '/video/disco.mp4', tags: ['ballo', 'loop'], usageCount: 19 },
  { id: 'm5', kind: 'audio', name: 'SaraMusica Snippet 01', url: '/audio/sara01.mp3', tags: ['saramusica', 'pop'], usageCount: 32 },
  { id: 'm6', kind: 'image', name: 'Coppie Heart Burst', url: '/img/hearts.png', tags: ['coppie'], usageCount: 14 },
];

export const SCORES: Score[] = [
  { id: 'sc1', sessionId: 'sess1', teamId: 'tm2', points: 1500, reason: 'Risposta perfetta', at: '20:31' },
  { id: 'sc2', sessionId: 'sess1', teamId: 'tm1', points: 1200, reason: 'Bonus velocità', at: '20:33' },
  { id: 'sc3', sessionId: 'sess1', teamId: 'tm2', points: 800, reason: 'Round 2', at: '20:36' },
  { id: 'sc4', sessionId: 'sess1', teamId: 'tm3', points: 950, reason: 'Round 2', at: '20:36' },
];

export const KPIS = {
  activeTenants: TENANTS.filter(t => t.status === 'active').length,
  sessionsToday: 14,
  playersThisWeek: 384,
  mrr: TENANTS.reduce((s, t) => s + t.mrr, 0),
};

export function getGame(slug: string): Game | undefined {
  return GAMES.find(g => g.slug === slug);
}

export function getTeam(id: string): Team | undefined {
  return TEAMS.find(t => t.id === id);
}

export type { GameSlug };
