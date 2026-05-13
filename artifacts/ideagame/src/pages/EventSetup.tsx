import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Building2, Calendar, MapPin, Users, Palette, Save, ArrowRight, Loader2 } from 'lucide-react';
import {
  useListGames,
  useCreateEvent,
  useUpdateEvent,
  useGetMe,
  useListTenants,
  getListEventsQueryKey,
  getGetCurrentEventQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

export default function EventSetup() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { data: games = [] } = useListGames();
  const { data: me } = useGetMe();
  const isSuperAdmin = me?.role === 'super_admin';
  const { data: tenants = [] } = useListTenants({ query: { queryKey: ['tenants'], enabled: isSuperAdmin } });
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();

  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
  const [joinCode, setJoinCode] = useState(() => Math.random().toString(36).slice(2, 8).toUpperCase());
  const [date, setDate] = useState(() => new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16));
  const [players, setPlayers] = useState(20);
  const [color, setColor] = useState('#F5B642');
  const [enabled, setEnabled] = useState<string[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (!initRef.current && games.length > 0) {
      initRef.current = true;
      setEnabled(games.map(g => g.slug));
    }
  }, [games]);

  const toggle = (slug: string) =>
    setEnabled(e => e.includes(slug) ? e.filter(x => x !== slug) : [...e, slug]);

  const onSave = async (then: 'admin' | 'lobby') => {
    setError(null);
    if (isSuperAdmin && !tenantId) {
      setError('Seleziona un tenant per l\'evento');
      return;
    }
    try {
      const created = await createEvent.mutateAsync({
        data: {
          name,
          venue,
          joinCode: joinCode.trim().toUpperCase() || undefined,
          startsAt: new Date(date).toISOString(),
          brandColor: color,
          expectedPlayers: players,
          enabledGames: enabled,
          ...(isSuperAdmin && tenantId ? { tenantId } : {}),
        },
      });
      const id = (created as { id: string }).id;

      if (then === 'lobby') {
        await updateEvent.mutateAsync({ id, data: { status: 'live' } });
      }
      await qc.invalidateQueries({ queryKey: getListEventsQueryKey() });
      await qc.invalidateQueries({ queryKey: getGetCurrentEventQueryKey() });
      navigate(then === 'lobby' ? `/control?e=${id}` : '/admin');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore salvataggio');
    }
  };

  const isSaving = createEvent.isPending || updateEvent.isPending;

  return (
    <div className="min-h-screen overflow-y-auto bg-background">
      <div className="mx-auto max-w-3xl px-4 py-6 pb-10">

        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Setup</div>
            <div className="mt-1 text-display text-3xl font-black">Nuovo evento</div>
          </div>
          <button onClick={() => navigate('/admin')} className="text-sm text-muted-foreground hover:text-foreground">Annulla</button>
        </div>

        <div className="space-y-3">
          {isSuperAdmin && (
            <Field label="Tenant" icon={<Building2 className="h-3.5 w-3.5" />}>
              <select
                value={tenantId}
                onChange={e => setTenantId(e.target.value)}
                className="w-full bg-transparent text-sm outline-none"
              >
                <option value="">— seleziona tenant —</option>
                {tenants.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </Field>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome evento" icon={<Calendar className="h-3.5 w-3.5" />}>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="es. Compleanno Marco 40"
                className="w-full bg-transparent text-sm font-bold outline-none placeholder:text-muted-foreground/50"
              />
            </Field>
            <Field label="Venue" icon={<MapPin className="h-3.5 w-3.5" />}>
              <input
                value={venue}
                onChange={e => setVenue(e.target.value)}
                placeholder="es. Villa Mediterraneo"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Codice QR join" icon={<span className="text-[10px] font-black">QR</span>}>
              <div className="flex items-center gap-2">
                <input
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 10))}
                  placeholder="es. FESTA01"
                  className="flex-1 bg-transparent text-sm font-black tracking-widest outline-none placeholder:text-muted-foreground/50"
                />
                <button
                  type="button"
                  onClick={() => setJoinCode(Math.random().toString(36).slice(2, 8).toUpperCase())}
                  className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
                >↺ rigenera</button>
              </div>
            </Field>
            <Field label="Data e ora" icon={<Calendar className="h-3.5 w-3.5" />}>
              <input
                type="datetime-local"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-transparent text-sm outline-none"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`Giocatori previsti: ${players}`} icon={<Users className="h-3.5 w-3.5" />}>
              <input
                type="range"
                min={2}
                max={200}
                value={players}
                onChange={e => setPlayers(+e.target.value)}
                className="w-full accent-primary"
              />
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>2</span><span>200</span>
              </div>
            </Field>
            <Field label="Colore brand" icon={<Palette className="h-3.5 w-3.5" />}>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  className="h-8 w-14 cursor-pointer rounded border border-border bg-transparent"
                />
                <code className="text-sm text-muted-foreground">{color}</code>
              </div>
            </Field>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">Giochi attivi — {enabled.length}/{games.length}</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {games.map(g => {
                const on = enabled.includes(g.slug);
                return (
                  <button key={g.id} onClick={() => toggle(g.slug)}
                    className={`rounded-lg border-2 px-3 py-2 text-left transition-all ${on ? 'border-primary bg-primary/10' : 'border-border bg-background/40 opacity-50'}`}
                    style={on ? { borderColor: g.accentColor, background: `${g.accentColor}15` } : undefined}
                  >
                    <div className="text-xs font-bold leading-tight" style={on ? { color: g.accentColor } : undefined}>{g.name}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">{on ? 'Attivo' : 'Off'}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-400/80">
            💡 Le squadre si creano da <strong>/admin/teams</strong> dopo aver creato l'evento. I giocatori si uniscono scannerizzando il QR con il codice <strong>{joinCode || '…'}</strong>.
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
        )}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            disabled={isSaving || !name || (isSuperAdmin && !tenantId)}
            onClick={() => onSave('admin')}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold hover-elevate disabled:opacity-40"
          >
            <Save className="h-4 w-4" /> Salva bozza
          </button>
          <button
            disabled={isSaving || !name || (isSuperAdmin && !tenantId)}
            onClick={() => onSave('lobby')}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-[0_0_24px_rgba(245,182,66,0.35)] hover-elevate disabled:opacity-40"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Salva e vai in regia
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon} {label}
      </div>
      {children}
    </div>
  );
}
