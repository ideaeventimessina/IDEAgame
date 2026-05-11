import { useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { useT } from '@/i18n';
import { Plus, Trash2, Loader2, Pencil, X } from 'lucide-react';
import {
  useListTenants, useCreateTenant, useDeleteTenant, useUpdateTenant,
  getListTenantsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

const STATUS_TONE: Record<string, string> = {
  active: 'bg-green-500/15 text-green-400',
  suspended: 'bg-red-500/15 text-red-400',
  trial: 'bg-amber-500/15 text-amber-400',
};

type TenantItem = {
  id: string; slug: string; name: string; plan: string; brandColor: string;
  locale: string; mrr: number; status?: string;
};

export default function Tenants() {
  const t = useT();
  const qc = useQueryClient();
  const { data: tenants = [], isLoading } = useListTenants();
  const create = useCreateTenant();
  const del = useDeleteTenant();
  const update = useUpdateTenant();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ slug: '', name: '', plan: 'pro', brandColor: '#F5B642', locale: 'it' });

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState({ name: '', plan: 'pro', brandColor: '#F5B642', locale: 'it', status: 'active', mrr: 0 });
  const [editBusy, setEditBusy] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });

  const openEdit = (tn: TenantItem) => {
    setEditId(tn.id);
    setEditForm({
      name: tn.name,
      plan: tn.plan,
      brandColor: tn.brandColor,
      locale: tn.locale,
      status: tn.status ?? 'active',
      mrr: tn.mrr ?? 0,
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editForm.name.trim()) return;
    setEditBusy(true);
    try {
      await update.mutateAsync({ id: editId, data: {
        name: editForm.name,
        plan: editForm.plan,
        brandColor: editForm.brandColor,
        locale: editForm.locale,
        status: editForm.status as 'active' | 'suspended' | 'trial',
        mrr: editForm.mrr,
      }});
      setEditOpen(false);
      refresh();
    } catch { /* silent */ }
    finally { setEditBusy(false); }
  };

  return (
    <AdminLayout title={t('admin.tenants')}>
      <div className="mb-4 flex justify-end">
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover-elevate">
          <Plus className="h-4 w-4" /> Nuovo tenant
        </button>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Tenant</th>
                  <th className="px-5 py-3">Slug</th>
                  <th className="px-5 py-3">Plan</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">MRR</th>
                  <th className="px-5 py-3">Locale</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {(tenants as TenantItem[]).map(tn => (
                  <tr key={tn.id} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl text-display font-black text-background shrink-0"
                             style={{ background: tn.brandColor }}>{tn.name[0]}</div>
                        <div className="text-display font-bold">{tn.name}</div>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono text-sm text-muted-foreground">{tn.slug}</td>
                    <td className="px-5 py-4 capitalize text-sm">{tn.plan}</td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${STATUS_TONE[tn.status ?? 'active'] ?? 'bg-secondary text-muted-foreground'}`}>
                        {tn.status ?? 'active'}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono text-sm">€ {tn.mrr}</td>
                    <td className="px-5 py-4 font-mono text-sm uppercase">{tn.locale}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(tn)}
                          className="rounded-lg border border-border p-2 hover-elevate text-primary"
                          title="Modifica tenant"
                        ><Pencil className="h-4 w-4" /></button>
                        <button
                          onClick={async () => { if (confirm(`Eliminare ${tn.name}? Questa azione è irreversibile.`)) { await del.mutateAsync({ id: tn.id }); refresh(); } }}
                          className="rounded-lg border border-border p-2 hover-elevate text-destructive"
                          title="Elimina tenant"
                        ><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {tenants.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">Nessun tenant.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Crea tenant ───────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-display text-2xl font-black mb-4">Nuovo tenant</div>
            <div className="space-y-3">
              <Field label="Nome *" value={form.name} onChange={v => setForm({ ...form, name: v })} />
              <Field label="Slug *" value={form.slug} onChange={v => setForm({ ...form, slug: v.toLowerCase().replace(/\s+/g, '-') })} placeholder="mango-events" />
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block">
                    <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Plan</div>
                    <select value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })}
                            className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary">
                      {['starter', 'pro', 'enterprise'].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </label>
                </div>
                <div className="flex-1">
                  <label className="block">
                    <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Locale</div>
                    <select value={form.locale} onChange={e => setForm({ ...form, locale: e.target.value })}
                            className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary">
                      {['it', 'en', 'es', 'fr'].map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                    </select>
                  </label>
                </div>
              </div>
              <label className="block">
                <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Colore brand</div>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2">
                  <input type="color" value={form.brandColor} onChange={e => setForm({ ...form, brandColor: e.target.value })}
                         className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
                  <span className="font-mono text-sm">{form.brandColor}</span>
                </div>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="rounded-xl border border-border px-4 py-2 hover-elevate">Annulla</button>
              <button
                disabled={create.isPending || !form.name.trim() || !form.slug.trim()}
                onClick={async () => { await create.mutateAsync({ data: form }); setOpen(false); refresh(); }}
                className="rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50"
              >{create.isPending ? 'Creando…' : 'Crea'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modifica tenant ───────────────────────────────── */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={() => setEditOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Pencil className="h-5 w-5" />
                </div>
                <div className="text-display text-2xl font-black">Modifica tenant</div>
              </div>
              <button onClick={() => setEditOpen(false)} className="rounded-lg border border-border p-1.5 hover-elevate">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <Field label="Nome *" value={editForm.name} onChange={v => setEditForm({ ...editForm, name: v })} />
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block">
                    <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Plan</div>
                    <select value={editForm.plan} onChange={e => setEditForm({ ...editForm, plan: e.target.value })}
                            className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary">
                      {['starter', 'pro', 'enterprise'].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </label>
                </div>
                <div className="flex-1">
                  <label className="block">
                    <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Status</div>
                    <select value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                            className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary">
                      {['active', 'trial', 'suspended'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block">
                    <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Colore brand</div>
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2">
                      <input type="color" value={editForm.brandColor} onChange={e => setEditForm({ ...editForm, brandColor: e.target.value })}
                             className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
                      <span className="font-mono text-sm">{editForm.brandColor}</span>
                    </div>
                  </label>
                </div>
                <div className="flex-1">
                  <label className="block">
                    <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Locale</div>
                    <select value={editForm.locale} onChange={e => setEditForm({ ...editForm, locale: e.target.value })}
                            className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary">
                      {['it', 'en', 'es', 'fr'].map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                    </select>
                  </label>
                </div>
              </div>
              <label className="block">
                <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">MRR (€)</div>
                <input type="number" min={0} value={editForm.mrr}
                       onChange={e => setEditForm({ ...editForm, mrr: parseInt(e.target.value) || 0 })}
                       className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary" />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setEditOpen(false)} className="rounded-xl border border-border px-4 py-2 hover-elevate">Annulla</button>
              <button
                disabled={editBusy || !editForm.name.trim()}
                onClick={handleSaveEdit}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50"
              >
                {editBusy ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</> : 'Salva modifiche'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
             className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary placeholder:text-muted-foreground/50" />
    </label>
  );
}
