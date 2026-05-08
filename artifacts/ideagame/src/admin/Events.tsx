import { useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { Plus, Trash2, Loader2, ExternalLink, Calendar } from 'lucide-react';
import {
  useListEvents, useCreateEvent, useDeleteEvent,
  useListTenants,
  getListEventsQueryKey, getListTenantsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useAuth } from '@/auth/roles';

const STATUS_COLORS: Record<string, string> = {
  live: 'bg-destructive text-destructive-foreground',
  draft: 'bg-secondary text-secondary-foreground',
  scheduled: 'bg-primary/20 text-primary',
  ended: 'bg-muted text-muted-foreground',
};

export default function Events() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { role } = useAuth();
  const isSuperAdmin = role === 'super_admin';
  const { data: events = [], isLoading } = useListEvents();
  const { data: tenants = [] } = useListTenants({ query: { queryKey: getListTenantsQueryKey(), enabled: isSuperAdmin } });
  const create = useCreateEvent();
  const del = useDeleteEvent();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', venue: '', brandColor: '#F5B642', expectedPlayers: 20, tenantId: '' });

  const refresh = () => qc.invalidateQueries({ queryKey: getListEventsQueryKey() });

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    try {
      await create.mutateAsync({ data: {
        name: form.name,
        venue: form.venue,
        brandColor: form.brandColor,
        expectedPlayers: form.expectedPlayers,
        ...(isSuperAdmin && form.tenantId ? { tenantId: form.tenantId } : {}),
      }});
      setOpen(false);
      setForm({ name: '', venue: '', brandColor: '#F5B642', expectedPlayers: 20, tenantId: '' });
      refresh();
    } catch { /* errors shown via disabled state */ }
  };

  return (
    <AdminLayout title="Eventi">
      <div className="mb-4 flex justify-end">
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover-elevate">
          <Plus className="h-4 w-4" /> Nuovo evento
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
                  <th className="px-5 py-3">Evento</th>
                  <th className="px-5 py-3">Venue</th>
                  <th className="px-5 py-3">Join Code</th>
                  <th className="px-5 py-3">Data</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {events.map(ev => (
                  <tr key={ev.id} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl text-display font-black text-background shrink-0"
                             style={{ background: ev.brandColor || '#F5B642' }}>{ev.name[0]}</div>
                        <div className="text-display font-bold">{ev.name}</div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">{ev.venue || '—'}</td>
                    <td className="px-5 py-4">
                      <span className="rounded-lg bg-secondary px-2.5 py-1 font-mono text-sm font-bold tracking-wider">{ev.joinCode}</span>
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">
                      {ev.startsAt ? new Date(ev.startsAt).toLocaleDateString('it-IT') : '—'}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${STATUS_COLORS[ev.status] ?? 'bg-muted text-muted-foreground'}`}>
                        {ev.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => navigate(`/control?e=${ev.id}`)}
                          className="rounded-lg border border-border p-2 hover-elevate"
                          title="Apri controllo"
                        ><ExternalLink className="h-4 w-4" /></button>
                        <button
                          onClick={async () => {
                            if (confirm(`Eliminare "${ev.name}"?`)) {
                              await del.mutateAsync({ id: ev.id });
                              refresh();
                            }
                          }}
                          className="rounded-lg border border-border p-2 hover-elevate text-destructive"
                          title="Elimina"
                        ><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">Nessun evento. Crea il primo!</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Calendar className="h-5 w-5" />
              </div>
              <div className="text-display text-2xl font-black">Nuovo evento</div>
            </div>
            <div className="space-y-3">
              <Field label="Nome evento *" value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="Compleanno Anna, Matrimonio Rossi…" />
              <Field label="Venue" value={form.venue} onChange={v => setForm({ ...form, venue: v })} placeholder="Villa Romana, Milano" />
              {isSuperAdmin && (
                <label className="block">
                  <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Tenant *</div>
                  <select
                    value={form.tenantId}
                    onChange={e => setForm({ ...form, tenantId: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary"
                  >
                    <option value="">— seleziona tenant —</option>
                    {tenants.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block">
                    <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Colore brand</div>
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2">
                      <input type="color" value={form.brandColor} onChange={e => setForm({ ...form, brandColor: e.target.value })}
                             className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
                      <span className="font-mono text-sm">{form.brandColor}</span>
                    </div>
                  </label>
                </div>
                <div className="flex-1">
                  <label className="block">
                    <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Giocatori attesi</div>
                    <input
                      type="number" min={1} max={500}
                      value={form.expectedPlayers}
                      onChange={e => setForm({ ...form, expectedPlayers: parseInt(e.target.value) || 20 })}
                      className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary"
                    />
                  </label>
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="rounded-xl border border-border px-4 py-2 hover-elevate">Annulla</button>
              <button
                disabled={create.isPending || !form.name.trim() || (isSuperAdmin && !form.tenantId)}
                onClick={handleCreate}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50"
              >
                {create.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Creando…</> : 'Crea evento'}
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
