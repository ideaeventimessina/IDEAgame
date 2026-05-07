import { AdminLayout } from './AdminLayout';
import { USERS } from '@/data/mock';
import { useT } from '@/i18n';
import { Plus } from 'lucide-react';

const ROLE_TONE: Record<string, string> = {
  super_admin: '#F5B642',
  tenant_owner: '#E84A8E',
  game_manager: '#5BC0EB',
  entertainer: '#9B5DE5',
  player: '#00F5A0',
};

export default function Users() {
  const t = useT();
  return (
    <AdminLayout title={t('admin.users')}>
      <div className="mb-4 flex justify-end">
        <button className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">
          <Plus className="h-4 w-4" /> Invite user
        </button>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full">
          <thead className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
            <tr><th className="px-5 py-3">User</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Tenant</th></tr>
          </thead>
          <tbody>
            {USERS.map(u => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full text-display font-black text-background"
                         style={{ background: u.avatarColor }}>{u.name[0]}</div>
                    <div className="text-display font-bold">{u.name}</div>
                  </div>
                </td>
                <td className="px-5 py-4 text-muted-foreground">{u.email}</td>
                <td className="px-5 py-4">
                  <span className="rounded-full px-2 py-0.5 text-xs font-bold uppercase"
                        style={{ background: `${ROLE_TONE[u.role]}22`, color: ROLE_TONE[u.role] }}>
                    {t(`admin.role.${u.role}`)}
                  </span>
                </td>
                <td className="px-5 py-4">{u.tenantId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
