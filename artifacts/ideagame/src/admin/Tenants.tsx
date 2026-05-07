import { AdminLayout } from './AdminLayout';
import { TENANTS } from '@/data/mock';
import { useT } from '@/i18n';
import { MoreHorizontal } from 'lucide-react';

export default function Tenants() {
  const t = useT();
  return (
    <AdminLayout title={t('admin.tenants')}>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full">
          <thead className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-5 py-3">Tenant</th>
              <th className="px-5 py-3">Plan</th>
              <th className="px-5 py-3">Seats</th>
              <th className="px-5 py-3">{t('common.status')}</th>
              <th className="px-5 py-3">MRR</th>
              <th className="px-5 py-3">Locale</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {TENANTS.map(tn => (
              <tr key={tn.id} className="border-b border-border last:border-0">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl text-display font-black text-background"
                         style={{ background: tn.brandColor }}>{tn.name[0]}</div>
                    <div>
                      <div className="text-display font-bold">{tn.name}</div>
                      <div className="text-xs text-muted-foreground">since {tn.createdAt}</div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 capitalize">{tn.plan}</td>
                <td className="px-5 py-4">{tn.seats}</td>
                <td className="px-5 py-4">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${
                    tn.status === 'active' ? 'bg-primary/15 text-primary' : 'bg-destructive/15 text-destructive'
                  }`}>{tn.status}</span>
                </td>
                <td className="px-5 py-4 text-mono">€ {tn.mrr}</td>
                <td className="px-5 py-4 uppercase text-mono">{tn.locale}</td>
                <td className="px-5 py-4 text-right">
                  <button className="rounded-lg border border-border p-2 hover-elevate"><MoreHorizontal className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
