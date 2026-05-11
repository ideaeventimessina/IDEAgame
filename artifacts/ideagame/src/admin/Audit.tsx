import { AdminLayout } from './AdminLayout';
import { Shield, Loader2, RefreshCw } from 'lucide-react';
import { useListAuditLog, type AuditEntry } from '@workspace/api-client-react';

export default function Audit() {
  const { data = [], isLoading, refetch, isFetching } = useListAuditLog({
    query: { queryKey: ['audit-log'], staleTime: 10_000 },
  });

  return (
    <AdminLayout title="Audit Log">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{data.length} eventi recenti</div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm hover-elevate disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Aggiorna
        </button>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Quando</th>
                  <th className="px-5 py-3">Utente</th>
                  <th className="px-5 py-3">Azione</th>
                  <th className="px-5 py-3">Risorsa</th>
                  <th className="px-5 py-3">Payload</th>
                </tr>
              </thead>
              <tbody>
                {data.map((entry: AuditEntry) => (
                  <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors">
                    <td className="px-5 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(entry.createdAt).toLocaleString('it-IT')}
                    </td>
                    <td className="px-5 py-3 text-sm">
                      <div className="font-mono text-xs text-muted-foreground">
                        {entry.userId ? entry.userId.slice(0, 8) + '…' : '—'}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <ActionBadge action={entry.action} />
                    </td>
                    <td className="px-5 py-3 text-sm text-muted-foreground font-mono">
                      {entry.targetType}{entry.targetId ? ` / ${entry.targetId.slice(0, 8)}…` : ''}
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground max-w-xs truncate">
                      {entry.payload ? JSON.stringify(entry.payload) : '—'}
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Shield className="h-8 w-8 opacity-30" />
                        <p className="text-sm">Nessun evento registrato.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-500/15 text-green-400',
  update: 'bg-blue-500/15 text-blue-400',
  delete: 'bg-red-500/15 text-red-400',
  login: 'bg-primary/15 text-primary',
  logout: 'bg-secondary text-muted-foreground',
};

function ActionBadge({ action }: { action: string }) {
  const base = action.split('.')[0];
  const cls = ACTION_COLORS[base] ?? 'bg-secondary text-muted-foreground';
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${cls}`}>
      {action}
    </span>
  );
}
