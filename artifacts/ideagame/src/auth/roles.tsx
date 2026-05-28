import React, { createContext, useContext } from 'react';
import { useGetMe, useLogin, useLogout, getGetMeQueryKey, getGetMeQueryOptions } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

export type Role = 'super_admin' | 'tenant_owner' | 'game_manager' | 'entertainer' | 'player';

export const ADMIN_NAV: { key: string; route: string; label: string; roles: Role[] }[] = [
  { key: 'dashboard', route: '/admin/giochi',   label: 'Dashboard',       roles: ['super_admin','tenant_owner','game_manager','entertainer'] },
  { key: 'show',      route: '/admin/events',   label: 'Show',            roles: ['super_admin','tenant_owner','game_manager'] },
  { key: 'giochi',    route: '/admin/giochi',   label: 'Giochi',          roles: ['super_admin','tenant_owner','game_manager'] },
  { key: 'media',     route: '/admin/media',    label: 'Libreria Media',  roles: ['super_admin','tenant_owner','game_manager'] },
  { key: 'settings',  route: '/admin/settings', label: 'Impostazioni',    roles: ['super_admin','tenant_owner','game_manager','entertainer'] },
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
