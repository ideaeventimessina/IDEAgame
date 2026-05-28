/**
 * HomeV4.1 — Game Show fullscreen 16:9 · Visual Upgrade
 * Zero backend · zero socket · zero polling.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { RotateCcw, Users, Trophy, Zap, Star, ChevronRight } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  useListGames, useGetScoreboard,
  type ScoreboardEntry, type Game as ApiGame,
} from '@workspace/api-client-react';

/* ─── Jonny poses: PNG transparent — no blend mode needed */
/* jonnyNobg = /public/jonny-master-nobg.png (already no background) */

/* ─── types ─────────────────────────────────────── */
type Screen = 'show' | 'arena' | 'podium';
interface Game       { slug:string; label:string; short:string; color:string; glow:string; desc:string; players:string; diff:string; }
interface LiveEvent  { id:string; name:string; joinCode:string; }
interface LivePlayer { id:string; nickname:string; teamId:string|null; }
interface LiveState  { event:LiveEvent|null; players:LivePlayer[]; loading:boolean; }

/* ─── data ──────────────────────────────────────── */
const GAMES: Game[] = [
  { slug:'freestyle', label:'Freestyle Battle',   short:'FREESTYLE', color:'#E6A800', glow:'#FFD040', desc:'Sfida aperta — ogni risposta vale. Chi osa vince.',     players:'2-20', diff:'Facile'  },
  { slug:'percorso',  label:'Percorso a Risate',  short:'PERCORSO',  color:'#7C3AED', glow:'#A855F7', desc:'Tappa dopo tappa — sopravvivi o esci di scena.',        players:'4-20', diff:'Media'   },
  { slug:'coppie',    label:'Gioco delle Coppie', short:'COPPIE',    color:'#CC2244', glow:'#F472B6', desc:'Trova la coppia. Occhi aperti, mente svelta.',           players:'4-16', diff:'Media'   },
  { slug:'quizzone',  label:'Quizzone',           short:'QUIZZONE',  color:'#E87E04', glow:'#FBBF24', desc:'Chi risponde primo prende tutto. Classifica live.',     players:'2-20', diff:'Media'   },
  { slug:'adult',     label:'Adult Only 🔥',      short:'ADULT',     color:'#CC3300', glow:'#F97316', desc:'Per soli adulti. Niente censura. Tutto in gioco.',       players:'4-16', diff:'Alta'    },
  { slug:'sfida',     label:'Sfida di Ballo',     short:'SFIDA',     color:'#1A8F3C', glow:'#34D399', desc:'Il telefono giudica. Il palco è tuo. Entra nell\'arena.',players:'2-12', diff:'Alta'    },
  { slug:'parola',    label:'Parola alle Spalle', short:'PAROLA',    color:'#0055CC', glow:'#60A5FA', desc:'Non puoi guardare. Il team ti salva — o ti tradisce.',   players:'4-20', diff:'Facile'  },
  { slug:'karaoke',   label:'Karaoke Battle',     short:'KARAOKE',   color:'#6633CC', glow:'#C084FC', desc:'Canta, stona, vinci. Il pubblico decide tutto.',        players:'2-16', diff:'Facile'  },
];


const PLAYER_COLORS = ['#F5B642','#A855F7','#EC4899','#34D399','#60A5FA','#FB923C'];

/* ─── asset helper ───────────────────────────────── */
const BASE = (import.meta.env.BASE_URL as string) ?? '/';
function pub(path: string) {
  const b = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;
  return `${b}${path}`;
}

/* ─── live-state hook (public endpoint, no auth) ─── */
function useLiveState(): LiveState {
  const [state, setState] = useState<LiveState>({ event:null, players:[], loading:true });
  useEffect(()=>{
    let alive = true;
    const load = () =>
      fetch('/api/events/public/live-state')
        .then(r=>r.json())
        .then((d:{event:LiveEvent|null;players:LivePlayer[]})=>{
          if(alive) setState({ event:d.event, players:d.players??[], loading:false });
        })
        .catch(()=>{ if(alive) setState(s=>({...s,loading:false})); });
    load();
    const t = setInterval(load, 5000);
    return ()=>{ alive=false; clearInterval(t); };
  },[]);
  return state;
}

/* ─── map API game → local Game type ─────────────── */
function mapApiGame(g: ApiGame): Game {
  const style = GAMES.find(s=>s.slug===g.slug);
  return {
    slug:    g.slug,
    label:   g.name,
    short:   style?.short ?? g.name.split(' ')[0].toUpperCase().slice(0,7),
    color:   style?.color ?? (g.accentColor as string) ?? '#7C3AED',
    glow:    style?.glow  ?? (g.accentColor as string) ?? '#A855F7',
    desc:    (g.tagline as string) ?? style?.desc ?? '',
    players: style?.players ?? '2-20',
    diff:    style?.diff    ?? 'Media',
  };
}

/* ─── stable random seed (no re-render drift) ────── */
function stableRnd(seed: number) {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

/* ─── wheel math ─────────────────────────────────── */
function polar(cx:number, cy:number, r:number, deg:number){
  const rad = ((deg-90)*Math.PI)/180;
  return { x: cx+r*Math.cos(rad), y: cy+r*Math.sin(rad) };
}
function sector(cx:number,cy:number,r:number,ri:number,a1:number,a2:number){
  const o1=polar(cx,cy,r,a1), o2=polar(cx,cy,r,a2);
  const i1=polar(cx,cy,ri,a1), i2=polar(cx,cy,ri,a2);
  const lg=a2-a1>180?1:0;
  return `M${o1.x},${o1.y} A${r},${r},0,${lg},1,${o2.x},${o2.y} L${i2.x},${i2.y} A${ri},${ri},0,${lg},0,${i1.x},${i1.y} Z`;
}
function midPt(cx:number,cy:number,r:number,a1:number,a2:number){
  return polar(cx,cy,r,(a1+a2)/2);
}

/* ─── SVG sector icons ───────────────────────────── */
function SectorIcon({ slug }: { slug: string }) {
  const s: Record<string, React.ReactNode> = {
    freestyle: <polygon points="0,-11 2.8,-3.5 11,-3.5 4.8,1.3 7.2,9 0,4.5 -7.2,9 -4.8,1.3 -11,-3.5 -2.8,-3.5" fill="rgba(255,255,255,0.92)"/>,
    percorso:  <><rect x="-9" y="-10" width="18" height="20" rx="3" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="2.2"/><circle cx="-4" cy="-4" r="2" fill="white"/><circle cx="4" cy="0" r="2" fill="white"/><circle cx="-4" cy="4" r="2" fill="white"/></>,
    coppie:    <><rect x="-11" y="-9" width="13" height="18" rx="2" fill="rgba(255,255,255,0.28)" stroke="rgba(255,255,255,0.88)" strokeWidth="2"/><rect x="-2" y="-9" width="13" height="18" rx="2" fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.88)" strokeWidth="2"/></>,
    quizzone:  <><circle cx="0" cy="0" r="11" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="2.2"/><text textAnchor="middle" dominantBaseline="central" fontSize="15" fontWeight="900" fill="white">?</text></>,
    adult:     <path d="M0,-13 C-3,-7 -10,-5 -7,2 C-5,7 -2,11 0,13 C2,11 5,7 7,2 C10,-5 3,-7 0,-13 Z" fill="rgba(255,255,255,0.9)"/>,
    sfida:     <path d="M3,-13 L-3,-1 L2,-1 L-4,13 L8,1 L2,1 Z" fill="rgba(255,255,255,0.92)"/>,
    parola:    <><path d="M-11,-9 Q-11,-13 -7,-13 L7,-13 Q11,-13 11,-9 L11,1 Q11,5 7,5 L2,5 L-1,11 L-3,5 L-7,5 Q-11,5 -11,1 Z" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="2.2"/><circle cx="-3" cy="-4" r="1.8" fill="white"/><circle cx="0" cy="-4" r="1.8" fill="white"/><circle cx="3" cy="-4" r="1.8" fill="white"/></>,
    karaoke:   <><ellipse cx="0" cy="-6" rx="5.5" ry="8" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="2.2"/><line x1="0" y1="2" x2="0" y2="10" stroke="rgba(255,255,255,0.88)" strokeWidth="2.2"/><path d="M-7,10 Q0,14 7,10" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="2.2"/></>,
  };
  return <>{s[slug] ?? <circle cx="0" cy="0" r="8" fill="rgba(255,255,255,0.7)"/>}</>;
}

/* ─── wheel ──────────────────────────────────────── */
function GameWheel({ selected, onSelect, spinning, games = GAMES }: {
  selected: Game; onSelect:(g:Game)=>void; spinning:boolean; games?: Game[];
}) {
  const cx=220, cy=220, r=183, ri=60;
  const controls = useAnimation();

  useEffect(()=>{
    if(spinning){
      const idx = games.findIndex(g=>g.slug===selected.slug);
      const sliceAngle = games.length > 0 ? 360/games.length : 45;
      controls.start({ rotate:[0, 1620+idx*sliceAngle], transition:{ duration:2.8, ease:'easeInOut' as const } });
    }
  },[spinning, selected, controls, games]);

  const BULBS = 48;
  const bulbR = r+17;

  return (
    <div style={{ width:'100%', height:'100%', transform:'perspective(900px) rotateX(6deg)', transformOrigin:'center bottom' }}>
      <motion.div animate={controls} style={{ transformOrigin:'center', width:'100%', height:'100%' }}>
        <svg viewBox="0 0 440 440" width="100%" height="100%">
          <defs>
            {games.map(g=>(
              <radialGradient key={g.slug} id={`gw-${g.slug}`} cx="38%" cy="28%" r="75%">
                <stop offset="0%" stopColor={g.glow} stopOpacity="1"/>
                <stop offset="55%" stopColor={g.color} stopOpacity="1"/>
                <stop offset="100%" stopColor={g.color} stopOpacity="0.75"/>
              </radialGradient>
            ))}
            {/* metallic gold ring gradient */}
            <linearGradient id="gw-ring1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stopColor="#FFF4A0"/>
              <stop offset="25%"  stopColor="#F5B642"/>
              <stop offset="50%"  stopColor="#FFE066"/>
              <stop offset="75%"  stopColor="#C8810A"/>
              <stop offset="100%" stopColor="#FFF4A0"/>
            </linearGradient>
            <linearGradient id="gw-ring2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%"   stopColor="#8B5E00"/>
              <stop offset="50%"  stopColor="#F5B642"/>
              <stop offset="100%" stopColor="#8B5E00"/>
            </linearGradient>
            {/* inner hub gradient */}
            <radialGradient id="gw-hub" cx="40%" cy="30%" r="70%">
              <stop offset="0%"   stopColor="#3B1280"/>
              <stop offset="100%" stopColor="#0A0320"/>
            </radialGradient>
            {/* glow filter */}
            <filter id="gw-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="6" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="gw-bulbglow" x="-150%" y="-150%" width="400%" height="400%">
              <feGaussianBlur stdDeviation="2.5" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="gw-txt">
              <feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor="rgba(0,0,0,1)" floodOpacity="1"/>
            </filter>
            <filter id="gw-innerShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feFlood floodColor="rgba(0,0,0,0.7)" result="flood"/>
              <feComposite in="flood" in2="SourceGraphic" operator="in" result="shadow"/>
              <feGaussianBlur in="shadow" stdDeviation="8" result="blurShadow"/>
              <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="blurShadow"/></feMerge>
            </filter>
          </defs>

          {/* deep drop shadow behind wheel */}
          <ellipse cx={cx} cy={cy+15} rx={r+40} ry={r+30} fill="rgba(0,0,0,0.55)" filter="url(#gw-glow)"/>

          {/* outer metallic rim — 3 rings */}
          <circle cx={cx} cy={cy} r={r+22} fill="none" stroke="url(#gw-ring2)" strokeWidth="5"/>
          <circle cx={cx} cy={cy} r={r+14} fill="rgba(0,0,0,0.6)" stroke="none"/>
          <circle cx={cx} cy={cy} r={r+12} fill="none" stroke="url(#gw-ring1)" strokeWidth="11"
            style={{ filter:'drop-shadow(0 0 10px rgba(245,182,66,0.95))' }}/>
          <circle cx={cx} cy={cy} r={r+5}  fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>

          {/* sectors */}
          {games.map((g,i)=>{
            const sliceAng = 360/games.length;
            const a1=i*sliceAng, a2=(i+1)*sliceAng;
            const isSel = g.slug===selected.slug;
            const lbl   = midPt(cx,cy,r*0.70,a1,a2);
            const iconPt= midPt(cx,cy,r*0.52,a1,a2);
            return (
              <g key={g.slug} onClick={()=>onSelect(g)} style={{ cursor:'pointer' }}>
                {/* sector inner shadow */}
                <path d={sector(cx,cy,r,ri,a1,a2)}
                  fill="rgba(0,0,0,0.35)" style={{ transform:'translate(2px,3px)' }}/>
                {/* main sector */}
                <path d={sector(cx,cy, r-(isSel?0:4), ri+(isSel?0:3), a1, a2)}
                  fill={`url(#gw-${g.slug})`}
                  stroke={isSel?'rgba(255,255,255,0.75)':'rgba(0,0,0,0.6)'}
                  strokeWidth={isSel?2.5:1.5}
                  filter={isSel?'url(#gw-glow)':undefined}/>
                {/* icon */}
                <g transform={`translate(${iconPt.x},${iconPt.y}) scale(0.92)`}>
                  <SectorIcon slug={g.slug}/>
                </g>
                {/* label */}
                <text x={lbl.x} y={lbl.y} textAnchor="middle" dominantBaseline="middle"
                  fontSize="12" fontWeight="900" fontFamily="'Outfit','Arial Black',sans-serif"
                  fill="white" stroke="rgba(0,0,0,0.95)" strokeWidth="3" paintOrder="stroke"
                  filter="url(#gw-txt)" style={{ userSelect:'none', letterSpacing:'0.06em' }}>
                  {g.short}
                </text>
              </g>
            );
          })}

          {/* dividers */}
          {games.map((_,i)=>{
            const sliceAng = 360/games.length;
            const p1=polar(cx,cy,ri+4,i*sliceAng), p2=polar(cx,cy,r-4,i*sliceAng);
            return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(0,0,0,0.65)" strokeWidth="1.5"/>;
          })}

          {/* bulbs */}
          {Array.from({length:BULBS},(_,i)=>{
            const ang=i*(360/BULBS);
            const pt=polar(cx,cy,bulbR,ang);
            const lit=i%2===0;
            return (
              <motion.circle key={i} cx={pt.x} cy={pt.y} r={lit?5:3.5}
                fill={lit?'#FFE55C':'#7A5200'}
                style={{ filter:lit?'url(#gw-bulbglow)':undefined }}
                animate={lit?{ opacity:[0.65,1,0.65] }:{}}
                transition={lit?{ duration:1.1+((i%7)*0.18), repeat:Infinity, delay:(i%9)*0.12, ease:'easeInOut' as const }:{}}
              />
            );
          })}

          {/* hub */}
          <circle cx={cx} cy={cy} r={ri+5}  fill="rgba(0,0,0,0.85)"/>
          <circle cx={cx} cy={cy} r={ri}     fill="url(#gw-hub)" stroke="url(#gw-ring1)" strokeWidth="3"
            style={{ filter:'drop-shadow(0 0 12px rgba(168,85,247,0.7))' }}/>
          <circle cx={cx} cy={cy} r={ri-6}   fill="transparent" stroke="rgba(255,255,255,0.12)" strokeWidth="1"/>
          {/* hub text */}
          <text x={cx} y={cy-9} textAnchor="middle" dominantBaseline="middle"
            fontSize="10.5" fontWeight="900" fontFamily="'Outfit','Arial Black',sans-serif"
            fill="#F5B642" style={{ userSelect:'none', letterSpacing:'0.14em' }}>SCEGLI</text>
          <text x={cx} y={cy+8} textAnchor="middle" dominantBaseline="middle"
            fontSize="10.5" fontWeight="900" fontFamily="'Outfit','Arial Black',sans-serif"
            fill="#FFD700" style={{ userSelect:'none', letterSpacing:'0.08em' }}>IL GIOCO</text>
        </svg>
      </motion.div>

      {/* ── fixed pointer (outside rotating div) ── */}
      <div style={{ position:'absolute', top:'-3%', left:'50%', transform:'translateX(-50%)', zIndex:10, pointerEvents:'none' }}>
        <svg width="28" height="38" viewBox="0 0 28 38">
          <defs>
            <linearGradient id="ptr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFE55C"/>
              <stop offset="100%" stopColor="#D97706"/>
            </linearGradient>
          </defs>
          <polygon points="14,36 0,6 28,6" fill="url(#ptr)"
            style={{ filter:'drop-shadow(0 0 8px rgba(245,182,66,1)) drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}/>
          <polygon points="14,36 3,9 25,9" fill="rgba(255,255,255,0.2)"/>
        </svg>
      </div>
    </div>
  );
}

/* ─── QR mock ─────────────────────────────────────── */
function QRMock({ size=80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80">
      <rect width="80" height="80" fill="white" rx="4"/>
      <rect x="4" y="4" width="26" height="26" rx="2" fill="#111"/>
      <rect x="8" y="8" width="18" height="18" rx="1" fill="white"/>
      <rect x="11" y="11" width="12" height="12" rx="1" fill="#111"/>
      <rect x="50" y="4" width="26" height="26" rx="2" fill="#111"/>
      <rect x="54" y="8" width="18" height="18" rx="1" fill="white"/>
      <rect x="57" y="11" width="12" height="12" rx="1" fill="#111"/>
      <rect x="4" y="50" width="26" height="26" rx="2" fill="#111"/>
      <rect x="8" y="54" width="18" height="18" rx="1" fill="white"/>
      <rect x="11" y="57" width="12" height="12" rx="1" fill="#111"/>
      {[38,42,46,50,54,58,62,66,70,74].flatMap(x=>
        [4,8,12,16,20,24,28,32,36,40,44,48,52,56,60,64,68,72,76].map(y=>{
          const on=((x*7+y*13)%17)>8&&x<76&&y<76&&!(x<34&&y<34)&&!(x>46&&y<34)&&!(x<34&&y>46);
          return on?<rect key={`${x}-${y}`} x={x} y={y} width="3" height="3" fill="#111"/>:null;
        })
      )}
    </svg>
  );
}

/* ─── arcade button ───────────────────────────────── */
function ArcadeBtn({ children, onClick, bg, glow, border }:
  { children:React.ReactNode; onClick:()=>void; bg:string; glow:string; border:string }) {
  return (
    <motion.button onClick={onClick}
      className="relative overflow-hidden font-black rounded-full flex items-center justify-center gap-3 text-white"
      style={{ background:bg, border:`3px solid ${border}`,
        boxShadow:`0 0 30px ${glow}66, 0 6px 0 rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)`,
        padding:'0 2.5vw', height:'7vh', fontSize:'clamp(0.85rem,1.5vw,1.2rem)', minWidth:'18vw' }}
      whileHover={{ scale:1.05, boxShadow:`0 0 60px ${glow}aa, 0 6px 0 rgba(0,0,0,0.5)` }}
      whileTap={{ scale:0.97, y:3 }}>
      <div className="absolute inset-0 opacity-25 pointer-events-none rounded-full"
        style={{ background:'radial-gradient(ellipse 80% 40% at 50% 5%, rgba(255,255,255,0.7), transparent)' }}/>
      <span className="relative z-10 flex items-center gap-2.5">{children}</span>
    </motion.button>
  );
}

/* ─── LED wall (background décor) ────────────────── */
function LedWall() {
  const dots = useMemo(()=>Array.from({length:120},(_,i)=>({
    id:i, x:stableRnd(i*3)*100, y:stableRnd(i*7)*55,
    sz:stableRnd(i*11)*3+1.5,
    color:['#A855F7','#F5B642','#EC4899','#22D3EE','#34D399'][i%5],
    dur:stableRnd(i*17)*3+1.5, delay:stableRnd(i*23)*4,
  })),[]);
  return (
    <div className="absolute pointer-events-none" style={{ top:0, left:0, right:0, height:'55%', overflow:'hidden' }}>
      {/* grid base */}
      <div className="absolute inset-0" style={{
        backgroundImage:'linear-gradient(rgba(80,20,160,0.18) 1px,transparent 1px),linear-gradient(90deg,rgba(80,20,160,0.18) 1px,transparent 1px)',
        backgroundSize:'40px 40px' }}/>
      {/* glow dots */}
      {dots.map(d=>(
        <motion.div key={d.id} className="absolute rounded-full"
          style={{ left:`${d.x}%`, top:`${d.y}%`, width:d.sz, height:d.sz, background:d.color,
            boxShadow:`0 0 ${d.sz*4}px ${d.color}` }}
          animate={{ opacity:[0.2,0.9,0.2], scale:[0.8,1.3,0.8] }}
          transition={{ duration:d.dur, repeat:Infinity, delay:d.delay, ease:'easeInOut' as const }}/>
      ))}
      {/* fade to dark bottom */}
      <div className="absolute inset-x-0 bottom-0 h-1/2"
        style={{ background:'linear-gradient(0deg,rgba(3,0,16,1) 0%,transparent 100%)' }}/>
    </div>
  );
}

/* ─── spotlights from ceiling ─────────────────────── */
function Spotlights() {
  const lights = useMemo(()=>[
    { x:15, color:'168,85,247',  dur:5.5, delay:0   },
    { x:30, color:'245,182,66',  dur:4.2, delay:1.1 },
    { x:50, color:'255,255,255', dur:6.0, delay:0.5 },
    { x:68, color:'236,72,153',  dur:4.8, delay:2.0 },
    { x:83, color:'34,211,153',  dur:5.2, delay:0.8 },
  ],[]);
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {lights.map((l,i)=>(
        <motion.div key={i} className="absolute"
          style={{ top:0, left:`${l.x}%`, width:'12vw', height:'90%',
            transformOrigin:'top center',
            background:`linear-gradient(180deg,rgba(${l.color},0.25) 0%,rgba(${l.color},0.10) 35%,rgba(${l.color},0.03) 65%,transparent 100%)`,
            clipPath:'polygon(40% 0%,60% 0%,100% 100%,0% 100%)',
          }}
          animate={{ opacity:[0.5,1,0.5], scaleX:[0.85,1.15,0.85] }}
          transition={{ duration:l.dur, repeat:Infinity, delay:l.delay, ease:'easeInOut' as const }}/>
      ))}
    </div>
  );
}

/* ─── reflective floor ─────────────────────────────── */
function Floor() {
  return (
    <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{ height:'28%' }}>
      {/* perspective grid */}
      <div className="absolute inset-0" style={{
        background:'linear-gradient(0deg,rgba(8,2,24,1) 0%,rgba(20,5,55,0.7) 60%,transparent 100%)',
        backgroundImage:`
          linear-gradient(0deg,rgba(8,2,24,1) 0%,rgba(20,5,55,0.7) 60%,transparent 100%),
          linear-gradient(rgba(130,70,220,0.22) 1px,transparent 1px),
          linear-gradient(90deg,rgba(130,70,220,0.12) 1px,transparent 1px)`,
        backgroundSize:'100% 100%, 60px 30px, 60px 30px',
        transform:'perspective(200px) rotateX(30deg)',
        transformOrigin:'bottom center',
      }}/>
      {/* floor glow line */}
      <div className="absolute left-0 right-0" style={{ top:'20%', height:2,
        background:'linear-gradient(90deg,transparent 0%,rgba(168,85,247,0.6) 15%,rgba(245,182,66,1) 40%,rgba(255,255,255,0.95) 50%,rgba(245,182,66,1) 60%,rgba(236,72,153,0.6) 85%,transparent 100%)',
        boxShadow:'0 0 25px rgba(245,182,66,0.6),0 2px 40px rgba(168,85,247,0.4)' }}/>
      {/* reflection fade */}
      <div className="absolute inset-x-0 bottom-0" style={{ height:'60%',
        background:'linear-gradient(0deg,rgba(3,0,16,1) 0%,transparent 100%)' }}/>
    </div>
  );
}

/* ─── crowd silhouettes ───────────────────────────── */
function Crowd() {
  return (
    <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{ height:'22%', overflow:'hidden' }}>
      <svg viewBox="0 0 1280 180" width="100%" height="100%" preserveAspectRatio="none">
        <path d="M0,140 Q30,80 60,120 Q90,60 120,100 Q150,50 180,90 Q200,40 230,80 Q260,55 290,95 Q320,30 350,70 Q380,55 410,90 Q440,20 470,65 Q500,45 530,85 Q560,25 590,70 Q620,50 650,90 Q680,30 710,75 Q740,55 770,95 Q800,35 830,80 Q860,55 890,95 Q920,40 950,85 Q980,60 1010,100 Q1040,50 1070,90 Q1100,65 1130,105 Q1160,80 1190,120 Q1220,90 1250,130 L1280,180 L0,180 Z"
          fill="rgba(15,5,40,0.92)"/>
        <path d="M0,160 Q40,120 80,150 Q120,110 160,140 Q200,115 240,145 Q280,120 320,150 Q360,125 400,155 Q440,130 480,160 Q520,135 560,165 Q600,140 640,165 Q680,140 720,165 Q760,140 800,160 Q840,130 880,155 Q920,130 960,155 Q1000,130 1040,155 Q1080,135 1120,160 Q1160,140 1200,165 L1280,180 L0,180 Z"
          fill="rgba(8,2,20,0.98)"/>
        {/* crowd glow */}
        <rect x="0" y="0" width="1280" height="180"
          fill="url(#crowdGrad)"/>
        <defs>
          <linearGradient id="crowdGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(80,20,160,0.35)"/>
            <stop offset="100%" stopColor="rgba(0,0,0,0)"/>
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

/* ─── stage (composited) ──────────────────────────── */
function Stage() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* base deep void */}
      <div className="absolute inset-0" style={{
        background:'radial-gradient(ellipse 150% 70% at 50% 0%, #1E0550 0%, #0C0128 35%, #030010 80%, #000008 100%)' }}/>
      {/* LED wall */}
      <LedWall/>
      {/* spotlights */}
      <Spotlights/>
      {/* side neon pillars */}
      {[{s:'4%',c:'168,85,247'},{s:'96%',c:'236,72,153'}].map((col,i)=>(
        <div key={i} className="absolute top-0 bottom-0" style={{ left:col.s, width:3,
          background:`linear-gradient(180deg,transparent 0%,rgba(${col.c},0.8) 25%,rgba(255,220,100,1) 50%,rgba(${col.c},0.8) 75%,transparent 100%)`,
          boxShadow:`0 0 30px rgba(${col.c},0.7),0 0 60px rgba(${col.c},0.3)`, filter:'blur(0.5px)' }}/>
      ))}
      {/* floor */}
      <Floor/>
      {/* crowd */}
      <Crowd/>
      {/* vignette */}
      <div className="absolute inset-0"
        style={{ background:'radial-gradient(ellipse 100% 100% at 50% 50%,transparent 30%,rgba(0,0,0,0.7) 100%)' }}/>
      {/* subtle scanlines */}
      <div className="absolute inset-0"
        style={{ backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.06) 3px,rgba(0,0,0,0.06) 4px)', opacity:1 }}/>
    </div>
  );
}

/* ─── sparks ──────────────────────────────────────── */
function Sparks() {
  const ps = useMemo(()=>Array.from({length:22},(_,i)=>({
    id:i, x:stableRnd(i*5)*100, sz:stableRnd(i*9)*4+1.5,
    dur:stableRnd(i*13)*9+5, delay:stableRnd(i*19)*8,
    color:['#F5B642','#A855F7','#EC4899','#34D399','#22D3EE'][i%5],
  })),[]);
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {ps.map(p=>(
        <motion.div key={p.id} className="absolute rounded-full"
          style={{ left:`${p.x}%`, bottom:'-4%', width:p.sz, height:p.sz,
            background:p.color, boxShadow:`0 0 ${p.sz*3}px ${p.color}` }}
          animate={{ y:[0,-820], opacity:[0,0.9,0.9,0] }}
          transition={{ duration:p.dur, repeat:Infinity, delay:p.delay, ease:'linear' as const }}/>
      ))}
    </div>
  );
}

/* ─── confetti ────────────────────────────────────── */
function Confetti() {
  const ps=useMemo(()=>Array.from({length:70},(_,i)=>({
    id:i, x:stableRnd(i*7)*100,
    color:['#F5B642','#A855F7','#EC4899','#34D399','#F87171','#22D3EE','#FCD34D'][i%7],
    w:stableRnd(i*11)*10+5, dur:stableRnd(i*13)*3+2, delay:stableRnd(i*17)*2.5, rot:stableRnd(i*23)*720,
  })),[]);
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {ps.map(p=>(
        <motion.div key={p.id} className="absolute"
          style={{ left:`${p.x}%`, top:'-5%', width:p.w, height:p.w*0.5, background:p.color, borderRadius:2 }}
          animate={{ y:['0vh','110vh'], rotate:[0,p.rot], opacity:[1,1,0] }}
          transition={{ duration:p.dur, repeat:Infinity, delay:p.delay, ease:'linear' as const }}/>
      ))}
    </div>
  );
}

/* ─── game card (mini trailer) ───────────────────── */
function GameCard({ game }: { game: Game }) {
  const DIFF_COLORS: Record<string,string> = { Facile:'#34D399', Media:'#F5B642', Alta:'#F87171' };
  return (
    <AnimatePresence mode="wait">
      <motion.div key={game.slug} className="rounded-2xl"
        style={{ background:`rgba(8,2,24,0.88)`, border:`1.5px solid ${game.color}99`,
          boxShadow:`0 0 30px ${game.color}44,0 0 60px ${game.color}18` }}
        initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}
        transition={{ duration:0.22 }}>
        <div className="px-4 py-3.5">
          {/* title */}
          <div className="font-black text-white mb-1"
            style={{ fontSize:'clamp(0.95rem,1.4vw,1.15rem)', fontFamily:"'Outfit','Arial Black',sans-serif",
              textShadow:`0 0 20px ${game.glow}88` }}>
            {game.label}
          </div>
          {/* subtitle */}
          <div className="mb-3" style={{ fontSize:'0.72rem', color:'rgba(255,255,255,0.48)', lineHeight:1.45 }}>
            {game.desc}
          </div>
          {/* badges */}
          <div className="flex gap-2 mb-3 flex-wrap">
            <span className="flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold"
              style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)',
                fontSize:'0.6rem', color:'rgba(255,255,255,0.65)' }}>
              <Users size={8}/> {game.players} giocatori
            </span>
            <span className="flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold"
              style={{ background:`${DIFF_COLORS[game.diff] ?? '#F5B642'}18`,
                border:`1px solid ${DIFF_COLORS[game.diff] ?? '#F5B642'}44`,
                color:DIFF_COLORS[game.diff] ?? '#F5B642', fontSize:'0.6rem' }}>
              <Star size={8}/> {game.diff}
            </span>
          </div>
          {/* CTA */}
          <motion.button className="w-full rounded-xl py-2 font-black text-white flex items-center justify-center gap-1.5"
            style={{ background:`linear-gradient(135deg,${game.color} 0%,${game.glow} 100%)`,
              boxShadow:`0 0 18px ${game.color}55`, border:'none', fontSize:'0.8rem' }}
            whileHover={{ scale:1.02 }} whileTap={{ scale:0.97 }}>
            Gioca ora <ChevronRight size={13}/>
          </motion.button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ─── classifica ─────────────────────────────────── */
function Classifica({ players, scoreboard }: { players: LivePlayer[]; scoreboard: ScoreboardEntry[]; }) {
  const glowFor  = (i:number) => i===0?'rgba(245,182,66,0.7)':i===1?'rgba(192,192,192,0.5)':i===2?'rgba(205,127,50,0.45)':undefined;
  const borderFor= (i:number) => i===0?'rgba(245,182,66,0.5)':i===1?'rgba(192,192,192,0.35)':i===2?'rgba(205,127,50,0.35)':'rgba(255,255,255,0.07)';
  const bgFor    = (i:number) => i===0?'linear-gradient(135deg,rgba(245,182,66,0.22),rgba(245,182,66,0.06))'
                                :i===1?'linear-gradient(135deg,rgba(192,192,192,0.12),rgba(192,192,192,0.04))'
                                :i===2?'linear-gradient(135deg,rgba(205,127,50,0.12),rgba(205,127,50,0.04))'
                                :'rgba(255,255,255,0.04)';
  const avSize   = (i:number) => i<3?'w-10 h-10':'w-8 h-8';
  const rankLabel= (i:number) => ['🥇','🥈','🥉'][i]??`${i+1}`;

  /* ── build score lookup teamId → total ── */
  const teamScore = useMemo(()=>{
    const m: Record<string,number> = {};
    scoreboard.forEach(e=>{ m[e.teamId]=e.total; });
    return m;
  },[scoreboard]);

  /* ── sort players by their team score desc ── */
  const sorted = useMemo(()=>
    [...players].sort((a,b)=>(teamScore[b.teamId??'']??0)-(teamScore[a.teamId??'']??0))
  ,[players, teamScore]);

  const isEmpty = sorted.length === 0;

  return (
    <div className="rounded-2xl overflow-hidden h-full flex flex-col"
      style={{ background:'rgba(12,4,32,0.82)', border:'1.5px solid rgba(255,255,255,0.11)',
        backdropFilter:'blur(12px)', boxShadow:'0 4px 40px rgba(0,0,0,0.6),inset 0 1px 0 rgba(255,255,255,0.08)' }}>
      {/* header */}
      <div className="px-4 py-2.5 font-black uppercase shrink-0 flex items-center gap-2"
        style={{ background:'linear-gradient(135deg,rgba(245,182,66,0.3),rgba(245,182,66,0.08))',
          borderBottom:'1px solid rgba(245,182,66,0.25)' }}>
        <Trophy size={13} className="text-yellow-400"/>
        <span style={{ fontSize:'0.6rem', letterSpacing:'0.22em', color:'#F5B642' }}>Classifica Live</span>
        <motion.span className="ml-auto rounded-full px-2 py-0.5 font-black"
          animate={{ opacity:[1,0.5,1] }} transition={{ duration:1.4, repeat:Infinity }}
          style={{ background:'rgba(245,182,66,0.2)', color:'#F5B642', fontSize:'0.55rem' }}>LIVE</motion.span>
      </div>
      {/* players */}
      <div className="flex flex-col p-2 gap-1.5 flex-1 overflow-hidden">
        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 opacity-50">
            <Users size={22} className="text-purple-400"/>
            <span style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.4)', textAlign:'center' }}>
              Nessun giocatore<br/>connesso
            </span>
          </div>
        ) : sorted.map((p,i)=>{
          const score = teamScore[p.teamId??''] ?? 0;
          const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
          return (
            <motion.div key={p.id} className="flex items-center gap-2 rounded-xl px-2.5 py-1.5"
              initial={{ x:-30, opacity:0 }} animate={{ x:0, opacity:1 }}
              transition={{ delay:i*0.05, ease:'easeOut' as const }}
              style={{ background:bgFor(i), border:`1px solid ${borderFor(i)}`,
                boxShadow:glowFor(i)?`0 0 18px ${glowFor(i)}`:undefined }}>
              <span className="shrink-0 text-center" style={{ fontSize:i<3?'0.9rem':'0.7rem', width:i<3?20:16, lineHeight:1 }}>
                {rankLabel(i)}
              </span>
              <div className={`${avSize(i)} rounded-full flex items-center justify-center font-black shrink-0`}
                style={{ background:`${color}2A`, border:`2.5px solid ${color}${i<3?'cc':'66'}`,
                  color, fontSize:i<3?'0.85rem':'0.72rem', boxShadow:i<3?`0 0 14px ${color}66`:undefined }}>
                {p.nickname[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-black text-white truncate" style={{ fontSize:i<3?'0.85rem':'0.78rem' }}>{p.nickname}</div>
              </div>
              {score > 0 && (
                <div className="font-black shrink-0" style={{
                  color:i===0?'#F5B642':i===1?'#C8C8C8':i===2?'#CD7F32':'rgba(255,255,255,0.55)',
                  fontSize:i<3?'0.88rem':'0.78rem',
                  textShadow:i<3?`0 0 12px ${color}`:undefined }}>
                  {score >= 1000 ? `${(score/1000).toFixed(1)}k` : score}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
      {/* footer */}
      <div className="mx-3 mb-3 rounded-xl px-3 py-2 flex items-center gap-2 shrink-0"
        style={{ background:'rgba(124,58,237,0.2)', border:'1px solid rgba(124,58,237,0.35)' }}>
        <Users size={12} className="text-purple-400 shrink-0"/>
        <span className="font-black text-white" style={{ fontSize:'0.72rem' }}>
          <span style={{ color:'#A855F7' }}>{sorted.length}</span> Giocatori Connessi
        </span>
        <motion.div className="ml-auto w-2 h-2 rounded-full bg-green-400 shrink-0"
          animate={{ opacity:[1,0,1] }} transition={{ duration:1.2, repeat:Infinity }}/>
      </div>
    </div>
  );
}

/* ─── screen: SHOW ───────────────────────────────── */
/* ─── Park background SVG — theme-park depth layers ─── */
function ParkBg() {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none select-none" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        {/* sky gradient */}
        <radialGradient id="sky" cx="50%" cy="30%" r="70%">
          <stop offset="0%"  stopColor="#1a0040"/>
          <stop offset="60%" stopColor="#0a0020"/>
          <stop offset="100%" stopColor="#030010"/>
        </radialGradient>
        {/* ground glow */}
        <radialGradient id="gnd" cx="50%" cy="100%" r="60%">
          <stop offset="0%"  stopColor="#7C3AED" stopOpacity="0.35"/>
          <stop offset="100%" stopColor="#030010" stopOpacity="0"/>
        </radialGradient>
        {/* spotlight cone filter */}
        <filter id="pk-soft"><feGaussianBlur stdDeviation="8"/></filter>
        <filter id="pk-glow"><feGaussianBlur stdDeviation="3"/></filter>
        <filter id="neon-blur"><feGaussianBlur stdDeviation="5"/></filter>
      </defs>

      {/* ── sky ── */}
      <rect width="1280" height="720" fill="url(#sky)"/>

      {/* ── stars ── */}
      {[
        [80,60],[200,35],[340,90],[480,20],[620,50],[760,30],[900,70],[1050,45],[1180,25],
        [140,110],[380,130],[550,80],[720,120],[1000,100],[1150,140],[60,180],[300,160],
        [660,170],[850,150],[1200,175],[420,200],[990,210],[240,220],[700,55],[1100,190],
      ].map(([x,y],i)=>(
        <motion.circle key={i} cx={x} cy={y} r={i%3===0?1.8:1.1}
          fill="white" opacity={0.4+((i*17)%30)/100}
          animate={{ opacity:[0.3,0.9,0.3] }}
          transition={{ duration:2+((i*7)%4), repeat:Infinity, delay:((i*13)%30)/10, ease:'easeInOut' as const }}/>
      ))}

      {/* ── deep background: distant castle silhouette ── */}
      <g opacity="0.18" fill="#A855F7">
        {/* left tower */}
        <rect x="60" y="260" width="40" height="200"/>
        <polygon points="60,260 80,210 100,260"/>
        <rect x="50" y="290" width="15" height="80"/>
        <rect x="95" y="290" width="15" height="80"/>
        {/* right tower */}
        <rect x="1180" y="280" width="40" height="180"/>
        <polygon points="1180,280 1200,225 1220,280"/>
        <rect x="1170" y="310" width="15" height="80"/>
        <rect x="1215" y="310" width="15" height="80"/>
        {/* center spire far */}
        <rect x="590" y="200" width="25" height="260"/>
        <polygon points="580,205 602,140 625,205"/>
        <rect x="570" y="230" width="20" height="120"/>
        <rect x="615" y="230" width="20" height="120"/>
      </g>

      {/* ── mid layer: roller coaster track ── */}
      <g opacity="0.22" stroke="#F5B642" strokeWidth="2" fill="none">
        <path d="M0,400 Q80,350 160,400 Q200,420 240,370 Q280,310 340,360 Q400,410 450,370 Q510,320 570,380"/>
        {/* support pillars */}
        {[80,160,240,340,450].map((x,i)=>(
          <line key={i} x1={x} y1={360+((i%3)*15)} x2={x} y2={480}/>
        ))}
      </g>

      {/* ── mid layer: ferris wheel right ── */}
      <g transform="translate(1090,330)" opacity="0.25">
        <circle cx="0" cy="0" r="110" stroke="#A855F7" strokeWidth="2.5" fill="none"/>
        <circle cx="0" cy="0" r="18" fill="#1a0040" stroke="#A855F7" strokeWidth="2"/>
        {Array.from({length:8},(_,i)=>{
          const a=(i/8)*Math.PI*2; const r=108;
          return <line key={i} x1={0} y1={0} x2={Math.cos(a)*r} y2={Math.sin(a)*r} stroke="#7C3AED" strokeWidth="1.5"/>;
        })}
        {Array.from({length:8},(_,i)=>{
          const a=(i/8)*Math.PI*2; const r=110;
          return <circle key={i} cx={Math.cos(a)*r} cy={Math.sin(a)*r} r="7" fill="#F5B642" opacity="0.8"/>;
        })}
        {/* pole */}
        <line x1="0" y1="110" x2="0" y2="220" stroke="#A855F7" strokeWidth="3"/>
      </g>

      {/* ── spotlight cones from above (behind content) ── */}
      {([
        { x:250, col:'rgba(168,85,247,0.12)' },
        { x:640, col:'rgba(245,182,66,0.1)'  },
        { x:1030,col:'rgba(100,180,255,0.1)' },
      ] as {x:number;col:string}[]).map(({x,col},i)=>(
        <polygon key={i} points={`${x-8},0 ${x+8},0 ${x+120},720 ${x-120},720`}
          fill={col} filter="url(#pk-soft)"/>
      ))}

      {/* ── neon signs mid-layer ── */}
      {/* sign left: GAMES */}
      <g transform="translate(110,310)">
        <rect x="-52" y="-18" width="104" height="36" rx="8" fill="none" stroke="#F472B6" strokeWidth="2" opacity="0.8" filter="url(#pk-glow)"/>
        <text x="0" y="6" textAnchor="middle" fill="#F472B6" fontSize="16" fontWeight="900" fontFamily="monospace" opacity="0.9">GAMES</text>
        <rect x="-52" y="-18" width="104" height="36" rx="8" fill="none" stroke="#F472B6" strokeWidth="4" opacity="0.25" filter="url(#neon-blur)"/>
      </g>
      {/* sign right: LIVE */}
      <g transform="translate(1150,295)">
        <rect x="-38" y="-16" width="76" height="32" rx="7" fill="none" stroke="#F5B642" strokeWidth="2" opacity="0.85" filter="url(#pk-glow)"/>
        <text x="0" y="6" textAnchor="middle" fill="#F5B642" fontSize="15" fontWeight="900" fontFamily="monospace" opacity="0.9">LIVE</text>
        <rect x="-38" y="-16" width="76" height="32" rx="7" fill="none" stroke="#F5B642" strokeWidth="5" opacity="0.2" filter="url(#neon-blur)"/>
      </g>
      {/* sign top-center: TONIGHT */}
      <g transform="translate(640,140)">
        <rect x="-70" y="-16" width="140" height="32" rx="7" fill="rgba(80,0,160,0.6)" stroke="#A855F7" strokeWidth="1.5" opacity="0.9"/>
        <text x="0" y="6" textAnchor="middle" fill="#E9D5FF" fontSize="13" fontWeight="700" fontFamily="monospace" letterSpacing="4" opacity="0.9">TONIGHT</text>
        {/* pulsing ring */}
        <motion.rect x="-70" y="-16" width="140" height="32" rx="7" fill="none" stroke="#A855F7" strokeWidth="3"
          animate={{ opacity:[0.2,0.8,0.2] }}
          transition={{ duration:1.8, repeat:Infinity, ease:'easeInOut' as const }}/>
      </g>

      {/* ── string lights ── */}
      {Array.from({length:18},(_,i)=>{
        const x = i*(1280/17); const y = 220 + Math.sin(i*0.9)*28;
        const colors=['#F5B642','#F472B6','#A855F7','#60A5FA','#34D399'];
        return <circle key={i} cx={x} cy={y} r="4" fill={colors[i%5]} opacity="0.75"/>;
      })}
      <path d={Array.from({length:18},(_,i)=>{
        const x=i*(1280/17); const y=220+Math.sin(i*0.9)*28;
        return (i===0?`M${x},${y}`:`L${x},${y}`);
      }).join(' ')} stroke="rgba(255,255,255,0.12)" strokeWidth="1" fill="none"/>

      {/* ── foreground stage floor — altezza ridotta del 50% ── */}
      <rect x="0" y="660" width="1280" height="60" fill="rgba(20,5,50,0.7)"/>
      <rect x="0" y="658" width="1280" height="4" fill="rgba(168,85,247,0.5)"/>
      {/* floor grid lines */}
      {Array.from({length:12},(_,i)=>(
        <line key={i} x1={i*120} y1="660" x2={i*120+60} y2="720" stroke="rgba(168,85,247,0.12)" strokeWidth="1"/>
      ))}

      {/* ── ground glow ── */}
      <rect width="1280" height="720" fill="url(#gnd)"/>
    </svg>
  );
}

/* ── feature badge data ── */
const FEATURES = [
  { icon:'🎮', title:'8 Mondi',      sub:'di gioco',    color:'#F5B642', glow:'#FFD040', border:'rgba(245,182,66,0.45)' },
  { icon:'👥', title:'Fino a 20',    sub:'giocatori',   color:'#A855F7', glow:'#C084FC', border:'rgba(168,85,247,0.45)' },
  { icon:'🏠', title:'Casa',         sub:'o eventi',    color:'#34D399', glow:'#6EE7B7', border:'rgba(52,211,153,0.45)'  },
  { icon:'⚡', title:'Show',         sub:'live',        color:'#F472B6', glow:'#FB7185', border:'rgba(244,114,182,0.45)' },
];

function ShowLanding({ onArena }: { onArena:()=>void }) {
  return (
    <motion.div key="show" className="absolute inset-0 overflow-hidden"
      initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
      transition={{ duration:0.5 }}>

      {/* background — contain keeps the full image visible at all aspect ratios.
           Dark gaps (if any) are filled by the parent root background #030010.
           backgroundPosition center/center ensures symmetric letterboxing.
           No 100vh: the parent is fixed inset-0 which already respects the
           browser's dynamic/visual viewport (svh/dvh equivalent). */}
      <div className="absolute inset-0" style={{
        backgroundColor:'#030010',
        backgroundImage:`url(${pub('/landing-bg.png')})`,
        backgroundSize:'contain',
        backgroundRepeat:'no-repeat',
        backgroundPosition:'center center',
      }}/>

      {/* bottom-left: CTA */}
      <motion.div className="absolute z-20"
        style={{ left:'var(--tv-safe-x)', bottom:'var(--tv-safe-y)' }}
        initial={{ y:16, opacity:0 }} animate={{ y:0, opacity:1 }}
        transition={{ delay:0.2, duration:0.5 }}>
        <motion.button onClick={onArena}
          whileHover={{ scale:1.06 }} whileTap={{ scale:0.97 }}
          style={{
            display:'flex', alignItems:'center', gap:'0.8rem',
            padding:'clamp(0.85rem,1.5vh,1.1rem) clamp(2rem,3.5vw,3.2rem)',
            background:'linear-gradient(135deg,#F5B642 0%,#FF8C00 55%,#FF5500 100%)',
            border:'2.5px solid #FFD700',
            borderRadius:'100px',
            fontFamily:"'Outfit','Arial Black',sans-serif",
            fontWeight:900,
            fontSize:'clamp(1.1rem,1.8vw,1.5rem)',
            color:'#000',
            letterSpacing:'0.05em',
            boxShadow:'0 0 55px rgba(245,182,66,0.75),0 0 110px rgba(245,182,66,0.28),0 8px 32px rgba(0,0,0,0.65)',
            cursor:'pointer',
          }}>
          <motion.span
            animate={{ scale:[1,1.22,1] }}
            transition={{ duration:1.1, repeat:Infinity, ease:'easeInOut' as const }}
            style={{ fontSize:'1.25em' }}>▶</motion.span>
          INIZIA LO SHOW
        </motion.button>
      </motion.div>

      {/* bottom-right: IDEAgames logo */}
      <motion.div className="absolute z-20"
        style={{ right:'var(--tv-safe-x)', bottom:'var(--tv-safe-y)' }}
        initial={{ opacity:0 }} animate={{ opacity:1 }}
        transition={{ delay:0.3, duration:0.5 }}>
        <img src={pub('/logo.png')} alt="IDEAgames"
          style={{
            height:'clamp(2rem,4vh,3.2rem)', objectFit:'contain',
            filter:'brightness(1.3) drop-shadow(0 0 14px rgba(245,182,66,0.6)) drop-shadow(0 0 28px rgba(168,85,247,0.35))',
          }}/>
      </motion.div>

    </motion.div>
  );
}

/* ─── screen: ARENA ──────────────────────────────── */
function Arena({ onPodium }: { onPodium:()=>void }) {
  /* ── real data ── */
  const live = useLiveState();
  const { data: apiGames = [] } = useListGames();
  const scoreboard = useGetScoreboard(live.event?.id ?? '', {
    query: { queryKey: ['scoreboard', live.event?.id], enabled: !!live.event?.id },
  });
  const scoreboardData: ScoreboardEntry[] = (scoreboard.data ?? []) as ScoreboardEntry[];

  /* ── map API games → local Game type; fall back to GAMES if API empty ── */
  const realGames: Game[] = useMemo(()=>
    apiGames.length > 0 ? apiGames.map(mapApiGame) : GAMES
  ,[apiGames]);

  const [selected, setSelected] = useState<Game>(realGames[0] ?? GAMES[0]);
  const [spinning, setSpinning]  = useState(false);

  /* keep selected in sync when realGames loads */
  useEffect(()=>{
    if(realGames.length > 0 && !realGames.find(g=>g.slug===selected.slug)){
      setSelected(realGames[0]);
    }
  },[realGames, selected.slug]);

  const handleSpin = useCallback(()=>{
    if(spinning || realGames.length === 0) return;
    const rnd = realGames[Math.floor(Math.random()*realGames.length)];
    setSelected(rnd);
    setSpinning(true);
    setTimeout(()=>setSpinning(false), 3000);
  },[spinning, realGames]);

  /* ── join URL for QR ── */
  const joinUrl = live.event
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/play?e=${live.event.joinCode}`
    : '';

  /* ── no live event → empty state ── */
  if (!live.loading && !live.event) {
    return (
      <motion.div key="arena-empty" className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-20"
        initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
        <Stage/>
        <div style={{ position:'relative', zIndex:20, textAlign:'center' }}>
          <div style={{ fontSize:'clamp(2rem,4vw,3rem)', marginBottom:8 }}>🎪</div>
          <div className="font-black text-white" style={{
            fontFamily:"'Outfit','Arial Black',sans-serif",
            fontSize:'clamp(1.3rem,2.5vw,2rem)',
            textShadow:'0 0 40px rgba(168,85,247,0.6)' }}>
            Nessun evento live
          </div>
          <div style={{ fontSize:'0.85rem', color:'rgba(255,255,255,0.4)', marginTop:8 }}>
            Avvia un evento dal pannello admin per iniziare
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div key="arena" className="absolute inset-0"
      initial={{ opacity:0, scale:0.98 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0 }}
      transition={{ duration:0.45 }}
      style={{ display:'grid', gridTemplateColumns:'22% 1fr 30%', gridTemplateRows:'auto 1fr auto', position:'relative' }}>

      {/* scenic stage background — lives here so ShowLanding is unaffected */}
      <Stage/>
      <Sparks/>

      {/* ── TOP ── */}

      {/* logo top-left */}
      <div className="flex items-center pb-1 z-20" style={{ paddingLeft:'var(--tv-safe-x)', paddingTop:'var(--tv-safe-y)' }}>
        <img src={pub('/logo.png')} alt="" className="object-contain"
          style={{ height:'clamp(1.6rem,2.8vh,2.4rem)',
            filter:'brightness(1.3) drop-shadow(0 0 12px rgba(245,182,66,0.7)) drop-shadow(0 0 25px rgba(168,85,247,0.4))' }}/>
      </div>

      {/* title top-center — logo dominante 18–22% screen width */}
      <motion.div className="flex flex-col items-center justify-center pt-1 pb-0 z-20"
        initial={{ y:-20, opacity:0 }} animate={{ y:0, opacity:1 }} transition={{ delay:0.1 }}>
        <img src={pub('/jonny-world-logo.png')} alt="Jonny's World"
          className="object-contain block"
          style={{ width:'clamp(12rem,20vw,18rem)',
            filter:'drop-shadow(0 0 30px rgba(245,182,66,0.7)) drop-shadow(0 0 70px rgba(168,85,247,0.4))' }}/>
      </motion.div>

      {/* top-right: join code + QR */}
      <div className="flex flex-col items-end justify-center z-20" style={{ paddingRight:'var(--tv-safe-x)', paddingTop:'var(--tv-safe-y)' }}>
        {live.event && (
          <motion.div initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.15 }}
            style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4,
              background:'rgba(10,2,28,0.88)', border:'1.5px solid rgba(245,182,66,0.35)',
              borderRadius:14, padding:'8px 12px',
              backdropFilter:'blur(12px)',
              boxShadow:'0 0 24px rgba(245,182,66,0.25)' }}>
            <div style={{ fontFamily:"'Outfit','Arial Black',sans-serif", fontWeight:900,
              fontSize:'clamp(1.1rem,2vw,1.6rem)', letterSpacing:'0.14em', color:'#F5B642',
              textShadow:'0 0 18px rgba(245,182,66,0.8)', lineHeight:1 }}>
              {live.event.joinCode}
            </div>
            <div style={{ background:'white', borderRadius:6, padding:3 }}>
              <QRCodeSVG value={joinUrl} size={56} bgColor="#ffffff" fgColor="#0a0820" level="M"/>
            </div>
            <div style={{ fontSize:'0.5rem', color:'rgba(255,255,255,0.4)', letterSpacing:'0.1em', textTransform:'uppercase' }}>
              Scansiona per giocare
            </div>
          </motion.div>
        )}
      </div>

      {/* ── MAIN ── */}

      {/* left: classifica */}
      <div className="flex flex-col pr-2 pb-1 z-20" style={{ paddingLeft:'var(--tv-safe-x)' }}>
        <Classifica players={live.players} scoreboard={scoreboardData}/>
      </div>

      {/* center: wheel + idle float */}
      <div className="flex flex-col items-center justify-center relative z-10 py-1">
        <motion.div className="relative"
          style={{ width:'min(44vw,60vh)', height:'min(44vw,60vh)' }}
          animate={{ y:[0,-6,0] }}
          transition={{ duration:4, repeat:Infinity, ease:'easeInOut' as const }}>
          {/* glow halo */}
          <div className="absolute inset-[-8%] rounded-full pointer-events-none"
            style={{ background:`radial-gradient(circle,${selected.color}18 0%,transparent 70%)`,
              boxShadow:`0 0 100px ${selected.glow}55,0 0 200px ${selected.glow}18` }}/>
          <GameWheel selected={selected} onSelect={setSelected} spinning={spinning} games={realGames}/>
          {/* wheel floor shadow */}
          <div className="absolute pointer-events-none"
            style={{ bottom:'-12%', left:'15%', right:'15%', height:20,
              background:'rgba(0,0,0,0.6)', borderRadius:'50%', filter:'blur(14px)' }}/>
        </motion.div>
      </div>

      {/* right: game card — Jonny è outside/absolute separato */}
      <div className="flex flex-col pl-1 pb-1 z-20 relative justify-end" style={{ paddingRight:'var(--tv-safe-x)' }}>
        <GameCard game={selected}/>
      </div>

      {/* Jonny — presenza scenica grande, pedana illuminata */}
      <div className="absolute pointer-events-none select-none"
        style={{ right:'-1%', bottom:'10vh', zIndex:12, width:'24%' }}>
        {/* pedana spotlight cone */}
        <div style={{ position:'absolute', bottom:-6, left:'-30%', right:'-30%', height:'80%',
          background:'radial-gradient(ellipse 80% 100% at 50% 100%,rgba(245,182,66,0.18) 0%,rgba(168,85,247,0.12) 50%,transparent 80%)',
          pointerEvents:'none' }}/>
        {/* floor shadow ellipse */}
        <div style={{ position:'absolute', bottom:-4, left:'8%', right:'8%', height:22,
          background:'rgba(0,0,0,0.65)', borderRadius:'50%', filter:'blur(18px)' }}/>
        {/* pedestal glow bar */}
        <div style={{ position:'absolute', bottom:2, left:'5%', right:'5%', height:10,
          background:'linear-gradient(90deg,transparent,rgba(168,85,247,0.8),rgba(245,182,66,0.6),rgba(168,85,247,0.8),transparent)',
          borderRadius:'50%', filter:'blur(6px)' }}/>
        {/* ambient body halo */}
        <div style={{ position:'absolute', bottom:0, left:'-25%', right:'-10%', top:'5%',
          background:`radial-gradient(ellipse 65% 75% at 52% 65%,${selected.glow}30 0%,rgba(168,85,247,0.15) 55%,transparent 80%)`,
          pointerEvents:'none' }}/>
        <motion.img src={pub('/jonny-master-nobg.png')} alt="Jonny host"
          style={{ height:'min(58vh,480px)', display:'block', objectFit:'contain', width:'100%',
            filter:`drop-shadow(0 0 55px ${selected.glow}cc) drop-shadow(-5px 0 25px rgba(168,85,247,0.55)) drop-shadow(0 10px 35px rgba(0,0,0,0.7))` }}
          animate={{ y:[0,-8,0] }}
          transition={{ duration:3.5, repeat:Infinity, ease:'easeInOut' as const }}/>
      </div>

      {/* ── BOTTOM ── */}

      {/* bottom-left: spacer — logo rimosso (duplicato, rimane solo top-left) */}
      <div className="z-20"/>

      {/* bottom-center: comandi arcade — niente micro badge */}
      <div className="flex items-center justify-center gap-5 pb-3 z-20">
        <ArcadeBtn onClick={handleSpin}
          bg="linear-gradient(135deg,#5B21B6 0%,#7C3AED 100%)"
          glow="#7C3AED" border="#A855F7">
          <Zap size={22} fill="white"/> GIRA LA RUOTA
        </ArcadeBtn>
        <ArcadeBtn onClick={onPodium}
          bg="linear-gradient(135deg,#92400E 0%,#D97706 100%)"
          glow="#F5B642" border="#F5B642">
          <Trophy size={22} fill="white"/> CLASSIFICA LIVE
        </ArcadeBtn>
      </div>

      <div className="z-20"/>
    </motion.div>
  );
}

/* ─── screen: PODIUM ─────────────────────────────── */
function Podium({ onRestart }: { onRestart:()=>void }) {
  const live = useLiveState();
  const scoreboard = useGetScoreboard(live.event?.id ?? '', {
    query: { queryKey: ['scoreboard-podium', live.event?.id], enabled: !!live.event?.id },
  });
  const sorted = useMemo(()=>
    [...((scoreboard.data ?? []) as ScoreboardEntry[])].sort((a,b)=>b.total-a.total)
  ,[scoreboard.data]);

  const medals  = ['#C0C0C0','#F5B642','#CD7F32'];
  const glows   = ['rgba(192,192,192,0.6)','rgba(245,182,66,0.9)','rgba(205,127,50,0.6)'];
  const ranks   = [2,1,3];
  const heights = [155,215,115];

  /* podium display order: 2nd, 1st, 3rd */
  const top3 = [sorted[1], sorted[0], sorted[2]].filter(Boolean);
  const rest = sorted.slice(3);

  return (
    <motion.div key="podium" className="absolute inset-0 flex flex-col"
      initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
      transition={{ duration:0.5 }}>
      <Confetti/>
      {/* Jonny podio */}
      <motion.div className="absolute pointer-events-none select-none" style={{ right:'-1%', bottom:0, zIndex:5 }}>
        <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 80% 90% at 50% 90%,rgba(245,182,66,0.45) 0%,transparent 70%)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', bottom:0, left:'5%', right:'5%', height:20, background:'rgba(0,0,0,0.5)', borderRadius:'50%', filter:'blur(14px)' }}/>
        <motion.img src={pub('/jonny-master-nobg.png')} alt="Jonny festeggia"
          style={{ height:'68vh', display:'block', objectFit:'contain',
            filter:'drop-shadow(0 0 60px rgba(245,182,66,0.8)) drop-shadow(0 0 120px rgba(245,182,66,0.35))' }}
          animate={{ y:[0,-10,0], rotate:[-1,1,-1] }}
          transition={{ duration:2.2, repeat:Infinity, ease:'easeInOut' as const }}/>
      </motion.div>
      {/* header */}
      <div className="flex items-center justify-between px-10 pt-6 shrink-0 z-10">
        <motion.div initial={{ x:-25, opacity:0 }} animate={{ x:0, opacity:1 }} transition={{ delay:0.2 }}>
          <div className="font-black uppercase mb-0.5" style={{ fontSize:'0.62rem', letterSpacing:'0.3em', color:'#F5B642' }}>Risultati Finali</div>
          <h2 className="font-black text-white" style={{ fontSize:'clamp(1.8rem,3.8vw,3.2rem)',
            fontFamily:"'Outfit','Arial Black',sans-serif", textShadow:'0 0 50px rgba(245,182,66,0.8)' }}>
            HALL OF FAME
          </h2>
        </motion.div>
        <motion.button onClick={onRestart}
          className="flex items-center gap-2 rounded-2xl px-5 py-2.5 font-black text-white"
          style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', fontSize:'0.85rem' }}
          whileHover={{ scale:1.05 }} whileTap={{ scale:0.97 }}
          initial={{ x:25, opacity:0 }} animate={{ x:0, opacity:1 }} transition={{ delay:0.3 }}>
          <RotateCcw size={14}/> Ricomincia
        </motion.button>
      </div>
      {/* podium */}
      {top3.length === 0 ? (
        <div className="flex-1 flex items-center justify-center z-10 opacity-50">
          <span style={{ color:'rgba(255,255,255,0.4)', fontSize:'1rem' }}>Nessun dato classifica</span>
        </div>
      ) : (
        <div className="flex-1 flex items-end justify-center gap-5 px-[22%] pb-0 z-10 relative">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60%] h-32 pointer-events-none"
            style={{ background:'radial-gradient(ellipse 80% 100% at 50% 100%,rgba(245,182,66,0.4) 0%,transparent 70%)' }}/>
          {top3.map((team,di)=>(
            <motion.div key={team.teamId} className="flex flex-col items-center"
              style={{ flex:di===1?'1.3':'1', maxWidth:di===1?240:185 }}
              initial={{ y:80, opacity:0 }} animate={{ y:0, opacity:1 }}
              transition={{ delay:0.2+di*0.18, duration:0.7, ease:'easeOut' as const }}>
              {ranks[di]===1&&<motion.div className="text-4xl mb-1"
                animate={{ y:[0,-10,0], rotate:[-5,5,-5] }}
                transition={{ duration:2.2, repeat:Infinity, ease:'easeInOut' as const }}>&#128081;</motion.div>}
              <div className="rounded-full flex items-center justify-center font-black mb-1.5"
                style={{ width:di===1?66:50, height:di===1?66:50,
                  background:`linear-gradient(135deg,${medals[di]}44,${medals[di]}22)`,
                  border:`3px solid ${medals[di]}`,
                  boxShadow:`0 0 30px ${glows[di]}`,
                  fontSize:di===1?22:16, color:medals[di] }}>
                {(team.teamName??'?')[0].toUpperCase()}
              </div>
              <div className="font-black text-white mb-0.5 text-center" style={{ fontSize:di===1?'1.2rem':'0.9rem', fontFamily:"'Outfit','Arial Black',sans-serif" }}>{team.teamName}</div>
              <div className="font-black mb-2" style={{ color:medals[di], fontSize:di===1?'1rem':'0.82rem', textShadow:`0 0 18px ${medals[di]}` }}>{team.total.toLocaleString()} pt</div>
              <div className="w-full flex items-end justify-center rounded-t-3xl relative overflow-hidden"
                style={{ height:heights[di], background:`linear-gradient(180deg,${medals[di]}28 0%,${medals[di]}50 100%)`,
                  border:`2px solid ${medals[di]}88`, borderBottom:'none',
                  boxShadow:`0 0 45px ${glows[di]},inset 0 1px 0 rgba(255,255,255,0.2)` }}>
                <div className="absolute inset-0" style={{ background:'linear-gradient(135deg,rgba(255,255,255,0.1) 0%,transparent 50%)' }}/>
                <div className="font-black pb-3 relative z-10"
                  style={{ fontSize:di===1?'3rem':'2rem', color:medals[di], textShadow:`0 0 25px ${medals[di]}` }}>
                  {ranks[di]}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      <div className="h-1.5 mx-8 shrink-0 z-10"
        style={{ background:'linear-gradient(90deg,transparent,rgba(245,182,66,0.7) 25%,rgba(255,255,255,1) 50%,rgba(245,182,66,0.7) 75%,transparent)',
          boxShadow:'0 0 25px rgba(245,182,66,0.5)' }}/>
      <div className="flex justify-center gap-3 px-10 py-3 shrink-0 z-10 flex-wrap">
        {rest.map((team,i)=>(
          <motion.div key={team.teamId} className="flex items-center gap-3 rounded-2xl px-4 py-2"
            style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)' }}
            initial={{ y:18, opacity:0 }} animate={{ y:0, opacity:1 }}
            transition={{ delay:0.8+i*0.08 }}>
            <span className="font-black" style={{ color:'rgba(255,255,255,0.3)', fontSize:'0.85rem' }}>{i+4}</span>
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs"
              style={{ background:`${PLAYER_COLORS[i%PLAYER_COLORS.length]}2A`, color:PLAYER_COLORS[i%PLAYER_COLORS.length], border:`1.5px solid ${PLAYER_COLORS[i%PLAYER_COLORS.length]}66` }}>
              {(team.teamName??'?')[0].toUpperCase()}
            </div>
            <span className="font-black text-white" style={{ fontSize:'0.85rem' }}>{team.teamName}</span>
            <span className="font-black" style={{ color:'#F5B642', fontSize:'0.82rem' }}>{team.total.toLocaleString()}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

/* ─── root ────────────────────────────────────────── */
export default function HomeV4() {
  const [screen, setScreen] = useState<Screen>('show');
  const [, navigate] = useLocation();
  return (
    <div className="fixed inset-0 overflow-hidden"
      style={{ background:'#030010', fontFamily:"'Outfit','Space Grotesk','Arial Black',sans-serif" }}>
      {/* ── AUDIT BADGE — DEV only ── */}
      {import.meta.env.DEV && (
        <div style={{position:'fixed',top:6,left:'50%',transform:'translateX(-50%)',zIndex:99999,background:'rgba(0,0,0,0.85)',color:'#F5B642',fontFamily:'monospace',fontSize:11,padding:'3px 12px',borderRadius:5,border:'1px solid #F5B64280',pointerEvents:'none',whiteSpace:'nowrap'}}>
          ACTIVE ROUTE: /home-v4 · COMPONENT: HomeV4 · FILE: src/pages/HomeV4.tsx · BUILD: {String(typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : '?')} {String(typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : '')}
        </div>
      )}
      {/* Stage/Sparks moved into Arena — ShowLanding has its own official bg image */}
      <AnimatePresence mode="wait">
        {screen==='show'   && <ShowLanding onArena={()=>navigate('/mode-select')}/>}
        {screen==='arena'  && <Arena       onPodium={()=>setScreen('podium')}/>}
        {screen==='podium' && <Podium      onRestart={()=>setScreen('show')}/>}
      </AnimatePresence>
    </div>
  );
}
