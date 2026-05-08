import React, { createContext, useContext } from 'react';
import { useGetMe, useLogin, useLogout, getGetMeQueryKey, getGetMeQueryOptions } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

export type Role = 'super_admin' | 'tenant_owner' | 'game_manager' | 'entertainer' | 'player';

export const ADMIN_NAV: { key: string; route: string; labelKey: string; roles: Role[] }[] = [
  { key: 'dashboard', route: '/admin', labelKey: 'admin.dashboard', roles: ['super_admin', 'tenant_owner', 'game_manager', 'entertainer'] },
  { key: 'events', route: '/admin/events', labelKey: 'admin.events', roles: ['super_admin', 'tenant_owner', 'game_manager'] },
  { key: 'games', route: '/admin/games', labelKey: 'admin.games', roles: ['super_admin', 'tenant_owner', 'game_manager'] },
  { key: 'card-sets', route: '/admin/card-sets', labelKey: 'admin.card_sets', roles: ['super_admin', 'tenant_owner', 'game_manager'] },
  { key: 'percorso-risate', route: '/admin/percorso-risate', labelKey: 'admin.percorso_risate', roles: ['super_admin', 'tenant_owner', 'game_manager'] },
  { key: 'adult-only', route: '/admin/adult-only', labelKey: 'admin.adult_only', roles: ['super_admin', 'tenant_owner', 'game_manager'] },
  { key: 'quizzes', route: '/admin/quizzes', labelKey: 'admin.quizzes', roles: ['super_admin', 'tenant_owner', 'game_manager'] },
  { key: 'quiz-packs', route: '/admin/quiz-packs', labelKey: 'admin.quiz_packs', roles: ['super_admin', 'tenant_owner', 'game_manager'] },
  { key: 'media', route: '/admin/media', labelKey: 'admin.media', roles: ['super_admin', 'tenant_owner', 'game_manager'] },
  { key: 'teams', route: '/admin/teams', labelKey: 'admin.teams', roles: ['super_admin', 'tenant_owner', 'game_manager', 'entertainer'] },
  { key: 'tenants', route: '/admin/tenants', labelKey: 'admin.tenants', roles: ['super_admin'] },
  { key: 'billing', route: '/admin/billing', labelKey: 'admin.billing', roles: ['super_admin', 'tenant_owner'] },
  { key: 'users', route: '/admin/users', labelKey: 'admin.users', roles: ['super_admin', 'tenant_owner'] },
  { key: 'translations', route: '/admin/translations', labelKey: 'admin.translations', roles: ['super_admin', 'tenant_owner'] },
  { key: 'settings', route: '/admin/settings', labelKey: 'admin.settings', roles: ['super_admin', 'tenant_owner'] },
  { key: 'system', route: '/admin/system', labelKey: 'admin.system', roles: ['super_admin', 'tenant_owner', 'game_manager'] },
];

export interface CurrentUser {
  id: string; email: string; name: string; role: Role; locale: string;
  tenantId: string | null; tenantName: string | null;
}

interface AuthCtx {
  user: CurrentUser | null;
  role: Role;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading } = useGetMe({ query: { ...getGetMeQueryOptions().queryKey ? {} : {}, queryKey: getGetMeQueryKey(), retry: false, staleTime: 30_000 } });
  const loginMut = useLogin();
  const logoutMut = useLogout();

  const user = (data ?? null) as CurrentUser | null;
  const role: Role = user?.role ?? 'player';

  async function login(email: string, password: string) {
    const res = await loginMut.mutateAsync({ data: { email, password } });
    await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
    return res as CurrentUser;
  }

  async function logout() {
    await logoutMut.mutateAsync();
    await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
  }

  return <Ctx.Provider value={{ user, role, isLoading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be inside AuthProvider');
  return v;
}

export function canSee(route: string, role: Role): boolean {
  const item = ADMIN_NAV.find(n => n.route === route);
  if (!item) return true;
  return item.roles.includes(role);
}
