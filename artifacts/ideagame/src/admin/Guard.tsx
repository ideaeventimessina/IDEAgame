import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth, canSee, ADMIN_NAV } from '@/auth/roles';
import { AdminLayout } from './AdminLayout';
import { useT } from '@/i18n';
import { ShieldAlert, Loader2 } from 'lucide-react';

export function Guard({ route, children }: { route: string; children: ReactNode }) {
  const { role, user, isLoading } = useAuth();
  const t = useT();
  const [, navigate] = useLocation();

  // ── [AdminAuth] diagnostic console log ──────────────────────────────────────
  useEffect(() => {
    if (isLoading) return;
    const isSuperAdmin = role === 'super_admin';
    const visibleNavItems = ADMIN_NAV.filter(n => canSee(n.route, role)).map(n => n.key);
    const canAccessRoute = canSee(route, role);
    const redirectTarget = !user ? `/login?redirect=${encodeURIComponent(window.location.pathname)}` : (!canAccessRoute ? '/admin (access restricted)' : null);
    // eslint-disable-next-line no-console
    console.log('[AdminAuth]', {
      email: user?.email ?? null,
      role,
      isSuperAdmin,
      tenantId: user?.tenantId ?? null,
      route,
      canAccessRoute,
      visibleNavItems,
      redirectTarget,
    });
  }, [isLoading, user, role, route]);

  useEffect(() => {
    if (!isLoading && !user) {
      const redirect = encodeURIComponent(window.location.pathname + window.location.search);
      navigate(`/login?redirect=${redirect}`);
    }
  }, [isLoading, user, navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return null;
  if (canSee(route, role)) return <>{children}</>;

  return (
    <AdminLayout title={t('admin.dashboard')}>
      <div className="mx-auto mt-12 max-w-xl rounded-2xl border border-destructive/40 bg-destructive/10 p-10 text-center">
        <ShieldAlert className="mx-auto h-14 w-14 text-destructive" />
        <div className="mt-4 text-display text-3xl font-black">Access restricted</div>
        <div className="mt-2 text-muted-foreground">
          Your role ({t(`admin.role.${role}`)}) doesn't have permission for this page.
        </div>
        <button onClick={() => navigate('/admin')}
                className="mt-6 rounded-xl bg-primary px-5 py-2.5 font-bold text-primary-foreground">
          Back to dashboard
        </button>
      </div>
    </AdminLayout>
  );
}
