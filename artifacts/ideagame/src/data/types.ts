export type Locale = 'it' | 'en' | 'es' | 'fr';

export type Role = 'super_admin' | 'tenant_owner' | 'game_manager' | 'entertainer' | 'player';

export type GameSlug =
  | 'percorso-a-risate'
  | 'gioco-delle-coppie'
  | 'quizzone'
  | 'saramusica'
  | 'adult-only'
  | 'sfida-di-ballo';

export interface Tenant {
  id: string;
  name: string;
  plan: 'starter' | 'pro' | 'studio' | 'enterprise';
  status: 'active' | 'suspended';
  seats: number;
  mrr: number;
  locale: Locale;
  brandColor: string;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  tenantId: string;
  avatarColor: string;
}

export interface Subscription {
  id: string;
  tenantId: string;
  plan: 'starter' | 'pro' | 'studio' | 'enterprise';
  status: 'active' | 'past_due' | 'canceled';
  renewsAt: string;
  seats: number;
  priceMonthly: number;
}

export interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  features: string[];
  maxPlayers: number;
  maxGames: number;
  highlight: boolean;
}

export interface EventItem {
  id: string;
  tenantId: string;
  name: string;
  venue: string;
  scheduledAt: string;
  status: 'draft' | 'live' | 'ended';
  entertainerId: string;
}

export interface Session {
  id: string;
  eventId: string;
  gameId: string;
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'completed';
}

export interface Team {
  id: string;
  eventId: string;
  name: string;
  color: string;
  captainPlayerId: string;
  score: number;
}

export interface Player {
  id: string;
  sessionId: string;
  nickname: string;
  teamId: string;
  avatarColor: string;
  connected: boolean;
  score: number;
}

export interface Game {
  id: string;
  slug: GameSlug;
  name: string;
  tagline: string;
  accentColor: string;
  icon: string;
  enabled: boolean;
  adultOnly?: boolean;
  settings: {
    rounds: number;
    timeLimit: number;
    scoringWeight: number;
  };
}

export interface Question {
  id: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  media?: string;
  translations: Record<Locale, {
    prompt: string;
    options: string[];
    correctIndex: number;
  }>;
}

export interface MediaAsset {
  id: string;
  kind: 'image' | 'audio' | 'video';
  name: string;
  url: string;
  tags: string[];
  usageCount: number;
}

export interface Translation {
  key: string;
  values: Record<Locale, string>;
}

export interface Score {
  id: string;
  sessionId: string;
  teamId: string;
  points: number;
  reason: string;
  at: string;
}
