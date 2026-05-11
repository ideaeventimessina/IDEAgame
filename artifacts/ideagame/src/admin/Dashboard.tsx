import { useLocation } from 'wouter';
import { Building2, Activity, Users, DollarSign, Play, Image as ImageIcon, ArrowUpRight, Loader2, Mic2, Monitor } from 'lucide-react';
import { AdminLayout } from './AdminLayout';
import { useT } from '@/i18n';
import { useAuth } from '@/auth/roles';
import { useGetKpis, useListEvents, useListTenants, getGetKpisQueryKey, getListTenantsQueryKey } from '@workspace/api-client-react';
import { usePresenterMode } from '@/contexts/PresenterModeContext';

export default function Dashboard() {
  const t = useT();
  const [, navigate] = useLocation();
  const { role } = useAuth();
  const { mode, setMode } = usePresenterMode();

  const { data: kpis, isLoading: kpiLoading } = useGetKpis({ query: { queryKey: getGetKpisQueryKey(), enabled: role === 'super_admin' } });
  const { data: events = [] } = useListEvents();
  const { data: tenants = [] } = useListTenants({ query: { queryKey: getListTenantsQueryKey(), enabled: role === 'super_admin' } });

  const cards = [
    { label: t('admin.kpi.tenants'), value: kpis?.tenants ?? '—', sub: '', Icon: Building2, color: '#F5B642' },
    { label: t('admin.kpi.sessions'), value: kpis?.sessionsToday ?? '—', sub: 'today', Icon: Activity, color: '#00F5A0' },
    { label: t('admin.kpi.players'), value: kpis?.playersWeek ?? '—', sub: 'last 7 days', Icon: Users, color: '#9B5DE5' },
    { label: t('admin.kpi.mrr'), value: kpis ? `€ ${kpis.mrr.toLocaleString()}` : '—', sub: 'all tenants', Icon: DollarSign, color: '#5BC0EB' },
  ];

  return (
    <AdminLayout title={t('admin.dashboard')}>

      {/* ── Modalità switcher ─────────────────────────────────────────────── */}
      <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-1.5 flex gap-1.5">
        <button
          onClick={() => setMode('regia')}
          className={`flex-1 flex items-center justify-center gap-2.5 rounded-xl py-3.5 text-sm font-black transition-all ${
            mode === 'regia'
              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Monitor className="h-4 w-4" />
          Regia
        </button>
        <button
          onClick={() => { setMode('presentatore'); navigate('/presenter'); }}
          className={`flex-1 flex items-center justify-center gap-2.5 rounded-xl py-3.5 text-sm font-black transition-all ${
            mode === 'presentatore'
              ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/30'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Mic2 className="h-4 w-4" />
          Presentatore
        </button>
      </div>

      {kpiLoading && role === 'super_admin' ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {cards.map(c => (
            <div key={c.label} className="relative overflow-hidden rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between">
                <div className="text-sm font-semibold text-muted-foreground">{c.label}</div>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${c.color}20`, color: c.color }}>
                  <c.Icon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-display text-4xl font-black tabular-nums">{c.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{c.sub}</div>
              <div className="absolute -right-6 -bottom-8 h-24 w-24 rounded-full opacity-10" style={{ background: c.color }} />
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-display text-xl font-black">{t('admin.recent_events')}</div>
          </div>
          <div className="space-y-3">
            {events.length === 0 && <div className="text-sm text-muted-foreground">No events yet.</div>}
            {events.map(e => {
              const tenant = tenants.find(tn => tn.id === e.tenantId);
              return (
                <div key={e.id} className="flex items-center gap-4 rounded-xl border border-border bg-background/40 p-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl text-background font-black"
                       style={{ background: e.brandColor || tenant?.brandColor || '#F5B642' }}>
                    {e.name[0]}
                  </div>
                  <div className="flex-1">
                    <div className="text-display text-lg font-bold">{e.name}</div>
                    <div className="text-sm text-muted-foreground">{e.venue || '—'}{tenant ? ` · ${tenant.name}` : ''}</div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                    e.status === 'live' ? 'bg-destructive text-destructive-foreground' :
                    e.status === 'draft' ? 'bg-secondary text-secondary-foreground' :
                    'bg-muted text-muted-foreground'
                  }`}>{e.status}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-accent/10 p-6">
          <div className="text-display text-xl font-black">{t('dashboard.quick_actions')}</div>
          <div className="mt-5 space-y-3">
            <button onClick={() => navigate('/lobby')} className="flex w-full items-center justify-between rounded-xl bg-primary px-5 py-4 text-primary-foreground hover-elevate">
              <span className="flex items-center gap-3 font-bold"><Play className="h-5 w-5" /> {t('admin.quick_start')}</span>
              <ArrowUpRight className="h-4 w-4" />
            </button>
            <button onClick={() => navigate('/presenter')}
              className="flex w-full items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/10 px-5 py-4 hover-elevate">
              <span className="flex items-center gap-3 font-bold text-amber-400"><Mic2 className="h-5 w-5" /> Vai al Presentatore</span>
              <ArrowUpRight className="h-4 w-4 text-amber-400" />
            </button>
            <button onClick={() => navigate('/admin/media')} className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-5 py-4 hover-elevate">
              <span className="flex items-center gap-3 font-bold"><ImageIcon className="h-5 w-5" /> {t('admin.open_media')}</span>
              <ArrowUpRight className="h-4 w-4" />
            </button>
            <button onClick={() => navigate('/')} className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-5 py-4 hover-elevate">
              <span className="flex items-center gap-3 font-bold">Open GameStation</span>
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
