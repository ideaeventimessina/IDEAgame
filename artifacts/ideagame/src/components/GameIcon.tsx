import { Route, Heart, Brain, Music, Flame, Sparkles } from 'lucide-react';
import type { ComponentProps } from 'react';

const MAP = { route: Route, heart: Heart, brain: Brain, music: Music, flame: Flame, sparkles: Sparkles } as const;

export function GameIcon({ name, ...rest }: { name: string } & ComponentProps<typeof Route>) {
  const Icon = (MAP as Record<string, typeof Route>)[name] ?? Sparkles;
  return <Icon {...rest} />;
}
