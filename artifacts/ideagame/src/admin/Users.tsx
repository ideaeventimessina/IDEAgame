import { useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { useT } from '@/i18n';
import { Plus, Trash2, Loader2, Pencil, X } from 'lucide-react';
import {
  useListUsers, useCreateUser, useDeleteUser, useUpdateUser, useListTenants,
  getListUsersQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/roles';

const ROLE_TONE: Record<string, string> = {
  super_admin: '#F5B642', tenant_owner: '#E84A8E',
  game_manager: '#5BC0EB', entertainer: '#9B5DE5', player: '#00F5A0',
};

type UserItem = {
  id: string; name: string; email: string; role: string; locale: string;
  tenantId?: string | null; createdAt: string;
};

export default function Users() {
  const t = useT();
  const { role, user } = useAuth();
  const qc = useQueryClient();
  const isSuperAdmin = role === 'super_admin';
  const { data: users = [], isLoading } = useListUsers();
  const { data: tenants = [] } = useListTenants({ query: { queryKey: ['/api/tenants'] as const, enabled: isSuperAdmin } });
  const create = useCreateUser();
  const del = useDeleteUser();
  const update = useUpdateUser();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'entertainer', locale: 'it', tenantId: '' });

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState({ name: '', role: 'entertainer', locale: 'it', password: '' });
  const [editBusy, setEditBusy] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: getListUsersQueryKey() });

  const openEdit = (u: UserItem) => {
    setEditId(u.id);
    setEditForm({ name: u.name, role: u.role, locale: u.locale, password: '' });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editForm.name.trim()) return;
    setEditBusy(true);
    try {
      const data: Record<string, string> = { name: editForm.name, locale: editForm.locale };
      if (isSuperAdmin) data['role'] = editForm.role;
      if (editForm.password) data['password'] = editForm.password;
      await update.mutateAsync({ id: editId, data: data as Parameters<typeof update.mutateAsync>[0]['data'] });
      setEditOpen(false);
      refresh();
    } catch { /* silent */ }
    finally { setEditBusy(false); }
  };

  const availableRoles = isSuperAdmin
    ? ['super_admin', 'tenant_owner', 'game_manager', 'entertainer']
    : ['game_manager', 'entertainer'];

  return (
    <AdminLayout title={t('admin.users')}>
      <div className="mb-4 flex justify-end">
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover-elevate">
          <Plus className="h-4 w-4" /> Invite user
        </button>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Utente</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Ruolo</th>
                  <th className="px-5 py-3">Tenant</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {(users as UserItem[]).map(u => {
                  const tn = tenants.find(t => t.id === u.tenantId);
                  return (
                    <tr key={u.id} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full text-display font-black text-background shrink-0"
                               style={{ background: ROLE_TONE[u.role] ?? '#888' }}>{u.name[0]}</div>
                          <div className="text-display font-bold">{u.name}</div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">{u.email}</td>
                      <td className="px-5 py-4">
                        <span className="rounded-full px-2.5 py-0.5 text-xs font-bold uppercase"
                              style={{ background: `${ROLE_TONE[u.role] ?? '#888'}22`, color: ROLE_TONE[u.role] ?? '#888' }}>
                          {t(`admin.role.${u.role}`)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">{tn?.name ?? (u.tenantId ? '—' : '(global)')}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(u)}
                            className="rounded-lg border border-border p-2 hover-elevate text-primary"
                            title="Modifica utente"
                          ><Pencil className="h-4 w-4" /></button>
                          {u.id !== user?.id && (
                            <button
                              onClick={async () => { if (confirm(`Eliminare ${u.name}?`)) { await del.mutateAsync({ id: u.id }); refresh(); } }}
                              className="rounded-lg border border-border p-2 hover-elevate text-destructive"
                              title="Elimina utente"
                            ><Trash2 className="h-4 w-4" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-muted-foreground">Nessun utente.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Invite user ───────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-display text-2xl font-black mb-4">Invita utente</div>
            <div className="space-y-3">
              <Field label="Nome" value={form.name} onChange={v => setForm({ ...form, name: v })} />
              <Field label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} />
              <Field label="Password" value={form.password} onChange={v => setForm({ ...form, password: v })} type="password" />
              <label className="block">
                <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Ruolo</div>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
                        className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary">
                  {availableRoles.map(r => <option key={r} value={r}>{t(`admin.role.${r}`)}</option>)}
                </select>
              </label>
              {isSuperAdmin && (
                <label className="block">
                  <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Tenant (opzionale)</div>
                  <select value={form.tenantId} onChange={e => setForm({ ...form, tenantId: e.target.value })}
                          className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary">
                    <option value="">— (global) —</option>
                    {tenants.map(tn => <option key={tn.id} value={tn.id}>{tn.name}</option>)}
                  </select>
                </label>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="rounded-xl border border-border px-4 py-2 hover-elevate">Annulla</button>
              <button
                disabled={create.isPending || !form.email || !form.password}
                onClick={async () => {
                  const data = { ...form, tenantId: form.tenantId || undefined } as Parameters<typeof create.mutateAsync>[0]['data'];
                  await create.mutateAsync({ data });
                  setOpen(false);
                  refresh();
                }}
                className="rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50"
              >{create.isPending ? 'Invitando…' : 'Invita'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit user ─────────────────────────────────────── */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={() => setEditOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Pencil className="h-5 w-5" />
                </div>
                <div className="text-display text-2xl font-black">Modifica utente</div>
              </div>
              <button onClick={() => setEditOpen(false)} className="rounded-lg border border-border p-1.5 hover-elevate">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <Field label="Nome *" value={editForm.name} onChange={v => setEditForm({ ...editForm, name: v })} />
              {isSuperAdmin && (
                <label className="block">
                  <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Ruolo</div>
                  <select value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                          className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary">
                    {availableRoles.map(r => <option key={r} value={r}>{t(`admin.role.${r}`)}</option>)}
                  </select>
                </label>
              )}
              <label className="block">
                <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Lingua</div>
                <select value={editForm.locale} onChange={e => setEditForm({ ...editForm, locale: e.target.value })}
                        className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary">
                  {['it', 'en', 'es', 'fr'].map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                </select>
              </label>
              <Field label="Nuova password (lascia vuoto per non cambiare)" value={editForm.password}
                     onChange={v => setEditForm({ ...editForm, password: v })} type="password" />
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setEditOpen(false)} className="rounded-xl border border-border px-4 py-2 hover-elevate">Annulla</button>
              <button
                disabled={editBusy || !editForm.name.trim()}
                onClick={handleSaveEdit}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50"
              >
                {editBusy ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</> : 'Salva'}
              </button>
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
