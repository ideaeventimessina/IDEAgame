import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard, Gamepad2, BookOpen, Image as ImageIcon, Users2,
  Building2, CreditCard, ShieldCheck, Languages, Settings as SettingsIcon, Search, LogOut, Layers
} from 'lucide-react';
import { useT } from '@/i18n';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { ADMIN_NAV, useAuth, canSee } from '@/auth/roles';
import type { ReactNode } from 'react';

const ICONS: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard, games: Gamepad2, 'card-sets': Layers, quizzes: BookOpen, media: ImageIcon,
  teams: Users2, tenants: Building2, billing: CreditCard, users: ShieldCheck,
  translations: Languages, settings: SettingsIcon,
};

export function AdminLayout({ children, title }: { children: ReactNode; title: string }) {
  const t = useT();
  const [location, navigate] = useLocation();
  const { role, user, logout } = useAuth();

  return (
    <div className="grid min-h-screen w-full grid-cols-[280px_1fr]">
      <aside className="flex flex-col border-r border-border bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-3 px-6 py-7">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground text-display text-2xl font-black">I</div>
          <div>
            <div className="text-display text-xl font-black">{t('app.title')}</div>
            <div className="text-xs text-muted-foreground">Admin Console</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {ADMIN_NAV.filter(n => canSee(n.route, role)).map(n => {
            const Icon = ICONS[n.key];
            const active = location === n.route || (n.route !== '/admin' && location.startsWith(n.route));
            return (
              <Link key={n.key} href={n.route}>
                <div
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                    active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/80 hover-elevate'
                  }`}
                >
                  {Icon ? <Icon className="h-4 w-4" /> : null}
                  {t(n.labelKey)}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          {user ? (
            <div className="rounded-xl bg-sidebar-accent/40 p-3">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">{t(`admin.role.${role}`)}</div>
              <div className="mt-1 truncate text-sm font-bold">{user.name}</div>
              <div className="truncate text-xs text-muted-foreground">{user.tenantName ?? '—'}</div>
              <button
                onClick={async () => { await logout(); navigate('/login'); }}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-xs font-bold hover-elevate"
              >
                <LogOut className="h-3 w-3" /> Logout
              </button>
            </div>
          ) : (
            <button onClick={() => navigate('/login')} className="w-full rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
              Login
            </button>
          )}
        </div>
      </aside>

      <main className="flex flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/80 px-8 py-4 backdrop-blur-md">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">IDEAgame</div>
            <h1 className="text-display text-2xl font-black">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm md:flex">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input className="w-48 bg-transparent outline-none placeholder:text-muted-foreground" placeholder={t('admin.search')} />
            </div>
            <LocaleSwitcher size="sm" />
          </div>
        </header>
        <div className="flex-1 px-8 py-6 pb-28">{children}</div>
      </main>
    </div>
  );
}
