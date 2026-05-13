import { MonitorPlay, SlidersHorizontal, Smartphone, ExternalLink } from 'lucide-react';

const BASE = (import.meta.env.BASE_URL as string) ?? '/';

function appUrl(path: string) {
  const cleanBase = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;
  return `${window.location.origin}${cleanBase}${path}`;
}

const PANES = [
  { title: 'Proiettore', subtitle: 'Schermo pubblico', path: '/projector', icon: MonitorPlay },
  { title: 'Regia', subtitle: 'Controllo evento', path: '/control', icon: SlidersHorizontal },
  { title: 'Presentatore', subtitle: 'Vista mobile', path: '/presenter-live', icon: Smartphone },
];

export default function DevTest() {
  return (
    <div className="min-h-screen bg-[#07020f] text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-black/30 px-4 py-3">
        <div>
          <h1 className="text-xl font-black">IDEAgame · Test sviluppo</h1>
          <p className="text-sm text-white/60">
            Qui vedi proiettore, regia e presentatore insieme nella stessa finestra.
          </p>
        </div>
        <a
          href={appUrl('/cockpit')}
          className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-bold text-amber-300 hover:bg-amber-400/20"
        >
          Torna al cockpit
        </a>
      </header>

      <main className="grid min-h-[calc(100vh-73px)] grid-cols-1 gap-3 p-3 xl:grid-cols-[1.2fr_1.2fr_0.75fr]">
        {PANES.map((pane) => {
          const Icon = pane.icon;
          const url = appUrl(pane.path);
          return (
            <section key={pane.path} className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-amber-300" />
                  <div>
                    <div className="text-sm font-black">{pane.title}</div>
                    <div className="text-xs text-white/50">{pane.subtitle}</div>
                  </div>
                </div>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs font-bold text-white/70 hover:text-white"
                >
                  Apri
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <iframe
                title={pane.title}
                src={url}
                className="h-full min-h-0 flex-1 border-0 bg-black"
                allow="microphone; camera; accelerometer; gyroscope; autoplay; clipboard-write"
              />
            </section>
          );
        })}
      </main>
    </div>
  );
}
