/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Users, CalendarPlus, Play, Dices, ChevronRight } from 'lucide-react';
import ShowStage from '@/components/ShowStage';
import ShellHeader from '@/components/ShellHeader';
import StageFit from '@/components/StageFit';

/* ─── Home / landing "show" (mockup 05 · vista 01 HOME) ─────────────────
   Il motore resta Home: questa è solo la porta d'ingresso.
   - Entra con un codice → ingresso giocatore (/home/join)
   - Organizza una serata → scelta modalità (/mode-select)
   - Riprendi serata → wizard/recupero host
   - Scopri i giochi → demo/vetrina
   Palco fisso 752×500 (misure dal mockup) scalato a riempire il viewport.
*/

function PrimaryCta({
  tone,
  icon,
  label,
  onClick,
}: {
  tone: 'gold' | 'violet';
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  const gold = tone === 'gold';
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center rounded-2xl transition-transform active:scale-[0.99]"
      style={{
        height: 62,
        padding: '0 20px',
        gap: 14,
        background: gold
          ? 'linear-gradient(180deg,#FCE08B 0%,#EDB857 52%,#E0A63F 100%)'
          : 'linear-gradient(180deg,#8B3BF0 0%,#6A24D0 52%,#4D18A6 100%)',
        border: gold ? '1px solid rgba(255,228,150,0.7)' : '1px solid rgba(176,130,255,0.6)',
        boxShadow: gold
          ? '0 10px 24px rgba(224,166,63,0.35), inset 0 1px 0 rgba(255,255,255,0.5)'
          : '0 10px 24px rgba(90,30,180,0.42), inset 0 1px 0 rgba(255,255,255,0.22)',
        color: gold ? '#241803' : '#F7F3E8',
      }}
    >
      <span className="grid place-items-center shrink-0" style={{ width: 24 }}>
        {icon}
      </span>
      <span className="flex-1 text-left font-extrabold" style={{ fontSize: 20, letterSpacing: '0.01em' }}>
        {label}
      </span>
      <ChevronRight size={21} strokeWidth={2.6} className="shrink-0 opacity-85" />
    </button>
  );
}

function MiniCta({
  icon,
  lines,
  onClick,
}: {
  icon: React.ReactNode;
  lines: [string, string];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center rounded-2xl transition-transform active:scale-[0.99]"
      style={{
        height: 82,
        padding: '0 14px',
        gap: 11,
        background: 'rgba(13,13,25,0.72)',
        border: '1px solid rgba(230,184,92,0.32)',
        boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
      }}
    >
      <span
        className="grid place-items-center shrink-0 rounded-full"
        style={{
          width: 40,
          height: 40,
          background: 'linear-gradient(180deg,#FCE08B 0%,#E6B85C 100%)',
          color: '#241803',
        }}
      >
        {icon}
      </span>
      <span className="flex-1 text-left font-bold leading-tight" style={{ color: '#F7F3E8', fontSize: 15 }}>
        {lines[0]}
        <br />
        {lines[1]}
      </span>
      <ChevronRight size={17} strokeWidth={2.4} className="shrink-0" style={{ color: 'rgba(230,184,92,0.75)' }} />
    </button>
  );
}

function useIsNarrow(bp = 620) {
  const [narrow, setNarrow] = useState(
    typeof window !== 'undefined' ? window.innerWidth < bp : false,
  );
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < bp);
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [bp]);
  return narrow;
}

/* Reflow telefono: layout verticale a una mano (safe-area, tap target ≥48). */
function MobileHome({ navigate }: { navigate: (to: string) => void }) {
  return (
    <ShowStage style={{ minHeight: '100dvh' }}>
      <ShellHeader
        num="01"
        label="HOME"
        onPlayers={() => navigate('/home/join')}
        onSettings={() => navigate('/mode-select')}
        onProfile={() => navigate('/mode-select')}
      />
      <main
        className="flex flex-1 flex-col items-center"
        style={{ padding: '4px 18px calc(18px + env(safe-area-inset-bottom))', gap: 18 }}
      >
        <img
          src="/jonny-master-nobg.png"
          alt="Johhy, il conduttore"
          style={{ height: 'min(34vh, 240px)', width: 'auto', filter: 'drop-shadow(0 14px 24px rgba(0,0,0,0.55))' }}
          draggable={false}
        />
        <h1
          className="font-black text-center"
          style={{
            fontFamily: "'Outfit', system-ui, sans-serif",
            fontSize: 'clamp(28px, 8vw, 40px)',
            lineHeight: 1.08,
            letterSpacing: '-0.015em',
            color: '#F7F3E8',
            margin: 0,
          }}
        >
          La tua serata
          <br />
          diventa uno show
        </h1>
        <div className="flex w-full flex-col" style={{ maxWidth: 440, gap: 14 }}>
          <PrimaryCta tone="gold" icon={<Users size={21} strokeWidth={2.4} />} label="Entra con un codice" onClick={() => navigate('/home/join')} />
          <PrimaryCta tone="violet" icon={<CalendarPlus size={21} strokeWidth={2.4} />} label="Organizza una serata" onClick={() => navigate('/mode-select')} />
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <MiniCta icon={<Play size={19} strokeWidth={2.4} fill="currentColor" />} lines={['Riprendi', 'serata']} onClick={() => navigate('/home-setup')} />
            <MiniCta icon={<Dices size={21} strokeWidth={2.2} />} lines={['Scopri', 'i giochi']} onClick={() => navigate('/demo')} />
          </div>
        </div>
      </main>
    </ShowStage>
  );
}

export default function HomeV4() {
  const [, navigate] = useLocation();
  const narrow = useIsNarrow(620);

  if (narrow) return <MobileHome navigate={navigate} />;

  return (
    <ShowStage>
      <StageFit designW={752} designH={500}>
        <ShellHeader
          num="01"
          label="HOME"
          onPlayers={() => navigate('/home/join')}
          onSettings={() => navigate('/mode-select')}
          onProfile={() => navigate('/mode-select')}
        />

        <main className="relative flex flex-1 items-stretch" style={{ padding: '0 16px 6px', overflow: 'visible' }}>
          <div
            className="grid w-full"
            style={{ gridTemplateColumns: '300px 1fr', columnGap: 8, alignItems: 'stretch', overflow: 'visible' }}
          >
            {/* Johhy */}
            <div className="relative flex h-full items-end justify-center" style={{ overflow: 'visible' }}>
              <img
                src="/jonny-master-nobg.png"
                alt="Johhy, il conduttore"
                className="block"
                style={{
                  height: 456,
                  width: 'auto',
                  maxWidth: 'none',
                  objectFit: 'contain',
                  objectPosition: 'bottom',
                  filter: 'drop-shadow(0 18px 30px rgba(0,0,0,0.55))',
                }}
                draggable={false}
              />
            </div>

            {/* Contenuto */}
            <div className="flex flex-col justify-start" style={{ paddingTop: 16, paddingBottom: 14 }}>
              <h1
                className="font-black"
                style={{
                  fontFamily: "'Outfit', system-ui, sans-serif",
                  fontSize: 40,
                  lineHeight: 1.08,
                  letterSpacing: '-0.015em',
                  color: '#F7F3E8',
                  margin: '0 0 30px',
                  paddingLeft: 34,
                  whiteSpace: 'nowrap',
                  textShadow: '0 2px 16px rgba(0,0,0,0.5)',
                }}
              >
                La tua serata
                <br />
                diventa uno show
              </h1>

              <div className="flex flex-col" style={{ gap: 20 }}>
                <PrimaryCta
                  tone="gold"
                  icon={<Users size={21} strokeWidth={2.4} />}
                  label="Entra con un codice"
                  onClick={() => navigate('/home/join')}
                />
                <PrimaryCta
                  tone="violet"
                  icon={<CalendarPlus size={21} strokeWidth={2.4} />}
                  label="Organizza una serata"
                  onClick={() => navigate('/mode-select')}
                />

                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 6 }}>
                  <MiniCta
                    icon={<Play size={19} strokeWidth={2.4} fill="currentColor" />}
                    lines={['Riprendi', 'serata']}
                    onClick={() => navigate('/home-setup')}
                  />
                  <MiniCta
                    icon={<Dices size={21} strokeWidth={2.2} />}
                    lines={['Scopri', 'i giochi']}
                    onClick={() => navigate('/demo')}
                  />
                </div>
              </div>
            </div>
          </div>
        </main>
      </StageFit>
    </ShowStage>
  );
}
