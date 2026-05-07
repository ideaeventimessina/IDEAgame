import { useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { useT } from '@/i18n';
import { Wifi, WifiOff, Database, MonitorPlay, FileText, AlertTriangle, Trash2, Plus } from 'lucide-react';

export default function System() {
  const t = useT();
  const [offline, setOffline] = useState(false);
  const [cacheMb] = useState(184);
  const [paired, setPaired] = useState([
    { id: 'p1', name: 'Sala Principale — Proiettore 4K', when: '2 ore fa' },
    { id: 'p2', name: 'iPad Bar — Animatore', when: 'oggi' },
  ]);

  return (
    <AdminLayout title="Sistema">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Rete" icon={offline ? <WifiOff className="h-5 w-5" /> : <Wifi className="h-5 w-5" />}>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold">{offline ? 'Modalità locale' : 'Online'}</div>
              <div className="text-sm text-muted-foreground">
                {offline ? 'Funziona senza internet usando la rete WiFi del locale.' : 'Sincronizzazione cloud attiva.'}
              </div>
            </div>
            <button
              onClick={() => setOffline(o => !o)}
              className={`rounded-full px-5 py-2 text-sm font-bold ${offline ? 'bg-primary text-primary-foreground' : 'border border-border hover-elevate'}`}
            >
              {offline ? 'Torna online' : 'Passa offline'}
            </button>
          </div>
        </Card>

        <Card title="Cache" icon={<Database className="h-5 w-5" />}>
          <div className="text-3xl font-black text-display">{cacheMb} MB</div>
          <div className="mt-1 text-sm text-muted-foreground">Media e quiz pre-caricati</div>
          <div className="mt-4 flex gap-2">
            <button className="flex-1 rounded-xl bg-primary py-2 text-sm font-bold text-primary-foreground hover-elevate">Pre-cache evento</button>
            <button className="grid h-10 w-10 place-items-center rounded-xl border border-destructive/40 text-destructive hover-elevate">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </Card>

        <Card title="Pairing dispositivi" icon={<MonitorPlay className="h-5 w-5" />}>
          <div className="space-y-2">
            {paired.map(p => (
              <div key={p.id} className="flex items-center justify-between rounded-xl border border-border bg-background/40 px-3 py-2">
                <div>
                  <div className="font-bold text-sm">{p.name}</div>
                  <div className="text-xs text-muted-foreground">Connesso {p.when}</div>
                </div>
                <button onClick={() => setPaired(ps => ps.filter(x => x.id !== p.id))}
                  className="text-xs text-destructive hover:underline">Disconnetti</button>
              </div>
            ))}
          </div>
          <button className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-2 text-sm font-bold hover-elevate">
            <Plus className="h-4 w-4" /> Nuovo proiettore (codice: <span className="font-mono text-primary">7K2-9F</span>)
          </button>
        </Card>

        <Card title="Diagnostica" icon={<FileText className="h-5 w-5" />}>
          <div className="text-sm text-muted-foreground">Build v0.1.0 · {new Date().toLocaleDateString()}</div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <Stat label="Latency" value="42ms" />
            <Stat label="WS uptime" value="99.9%" />
            <Stat label="Errori" value="0" />
          </div>
          <button className="mt-4 w-full rounded-xl border border-border py-2 text-sm font-bold hover-elevate">Invia report</button>
        </Card>

        <div className="lg:col-span-2 rounded-2xl border border-destructive/40 bg-destructive/5 p-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <div className="text-display text-lg font-black">Zona pericolosa</div>
          </div>
          <div className="mt-2 text-sm text-muted-foreground">Reset di fabbrica per questo dispositivo. Richiede re-pairing.</div>
          <button className="mt-4 rounded-xl border border-destructive bg-destructive/10 px-5 py-2 text-sm font-bold text-destructive hover-elevate">
            Reset di fabbrica
          </button>
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
