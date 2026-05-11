import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Building2, Calendar, MapPin, Users, Palette, Save, ArrowRight, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  useListGames,
  useCreateEvent,
  useUpdateEvent,
  useCreateTeam,
  useGetMe,
  useListTenants,
  getListEventsQueryKey,
  getGetCurrentEventQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

const DEFAULT_TEAM_COLORS = ['#F5B642', '#9B5DE5', '#00BBF9', '#FF69B4', '#00F5A0', '#FF4D4D'];

interface TeamDraft { name: string; color: string }

export default function EventSetup() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { data: games = [] } = useListGames();
  const { data: me } = useGetMe();
  const isSuperAdmin = me?.role === 'super_admin';
  const { data: tenants = [] } = useListTenants({ query: { queryKey: ['tenants'], enabled: isSuperAdmin } });
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const createTeam = useCreateTeam();

  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
  const [date, setDate] = useState(() => new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16));
  const [players, setPlayers] = useState(2);
  const [color, setColor] = useState('#F5B642');
  const [enabled, setEnabled] = useState<string[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [teams, setTeams] = useState<TeamDraft[]>([
    { name: 'Squadra Oro', color: '#F5B642' },
    { name: 'Squadra Viola', color: '#9B5DE5' },
    { name: 'Squadra Azzurra', color: '#00BBF9' },
    { name: 'Squadra Rosa', color: '#FF69B4' },
  ]);
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

  const addTeam = () => {
    const idx = teams.length % DEFAULT_TEAM_COLORS.length;
    setTeams(t => [...t, { name: `Squadra ${t.length + 1}`, color: DEFAULT_TEAM_COLORS[idx] }]);
  };

  const removeTeam = (i: number) => setTeams(t => t.filter((_, idx) => idx !== i));
  const updateTeam = (i: number, patch: Partial<TeamDraft>) =>
    setTeams(t => t.map((tm, idx) => idx === i ? { ...tm, ...patch } : tm));

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
          startsAt: new Date(date).toISOString(),
          brandColor: color,
          expectedPlayers: players,
          enabledGames: enabled,
          ...(isSuperAdmin && tenantId ? { tenantId } : {}),
        },
      });
      const id = (created as { id: string }).id;

      // Create teams
      for (const team of teams.filter(t => t.name.trim())) {
        try {
          await createTeam.mutateAsync({ id, data: { name: team.name.trim(), color: team.color } });
        } catch { /* non-blocking: team errors don't abort event creation */ }
      }

      if (then === 'lobby') {
        await updateEvent.mutateAsync({ id, data: { status: 'live' } });
      }
      await qc.invalidateQueries({ queryKey: getListEventsQueryKey() });
      await qc.invalidateQueries({ queryKey: getGetCurrentEventQueryKey() });
      navigate(then === 'lobby' ? `/lobby?e=${id}` : '/admin');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore salvataggio');
    }
  };

  const isSaving = createEvent.isPending || updateEvent.isPending || createTeam.isPending;

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
            <Field label="Data e ora" icon={<Calendar className="h-3.5 w-3.5" />}>
              <input
                type="datetime-local"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-transparent text-sm outline-none"
              />
            </Field>
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
          </div>

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

          {/* Teams */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Squadre — {teams.length}</div>
              <button
                type="button"
                onClick={addTeam}
                className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs hover-elevate"
              >
                <Plus className="h-3 w-3" /> Aggiungi
              </button>
            </div>
            <div className="space-y-2">
              {teams.map((team, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={team.color}
                    onChange={e => updateTeam(i, { color: e.target.value })}
                    className="h-8 w-8 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
                  />
                  <input
                    value={team.name}
                    onChange={e => updateTeam(i, { name: e.target.value })}
                    placeholder={`Squadra ${i + 1}`}
                    className="min-w-0 flex-1 rounded-lg border border-border bg-background/40 px-3 py-1.5 text-sm outline-none focus:border-primary placeholder:text-muted-foreground/50"
                  />
                  <button
                    type="button"
                    onClick={() => removeTeam(i)}
                    disabled={teams.length <= 1}
                    className="rounded-lg border border-border p-1.5 text-destructive hover-elevate disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
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
            Salva e apri lobby
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
