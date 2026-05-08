import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Calendar, MapPin, Users, Image as ImageIcon, Save, ArrowRight, Loader2 } from 'lucide-react';
import {
  useListGames,
  useCreateEvent,
  useUpdateEvent,
  getListEventsQueryKey,
  getGetCurrentEventQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

export default function EventSetup() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { data: games = [] } = useListGames();
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();

  const [name, setName] = useState('Compleanno Sorrento 40');
  const [venue, setVenue] = useState('Hotel Mediterraneo');
  const [date, setDate] = useState(() => new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16));
  const [players, setPlayers] = useState(20);
  const [color, setColor] = useState('#F5B642');
  const [enabled, setEnabled] = useState<string[]>([]);
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
    try {
      const created = await createEvent.mutateAsync({
        data: {
          name,
          venue,
          startsAt: new Date(date).toISOString(),
          brandColor: color,
          expectedPlayers: players,
          enabledGames: enabled,
        },
      });
      const id = (created as { id: string }).id;
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

  return (
    <div className="min-h-screen bg-background px-6 py-10 pb-28">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Setup</div>
            <div className="mt-2 text-display text-4xl font-black">Nuovo evento</div>
          </div>
          <button onClick={() => navigate('/admin')} className="text-sm text-muted-foreground hover:text-foreground">Annulla</button>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
            <Field label="Nome evento" icon={<Calendar className="h-4 w-4" />}>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-transparent text-lg font-bold outline-none" />
            </Field>
            <Field label="Venue" icon={<MapPin className="h-4 w-4" />}>
              <input value={venue} onChange={e => setVenue(e.target.value)} className="w-full bg-transparent outline-none" />
            </Field>
            <Field label="Data e ora" icon={<Calendar className="h-4 w-4" />}>
              <input type="datetime-local" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-transparent outline-none" />
            </Field>
            <Field label={`Giocatori previsti: ${players}`} icon={<Users className="h-4 w-4" />}>
              <input type="range" min={4} max={40} value={players} onChange={e => setPlayers(+e.target.value)} className="w-full accent-primary" />
            </Field>
            <Field label="Colore brand" icon={<ImageIcon className="h-4 w-4" />}>
              <div className="flex items-center gap-3">
                <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-10 w-16 cursor-pointer rounded-md border border-border bg-transparent" />
                <code className="text-sm text-muted-foreground">{color}</code>
              </div>
            </Field>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="text-display text-lg font-black">Giochi attivi</div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {games.map(g => {
                const on = enabled.includes(g.slug);
                return (
                  <button key={g.id} onClick={() => toggle(g.slug)}
                    className={`rounded-xl border-2 p-3 text-left transition-all ${on ? 'border-primary bg-primary/10' : 'border-border bg-background/40 opacity-60'}`}
                    style={on ? { borderColor: g.accentColor, background: `${g.accentColor}15` } : undefined}
                  >
                    <div className="text-sm font-bold" style={on ? { color: g.accentColor } : undefined}>{g.name}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{on ? 'Attivo' : 'Disattivo'}</div>
                  </button>
                );
              })}
            </div>
            <div className="mt-5 text-xs text-muted-foreground">{enabled.length} di {games.length} giochi selezionati</div>
          </div>
        </div>

        {error && <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

        <div className="mt-8 flex items-center justify-end gap-3">
          <button
            disabled={createEvent.isPending}
            onClick={() => onSave('admin')}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-bold hover-elevate disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> Salva bozza
          </button>
          <button
            disabled={createEvent.isPending}
            onClick={() => onSave('lobby')}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-[0_0_30px_rgba(245,182,66,0.35)] hover-elevate disabled:opacity-50"
          >
            {createEvent.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Salva e apri lobby
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        {icon} {label}
      </div>
      {children}
    </div>
  );
}
