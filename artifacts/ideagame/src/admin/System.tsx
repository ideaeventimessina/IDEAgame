import { useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { Wifi, MonitorPlay, FileText, AlertTriangle, Trash2, Plus, Loader2 } from 'lucide-react';
import {
  useListDevices, getListDevicesQueryKey, useCreateDevice, useDeleteDevice,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

const KINDS: { value: 'projector' | 'controller' | 'host_tablet' | 'player_phone'; label: string }[] = [
  { value: 'projector', label: 'Proiettore' },
  { value: 'controller', label: 'Controller' },
  { value: 'host_tablet', label: 'Tablet host' },
  { value: 'player_phone', label: 'Telefono giocatore' },
];

export default function System() {
  const qc = useQueryClient();
  const { data: devices = [], isLoading } = useListDevices();
  const create = useCreateDevice();
  const remove = useDeleteDevice();
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<typeof KINDS[number]['value']>('projector');
  const [error, setError] = useState<string | null>(null);

  const onCreate = async () => {
    if (!label.trim()) return;
    setError(null);
    try {
      await create.mutateAsync({ data: { kind, label: label.trim() } });
      setLabel('');
      await qc.invalidateQueries({ queryKey: getListDevicesQueryKey() });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore creazione dispositivo');
    }
  };

  const onDelete = async (id: string) => {
    setError(null);
    try {
      await remove.mutateAsync({ id });
      await qc.invalidateQueries({ queryKey: getListDevicesQueryKey() });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore eliminazione dispositivo');
    }
  };

  return (
    <AdminLayout title="Sistema">
      {error && <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Pairing dispositivi" icon={<MonitorPlay className="h-5 w-5" />}>
          {isLoading ? (
            <div className="grid place-items-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="space-y-2">
              {devices.length === 0 && <div className="rounded-xl border border-dashed border-border bg-background/40 p-4 text-center text-sm text-muted-foreground">Nessun dispositivo registrato.</div>}
              {devices.map(d => (
                <div key={d.id} className="flex items-center justify-between rounded-xl border border-border bg-background/40 px-3 py-2">
                  <div>
                    <div className="font-bold text-sm">{d.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {d.kind} · codice <span className="font-mono text-primary">{d.pairCode}</span> · {d.status}
                    </div>
                  </div>
                  <button onClick={() => onDelete(d.id)} className="rounded-lg p-2 text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <select value={kind} onChange={e => setKind(e.target.value as typeof kind)}
              className="rounded-lg border border-border bg-background/40 px-3 py-2 text-sm outline-none">
              {KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Etichetta dispositivo"
              className="flex-1 rounded-lg border border-border bg-background/40 px-3 py-2 text-sm outline-none" />
            <button disabled={!label.trim() || create.isPending} onClick={onCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Aggiungi
            </button>
          </div>
        </Card>

        <Card title="Diagnostica" icon={<FileText className="h-5 w-5" />}>
          <div className="text-sm text-muted-foreground">Build v0.2.0 · {new Date().toLocaleDateString('it-IT')}</div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <Stat label="Dispositivi" value={String(devices.length)} />
            <Stat label="Connessi" value={String(devices.filter(d => d.status === 'paired').length)} />
            <Stat label="In attesa" value={String(devices.filter(d => d.status === 'pending').length)} />
          </div>
        </Card>

        <Card title="Rete" icon={<Wifi className="h-5 w-5" />}>
          <div className="text-sm text-muted-foreground">Le impostazioni rete (online/offline) sono ora gestite in <code>Impostazioni → Rete offline-first</code> e salvate in <code>system_settings</code>.</div>
        </Card>

        <div className="lg:col-span-2 rounded-2xl border border-destructive/40 bg-destructive/5 p-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <div className="text-display text-lg font-black">Zona pericolosa</div>
          </div>
          <div className="mt-2 text-sm text-muted-foreground">Il reset di fabbrica del dispositivo richiede re-pairing dal pannello sopra.</div>
        </div>
      </div>
    </AdminLayout>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-2 text-display text-lg font-black">{icon} {title}</div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-3 text-center">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 font-display font-black">{value}</div>
    </div>
  );
}
