import { AdminLayout } from './AdminLayout';
import { PLANS } from '@/data/mock';
import { useT } from '@/i18n';
import { Check, CreditCard } from 'lucide-react';

const INVOICES = [
  { id: 'INV-2026-04', date: '2026-04-01', amount: 149, status: 'Paid' },
  { id: 'INV-2026-03', date: '2026-03-01', amount: 149, status: 'Paid' },
  { id: 'INV-2026-02', date: '2026-02-01', amount: 149, status: 'Paid' },
];

export default function Billing() {
  const t = useT();
  return (
    <AdminLayout title={t('admin.billing')}>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {PLANS.map(p => (
          <div key={p.id} className={`relative rounded-2xl border p-6 ${
            p.highlight ? 'border-primary bg-gradient-to-br from-primary/15 via-card to-card' : 'border-border bg-card'
          }`}>
            {p.highlight && (
              <div className="absolute -top-3 left-5 rounded-full bg-primary px-3 py-1 text-xs font-black uppercase text-primary-foreground">
                {t('plan.most_popular')}
              </div>
            )}
            <div className="text-display text-2xl font-black">{t(`plan.${p.name.toLowerCase()}`)}</div>
            <div className="mt-2 flex items-baseline gap-1">
              {p.priceMonthly ? (
                <>
                  <span className="text-display text-5xl font-black">€{p.priceMonthly}</span>
                  <span className="text-muted-foreground">{t('plan.month')}</span>
                </>
              ) : (
                <span className="text-display text-3xl font-black">{t('plan.contact')}</span>
              )}
            </div>
            <ul className="mt-5 space-y-2">
              {p.features.map(f => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 text-primary" /> {f}
                </li>
              ))}
            </ul>
            <button className={`mt-6 w-full rounded-xl py-2.5 text-sm font-bold ${
              p.highlight ? 'bg-primary text-primary-foreground' : 'border border-border hover-elevate'
            }`}>
              {p.highlight ? t('plan.current') : t('plan.upgrade')}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="text-display text-xl font-black">{t('billing.invoices')}</div>
          <table className="mt-4 w-full">
            <thead className="text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr><th className="py-2">ID</th><th>Date</th><th>Amount</th><th>Status</th></tr>
            </thead>
            <tbody>
              {INVOICES.map(i => (
                <tr key={i.id} className="border-t border-border">
                  <td className="py-3 text-mono">{i.id}</td>
                  <td>{i.date}</td>
                  <td className="text-mono">€ {i.amount}</td>
                  <td><span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold uppercase text-primary">{i.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="text-display text-xl font-black">{t('billing.payment_method')}</div>
          <div className="mt-5 flex items-center gap-4 rounded-xl border border-border bg-background/40 p-4">
            <CreditCard className="h-6 w-6 text-primary" />
            <div>
              <div className="font-bold">Visa ending 4242</div>
              <div className="text-xs text-muted-foreground">Expires 09/28</div>
            </div>
          </div>
          <button className="mt-4 w-full rounded-xl border border-border py-2 text-sm font-bold hover-elevate">{t('billing.update_card')}</button>
        </div>
      </div>
    </AdminLayout>
  );
}
