/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import { useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { useT } from '@/i18n';
import { useGetAiUsage, type AiUsagePeriod } from '@workspace/api-client-react';
import {
  Loader2, RefreshCw, Zap, Coins, ArrowDownToLine, ArrowUpFromLine,
  Plug, CheckCircle2, XCircle, Building2, User as UserIcon,
} from 'lucide-react';

const PERIODS: { value: AiUsagePeriod; label: string }[] = [
  { value: 'day', label: 'Oggi' },
  { value: 'week', label: '7 giorni' },
  { value: 'month', label: '30 giorni' },
  { value: 'year', label: '365 giorni' },
];

function fmtUsd(n: number): string {
  return `$ ${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 })}`;
}

function fmtInt(n: number): string {
  return n.toLocaleString('it-IT');
}

export default function Billing() {
  const t = useT();
  const [period, setPeriod] = useState<AiUsagePeriod>('month');

  const { data, isLoading, isFetching, refetch } = useGetAiUsage(
    { period },
    { query: { queryKey: ['ai-usage', period], staleTime: 10_000 } },
  );

  const totals = data?.totals ?? { calls: 0, tokensInput: 0, tokensOutput: 0, costUsd: 0 };

  const cards = [
    { label: 'Chiamate AI', value: fmtInt(totals.calls), Icon: Zap, color: '#F5B642' },
    { label: 'Spesa stimata', value: fmtUsd(totals.costUsd), Icon: Coins, color: '#00F5A0' },
    { label: 'Token input', value: fmtInt(totals.tokensInput), Icon: ArrowDownToLine, color: '#9B5DE5' },
    { label: 'Token output', value: fmtInt(totals.tokensOutput), Icon: ArrowUpFromLine, color: '#5BC0EB' },
  ];

  return (
    <AdminLayout title={t('admin.billing')}>
      {/* ── Filtro periodo + refresh ─────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 rounded-2xl border border-border bg-card p-1.5">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                period === p.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover-elevate'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm hover-elevate disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Aggiorna
        </button>
      </div>

      <p className="mb-6 text-xs text-muted-foreground">
        La spesa mostrata è una <strong>stima calcolata</strong> dai token/unità usati per ogni chiamata, secondo i listini pubblici dei provider.
        Non è un saldo o credito residuo: nessun provider AI espone oggi un endpoint pubblico per leggere il credito rimasto su una singola API key.
      </p>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* ── KPI cards ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {cards.map(c => (
              <div key={c.label} className="relative overflow-hidden rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start justify-between">
                  <div className="text-sm font-semibold text-muted-foreground">{c.label}</div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${c.color}20`, color: c.color }}>
                    <c.Icon className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-3 text-display text-3xl font-black tabular-nums">{c.value}</div>
                <div className="absolute -right-6 -bottom-8 h-24 w-24 rounded-full opacity-10" style={{ background: c.color }} />
              </div>
            ))}
          </div>

          {/* ── Provider connessi ────────────────────────────────────────── */}
          <div className="mt-8 rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2 text-display text-xl font-black">
              <Plug className="h-5 w-5 text-primary" /> Provider connessi
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(data?.providers ?? []).map(p => (
                <div key={p.provider} className="flex items-center justify-between rounded-xl border border-border bg-background/40 p-4">
                  <div className="font-bold uppercase">{p.provider}</div>
                  {p.configured ? (
                    <span className="flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Connesso
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-bold text-destructive">
                      <XCircle className="h-3.5 w-3.5" /> Non configurato
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {/* ── Per tenant ─────────────────────────────────────────────── */}
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border p-5">
                <Building2 className="h-4 w-4 text-primary" />
                <div className="text-display text-lg font-black">Per tenant</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px]">
                  <thead className="bg-secondary/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
                    <tr>
                      <th className="px-5 py-2.5">Tenant</th>
                      <th className="px-5 py-2.5 text-right">Chiamate</th>
                      <th className="px-5 py-2.5 text-right">Spesa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.byTenant ?? []).map((row, i) => (
                      <tr key={`${row.tenantId ?? 'null'}-${i}`} className="border-b border-border last:border-0 hover:bg-secondary/20">
                        <td className="px-5 py-3 text-sm font-semibold">{row.tenantName ?? (row.tenantId ? row.tenantId.slice(0, 8) + '…' : 'Nessun tenant (super admin)')}</td>
                        <td className="px-5 py-3 text-right text-mono text-sm">{fmtInt(row.calls)}</td>
                        <td className="px-5 py-3 text-right text-mono text-sm font-bold">{fmtUsd(row.costUsd)}</td>
                      </tr>
                    ))}
                    {(!data?.byTenant || data.byTenant.length === 0) && (
                      <tr><td colSpan={3} className="px-5 py-8 text-center text-sm text-muted-foreground">Nessun utilizzo nel periodo selezionato.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Per utente ─────────────────────────────────────────────── */}
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border p-5">
                <UserIcon className="h-4 w-4 text-primary" />
                <div className="text-display text-lg font-black">Per utente</div>
              </div>
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full min-w-[420px]">
                  <thead className="bg-secondary/40 text-left text-xs uppercase tracking-widest text-muted-foreground sticky top-0">
                    <tr>
                      <th className="px-5 py-2.5">Utente</th>
                      <th className="px-5 py-2.5 text-right">Chiamate</th>
                      <th className="px-5 py-2.5 text-right">Spesa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.byUser ?? []).map((row, i) => (
                      <tr key={`${row.userId ?? 'null'}-${i}`} className="border-b border-border last:border-0 hover:bg-secondary/20">
                        <td className="px-5 py-3 text-sm">
                          <div className="font-semibold">{row.userName ?? '—'}</div>
                          <div className="text-xs text-muted-foreground">{row.userEmail ?? (row.userId ? row.userId.slice(0, 8) + '…' : 'sconosciuto')}</div>
                        </td>
                        <td className="px-5 py-3 text-right text-mono text-sm">{fmtInt(row.calls)}</td>
                        <td className="px-5 py-3 text-right text-mono text-sm font-bold">{fmtUsd(row.costUsd)}</td>
                      </tr>
                    ))}
                    {(!data?.byUser || data.byUser.length === 0) && (
                      <tr><td colSpan={3} className="px-5 py-8 text-center text-sm text-muted-foreground">Nessun utilizzo nel periodo selezionato.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ── Per provider ─────────────────────────────────────────────── */}
          <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
            <div className="border-b border-border p-5 text-display text-lg font-black">Per provider</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <thead className="bg-secondary/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2.5">Provider</th>
                    <th className="px-5 py-2.5 text-right">Chiamate</th>
                    <th className="px-5 py-2.5 text-right">Token input</th>
                    <th className="px-5 py-2.5 text-right">Token output</th>
                    <th className="px-5 py-2.5 text-right">Spesa</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.byProvider ?? []).map((row, i) => (
                    <tr key={`${row.provider}-${i}`} className="border-b border-border last:border-0 hover:bg-secondary/20">
                      <td className="px-5 py-3 text-sm font-bold uppercase">{row.provider}</td>
                      <td className="px-5 py-3 text-right text-mono text-sm">{fmtInt(row.calls)}</td>
                      <td className="px-5 py-3 text-right text-mono text-sm">{fmtInt(row.tokensInput)}</td>
                      <td className="px-5 py-3 text-right text-mono text-sm">{fmtInt(row.tokensOutput)}</td>
                      <td className="px-5 py-3 text-right text-mono text-sm font-bold">{fmtUsd(row.costUsd)}</td>
                    </tr>
                  ))}
                  {(!data?.byProvider || data.byProvider.length === 0) && (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">Nessun utilizzo nel periodo selezionato.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
