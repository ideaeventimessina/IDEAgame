import { useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { useT } from '@/i18n';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import {
  useListUsers, useCreateUser, useDeleteUser, useListTenants,
  getListUsersQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/roles';

const ROLE_TONE: Record<string, string> = {
  super_admin: '#F5B642', tenant_owner: '#E84A8E',
  game_manager: '#5BC0EB', entertainer: '#9B5DE5', player: '#00F5A0',
};

export default function Users() {
  const t = useT();
  const { role, user } = useAuth();
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useListUsers();
  const { data: tenants = [] } = useListTenants({ query: { queryKey: ['/api/tenants'] as const, enabled: role === 'super_admin' } });
  const create = useCreateUser();
  const del = useDeleteUser();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'entertainer', locale: 'it', tenantId: '' });

  const refresh = () => qc.invalidateQueries({ queryKey: getListUsersQueryKey() });

  return (
    <AdminLayout title={t('admin.users')}>
      <div className="mb-4 flex justify-end">
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">
          <Plus className="h-4 w-4" /> Invite user
        </button>
      </div>
      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full">
            <thead className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr><th className="px-5 py-3">User</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Tenant</th><th className="px-5 py-3"></th></tr>
            </thead>
            <tbody>
              {users.map(u => {
                const tn = tenants.find(t => t.id === u.tenantId);
                return (
                  <tr key={u.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full text-display font-black text-background"
                             style={{ background: ROLE_TONE[u.role] }}>{u.name[0]}</div>
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
                    <td className="px-5 py-4">{tn?.name ?? (u.tenantId ? '—' : '(global)')}</td>
                    <td className="px-5 py-4 text-right">
                      {u.id !== user?.id && (
                        <button
                          onClick={async () => { if (confirm(`Delete ${u.name}?`)) { await del.mutateAsync({ id: u.id }); refresh(); } }}
                          className="rounded-lg border border-border p-2 hover-elevate text-destructive"
                        ><Trash2 className="h-4 w-4" /></button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6" onClick={e => e.stopPropagation()}>
            <div className="text-display text-2xl font-black">Invite user</div>
            <div className="mt-4 space-y-3">
              <Field label="Name" value={form.name} onChange={v => setForm({ ...form, name: v })} />
              <Field label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} />
              <Field label="Password" value={form.password} onChange={v => setForm({ ...form, password: v })} type="password" />
              <label className="block">
                <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Role</div>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
                        className="w-full rounded-lg border border-border bg-background/40 px-3 py-2">
                  {(role === 'super_admin' ? ['super_admin', 'tenant_owner', 'game_manager', 'entertainer'] : ['game_manager', 'entertainer']).map(r =>
                    <option key={r} value={r}>{t(`admin.role.${r}`)}</option>
                  )}
                </select>
              </label>
              {role === 'super_admin' && (
                <label className="block">
                  <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Tenant (optional)</div>
                  <select value={form.tenantId} onChange={e => setForm({ ...form, tenantId: e.target.value })}
                          className="w-full rounded-lg border border-border bg-background/40 px-3 py-2">
                    <option value="">— (global) —</option>
                    {tenants.map(tn => <option key={tn.id} value={tn.id}>{tn.name}</option>)}
                  </select>
                </label>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="rounded-xl border border-border px-4 py-2">Cancel</button>
              <button
                disabled={create.isPending || !form.email || !form.password}
                onClick={async () => {
                  const data = { ...form, tenantId: form.tenantId || undefined } as any;
                  await create.mutateAsync({ data });
                  setOpen(false);
                  refresh();
                }}
                className="rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50"
              >{create.isPending ? 'Inviting…' : 'Invite'}</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
             className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary" />
    </label>
  );
}
