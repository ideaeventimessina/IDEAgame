import React, { createContext, useContext, useState } from 'react';
import type { Role } from '@/data/types';
import { USERS } from '@/data/mock';

export const ADMIN_NAV: { key: string; route: string; labelKey: string; roles: Role[] }[] = [
  { key: 'dashboard', route: '/admin', labelKey: 'admin.dashboard', roles: ['super_admin', 'tenant_owner', 'game_manager', 'entertainer'] },
  { key: 'games', route: '/admin/games', labelKey: 'admin.games', roles: ['super_admin', 'tenant_owner', 'game_manager'] },
  { key: 'quizzes', route: '/admin/quizzes', labelKey: 'admin.quizzes', roles: ['super_admin', 'tenant_owner', 'game_manager'] },
  { key: 'media', route: '/admin/media', labelKey: 'admin.media', roles: ['super_admin', 'tenant_owner', 'game_manager'] },
  { key: 'teams', route: '/admin/teams', labelKey: 'admin.teams', roles: ['super_admin', 'tenant_owner', 'game_manager', 'entertainer'] },
  { key: 'tenants', route: '/admin/tenants', labelKey: 'admin.tenants', roles: ['super_admin'] },
  { key: 'billing', route: '/admin/billing', labelKey: 'admin.billing', roles: ['super_admin', 'tenant_owner'] },
  { key: 'users', route: '/admin/users', labelKey: 'admin.users', roles: ['super_admin', 'tenant_owner'] },
  { key: 'translations', route: '/admin/translations', labelKey: 'admin.translations', roles: ['super_admin', 'tenant_owner'] },
  { key: 'settings', route: '/admin/settings', labelKey: 'admin.settings', roles: ['super_admin', 'tenant_owner'] },
  { key: 'system', route: '/admin/system', labelKey: 'admin.system', roles: ['super_admin', 'tenant_owner', 'game_manager'] },
];

interface AuthCtx {
  currentUserId: string;
  setCurrentUserId: (id: string) => void;
  role: Role;
  setRole: (r: Role) => void;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUserId, setCurrentUserId] = useState(USERS[0]!.id);
  const [role, setRole] = useState<Role>(USERS[0]!.role);
  return <Ctx.Provider value={{ currentUserId, setCurrentUserId, role, setRole }}>{children}</Ctx.Provider>;
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
