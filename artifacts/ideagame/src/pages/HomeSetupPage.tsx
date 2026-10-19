/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/**
 * HomeSetupPage — /home-setup
 * Wizard "Crea serata" in 3 passi (Serata · Giochi · Dispositivi), fedele ai
 * mockup 05-03 / 05-04. Il motore resta lo stesso: crea una sessione HOME
 * (e, in Live, la sessione Live collegata) e porta alla lobby.
 */
import { useState } from 'react';
import { useLocation } from 'wouter';
import {
  Pencil, User, Users, ChevronDown, ChevronRight, ChevronLeft, Check, Lock,
  Brain, Heart, Music, Laugh, Activity, MessageCircleQuestion, Mic, X, Loader2,
  Volume2,
} from 'lucide-react';
import ShowStage from '@/components/ShowStage';
import ShellHeader from '@/components/ShellHeader';
import StageFit from '@/components/StageFit';
import { CheckCircle2, AlertCircle, Monitor as MonitorIcon, Smartphone } from 'lucide-react';
import { AudioManager } from '@/audio/AudioManager';

type GameDef = {
  slug: string;
  label: string;
  desc: string;
  Icon: React.FC<{ size?: number; strokeWidth?: number }>;
  tint: string;
  border: string;
  adult?: boolean;
};

const GAMES: GameDef[] = [
  { slug: 'quizzone',           label: 'Quizzone',           desc: 'Domande, curiosità\ne colpi di scena', Icon: Brain,                   tint: 'linear-gradient(150deg,rgba(90,40,160,0.5),rgba(12,8,24,0.92))',  border: 'rgba(168,110,246,0.5)' },
  { slug: 'gioco-coppie',       label: 'Gioco delle Coppie', desc: 'Quanto vi conoscete\ndavvero?',        Icon: Heart,                   tint: 'linear-gradient(150deg,rgba(190,50,130,0.5),rgba(24,8,20,0.92))', border: 'rgba(240,110,190,0.5)' },
  { slug: 'saramusica',         label: 'SaraMusica',         desc: 'Indovina, canta,\nscatena la musica!', Icon: Music,                   tint: 'linear-gradient(150deg,rgba(30,90,180,0.5),rgba(8,14,30,0.92))',  border: 'rgba(90,160,240,0.5)' },
  { slug: 'percorso-a-risate',  label: 'Percorso a Risate',  desc: 'Mini giochi, sfide\ne tanto divertimento', Icon: Laugh,                 tint: 'linear-gradient(150deg,rgba(190,120,30,0.5),rgba(24,14,6,0.92))', border: 'rgba(240,186,90,0.55)' },
  { slug: 'sfida-ballo',        label: 'Sfida di Ballo',     desc: 'Muoviti, imita,\nfai punti!',          Icon: Activity,                tint: 'linear-gradient(150deg,rgba(30,150,90,0.5),rgba(8,24,16,0.92))',  border: 'rgba(70,210,140,0.5)' },
  { slug: 'parola-alle-spalle', label: 'Parola alle Spalle', desc: 'Spiega, fai indovinare,\nnon dire la parola!', Icon: MessageCircleQuestion, tint: 'linear-gradient(150deg,rgba(30,90,190,0.5),rgba(8,14,30,0.92))', border: 'rgba(90,150,240,0.5)' },
  { slug: 'karaoke-battle',     label: 'Karaoke Battle',     desc: 'Canta, sfida, fai volare\nla serata!', Icon: Mic,                     tint: 'linear-gradient(150deg,rgba(170,40,150,0.5),rgba(20,8,26,0.92))', border: 'rgba(220,100,210,0.5)' },
  { slug: 'adult-only',         label: 'Adult Only',         desc: 'Solo per un pubblico\nadatto',         Icon: Lock,                    tint: 'linear-gradient(150deg,rgba(60,20,30,0.6),rgba(14,6,8,0.95))',    border: 'rgba(120,60,70,0.5)', adult: true },
];

const IN_PROVA = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('prova') === '1';
const SOLO_CON_AI = new Set(['quizzone', 'saramusica']);
const AUDIENCES = ['Famiglia', 'Amici', 'Adulti'];

function Stepper({ step }: { step: number }) {
  const nodes = [
    { n: 1, label: 'Serata' },
    { n: 2, label: 'Giochi' },
    { n: 3, label: 'Dispositivi' },
  ];
  return (
    <div className="flex items-start justify-center" style={{ gap: 0 }}>
      {nodes.map((nd, i) => {
        const done = step > nd.n;
        const active = step === nd.n;
        return (
          <div key={nd.n} className="flex items-start">
            <div className="flex flex-col items-center" style={{ width: 92 }}>
              <div
                className="grid place-items-center rounded-full font-extrabold"
                style={{
                  width: 32, height: 32, fontSize: 14,
                  background: done || active ? 'linear-gradient(180deg,#FCE08B,#E6B85C)' : 'transparent',
                  border: done || active ? 'none' : '2px solid rgba(255,255,255,0.28)',
                  color: done || active ? '#241803' : 'rgba(255,255,255,0.5)',
                }}
              >
                {done ? <Check size={17} strokeWidth={3} /> : nd.n}
              </div>
              <span className="font-bold" style={{ marginTop: 6, fontSize: 12.5, color: active || done ? '#F7F3E8' : 'rgba(247,243,232,0.5)' }}>
                {nd.label}
              </span>
            </div>
            {i < nodes.length - 1 && (
              <span style={{ height: 2, width: 46, marginTop: 15, background: step > nd.n ? 'rgba(230,184,92,0.7)' : 'rgba(255,255,255,0.18)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function GoldButton({ label, onClick, disabled, loading, width }: { label: string; onClick: () => void; disabled?: boolean; loading?: boolean; width?: number | string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="flex items-center justify-center rounded-2xl font-extrabold transition-transform active:scale-[0.99]"
      style={{
        height: 54, padding: '0 28px', gap: 10, width,
        background: disabled ? 'rgba(230,184,92,0.4)' : 'linear-gradient(180deg,#FCE08B 0%,#EDB857 52%,#E0A63F 100%)',
        border: '1px solid rgba(255,228,150,0.7)', color: '#241803', fontSize: 19,
        boxShadow: '0 10px 24px rgba(224,166,63,0.35), inset 0 1px 0 rgba(255,255,255,0.5)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {loading ? <Loader2 size={20} className="animate-spin" /> : null}
      {loading ? 'Creazione...' : label}
      {!loading ? <ChevronRight size={21} strokeWidth={2.6} /> : null}
    </button>
  );
}

/* ── Componenti a LIVELLO DI MODULO (NON dentro il render: altrimenti si rismontano
      a ogni tasto e gli input perdono il focus). ───────────────────────────────── */
const SETUP_INPUT_STYLE: React.CSSProperties = {
  width: '100%', height: 44, padding: '0 14px', borderRadius: 12,
  background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.14)',
  color: '#F7F3E8', fontFamily: "'Outfit',system-ui,sans-serif", fontSize: 15, fontWeight: 600, outline: 'none',
};
function FieldRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center" style={{ gap: 12 }}>
      <div className="flex items-center" style={{ width: 150, gap: 9, color: '#F7F3E8' }}>
        <span style={{ color: '#E6B85C' }}>{icon}</span>
        <span className="font-bold" style={{ fontSize: 15 }}>{label}</span>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
function GameCard({ g, active, locked, onToggle }: { g: GameDef; active: boolean; locked: boolean; onToggle: () => void }) {
  const { Icon } = g;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={locked}
      className="group relative flex h-full flex-col justify-end overflow-hidden rounded-xl text-left transition-transform active:scale-[0.99]"
      style={{ padding: 12, background: g.tint, border: `1.5px solid ${active ? g.border : 'rgba(255,255,255,0.1)'}`, boxShadow: active ? `0 0 16px ${g.border}` : 'none', opacity: locked ? 0.85 : 1, cursor: locked ? 'not-allowed' : 'pointer' }}
    >
      <span className="absolute" style={{ top: 10, left: 12, color: '#F7F3E8', opacity: 0.95 }}>
        {g.adult ? (
          <span className="grid place-items-center rounded-full font-black" style={{ width: 30, height: 30, border: '2px solid #F0556B', color: '#F0556B', fontSize: 11 }}>18+</span>
        ) : (
          <Icon size={26} strokeWidth={2} />
        )}
      </span>
      <span
        className="absolute grid place-items-center rounded-md"
        style={{
          top: 10, right: 10, width: 22, height: 22,
          background: active ? 'linear-gradient(180deg,#FCE08B,#E6B85C)' : 'rgba(0,0,0,0.35)',
          border: active ? 'none' : '1.5px solid rgba(255,255,255,0.4)', color: '#241803',
        }}
      >
        {active ? <Check size={15} strokeWidth={3} /> : null}
        {locked ? <Lock size={12} style={{ color: 'rgba(255,255,255,0.7)' }} /> : null}
      </span>
      <div className="font-extrabold" style={{ fontFamily: "'Outfit',system-ui,sans-serif", fontSize: 16, color: '#F7F3E8', lineHeight: 1.05 }}>
        {g.label}
      </div>
      <div style={{ fontSize: 11.5, color: 'rgba(247,243,232,0.72)', marginTop: 3, lineHeight: 1.2, whiteSpace: 'pre-line' }}>{g.desc}</div>
    </button>
  );
}
function DeviceRow({ icon, title, sub, right }: { icon: React.ReactNode; title: string; sub: string; right: React.ReactNode }) {
  return (
    <div className="flex items-center" style={{ gap: 14, padding: '12px 4px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <span className="grid place-items-center shrink-0" style={{ width: 40, color: '#E6B85C' }}>{icon}</span>
      <div className="flex-1">
        <div className="font-bold" style={{ fontSize: 16, color: '#F7F3E8' }}>{title}</div>
        <div style={{ fontSize: 12.5, color: 'rgba(247,243,232,0.6)' }}>{sub}</div>
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
}

export default function HomeSetupPage() {
  const [, navigate] = useLocation();
  const mode = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('mode') : null;
  const isLive = mode === 'live';
  const isLockdown = mode === 'lockdown';
  const urlCode = typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('code') ?? '') : '';

  // ?step=N: utile per anteprima/confronto di un singolo passo del wizard.
  const initialStep = (() => {
    const n = typeof window !== 'undefined' ? Number(new URLSearchParams(window.location.search).get('step')) : 1;
    return n >= 1 && n <= 3 ? n : 1;
  })();
  const [step, setStep] = useState(initialStep);
  const [eventName, setEventName] = useState(IN_PROVA ? 'Prova in showroom' : '');
  const [hostName, setHostName] = useState('');
  const [audience, setAudience] = useState('Famiglia');
  const [liveCode, setLiveCode] = useState(urlCode);
  const [selectedGames, setSelectedGames] = useState<string[]>(() =>
    isLockdown ? ['lockdown'] : (IN_PROVA ? ['gioco-coppie', 'parola-alle-spalle', 'sfida-ballo'] : []));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [audioOk, setAudioOk] = useState(false);

  const provaAudio = () => {
    AudioManager.resumeContext();
    setAudioOk(true);
  };

  const isFamily = audience === 'Famiglia';
  // Adult Only resta VISIBILE ma bloccato per il pubblico Famiglia (spec: non nasconderlo
  // solo dopo aver creato la sessione). In prova showroom famiglia è escluso del tutto.
  const visibleGames = GAMES.filter((g) => !(IN_PROVA && (SOLO_CON_AI.has(g.slug) || g.adult)));

  const toggleGame = (slug: string) => {
    const g = GAMES.find((x) => x.slug === slug);
    if (g?.adult && isFamily) return;                 // bloccato per Famiglia
    setSelectedGames((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  };

  const back = () => {
    setError('');
    if (step === 1) { navigate('/mode-select'); return; }
    if (step === 3 && isLockdown) { setStep(1); return; }
    setStep(step - 1);
  };

  const next = () => {
    setError('');
    if (step === 1) {
      if (!hostName.trim()) { setError('Inserisci il nome del conduttore.'); return; }
      setStep(isLockdown ? 3 : 2);
      return;
    }
    if (step === 2) {
      if (selectedGames.length === 0) { setError('Seleziona almeno un gioco.'); return; }
      setStep(3);
    }
  };

  const handleCreate = async () => {
    if (!hostName.trim()) { setError('Inserisci il nome del conduttore.'); setStep(1); return; }
    if (!isLockdown && selectedGames.length === 0) { setError('Seleziona almeno un gioco.'); setStep(2); return; }
    setError('');
    setLoading(true);
    try {
      const homeRes = await fetch('/api/home/sessions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostName: hostName.trim(), selectedGames, ...(liveCode.trim() ? { liveCode: liveCode.trim() } : {}) }),
      });
      if (homeRes.status === 402) { setError('Codice serata non valido, già usato o scaduto.'); setLoading(false); return; }
      if (!homeRes.ok) throw new Error('Errore nella creazione della stanza.');
      const homeSession = await homeRes.json() as { id: string; joinCode: string };

      if (isLive) {
        const liveRes = await fetch('/api/live-sessions', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: (eventName.trim() || hostName.trim()), homeSessionId: homeSession.id }),
        });
        if (!liveRes.ok && liveRes.status === 401) {
          navigate('/login?redirect=' + encodeURIComponent('/home-setup?mode=live'));
          return;
        }
        const liveSession = liveRes.ok ? await liveRes.json() as { id: string; tvCode: string; presenterCode: string } : null;
        navigate(`/home-lobby/${homeSession.joinCode}${liveSession ? `?live=${liveSession.tvCode}` : ''}`);
      } else {
        navigate(`/home-lobby/${homeSession.joinCode}`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore di rete.');
    } finally {
      setLoading(false);
    }
  };

  const badge = isLockdown ? 'LOCKDOWN' : step === 2 ? 'SCEGLI GIOCHI' : 'CREA SERATA';
  const badgeNum = step === 2 ? '04' : '03';

  /* ── pannelli ── */
  const Step1 = (
    <div className="flex flex-col" style={{ gap: 14 }}>
      <div
        className="rounded-2xl"
        style={{ background: 'rgba(13,13,25,0.72)', border: '1.5px solid rgba(255,255,255,0.12)', padding: 22, backdropFilter: 'blur(10px)' }}
      >
        <div className="font-black" style={{ fontFamily: "'Outfit',system-ui,sans-serif", fontSize: 22, color: '#F7F3E8' }}>
          Impostazioni della serata
        </div>
        <div style={{ fontSize: 13.5, color: 'rgba(247,243,232,0.6)', margin: '4px 0 18px' }}>
          Dai un nome alla tua serata e personalizza i dettagli.
        </div>
        <div className="flex flex-col" style={{ gap: 12 }}>
          <FieldRow icon={<Pencil size={18} strokeWidth={2.2} />} label="Nome serata">
            <div className="relative">
              <input value={eventName} onChange={(e) => setEventName(e.target.value.slice(0, 40))} placeholder="Es. Compleanno di Giulia" style={SETUP_INPUT_STYLE} />
              {eventName && (
                <button type="button" aria-label="Cancella" onClick={() => setEventName('')} className="absolute" style={{ right: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(247,243,232,0.5)' }}>
                  <X size={17} />
                </button>
              )}
            </div>
          </FieldRow>
          <FieldRow icon={<User size={18} strokeWidth={2.2} />} label="Conduttore">
            <input value={hostName} onChange={(e) => setHostName(e.target.value.slice(0, 30))} placeholder="Il tuo nome" style={SETUP_INPUT_STYLE} />
          </FieldRow>
          <FieldRow icon={<Users size={18} strokeWidth={2.2} />} label="Pubblico">
            <div className="relative">
              <select value={audience} onChange={(e) => setAudience(e.target.value)} style={{ ...SETUP_INPUT_STYLE, appearance: 'none', cursor: 'pointer' }}>
                {AUDIENCES.map((a) => <option key={a} value={a} style={{ color: '#111' }}>{a}</option>)}
              </select>
              <ChevronDown size={18} className="pointer-events-none absolute" style={{ right: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(247,243,232,0.6)' }} />
            </div>
          </FieldRow>
          {isLive && (
            <FieldRow icon={<Check size={18} strokeWidth={2.2} />} label="Codice Live">
              <input value={liveCode} onChange={(e) => setLiveCode(e.target.value.toUpperCase())} placeholder="LIVE-XXXX-XXXX (opzionale)" style={SETUP_INPUT_STYLE} />
            </FieldRow>
          )}
        </div>
      </div>
      <div className="flex justify-center">
        <GoldButton label="Continua" onClick={next} width={260} />
      </div>
    </div>
  );

  const Step2 = (
    <div className="flex flex-1 flex-col" style={{ gap: 10 }}>
      <div className="text-center">
        <h1 className="font-black" style={{ fontFamily: "'Outfit',system-ui,sans-serif", fontSize: 23, color: '#F7F3E8', margin: 0 }}>
          Seleziona i giochi per la tua serata
        </h1>
        <div style={{ fontSize: 13, color: 'rgba(247,243,232,0.6)', marginTop: 4 }}>
          Scegli fino a 8 giochi. Ti consigliamo un mix per una serata ancora più divertente!
        </div>
      </div>
      <div className="grid flex-1" style={{ gridTemplateColumns: 'repeat(4,1fr)', gridTemplateRows: '1fr 1fr', gap: 10 }}>
        {visibleGames.map((g) => <GameCard key={g.slug} g={g} active={selectedGames.includes(g.slug)} locked={!!g.adult && isFamily} onToggle={() => toggleGame(g.slug)} />)}
      </div>
      <div className="flex items-center justify-between rounded-xl" style={{ padding: '10px 14px', background: 'rgba(13,13,25,0.72)', border: '1.5px solid rgba(255,255,255,0.12)' }}>
        <div className="flex items-center" style={{ gap: 10, color: '#F7F3E8' }}>
          <span className="grid place-items-center rounded-lg" style={{ width: 34, height: 34, background: 'rgba(255,255,255,0.06)', color: '#E6B85C' }}>🎲</span>
          <span className="font-bold" style={{ fontSize: 14 }}>{selectedGames.length} giochi selezionati</span>
        </div>
        <GoldButton label="Continua" onClick={next} width={210} />
      </div>
    </div>
  );

  const okChip = <CheckCircle2 size={24} style={{ color: '#34D27A' }} />;

  const Step3 = (
    <div className="flex flex-col" style={{ gap: 14 }}>
      <div className="rounded-2xl" style={{ background: 'rgba(13,13,25,0.72)', border: '1.5px solid rgba(255,255,255,0.12)', padding: '8px 18px' }}>
        <DeviceRow
          icon={<MonitorIcon size={26} strokeWidth={2} />}
          title="Monitor" sub="Pronto per la proiezione"
          right={okChip}
        />
        <DeviceRow
          icon={<Volume2 size={26} strokeWidth={2} />}
          title="Audio" sub={audioOk ? 'Attivo' : 'Non ancora attivato'}
          right={audioOk ? okChip : (
            <div className="flex items-center" style={{ gap: 12 }}>
              <AlertCircle size={22} style={{ color: '#E6B85C' }} />
              <button type="button" onClick={provaAudio} className="rounded-xl font-extrabold" style={{ padding: '9px 18px', background: 'linear-gradient(180deg,#FCE08B,#E6B85C)', color: '#241803', fontSize: 14 }}>
                Prova audio
              </button>
            </div>
          )}
        />
        <DeviceRow
          icon={<Smartphone size={26} strokeWidth={2} />}
          title="Telefoni giocatori" sub="Entrano col QR o col codice dopo l'apertura"
          right={okChip}
        />
        <div className="flex items-center" style={{ gap: 14, padding: '12px 4px' }}>
          <span className="grid place-items-center shrink-0" style={{ width: 40 }}>
            <img src="/brand/logo-glasses.png" alt="" aria-hidden style={{ height: 30 }} />
          </span>
          <div className="flex-1">
            <div className="font-bold" style={{ fontSize: 16, color: '#F7F3E8' }}>Johhy</div>
            <div style={{ fontSize: 12.5, color: 'rgba(247,243,232,0.6)' }}>Voce pronta</div>
          </div>
          {okChip}
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1.2fr', gap: 14 }}>
        <button type="button" onClick={handleCreate} disabled={loading}
          className="flex items-center justify-center rounded-2xl font-extrabold"
          style={{ height: 54, gap: 10, background: 'rgba(13,13,25,0.72)', border: '1.5px solid rgba(230,184,92,0.4)', color: '#F7F3E8', fontSize: 16, cursor: loading ? 'not-allowed' : 'pointer' }}>
          <MonitorIcon size={19} /> Apri monitor
        </button>
        <GoldButton label="Vai alla lobby" onClick={handleCreate} loading={loading} width="100%" />
      </div>
    </div>
  );

  const header = (
    <ShellHeader num={badgeNum} label={badge} onPlayers={() => navigate('/home/join')} onSettings={() => navigate('/mode-select')} onProfile={() => navigate('/login')} />
  );

  const errorBar = error ? (
    <div className="mx-auto rounded-xl text-center" style={{ maxWidth: 480, padding: '8px 14px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: 'rgba(255,140,140,0.95)', fontSize: 13, fontWeight: 600 }}>
      {error}
    </div>
  ) : null;

  const backBtn = (
    <button type="button" onClick={back} className="absolute flex items-center rounded-full" style={{ left: 14, top: 64, gap: 5, padding: '6px 14px', background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.14)', color: 'rgba(247,243,232,0.7)', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', zIndex: 30 }}>
      <ChevronLeft size={14} /> INDIETRO
    </button>
  );

  const body = (
    <>
      <div style={{ paddingTop: 6 }}><Stepper step={step} /></div>
      {step === 2 ? (
        <main className="flex flex-1 flex-col" style={{ padding: '2px 16px 12px', gap: 6 }}>
          {errorBar}
          {Step2}
        </main>
      ) : (
        <main className="relative flex flex-1" style={{ padding: '6px 16px 14px' }}>
          <div className="grid w-full" style={{ gridTemplateColumns: '290px 1fr', columnGap: 10, alignItems: 'stretch' }}>
            <div className="relative flex h-full items-end justify-center" style={{ overflow: 'visible' }}>
              <img src="/jonny-master-nobg.png" alt="Johhy" style={{ height: 420, width: 'auto', maxWidth: 'none', objectFit: 'contain', objectPosition: 'bottom', filter: 'drop-shadow(0 16px 26px rgba(0,0,0,0.55))' }} draggable={false} />
            </div>
            <div className="flex flex-col justify-start" style={{ gap: 10, paddingTop: 2 }}>
              {errorBar}
              {step === 1 ? Step1 : Step3}
            </div>
          </div>
        </main>
      )}
    </>
  );

  return (
    <ShowStage>
      <StageFit designW={752} designH={500}>
        {header}
        {backBtn}
        {body}
      </StageFit>
    </ShowStage>
  );
}
