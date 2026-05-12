import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard, Gamepad2, BookOpen, Image as ImageIcon, Users2,
  Building2, CreditCard, ShieldCheck, Languages, Settings as SettingsIcon,
  LogOut, Layers, Sparkles, Menu, X, Route, Flame, CalendarDays, Wand2, Volume2, ClipboardList
} from 'lucide-react';
import { useT } from '@/i18n';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { ADMIN_NAV, useAuth, canSee } from '@/auth/roles';
import { type ReactNode, useState } from 'react';

const ICONS: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard, events: CalendarDays, games: Gamepad2, 'card-sets': Layers, quizzes: BookOpen, 'quiz-packs': Sparkles,
  media: ImageIcon, teams: Users2, tenants: Building2, billing: CreditCard, users: ShieldCheck,
  translations: Languages, settings: SettingsIcon, 'percorso-risate': Route, 'adult-only': Flame,
  'jonny-creator': Wand2, 'audio': Volume2, audit: ClipboardList,
};

export function AdminLayout({ children, title }: { children: ReactNode; title: string }) {
  const t = useT();
  const [location, navigate] = useLocation();
  const { role, user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const NavLinks = () => (
    <>
      <nav className="flex-1 min-h-0 overflow-y-auto space-y-1 px-3 pb-2">
        {ADMIN_NAV.filter(n => canSee(n.route, role)).map(n => {
          const Icon = ICONS[n.key];
          const active = location === n.route || (n.route !== '/admin' && location.startsWith(n.route));
          return (
            <Link key={n.key} href={n.route}>
              <div
                onClick={() => setDrawerOpen(false)}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                  active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/80 hover-elevate'
                }`}
              >
                {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
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
    </>
  );

  return (
    <div className="h-screen w-full overflow-hidden">

      {/* ── Mobile drawer overlay ──────────────────────────────────── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── Mobile slide-over sidebar ─────────────────────────────── */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-border bg-sidebar text-sidebar-foreground transition-transform duration-200 md:hidden ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center rounded-xl bg-white px-2 py-1">
              <img src="/logo.png" alt="IDEA Games" className="h-8 w-auto object-contain" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Admin Console</div>
            </div>
          </div>
          <button onClick={() => setDrawerOpen(false)} className="rounded-lg border border-border p-1.5 hover-elevate">
            <X className="h-4 w-4" />
          </button>
        </div>
        <NavLinks />
      </aside>

      {/* ── Desktop sidebar ───────────────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 hidden w-[280px] flex-col border-r border-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-3 px-6 py-5">
          <div className="flex items-center justify-center rounded-xl bg-white px-2.5 py-1.5">
            <img src="/logo.png" alt="IDEA Games" className="h-9 w-auto object-contain" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Admin Console</div>
          </div>
        </div>
        <NavLinks />
      </aside>

      {/* ── Main content ──────────────────────────────────────────── */}
      <div className="md:pl-[280px] h-full flex flex-col overflow-hidden">
        <header className="shrink-0 z-30 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setDrawerOpen(true)}
              className="rounded-lg border border-border p-2 hover-elevate md:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-widest text-muted-foreground hidden sm:block">IDEAgame</div>
              <h1 className="text-display text-lg font-black sm:text-2xl truncate">{title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <LocaleSwitcher size="sm" />
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4 pb-6 sm:px-6 sm:py-6 lg:px-8">{children}</div>
      </div>
    </div>
  );
}
