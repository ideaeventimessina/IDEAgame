import { useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { useT } from '@/i18n';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import {
  useListTenants, useCreateTenant, useDeleteTenant,
  getListTenantsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

export default function Tenants() {
  const t = useT();
  const qc = useQueryClient();
  const { data: tenants = [], isLoading } = useListTenants();
  const create = useCreateTenant();
  const del = useDeleteTenant();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ slug: '', name: '', plan: 'pro', brandColor: '#F5B642', locale: 'it' });

  const refresh = () => qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });

  return (
    <AdminLayout title={t('admin.tenants')}>
      <div className="mb-4 flex justify-end">
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">
          <Plus className="h-4 w-4" /> New tenant
        </button>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full">
            <thead className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Tenant</th>
                <th className="px-5 py-3">Slug</th>
                <th className="px-5 py-3">Plan</th>
                <th className="px-5 py-3">MRR</th>
                <th className="px-5 py-3">Locale</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(tn => (
                <tr key={tn.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl text-display font-black text-background"
                           style={{ background: tn.brandColor }}>{tn.name[0]}</div>
                      <div className="text-display font-bold">{tn.name}</div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-mono text-sm text-muted-foreground">{tn.slug}</td>
                  <td className="px-5 py-4 capitalize">{tn.plan}</td>
                  <td className="px-5 py-4 text-mono">€ {tn.mrr}</td>
                  <td className="px-5 py-4 uppercase text-mono">{tn.locale}</td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={async () => { if (confirm(`Delete ${tn.name}?`)) { await del.mutateAsync({ id: tn.id }); refresh(); } }}
                      className="rounded-lg border border-border p-2 hover-elevate text-destructive"
                    ><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">No tenants yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6" onClick={e => e.stopPropagation()}>
            <div className="text-display text-2xl font-black">New tenant</div>
            <div className="mt-4 space-y-3">
              <Field label="Name" value={form.name} onChange={v => setForm({ ...form, name: v })} />
              <Field label="Slug" value={form.slug} onChange={v => setForm({ ...form, slug: v })} />
              <Field label="Plan" value={form.plan} onChange={v => setForm({ ...form, plan: v })} />
              <Field label="Brand color" value={form.brandColor} onChange={v => setForm({ ...form, brandColor: v })} />
              <Field label="Locale" value={form.locale} onChange={v => setForm({ ...form, locale: v })} />
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="rounded-xl border border-border px-4 py-2">Cancel</button>
              <button
                disabled={create.isPending}
                onClick={async () => {
                  await create.mutateAsync({ data: form });
                  setOpen(false);
                  refresh();
                }}
                className="rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50"
              >{create.isPending ? 'Creating…' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <input value={value} onChange={e => onChange(e.target.value)}
             className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary" />
    </label>
  );
}
