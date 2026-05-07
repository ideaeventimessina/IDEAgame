import type { ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useAuth, canSee } from '@/auth/roles';
import { AdminLayout } from './AdminLayout';
import { useT } from '@/i18n';
import { ShieldAlert } from 'lucide-react';

export function Guard({ route, children }: { route: string; children: ReactNode }) {
  const { role } = useAuth();
  const t = useT();
  const [, navigate] = useLocation();
  if (canSee(route, role)) return <>{children}</>;
  return (
    <AdminLayout title={t('admin.dashboard')}>
      <div className="mx-auto mt-12 max-w-xl rounded-2xl border border-destructive/40 bg-destructive/10 p-10 text-center">
        <ShieldAlert className="mx-auto h-14 w-14 text-destructive" />
        <div className="mt-4 text-display text-3xl font-black">Access restricted</div>
        <div className="mt-2 text-muted-foreground">
          Your current role doesn't have permission to view this page. Switch role from the sidebar.
        </div>
        <button onClick={() => navigate('/admin')}
                className="mt-6 rounded-xl bg-primary px-5 py-2.5 font-bold text-primary-foreground">
          Back to dashboard
        </button>
      </div>
    </AdminLayout>
  );
}
