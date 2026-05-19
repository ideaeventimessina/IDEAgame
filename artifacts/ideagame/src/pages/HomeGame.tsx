/**
 * HomeGame — Modalità HOME (TV/Proiettore)
 *
 * Flusso:
 *   welcome → join (QR + giocatori) → board (8 giochi) → playing → board → ... → champion
 *
 * URL: /home?s=SESSION_ID
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import {
  Sparkles, Users, QrCode, Trophy, Timer,
  Play, SkipForward, Home, Loader2, Check, X, Music,
  Laugh, Star, Mic, ShieldAlert, Zap, MessageSquare, ChevronRight,
} from 'lucide-react';
import { QrPlaceholder } from '@/components/QrPlaceholder';
import { JonnyAvatar } from '@/components/JonnyAvatar';
import { useEventSocket } from '@/hooks/useEventSocket';
import { GameFlowEngine } from '@/components/GameFlowEngine';
import { AudioManager } from '@/audio/AudioManager';

// ── Types ─────────────────────────────────────────────────────────────────────

interface HomeSession {
  id: string;
  joinCode: string;
  hostName: string;
  gameSlug: string | null;
  gameConfig: Record<string, unknown>;
  status: 'lobby' | 'playing' | 'ended';
  currentRound: number;
  totalRounds: number;
  roundPayload: Record<string, unknown>;
}

interface HomePlayer {
  id: string;
  nickname: string;
  avatarColor: string;
  score: number;
  isConnected: boolean;
}

type TabooAlarmEvent = { playerId: string; nickname: string; round: number; timestamp: number };

// ── Game catalogue ─────────────────────────────────────────────────────────────

const ALL_GAMES = [
  {
    slug: 'percorso-a-risate',
    name: 'Percorso a Risate',
    icon: <Laugh className="h-7 w-7" />,
    emoji: '😂',
    color: '#34D399',
    description: 'Sfide, mimo, reazioni esilaranti di gruppo',
  },
  {
    slug: 'gioco-coppie',
    name: 'Gioco delle Coppie',
    icon: <Zap className="h-7 w-7" />,
    emoji: '💞',
    color: '#F472B6',
    description: 'Memory card: trova le coppie prima degli altri!',
  },
  {
    slug: 'quizzone',
    name: 'Quizzone',
    icon: <Star className="h-7 w-7" />,
    emoji: '⭐',
    color: '#F5B642',
    description: 'Domande e risposte — chi sa di più vince!',
  },
  {
    slug: 'saramusica',
    name: 'SaraMusica',
    icon: <Music className="h-7 w-7" />,
    emoji: '🎵',
    color: '#60A5FA',
    description: 'Indovina la canzone dal suggerimento!',
  },
  {
    slug: 'adult-only',
    name: 'Adult Only',
    icon: <ShieldAlert className="h-7 w-7" />,
    emoji: '🔞',
    color: '#F87171',
    description: 'Sfide osé per adulti coraggiosi — 18+',
  },
  {
    slug: 'sfida-ballo',
    name: 'Sfida di Ballo',
    icon: <span className="text-2xl">💃</span>,
    emoji: '💃',
    color: '#A78BFA',
    description: 'Chi ha più ritmo sale sul podio!',
  },
  {
    slug: 'parola-alle-spalle',
    name: 'Parola alle Spalle',
    icon: <MessageSquare className="h-7 w-7" />,
    emoji: '💬',
    color: '#22D3EE',
    description: 'Fai indovinare la parola sulla tua schiena!',
  },
  {
    slug: 'karaoke-battle',
    name: 'Karaoke Battle',
    icon: <Mic className="h-7 w-7" />,
    emoji: '🎤',
    color: '#FB923C',
    description: 'Canta + Freestyle rap alternati!',
  },
];

const AVATAR_RING = ['#F5B642','#FF69B4','#60A5FA','#A78BFA','#34D399','#F87171','#F472B6','#FB923C','#22D3EE','#4ADE80'];

const FREESTYLE_TRACKS = [
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3',
] as const;



// ── Wheel arena helpers ────────────────────────────────────────────────────────

interface WheelGame {
  slug: string;
  label: string;
  short: string;
  color: string;
  glow: string;
  done: boolean;
}

const WHEEL_EXTRAS: Record<string, { short: string; glow: string }> = {
  'percorso-a-risate':  { short: 'PERCORSO', glow: '#4ADE80' },
  'gioco-coppie':       { short: 'COPPIE',   glow: '#F9A8D4' },
  'quizzone':           { short: 'QUIZZONE', glow: '#FCD34D' },
  'saramusica':         { short: 'SARA',     glow: '#93C5FD' },
  'adult-only':         { short: 'ADULT',    glow: '#FCA5A5' },
  'sfida-ballo':        { short: 'BALLO',    glow: '#C4B5FD' },
  'parola-alle-spalle': { short: 'PAROLA',   glow: '#67E8F9' },
  'karaoke-battle':     { short: 'KARAOKE',  glow: '#FDB175' },
};

function polarPt(cx:number,cy:number,r:number,deg:number){
  const rad=((deg-90)*Math.PI)/180;
  return{x:cx+r*Math.cos(rad),y:cy+r*Math.sin(rad)};
}
function sectorPath(cx:number,cy:number,r:number,ri:number,a1:number,a2:number){
  const o1=polarPt(cx,cy,r,a1),o2=polarPt(cx,cy,r,a2);
  const i1=polarPt(cx,cy,ri,a1),i2=polarPt(cx,cy,ri,a2);
  const lg=a2-a1>180?1:0;
  return`M${o1.x},${o1.y} A${r},${r},0,${lg},1,${o2.x},${o2.y} L${i2.x},${i2.y} A${ri},${ri},0,${lg},0,${i1.x},${i1.y} Z`;
}
function midPoint(cx:number,cy:number,r:number,a1:number,a2:number){
  return polarPt(cx,cy,r,(a1+a2)/2);
}

const WHEEL_ICONS: Record<string,React.ReactNode> = {
  'percorso-a-risate':  <><rect x="-9" y="-10" width="18" height="20" rx="3" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="2.2"/><circle cx="-4" cy="-4" r="2" fill="white"/><circle cx="4" cy="0" r="2" fill="white"/><circle cx="-4" cy="4" r="2" fill="white"/></>,
  'gioco-coppie':       <><rect x="-11" y="-9" width="13" height="18" rx="2" fill="rgba(255,255,255,0.28)" stroke="rgba(255,255,255,0.88)" strokeWidth="2"/><rect x="-2" y="-9" width="13" height="18" rx="2" fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.88)" strokeWidth="2"/></>,
  'quizzone':           <><circle cx="0" cy="0" r="11" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="2.2"/><text textAnchor="middle" dominantBaseline="central" fontSize="15" fontWeight="900" fill="white">?</text></>,
  'saramusica':         <><ellipse cx="0" cy="-6" rx="5.5" ry="8" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="2.2"/><line x1="0" y1="2" x2="0" y2="10" stroke="rgba(255,255,255,0.88)" strokeWidth="2.2"/><path d="M-7,10 Q0,14 7,10" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="2.2"/></>,
  'adult-only':         <path d="M0,-13 C-3,-7 -10,-5 -7,2 C-5,7 -2,11 0,13 C2,11 5,7 7,2 C10,-5 3,-7 0,-13 Z" fill="rgba(255,255,255,0.9)"/>,
  'sfida-ballo':        <path d="M3,-13 L-3,-1 L2,-1 L-4,13 L8,1 L2,1 Z" fill="rgba(255,255,255,0.92)"/>,
  'parola-alle-spalle': <><path d="M-11,-9 Q-11,-13 -7,-13 L7,-13 Q11,-13 11,-9 L11,1 Q11,5 7,5 L2,5 L-1,11 L-3,5 L-7,5 Q-11,5 -11,1 Z" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="2.2"/><circle cx="-3" cy="-4" r="1.8" fill="white"/><circle cx="0" cy="-4" r="1.8" fill="white"/><circle cx="3" cy="-4" r="1.8" fill="white"/></>,
  'karaoke-battle':     <polygon points="0,-11 2.8,-3.5 11,-3.5 4.8,1.3 7.2,9 0,4.5 -7.2,9 -4.8,1.3 -11,-3.5 -2.8,-3.5" fill="rgba(255,255,255,0.92)"/>,
};

function WheelSectorIcon({ slug }:{ slug:string }) {
  return <>{WHEEL_ICONS[slug] ?? <circle cx="0" cy="0" r="8" fill="rgba(255,255,255,0.7)"/>}</>;
}

function HomeGameWheel({ selected, onSelect, spinning, games }:{
  selected: WheelGame; onSelect:(g:WheelGame)=>void; spinning:boolean; games:WheelGame[];
}) {
  const cx=220,cy=220,r=183,ri=62;
  const controls = useAnimation();
  const BULBS=48, bulbR=r+17;
  // Track cumulative rotation so each subsequent spin starts from where the last left off.
  // Using a ref avoids stale-closure issues inside the effect; the state drives label re-render.
  const currentRotationRef = useRef(0);
  const [currentRotation, setCurrentRotation] = useState(0);

  useEffect(()=>{
    if(!spinning) return;
    const idx = Math.max(0, games.findIndex(g=>g.slug===selected.slug));
    const sliceAngle = games.length > 0 ? 360/games.length : 45;
    // Correct spin math: CSS rotate(R) moves sector at angle θ to screen angle θ+R.
    // Pointer is at 0° (top). Sector idx center is at (idx+0.5)*sliceAngle.
    // For it to reach the top: (idx+0.5)*sliceAngle + R ≡ 0 (mod 360)
    // → R_target_mod = (360 - ((idx+0.5)*sliceAngle % 360)) % 360
    const targetMod = (360 - (((idx+0.5)*sliceAngle) % 360)) % 360;
    const currentMod = ((currentRotationRef.current % 360) + 360) % 360;
    let diff = targetMod - currentMod;
    if (diff <= 0) diff += 360;   // always spin at least one full extra step forward
    const spinAmount = 1440 + diff; // 4 full spins + precision landing
    const newTotal = currentRotationRef.current + spinAmount;
    void controls.start({
      rotate: newTotal,
      transition: { duration: 2.8, ease: 'easeInOut' as const }
    }).then(()=>{
      currentRotationRef.current = newTotal;
      setCurrentRotation(newTotal);
    });
  },[spinning,selected,controls,games]);

  return (
    <div style={{width:'100%',height:'100%',transform:'perspective(900px) rotateX(6deg)',transformOrigin:'center bottom',position:'relative'}}>
      <motion.div animate={controls} style={{transformOrigin:'center',width:'100%',height:'100%'}}>
        <svg viewBox="0 0 440 440" width="100%" height="100%">
          <defs>
            {games.map(g=>(
              <radialGradient key={g.slug} id={`hw-${g.slug}`} cx="38%" cy="28%" r="75%">
                <stop offset="0%" stopColor={g.glow} stopOpacity="1"/>
                <stop offset="55%" stopColor={g.color} stopOpacity="1"/>
                <stop offset="100%" stopColor={g.color} stopOpacity="0.75"/>
              </radialGradient>
            ))}
            <linearGradient id="hw-ring1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFF4A0"/><stop offset="25%" stopColor="#F5B642"/>
              <stop offset="50%" stopColor="#FFE066"/><stop offset="75%" stopColor="#C8810A"/>
              <stop offset="100%" stopColor="#FFF4A0"/>
            </linearGradient>
            <linearGradient id="hw-ring2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#8B5E00"/><stop offset="50%" stopColor="#F5B642"/>
              <stop offset="100%" stopColor="#8B5E00"/>
            </linearGradient>
            <radialGradient id="hw-hub" cx="40%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#3B1280"/><stop offset="100%" stopColor="#0A0320"/>
            </radialGradient>
            <filter id="hw-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="6" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="hw-bulbglow" x="-150%" y="-150%" width="400%" height="400%">
              <feGaussianBlur stdDeviation="2.5" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="hw-txt">
              <feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor="rgba(0,0,0,1)" floodOpacity="1"/>
            </filter>
          </defs>

          {/* Gold metallic ring — no dark halo ellipse */}
          <circle cx={cx} cy={cy} r={r+22} fill="none" stroke="url(#hw-ring2)" strokeWidth="5"/>
          <circle cx={cx} cy={cy} r={r+14} fill="rgba(0,0,0,0.6)" stroke="none"/>
          <circle cx={cx} cy={cy} r={r+12} fill="none" stroke="url(#hw-ring1)" strokeWidth="11"
            style={{filter:'drop-shadow(0 0 10px rgba(245,182,66,0.95))'}}/>
          <circle cx={cx} cy={cy} r={r+5} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>

          {/* Sectors — icon only, no text (text is in static overlay) */}
          {games.map((g,i)=>{
            const sliceAng=360/games.length;
            const a1=i*sliceAng,a2=(i+1)*sliceAng;
            const isSel=g.slug===selected.slug;
            const iconPt=midPoint(cx,cy,r*0.58,a1,a2);
            return (
              <g key={g.slug} onClick={()=>!g.done&&onSelect(g)} style={{cursor:g.done?'default':'pointer',opacity:g.done?0.45:1}}>
                <path d={sectorPath(cx,cy,r,ri,a1,a2)} fill="rgba(0,0,0,0.35)" style={{transform:'translate(2px,3px)'}}/>
                <path d={sectorPath(cx,cy,r-(isSel?0:4),ri+(isSel?0:3),a1,a2)}
                  fill={g.done?'rgba(52,211,153,0.38)':`url(#hw-${g.slug})`}
                  stroke={isSel?'rgba(255,255,255,0.75)':g.done?'rgba(52,211,153,0.55)':'rgba(0,0,0,0.6)'}
                  strokeWidth={isSel?2.5:1.5}
                  filter={isSel&&!g.done?'url(#hw-glow)':undefined}/>
                {g.done ? (
                  <text x={iconPt.x} y={iconPt.y} textAnchor="middle" dominantBaseline="middle"
                    fontSize="24" fill="rgba(52,211,153,0.95)" filter="url(#hw-txt)" style={{userSelect:'none'}}>✓</text>
                ) : (
                  <g transform={`translate(${iconPt.x},${iconPt.y}) scale(0.92)`}>
                    <WheelSectorIcon slug={g.slug}/>
                  </g>
                )}
              </g>
            );
          })}

          {/* Dividers */}
          {games.map((_,i)=>{
            const sliceAng=360/games.length;
            const p1=polarPt(cx,cy,ri+4,i*sliceAng),p2=polarPt(cx,cy,r-4,i*sliceAng);
            return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(0,0,0,0.65)" strokeWidth="1.5"/>;
          })}

          {/* Bulb ring */}
          {Array.from({length:BULBS},(_,i)=>{
            const ang=i*(360/BULBS);
            const pt=polarPt(cx,cy,bulbR,ang);
            const lit=i%2===0;
            return (
              <motion.circle key={i} cx={pt.x} cy={pt.y} r={lit?5:3.5}
                fill={lit?'#FFE55C':'#7A5200'}
                style={{filter:lit?'url(#hw-bulbglow)':undefined}}
                animate={lit?{opacity:[0.65,1,0.65]}:{}}
                transition={lit?{duration:1.1+((i%7)*0.18),repeat:Infinity,delay:(i%9)*0.12,ease:'easeInOut' as const}:{}}/>
            );
          })}

          {/* Hub — Jonny's World logo instead of text */}
          <circle cx={cx} cy={cy} r={ri+5} fill="rgba(0,0,0,0.85)"/>
          <circle cx={cx} cy={cy} r={ri} fill="url(#hw-hub)" stroke="url(#hw-ring1)" strokeWidth="3"
            style={{filter:'drop-shadow(0 0 12px rgba(168,85,247,0.7))'}}/>
          <circle cx={cx} cy={cy} r={ri-6} fill="transparent" stroke="rgba(255,255,255,0.12)" strokeWidth="1"/>
          <image href="/jonny-world-logo-nobg.png"
            x={cx-50} y={cy-36} width={100} height={72}
            preserveAspectRatio="xMidYMid meet"
            style={{filter:'drop-shadow(0 0 8px rgba(245,182,66,0.6))'}}/>
        </svg>
      </motion.div>

      {/* ── Static label overlay — does NOT rotate, always readable ── */}
      {/* Labels are positioned at the CURRENT screen angle of each sector  */}
      {/* Screen angle = original angle + cumulative rotation                */}
      <svg style={{position:'absolute',inset:0,pointerEvents:'none'}}
        viewBox="0 0 440 440" width="100%" height="100%">
        <defs>
          <filter id="hw-txt2">
            <feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor="rgba(0,0,0,1)" floodOpacity="1"/>
          </filter>
        </defs>
        {!spinning && games.map((g,i)=>{
          const sliceAng=360/games.length;
          // After CSS rotate(currentRotation), sector i's center moved from (i+0.5)*sliceAng to that + currentRotation
          const screenAngle=(i+0.5)*sliceAng + currentRotation;
          const lbl=polarPt(cx,cy,r*0.72,screenAngle);
          const isSel=g.slug===selected.slug;
          return (
            <text key={g.slug} x={lbl.x} y={lbl.y} textAnchor="middle" dominantBaseline="middle"
              fontSize={isSel?13:11} fontWeight="900" fontFamily="'Outfit','Arial Black',sans-serif"
              fill={g.done?'rgba(52,211,153,0.85)':isSel?'#FFE066':'white'}
              stroke="rgba(0,0,0,0.95)" strokeWidth="3.5" paintOrder="stroke"
              filter="url(#hw-txt2)" style={{userSelect:'none',letterSpacing:'0.06em'}}>
              {g.short}
            </text>
          );
        })}
      </svg>

      {/* Pointer */}
      <div style={{position:'absolute',top:'-3%',left:'50%',transform:'translateX(-50%)',zIndex:10,pointerEvents:'none'}}>
        <svg width="28" height="38" viewBox="0 0 28 38">
          <defs>
            <linearGradient id="hw-ptr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFE55C"/><stop offset="100%" stopColor="#D97706"/>
            </linearGradient>
          </defs>
          <polygon points="14,36 0,6 28,6" fill="url(#hw-ptr)"
            style={{filter:'drop-shadow(0 0 8px rgba(245,182,66,1)) drop-shadow(0 2px 4px rgba(0,0,0,0.8))'}}/>
          <polygon points="14,36 3,9 25,9" fill="rgba(255,255,255,0.2)"/>
        </svg>
      </div>
    </div>
  );
}

function HomeArenaClassifica({ players }:{ players: HomePlayer[] }) {
  const COLORS = AVATAR_RING;
  const sorted = useMemo(()=>[...players].sort((a,b)=>b.score-a.score),[players]);
  const glowFor  = (i:number)=>i===0?'rgba(245,182,66,0.7)':i===1?'rgba(192,192,192,0.5)':i===2?'rgba(205,127,50,0.45)':undefined;
  const borderFor= (i:number)=>i===0?'rgba(245,182,66,0.5)':i===1?'rgba(192,192,192,0.35)':i===2?'rgba(205,127,50,0.35)':'rgba(255,255,255,0.07)';
  const bgFor    = (i:number)=>i===0?'linear-gradient(135deg,rgba(245,182,66,0.22),rgba(245,182,66,0.06))':i===1?'linear-gradient(135deg,rgba(192,192,192,0.12),rgba(192,192,192,0.04))':i===2?'linear-gradient(135deg,rgba(205,127,50,0.12),rgba(205,127,50,0.04))':'rgba(255,255,255,0.04)';
  const rankLabel= (i:number)=>(['🥇','🥈','🥉'][i])??`${i+1}`;
  return (
    <div className="rounded-2xl overflow-hidden flex flex-col h-full"
      style={{background:'rgba(12,4,32,0.82)',border:'1.5px solid rgba(255,255,255,0.11)',backdropFilter:'blur(12px)',boxShadow:'0 4px 40px rgba(0,0,0,0.6),inset 0 1px 0 rgba(255,255,255,0.08)'}}>
      <div className="px-4 py-2.5 font-black uppercase shrink-0 flex items-center gap-2"
        style={{background:'linear-gradient(135deg,rgba(245,182,66,0.3),rgba(245,182,66,0.08))',borderBottom:'1px solid rgba(245,182,66,0.25)'}}>
        <Trophy className="h-3.5 w-3.5 text-yellow-400"/>
        <span style={{fontSize:'0.6rem',letterSpacing:'0.22em',color:'#F5B642'}}>Classifica Live</span>
        <motion.span className="ml-auto rounded-full px-2 py-0.5 font-black"
          animate={{opacity:[1,0.5,1]}} transition={{duration:1.4,repeat:Infinity}}
          style={{background:'rgba(245,182,66,0.2)',color:'#F5B642',fontSize:'0.55rem'}}>LIVE</motion.span>
      </div>
      <div className="flex flex-col p-2 gap-1.5 flex-1 overflow-hidden">
        {sorted.length===0?(
          <div className="flex-1 flex flex-col items-center justify-center gap-2 opacity-50">
            <Users className="h-5 w-5 text-purple-400"/>
            <span style={{fontSize:'0.7rem',color:'rgba(255,255,255,0.4)',textAlign:'center'}}>Nessun giocatore<br/>connesso</span>
          </div>
        ):sorted.map((p,i)=>{
          const color=COLORS[i%COLORS.length];
          return (
            <motion.div key={p.id} className="flex items-center gap-2 rounded-xl px-2.5 py-1.5"
              initial={{x:-30,opacity:0}} animate={{x:0,opacity:1}}
              transition={{delay:i*0.05,ease:'easeOut' as const}}
              style={{background:bgFor(i),border:`1px solid ${borderFor(i)}`,boxShadow:glowFor(i)?`0 0 18px ${glowFor(i)}`:undefined}}>
              <span className="shrink-0 text-center" style={{fontSize:i<3?'0.9rem':'0.7rem',width:i<3?20:16,lineHeight:1}}>{rankLabel(i)}</span>
              <div className={`${i<3?'w-10 h-10':'w-8 h-8'} rounded-full flex items-center justify-center font-black shrink-0`}
                style={{background:`${color}2A`,border:`2.5px solid ${color}${i<3?'cc':'66'}`,color,fontSize:i<3?'0.85rem':'0.72rem',boxShadow:i<3?`0 0 14px ${color}66`:undefined}}>
                {p.nickname[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-black text-white truncate" style={{fontSize:i<3?'0.85rem':'0.78rem'}}>{p.nickname}</div>
              </div>
              {p.score>0&&(
                <div className="font-black shrink-0"
                  style={{color:i===0?'#F5B642':i===1?'#C8C8C8':i===2?'#CD7F32':'rgba(255,255,255,0.55)',fontSize:i<3?'0.88rem':'0.78rem',textShadow:i<3?`0 0 12px ${color}`:undefined}}>
                  {p.score}pt
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
      <div className="mx-3 mb-3 rounded-xl px-3 py-2 flex items-center gap-2 shrink-0"
        style={{background:'rgba(124,58,237,0.2)',border:'1px solid rgba(124,58,237,0.35)'}}>
        <Users className="h-3 w-3 text-purple-400 shrink-0"/>
        <span className="font-black text-white" style={{fontSize:'0.72rem'}}>
          <span style={{color:'#A855F7'}}>{sorted.length}</span> Giocatori
        </span>
        <motion.div className="ml-auto w-2 h-2 rounded-full bg-green-400 shrink-0"
          animate={{opacity:[1,0,1]}} transition={{duration:1.2,repeat:Infinity}}/>
      </div>
    </div>
  );
}

function HomeWheelGameCard({ game, onPlay, loading }:{
  game: WheelGame; onPlay:()=>void; loading:boolean;
}) {
  return (
    <AnimatePresence mode="wait">
      <motion.div key={game.slug} className="rounded-2xl"
        style={{background:'rgba(8,2,24,0.88)',border:`1.5px solid ${game.color}99`,boxShadow:`0 0 30px ${game.color}44,0 0 60px ${game.color}18`}}
        initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}
        transition={{duration:0.22}}>
        <div className="px-4 py-3.5">
          <div className="font-black text-white mb-2"
            style={{fontSize:'clamp(0.9rem,1.3vw,1.1rem)',fontFamily:"'Outfit','Arial Black',sans-serif",textShadow:`0 0 20px ${game.glow}88`}}>
            {game.label}
          </div>
          {game.done ? (
            <div className="rounded-xl px-3 py-2 text-center font-black"
              style={{background:'rgba(52,211,153,0.15)',border:'1px solid rgba(52,211,153,0.45)',color:'#34D399',fontSize:'0.78rem'}}>
              ✓ Completato
            </div>
          ) : (
            <motion.button onClick={onPlay} disabled={loading}
              className="w-full rounded-xl py-2.5 font-black text-white flex items-center justify-center gap-2 disabled:opacity-40"
              style={{background:`linear-gradient(135deg,${game.color} 0%,${game.glow} 100%)`,boxShadow:`0 0 18px ${game.color}55`,border:'none',fontSize:'0.82rem'}}
              whileHover={{scale:loading?1:1.02}} whileTap={{scale:loading?1:0.97}}>
              {loading?<Loader2 className="h-4 w-4 animate-spin"/>:<><Play className="h-4 w-4"/> Inizia</>}
            </motion.button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Socket ─────────────────────────────────────────────────────────────────────

function useHomeSocket(sessionId: string | null) {
  const { on, emit } = useEventSocket(null);
  useEffect(() => {
    if (!sessionId) return;
    emit('join:home', sessionId);
    return () => { emit('leave:home', sessionId); };
  }, [sessionId, emit]);
  return { on, emit };
}

// ── Main ──────────────────────────────────────────────────────────────────────

type Phase = 'welcome' | 'join' | 'board' | 'playing' | 'champion';

const BUILD_STAMP = `${new Date().toISOString().slice(0,16).replace('T',' ')} / HomeGame v-check`;
export default function HomeGame() {
  useEffect(() => {
    console.log('[RuntimeCheck] HomeGame mounted FILE=src/pages/HomeGame.tsx BUILD=' + BUILD_STAMP);
  }, []);
  const [, navigate] = useLocation();
  const urlParams = new URLSearchParams(window.location.search);
  const urlSessionId = urlParams.get('s');

  // No sessionId → redirect to home-v4 (generic entry); sessionId present → wait for load effect
  const [phase, setPhase] = useState<Phase>('board');
  useEffect(() => {
    if (!urlSessionId) {
      console.log('[RoutingCheck] /home without session redirected to /home-v4');
      navigate('/home-v4');
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  const [session, setSession] = useState<HomeSession | null>(null);
  const [players, setPlayers] = useState<HomePlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [selectingGame, setSelectingGame] = useState<string | null>(null);
  const [jonnyMood, setJonnyMood] = useState<'idle' | 'excited' | 'thinking' | 'winner' | 'scoreboard' | 'correct'>('excited');
  const [jonnyMsg, setJonnyMsg] = useState('Benvenuti a JONNY\'S WORLD!');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tracks the last known roundPayload.mode so home:state can detect flow→ballo transition
  // even when slug/round haven't changed (both stay at sfida-ballo / 0 through the whole flow).
  const currentModeRef = useRef<string>('');
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [audioWarning, setAudioWarning] = useState(false);
  const [postGame, setPostGame] = useState<{gameSlug:string;players:HomePlayer[]}|null>(null);
  const [balloEnergies, setBalloEnergies] = useState<Record<string, number>>({});     // peak — for winner/sorting
  const [balloCurrent, setBalloCurrent]   = useState<Record<string, number>>({});     // current live — for bars
  const [balloResult, setBalloResult] = useState<{
    winnerId: string | null; winnerNickname: string | null; points: number;
    teamResult?: { winnerTeamId: string; winnerTeamPlayers: { id: string; nickname: string }[]; perPlayer: number; teamScores: { teamId: string; players: { id: string; nickname: string }[]; totalEnergy: number }[] } | null;
  } | null>(null);
  const [saraMusicaWinner, setSaraMusicaWinner] = useState<{ nickname: string; points: number; round: number } | null>(null);
  // Reset saraMusicaWinner when the round changes
  useEffect(() => { setSaraMusicaWinner(null); }, [session?.currentRound]);
  const [spinning, setSpinning] = useState(false);
  const [wheelSelected, setWheelSelected] = useState<string | null>(null);
  const [postSpinModal, setPostSpinModal] = useState(false);
  const [postGameCountdown, setPostGameCountdown] = useState<number>(5);
  // ── Home media (intro videos per game) ────────────────────────────────────
  type HomeMediaItem = { id: string; name: string; kind: string; url: string; tags: string[] };
  const [homeMedia, setHomeMedia] = useState<HomeMediaItem[]>([]);
  const [introVideo, setIntroVideo] = useState<{ url: string; slug: string; timeLimit: number } | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const introStartedRef    = useRef(false);
  const introMaxTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introStallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { on, emit } = useHomeSocket(session?.id ?? null);
  const [tabooAlarm, setTabooAlarm] = useState<TabooAlarmEvent | null>(null);
  const tabooDebounceRef = useRef<Map<string, number>>(new Map());
  const [balloSensitivity, setBalloSensitivity] = useState(1.0);
  const [sensorReadyMap, setSensorReadyMap] = useState<Record<string, boolean>>({});
  // Spectator votes per dancer: Record<dancerId, { total: number; count: number }>
  const [balloVotes, setBalloVotes] = useState<Record<string, { total: number; count: number }>>({});
  const handleBalloSensitivity = useCallback((s: number) => {
    setBalloSensitivity(s);
    if (session?.id) emit('home:set_ballo_sensitivity', { sessionId: session.id, sensitivity: s });
  }, [emit, session?.id]);

  // Derived
  const gamesPlayed = useMemo<string[]>(() => {
    const cfg = session?.gameConfig ?? {};
    return (cfg.gamesPlayed as string[]) ?? [];
  }, [session]);

  const visibleGames = useMemo(() => {
    const cfg = session?.gameConfig ?? {};
    const selected = (cfg.selectedGames as string[] | undefined) ?? [];
    if (selected.length > 0) return ALL_GAMES.filter(g => selected.includes(g.slug));
    return ALL_GAMES;
  }, [session]);

  const cfgPhase = useMemo(() => {
    const cfg = session?.gameConfig ?? {};
    return (cfg.phase as string) ?? 'join';
  }, [session]);

  // ── Wheel arena ─────────────────────────────────────────────────────────────
  const wheelGames = useMemo<WheelGame[]>(() =>
    visibleGames.map(g => ({
      slug:  g.slug,
      label: g.name,
      short: WHEEL_EXTRAS[g.slug]?.short ?? g.name.split(' ')[0].toUpperCase().slice(0,7),
      color: g.color,
      glow:  WHEEL_EXTRAS[g.slug]?.glow ?? g.color,
      done:  gamesPlayed.includes(g.slug),
    }))
  , [visibleGames, gamesPlayed]);

  const wheelSelectedGame = useMemo<WheelGame>(() => {
    const bySlug = wheelGames.find(g => g.slug === wheelSelected);
    if (bySlug) return bySlug;
    return wheelGames.find(g => !g.done) ?? wheelGames[0] ?? {
      slug:'quizzone',label:'Quizzone',short:'QUIZZONE',color:'#F5B642',glow:'#FCD34D',done:false
    };
  }, [wheelGames, wheelSelected]);

  const handleWheelSpin = useCallback(() => {
    if (spinning || wheelGames.length === 0) return;
    const available = wheelGames.filter(g => !g.done);
    const pool = available.length > 0 ? available : wheelGames;
    // Single game available — skip animation, go straight to modal
    if (pool.length === 1) {
      setWheelSelected(pool[0].slug);
      setPostSpinModal(true);
      return;
    }
    const rnd = pool[Math.floor(Math.random() * pool.length)];
    setWheelSelected(rnd.slug);
    setSpinning(true);
    setTimeout(() => { setSpinning(false); setPostSpinModal(true); }, 3000);
  }, [spinning, wheelGames]);

  // ── Audio unlock ────────────────────────────────────────────────────────────
  const unlockAudio = useCallback((_src?: string) => {
    setAudioUnlocked(true);
    AudioManager.stopLoop(true);
    void AudioManager.playLoop('hub', 'lobby_loop').then(started => {
      if (!started) setAudioWarning(true);
    });
  }, []);

  // ── Load session from URL ────────────────────────────────────────────────────
  useEffect(() => {
    if (!urlSessionId) return;
    fetch(`/api/home/sessions/${urlSessionId}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { session: HomeSession; players: HomePlayer[] } | null) => {
        if (!data) { navigate('/home-setup'); return; }
        setSession(data.session);
        setPlayers(data.players);
        const cfg = data.session.gameConfig ?? {};
        const p = (cfg.phase as string) ?? 'join';
        if (data.session.status === 'ended') {
          setPhase('champion');
        } else if (data.session.status === 'playing') {
          if (p === 'board') {
            // Between games: show board UI + start lobby music
            console.log('[AudioFlowDebug] load-session status=playing phase=board — playLoop hub/lobby_loop');
            setPhase('board');
            AudioManager.stopLoop(true);
            void AudioManager.playLoop('hub', 'lobby_loop');
          } else {
            // Game in progress — restore correct music based on mode
            const flowMode = String(data.session.roundPayload?.mode ?? '');
            console.log('[AudioFlowDebug] load-session status=playing phase=playing flowMode=' + flowMode + ' slug=' + (data.session.gameSlug ?? 'null'));
            setPhase('playing');
            setRevealed(false);
            if (flowMode === 'home-flow') {
              // Flow phases (theme_select/booking/confirm/countdown) use lobby music
              void AudioManager.playLoop('hub', 'lobby_loop');
            } else {
              AudioManager.stopLoop(true);
              void AudioManager.playLoop(data.session.gameSlug ?? 'hub', 'round_loop');
            }
          }
        } else if (p === 'board') {
          setPhase('board');
          AudioManager.stopLoop(true);
          void AudioManager.playLoop('hub', 'lobby_loop');
        } else {
          // Session is in lobby/waiting state — hand off to the lobby page
          navigate(`/home-lobby/${data.session.joinCode}`);
          return;
        }
      })
      .catch(() => navigate('/home-setup'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSessionId]);

  // ── Socket listeners ─────────────────────────────────────────────────────────
  useEffect(() => {
    const u1 = on<{ session: HomeSession; players: HomePlayer[] }>('home:state', (d) => {
      const newMode  = String(d.session.roundPayload?.mode ?? '');
      const prevMode = currentModeRef.current;
      // ── Fallback: flow→ballo detected in home:state (handles missed home:round) ──
      // currentModeRef is set by home:round first in the normal path, so this only fires
      // when home:round was truly missed.
      if (prevMode === 'home-flow' && newMode === 'home-ballo') {
        console.log('[BalloFlow] home:state (TV): flow→ballo fallback — starting ballo timer');
        currentModeRef.current = newMode;
        setBalloEnergies({});
        setBalloCurrent({});
        setBalloResult(null);
        startTimer(Number(d.session.roundPayload?.timeLimit ?? 15));
        AudioManager.stopLoop(true);
        void AudioManager.playLoop('sfida-ballo', 'round_loop');
      } else {
        currentModeRef.current = newMode;
      }
      setSession(d.session);
      setPlayers(d.players);
    });
    const u2 = on<{ session: HomeSession; players: HomePlayer[] }>('home:board', (d) => {
      setSession(d.session);
      setPlayers(d.players);
      setPhase('board');
      setJonnyMood('excited');
      setJonnyMsg('Scegli il tuo gioco!');
      console.log('[AudioTrace] home:board — stopLoop then playLoop hub/lobby_loop');
      setBalloResult(null);
      AudioManager.stopLoop(true);
      void AudioManager.playLoop('hub', 'lobby_loop');
    });
    const u3 = on<{ session: HomeSession; players: HomePlayer[]; payload: Record<string, unknown> }>('home:game_started', (d) => {
      setSession(d.session);
      setPlayers(d.players);
      setPhase('playing');
      setRevealed(false);
      setBalloEnergies({});
      setBalloCurrent({});
      setBalloResult(null);
      setJonnyMood('thinking');
      // Flow pilot: skip timer + audio — music stays as lobby, switches on first home:round
      if (String(d.session.roundPayload?.mode ?? '') === 'home-flow') {
        console.log('[HomeAudioFlow] home:game_started flow — skipping timer+audio, phase=theme_select');
        return;
      }
      startTimer(Number(d.payload?.timeLimit ?? 30));
      console.log('[AudioTrace] home:game_started — stopLoop then playLoop', { slug: d.session.gameSlug ?? 'global', type: 'round_loop' });
      AudioManager.stopLoop(true);
      void AudioManager.playLoop(d.session.gameSlug ?? 'global', 'round_loop');
    });
    const u4 = on<{ round: number; payload: Record<string, unknown> }>('home:round', (d) => {
      const roundMode = String(d.payload?.mode ?? '');
      const prevMode  = currentModeRef.current;
      currentModeRef.current = roundMode;
      console.log('[BalloFlow] home:round (TV) → mode:', roundMode, '| prevMode:', prevMode, '| round:', d.round);
      setSession(prev => prev ? { ...prev, currentRound: d.round, roundPayload: d.payload } : prev);
      setRevealed(false);
      setBalloEnergies({});
      setBalloCurrent({});
      setBalloResult(null);
      setBalloVotes({});
      startTimer(Number(d.payload?.timeLimit ?? 30));
      setJonnyMood('thinking');
      // Audio switch: covers both normal ballo AND flow→ballo transition
      if (roundMode === 'home-ballo') {
        console.log('[HomeAudioFlow] home:round home-ballo — switching to ballo audio');
        AudioManager.stopLoop(true);
        void AudioManager.playLoop('sfida-ballo', 'round_loop');
      }
    });
    const u5 = on<{ session: HomeSession; players: HomePlayer[]; gameSlug: string }>('home:game_ended', (d) => {
      setSession(d.session);
      setPlayers(d.players);
      setJonnyMood('winner');
      setJonnyMsg(`${ALL_GAMES.find(g => g.slug === d.gameSlug)?.name ?? 'Gioco'} completato! 🎉`);
      console.log('[AudioFlowDebug] home:game_ended — stopLoop then playLoop hub/lobby_loop for post-game screen');
      AudioManager.stopLoop(true);
      void AudioManager.playLoop('hub', 'lobby_loop');
      setPostGame({ gameSlug: d.gameSlug, players: d.players });
    });
    const u6 = on<{ session: HomeSession; players: HomePlayer[] }>('home:champion', (d) => {
      setSession(d.session);
      setPlayers(d.players);
      setPhase('champion');
      setJonnyMood('winner');
      AudioManager.stopLoop(true);
      void AudioManager.playStinger('global', 'podium_theme');
    });
    const u7 = on<{ payload: Record<string, unknown>; players: HomePlayer[] }>('home:card_flip', (d) => {
      setSession(prev => prev ? { ...prev, roundPayload: d.payload } : prev);
      if (d.players) setPlayers(d.players);
    });
    const u8 = on<{ currentEnergies: Record<string, number>; peakEnergies: Record<string, number>; round: number }>('home:ballo_live', (d) => {
      console.log('[BalloTrace:tv] received home:ballo_live', { current: d.currentEnergies, peak: d.peakEnergies });
      setBalloCurrent(d.currentEnergies);
      setBalloEnergies(d.peakEnergies);
    });
    const u9 = on<{ winnerId: string | null; winnerNickname: string | null; points: number; energies: Record<string, number>; teamResult?: { winnerTeamId: string; winnerTeamPlayers: { id: string; nickname: string }[]; perPlayer: number; teamScores: { teamId: string; players: { id: string; nickname: string }[]; totalEnergy: number }[] } | null }>('home:ballo_result', (d) => {
      console.log('[BalloTrace:tv] received home:ballo_result', { winnerId: d.winnerId, teamResult: d.teamResult });
      // Optimistic score update for solo winner
      if (d.winnerId) setPlayers(prev => prev.map(p => p.id === d.winnerId ? { ...p, score: p.score + d.points } : p));
      // Optimistic score update for team winners
      if (d.teamResult) setPlayers(prev => prev.map(p => d.teamResult?.winnerTeamPlayers.some(m => m.id === p.id) ? { ...p, score: p.score + d.teamResult!.perPlayer } : p));
      setBalloEnergies(d.energies ?? {});
      setBalloResult({ winnerId: d.winnerId, winnerNickname: d.winnerNickname, points: d.points, teamResult: d.teamResult ?? null });
      setRevealed(true);
      if (timerRef.current) clearInterval(timerRef.current);
      setJonnyMood('winner');
    });
    const u10 = on<{ sessionId: string; round: number; correctIndex: number }>('home:quiz_all_answered', (d) => {
      console.log('[QuizTrace:tv] received home:quiz_all_answered', d);
      // All players answered — freeze timer and reveal correct answer on TV
      if (timerRef.current) { clearInterval(timerRef.current); console.log('[QuizTrace:tv] timer stopped'); }
      setRevealed(true);
      console.log('[QuizTrace:tv] set revealed true');
      setJonnyMood('correct');
    });
    const u11 = on<{ playerId: string; nickname: string; round: number; points: number }>('home:saramusica_winner', (d) => {
      console.log('[SaraTrace:tv] received home:saramusica_winner', d);
      setSaraMusicaWinner({ nickname: d.nickname, points: d.points, round: d.round });
      setPlayers(prev => prev.map(p => p.id === d.playerId ? { ...p, score: p.score + d.points } : p));
      setRevealed(true);
      if (timerRef.current) clearInterval(timerRef.current);
      setJonnyMood('excited');
    });

    const u12 = on<{ sessionId: string; playerId: string; sensorReady: boolean }>('home:player_sensor_ready', (d) => {
      setSensorReadyMap(prev => ({ ...prev, [d.playerId]: d.sensorReady }));
    });

    const u13 = on<TabooAlarmEvent>('home:wordback_taboo_alarm', (d) => {
      const now = Date.now();
      const last = tabooDebounceRef.current.get(d.playerId) ?? 0;
      if (now - last < 2000) return;
      tabooDebounceRef.current.set(d.playerId, now);
      setTabooAlarm(d);
      AudioManager.playGlobalStinger('taboo_alarm');
      setTimeout(() => setTabooAlarm(prev => prev?.timestamp === d.timestamp ? null : prev), 3000);
    });

    const u14 = on<{ round: number; totals: Record<string, { total: number; count: number }> }>('home:ballo_vote_update', (d) => {
      setBalloVotes(d.totals);
    });

    return () => { u1?.(); u2?.(); u3?.(); u4?.(); u5?.(); u6?.(); u7?.(); u8?.(); u9?.(); u10?.(); u11?.(); u12?.(); u13?.(); u14?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  // ── Polling fallback in join ──────────────────────────────────────────────────
  useEffect(() => {
    if ((phase !== 'join' && phase !== 'board') || !session?.id) return;
    const sid = session.id;
    const interval = setInterval(() => {
      fetch(`/api/home/sessions/${sid}`)
        .then(r => r.ok ? r.json() : null)
        .then((d: { session: HomeSession; players: HomePlayer[] } | null) => {
          if (!d) return;
          setPlayers(d.players);
          setSession(d.session);
          if (d.session.status === 'playing') {
            setPhase('playing');
            setRevealed(false);
            startTimer(Number(d.session.roundPayload?.timeLimit ?? 30));
          } else if (d.session.status === 'ended') {
            setPhase('champion');
          }
        })
        .catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, session?.id]);

  // ── Timer ────────────────────────────────────────────────────────────────────
  const startTimer = useCallback((seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(seconds);
    let t = seconds;
    timerRef.current = setInterval(() => {
      t -= 1;
      setTimeLeft(t);
      if (t <= 0) {
        clearInterval(timerRef.current!);
        setRevealed(true);
        setJonnyMood('correct');
      }
    }, 1000);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // ── Fetch home media (intro videos tagged home_intro_{slug}) ───────────────
  useEffect(() => {
    fetch('/api/media')
      .then(r => r.ok ? r.json() : [])
      .then((items: HomeMediaItem[]) => {
        setHomeMedia(items.filter(m => m.kind === 'video' && m.tags?.some(t => t.startsWith('home_intro_'))));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getIntroVideoUrl = useCallback((slug: string): string | null => {
    const tag = `home_intro_${slug}`;
    return homeMedia.find(m => m.tags?.includes(tag))?.url ?? null;
  }, [homeMedia]);

  /**
   * Single protected entry-point for starting the game after the intro video.
   * Idempotent: uses introStartedRef so it fires at most once per intro, regardless
   * of how many failsafe paths (onEnded, timeout, stall, error) converge.
   */
  const safeStartGame = useCallback((video: { url: string; slug: string; timeLimit: number }) => {
    if (introStartedRef.current) return;
    introStartedRef.current = true;
    if (introMaxTimerRef.current)   { clearTimeout(introMaxTimerRef.current);   introMaxTimerRef.current   = null; }
    if (introStallTimerRef.current) { clearTimeout(introStallTimerRef.current); introStallTimerRef.current = null; }
    setIntroVideo(null);
    setVideoLoading(false);
    setPhase('playing');
    setRevealed(false);
    setJonnyMood('thinking');
    startTimer(video.timeLimit);
    AudioManager.stopLoop(true);
    void AudioManager.playLoop(video.slug, 'round_loop');
  }, [startTimer]);

  // ── Intro-video lifecycle: reset guard, start 20 s max-duration failsafe ─────
  useEffect(() => {
    if (!introVideo) return;
    introStartedRef.current = false;
    setVideoLoading(true);
    const snapshot = introVideo;
    introMaxTimerRef.current = setTimeout(() => {
      console.warn('[IntroVideo] 20 s timeout — force-starting game');
      safeStartGame(snapshot);
    }, 20_000);
    return () => {
      if (introMaxTimerRef.current)   { clearTimeout(introMaxTimerRef.current);   introMaxTimerRef.current   = null; }
      if (introStallTimerRef.current) { clearTimeout(introStallTimerRef.current); introStallTimerRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introVideo?.url]);

  // ── Board phase audio catchall — covers all paths to board (session load,
  //    socket, post-game, goToBoard) with a single reactive trigger ──────────────
  useEffect(() => {
    if (phase !== 'board' || !session?.id) return;
    AudioManager.stopLoop(true);
    void AudioManager.playLoop('hub', 'lobby_loop');
  }, [phase, session?.id]);

  // ── API ───────────────────────────────────────────────────────────────────────

  const createSession = async () => {
    unlockAudio();
    setLoading(true);
    try {
      const r = await fetch('/api/home/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostName: 'Casa' }),
      });
      const s: HomeSession = await r.json();
      setSession(s);
      setPhase('join');
      navigate(`/home?s=${s.id}`, { replace: true });
      setJonnyMood('excited');
      setJonnyMsg('Aspettiamo i giocatori!');
    } finally { setLoading(false); }
  };

  const goToBoard = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/home/sessions/${session.id}/ready`, { method: 'POST' });
      const d = await r.json() as { session: HomeSession; players: HomePlayer[] };
      setSession(d.session);
      setPlayers(d.players);
      setPhase('board');
      setJonnyMood('excited');
      setJonnyMsg('Scegli il gioco!');
      AudioManager.stopLoop(true);
      void AudioManager.playLoop('hub', 'lobby_loop');
    } finally { setLoading(false); }
  };

  const selectGame = async (slug: string) => {
    if (!session || selectingGame) return;
    setSelectingGame(slug);
    try {
      const r = await fetch(`/api/home/sessions/${session.id}/select-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameSlug: slug }),
      });
      if (!r.ok) { alert('Errore nell\'avvio del gioco'); return; }
      const d = await r.json() as { session: HomeSession; players: HomePlayer[] };
      setSession(d.session);
      setPlayers(d.players);
      const game = ALL_GAMES.find(g => g.slug === slug);
      setJonnyMsg(`${game?.name ?? slug} iniziato!`);

      // ── GameFlowEngine pilot: theme_select → booking → confirm → countdown ──
      // Do NOT start timer, do NOT switch audio, do NOT show intro video.
      // Music keeps playing (lobby_loop). Audio switches on first home:round.
      if (String(d.session.roundPayload?.mode ?? '') === 'home-flow') {
        console.log('[HomeAudioFlow] flow mode detected in selectGame — keeping lobby audio, entering theme_select');
        setPhase('playing');
        return;
      }

      // ── Normal path ──────────────────────────────────────────────────────────
      const timeLimit = Number(d.session.roundPayload?.timeLimit ?? 30);
      // Hard stop board music before anything
      AudioManager.stopLoop(true);
      const videoUrl = getIntroVideoUrl(slug);
      if (videoUrl) {
        // Show fullscreen intro video — game starts when video ends/errors/skipped
        setIntroVideo({ url: videoUrl, slug, timeLimit });
      } else {
        // No video — start game immediately
        setPhase('playing');
        setRevealed(false);
        startTimer(timeLimit);
        setJonnyMood('thinking');
        void AudioManager.playLoop(slug, 'round_loop');
      }
    } finally { setSelectingGame(null); }
  };

  const nextRound = async () => {
    if (!session) return;
    const finishedSlug = session.gameSlug;
    setLoading(true);
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      const r = await fetch(`/api/home/sessions/${session.id}/next`, { method: 'POST' });
      if (!r.ok) {
        console.warn('nextRound rejected', r.status);
        return;
      }
      const d = await r.json() as { gameEnded?: boolean; session: HomeSession; payload?: Record<string, unknown>; players?: HomePlayer[] };
      if (d.gameEnded) {
        setSession(d.session);
        if (d.players) setPlayers(d.players);
        setJonnyMood('winner');
        console.log('[AudioFlowDebug] nextRound gameEnded — stopLoop then playLoop hub/lobby_loop for post-game screen');
        AudioManager.stopLoop(true);
        void AudioManager.playLoop('hub', 'lobby_loop');
        setPostGame({ gameSlug: finishedSlug ?? '', players: d.players ?? players });
      } else {
        setSession(d.session);
        setRevealed(false);
        startTimer(Number(d.payload?.timeLimit ?? 30));
        setJonnyMood('thinking');
      }
    } finally { setLoading(false); }
  };

  // ── Ballo tournament: call ballo-round-end when dance timer hits zero ─────────
  // This scores the round and sets balloPhase:'result' WITHOUT advancing the round.
  // The host then clicks "PROSSIMA SFIDA" (ballo-stage-next) or "FINE BALLO" (end-game).
  const balloRoundEndedRef = useRef(false);
  useEffect(() => { balloRoundEndedRef.current = false; }, [session?.id, session?.currentRound]);
  useEffect(() => {
    if (timeLeft !== 0) return;
    if (String(session?.roundPayload?.mode ?? '') !== 'home-ballo') return;
    const balloPhase = String((session?.roundPayload as Record<string,unknown>)?.balloPhase ?? 'dancing');
    if (balloPhase !== 'dancing') return; // skip if already in result/booking
    if (balloRoundEndedRef.current) return;
    balloRoundEndedRef.current = true;
    const sid = session?.id;
    if (!sid) return;
    void fetch(`/api/home/sessions/${sid}/ballo-round-end`, { method: 'POST', credentials: 'include' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, (session?.roundPayload as Record<string,unknown>)?.balloPhase, session?.roundPayload?.mode, session?.id]);

  const endGame = async () => {
    if (!session) return;
    const finishedSlug = session.gameSlug;
    setLoading(true);
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      const r = await fetch(`/api/home/sessions/${session.id}/end-game`, { method: 'POST' });
      const d = await r.json() as { session: HomeSession; players: HomePlayer[] };
      setSession(d.session);
      setPlayers(d.players);
      setJonnyMood('winner');
      console.log('[AudioFlowDebug] endGame — stopLoop then playLoop hub/lobby_loop for post-game screen');
      AudioManager.stopLoop(true);
      void AudioManager.playLoop('hub', 'lobby_loop');
      setPostGame({ gameSlug: finishedSlug ?? '', players: d.players });
    } finally { setLoading(false); }
  };

  const goToChampion = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/home/sessions/${session.id}/champion`, { method: 'POST' });
      const d = await r.json() as { session: HomeSession; players: HomePlayer[] };
      setSession(d.session);
      setPlayers(d.players);
      setPhase('champion');
      setJonnyMood('winner');
      AudioManager.stopLoop(true);
      void AudioManager.playStinger('global', 'podium_theme');
    } finally { setLoading(false); }
  };

  const joinUrl = session ? `${window.location.origin}/home/join?s=${session.joinCode}` : '';
  const allDone = gamesPlayed.length >= visibleGames.length;

  // ── Post-game overlay: 2 s (last game → champion) or 5 s (→ board) ──────────
  useEffect(() => {
    if (!postGame) return;
    const sid = session?.id;
    const done = gamesPlayed.length >= visibleGames.length;
    const totalSeconds = done ? 2 : 5;
    setPostGameCountdown(totalSeconds);
    let c = totalSeconds;
    const countdown = setInterval(() => {
      c -= 1;
      setPostGameCountdown(c);
      if (c <= 0) clearInterval(countdown);
    }, 1000);
    const timer = setTimeout(async () => {
      clearInterval(countdown);
      setPostGame(null);
      if (done && sid) {
        setLoading(true);
        try {
          const r = await fetch(`/api/home/sessions/${sid}/champion`, { method: 'POST' });
          const d = await r.json() as { session: HomeSession; players: HomePlayer[] };
          setSession(d.session);
          setPlayers(d.players);
          setPhase('champion');
          setJonnyMood('winner');
          AudioManager.stopLoop(true);
          void AudioManager.playStinger('global', 'podium_theme');
        } finally { setLoading(false); }
      } else {
        setPhase('board');
        setJonnyMood('excited');
        setJonnyMsg('Scegli il gioco!');
        AudioManager.stopLoop(true);
        void AudioManager.playLoop('hub', 'lobby_loop');
      }
    }, totalSeconds * 1000);
    return () => { clearTimeout(timer); clearInterval(countdown); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postGame]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden"
      style={{ background: 'linear-gradient(-45deg,#07061a,#1d0545,#0a1845,#1a0800,#07061a)', backgroundSize: '500% 500%', animation: 'hgAurora 18s ease infinite' }}>

      <style>{`
        @keyframes hgAurora { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes hgPulse { 0%,100%{box-shadow:0 0 24px #F5B64255,0 0 60px #F5B64218} 50%{box-shadow:0 0 48px #F5B642aa,0 0 100px #F5B64235} }
        @keyframes hgFloat { 0%,100%{transform:translateY(0px) rotate(-1deg)} 50%{transform:translateY(-14px) rotate(1deg)} }
        @keyframes hgBlink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes hgSlideUp { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
        .hg-pulse{animation:hgPulse 2.8s ease infinite}
        .hg-float{animation:hgFloat 4s ease-in-out infinite}
        .hg-blink{animation:hgBlink 1.4s ease infinite}
      `}</style>

      {/* Hex overlay */}
      <div className="pointer-events-none absolute inset-0 z-0"
        style={{ opacity:0.04, backgroundImage:`url("data:image/svg+xml,%3Csvg width='56' height='48' viewBox='0 0 56 48' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M28 2L54 16L54 44L28 58L2 44L2 16Z' fill='none' stroke='white' stroke-width='1'/%3E%3C/svg%3E")`, backgroundSize:'56px 48px' }} />

      {/* Stars */}
      <div className="pointer-events-none absolute inset-0 z-0">
        {Array.from({length:50}).map((_,i)=>{const cs=['#fff','#F5B642','#A855F7','#22D3EE','#F472B6','#34D399'];return<div key={i} className="absolute rounded-full" style={{left:`${(i*37+11)%100}%`,top:`${(i*53+7)%100}%`,width:1.5+(i%3),height:1.5+(i%3),background:cs[i%cs.length],opacity:0.10+(i%5)*0.05}}/>;})}
      </div>

      {/* Dev build stamp — dev only */}
      {import.meta.env.DEV && (
        <div className="pointer-events-none absolute bottom-1 left-2 z-50 text-[9px] font-mono opacity-40" style={{color:'#F5B642'}}>
          BUILD: {BUILD_STAMP}
        </div>
      )}

      {/* Audio unlock / warning */}
      {!audioUnlocked && (
        <button onClick={() => unlockAudio()}
          className="hg-pulse absolute bottom-5 right-5 z-50 flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-black"
          style={{background:'rgba(245,182,66,0.15)',border:'1px solid rgba(245,182,66,0.6)',color:'#F5B642',backdropFilter:'blur(10px)'}}>
          🎵 Attiva audio
        </button>
      )}
      {audioUnlocked && audioWarning && (
        <div className="absolute bottom-5 right-5 z-50 flex items-center gap-3 rounded-2xl px-4 py-3 text-xs font-bold"
          style={{background:'rgba(245,182,66,0.10)',border:'1px solid rgba(245,182,66,0.35)',color:'rgba(245,182,66,0.75)',backdropFilter:'blur(10px)',maxWidth:280}}>
          <span className="shrink-0 text-base">🔇</span>
          <span>Nessun file audio caricato — carica MP3 da <span className="underline">/admin</span> per attivare la musica</span>
          <button onClick={() => setAudioWarning(false)} className="ml-1 shrink-0 opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      <AnimatePresence mode="wait">

        {/* ══ BOARD — Wheel Arena ══ */}
        {phase === 'board' && session && (
          <motion.div key="board" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="relative z-10 flex-1 overflow-hidden"
            style={{display:'grid',gridTemplateColumns:'22% 1fr 26%',gridTemplateRows:'auto 1fr auto'}}>

            {/* TOP-LEFT: logo + status */}
            <div className="flex items-center pl-5 pt-3 pb-1 z-20 gap-3">
              <img src="/jonny-master-nobg.png" alt="Jonny" className="h-10 w-auto object-contain"
                style={{filter:'drop-shadow(0 0 18px #F5B64265)'}}/>
              <div>
                <img src="/jonny-world-logo-nobg.png" alt="Jonny's World" className="h-9 w-auto object-contain"
                  style={{filter:'drop-shadow(0 0 12px rgba(245,182,66,0.65))'}}/>
                <div className="text-[10px] font-bold tracking-widest uppercase" style={{color:'rgba(168,85,247,0.75)'}}>
                  {gamesPlayed.length}/{visibleGames.length} completati
                </div>
              </div>
            </div>

            {/* TOP-CENTER: Jonny message */}
            <div className="flex items-center justify-center pt-2 pb-0 z-20">
              <div className="flex items-center gap-2 rounded-2xl px-4 py-1.5"
                style={{background:'rgba(10,2,28,0.7)',border:'1px solid rgba(245,182,66,0.2)',backdropFilter:'blur(12px)'}}>
                <JonnyAvatar mood={jonnyMood} size={28}/>
                <div className="text-sm italic font-bold text-white/50 max-w-[260px] truncate">"{jonnyMsg}"</div>
              </div>
            </div>

            {/* TOP-RIGHT: player count + actions */}
            <div className="flex items-center justify-end pr-4 pt-2 pb-1 gap-2 z-20 flex-wrap">
              <div className="rounded-xl px-3 py-1.5 text-sm font-black"
                style={{background:'rgba(245,182,66,0.15)',border:'1px solid rgba(245,182,66,0.35)',color:'#F5B642'}}>
                <Users className="inline h-4 w-4 mr-1"/>{players.length}
              </div>
              {gamesPlayed.length > 0 && players.length > 0 && (
                <button disabled={loading}
                  onClick={async()=>{
                    if(window.confirm('Vuoi chiudere la partita e mostrare la classifica con i punteggi attuali?')){
                      await goToChampion();
                    }
                  }}
                  className="flex items-center gap-2 rounded-2xl px-3 py-1.5 text-xs font-black disabled:opacity-40"
                  style={{background:'rgba(245,182,66,0.12)',border:'1px solid rgba(245,182,66,0.35)',color:'rgba(245,182,66,0.9)'}}>
                  <Trophy className="h-3.5 w-3.5"/> Chiudi &amp; classifica
                </button>
              )}
            </div>

            {/* LEFT: live ranking */}
            <div className="flex flex-col pl-4 pr-2 pb-2 z-20">
              <HomeArenaClassifica players={players}/>
            </div>

            {/* CENTER: wheel */}
            <div className="flex flex-col items-center justify-center relative z-10 py-1">
              <motion.div className="relative"
                style={{width:'min(44vw,60vh)',height:'min(44vw,60vh)'}}
                animate={{y:[0,-6,0]}}
                transition={{duration:4,repeat:Infinity,ease:'easeInOut' as const}}>
                <HomeGameWheel
                  selected={wheelSelectedGame}
                  onSelect={g => setWheelSelected(g.slug)}
                  spinning={spinning}
                  games={wheelGames}/>
                <div className="absolute pointer-events-none"
                  style={{bottom:'-12%',left:'15%',right:'15%',height:20,background:'rgba(0,0,0,0.6)',borderRadius:'50%',filter:'blur(14px)'}}/>
              </motion.div>
            </div>

            {/* RIGHT: selected game card */}
            <div className="flex flex-col pr-3 pl-1 pb-2 z-20 justify-end">
              <HomeWheelGameCard
                game={wheelSelectedGame}
                onPlay={() => selectGame(wheelSelectedGame.slug)}
                loading={!!selectingGame}/>
            </div>

            {/* Jonny — enlarged scenic presence */}
            <div className="absolute pointer-events-none select-none"
              style={{right:'0%',bottom:'6vh',zIndex:12,width:'30%'}}>
              <div style={{position:'absolute',bottom:-4,left:'8%',right:'8%',height:28,background:'rgba(0,0,0,0.65)',borderRadius:'50%',filter:'blur(20px)'}}/>
              <div style={{position:'absolute',bottom:2,left:'5%',right:'5%',height:12,background:'linear-gradient(90deg,transparent,rgba(168,85,247,0.8),rgba(245,182,66,0.6),rgba(168,85,247,0.8),transparent)',borderRadius:'50%',filter:'blur(8px)'}}/>
              <div style={{position:'absolute',bottom:0,left:'-20%',right:'-10%',top:'5%',background:`radial-gradient(ellipse 65% 75% at 52% 65%,${wheelSelectedGame.glow}30 0%,rgba(168,85,247,0.15) 55%,transparent 80%)`,pointerEvents:'none'}}/>
              <motion.img src="/jonny-master-nobg.png" alt="Jonny host"
                style={{height:'min(74vh,600px)',display:'block',objectFit:'contain',width:'100%',filter:`drop-shadow(0 0 65px ${wheelSelectedGame.glow}dd) drop-shadow(-6px 0 28px rgba(168,85,247,0.6)) drop-shadow(0 12px 40px rgba(0,0,0,0.75))`}}
                animate={{y:[0,-10,0]}}
                transition={{duration:3.5,repeat:Infinity,ease:'easeInOut' as const}}/>
            </div>

            {/* BOTTOM-LEFT: spacer */}
            <div className="z-20"/>

            {/* BOTTOM-CENTER: arcade buttons */}
            <div className="flex items-center justify-center gap-4 pb-3 z-20">
              {/* Spin */}
              <motion.button onClick={handleWheelSpin} disabled={spinning || allDone}
                className="relative overflow-hidden font-black rounded-full flex items-center justify-center gap-3 text-white disabled:opacity-40"
                style={{background:'linear-gradient(135deg,#5B21B6 0%,#7C3AED 100%)',border:'3px solid #A855F7',boxShadow:'0 0 30px #7C3AED66,0 6px 0 rgba(0,0,0,0.5)',padding:'0 2.2vw',height:'7vh',fontSize:'clamp(0.8rem,1.4vw,1.1rem)',minWidth:'16vw'}}
                whileHover={{scale:1.05}} whileTap={{scale:0.97,y:3}}>
                <div className="absolute inset-0 opacity-25 pointer-events-none rounded-full" style={{background:'radial-gradient(ellipse 80% 40% at 50% 5%,rgba(255,255,255,0.7),transparent)'}}/>
                <span className="relative z-10 flex items-center gap-2"><Zap className="h-5 w-5" style={{fill:'white'}}/> GIRA LA RUOTA</span>
              </motion.button>

              {/* Play selected / Classifica finale */}
              {allDone ? (
                <motion.button onClick={goToChampion} disabled={loading}
                  className="relative overflow-hidden font-black rounded-full flex items-center justify-center gap-3 text-white disabled:opacity-40"
                  style={{background:'linear-gradient(135deg,#92400E 0%,#D97706 100%)',border:'3px solid #F5B642',boxShadow:'0 0 30px #F5B64266,0 6px 0 rgba(0,0,0,0.5)',padding:'0 2.2vw',height:'7vh',fontSize:'clamp(0.8rem,1.4vw,1.1rem)',minWidth:'16vw'}}
                  whileHover={{scale:1.05}} whileTap={{scale:0.97,y:3}}>
                  <div className="absolute inset-0 opacity-25 pointer-events-none rounded-full" style={{background:'radial-gradient(ellipse 80% 40% at 50% 5%,rgba(255,255,255,0.7),transparent)'}}/>
                  <span className="relative z-10 flex items-center gap-2"><Trophy className="h-5 w-5" style={{fill:'white'}}/> CLASSIFICA FINALE</span>
                </motion.button>
              ) : (
                <motion.button
                  onClick={() => { if (!wheelSelectedGame.done) void selectGame(wheelSelectedGame.slug); }}
                  disabled={!!selectingGame || wheelSelectedGame.done || loading}
                  className="relative overflow-hidden font-black rounded-full flex items-center justify-center gap-3 text-white disabled:opacity-40"
                  style={{background:`linear-gradient(135deg,${wheelSelectedGame.color} 0%,${wheelSelectedGame.glow} 100%)`,border:`3px solid ${wheelSelectedGame.color}`,boxShadow:`0 0 30px ${wheelSelectedGame.color}66,0 6px 0 rgba(0,0,0,0.5)`,padding:'0 2.2vw',height:'7vh',fontSize:'clamp(0.8rem,1.4vw,1.1rem)',minWidth:'16vw'}}
                  whileHover={{scale:1.05}} whileTap={{scale:0.97,y:3}}>
                  <div className="absolute inset-0 opacity-25 pointer-events-none rounded-full" style={{background:'radial-gradient(ellipse 80% 40% at 50% 5%,rgba(255,255,255,0.7),transparent)'}}/>
                  <span className="relative z-10 flex items-center gap-2">
                    {selectingGame === wheelSelectedGame.slug
                      ? <Loader2 className="h-5 w-5 animate-spin"/>
                      : <Play className="h-5 w-5" style={{fill:'white'}}/>}
                    {wheelSelectedGame.done ? '✓ COMPLETATO' : 'GIOCA ORA'}
                  </span>
                </motion.button>
              )}
            </div>

            {/* BOTTOM-RIGHT: spacer */}
            <div className="z-20"/>

            {/* ── Post-spin game confirmation modal ── */}
            <AnimatePresence>
              {postSpinModal && !wheelSelectedGame.done && (
                <motion.div key="postspin"
                  initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                  className="absolute inset-0 z-50 flex items-center justify-center"
                  style={{background:'rgba(4,0,18,0.82)',backdropFilter:'blur(18px)'}}>
                  <motion.div
                    initial={{scale:0.85,y:40,opacity:0}} animate={{scale:1,y:0,opacity:1}}
                    exit={{scale:0.9,y:-20,opacity:0}}
                    transition={{type:'spring',damping:22,stiffness:300}}
                    className="relative rounded-3xl overflow-hidden max-w-sm w-full mx-6"
                    style={{background:'linear-gradient(160deg,rgba(18,6,44,0.98),rgba(10,2,28,0.98))',border:`2px solid ${wheelSelectedGame.color}80`,boxShadow:`0 0 80px ${wheelSelectedGame.glow}55, 0 30px 80px rgba(0,0,0,0.8)`}}>
                    {/* Top accent bar */}
                    <div style={{height:5,background:`linear-gradient(90deg,transparent,${wheelSelectedGame.color},${wheelSelectedGame.glow},${wheelSelectedGame.color},transparent)`}}/>
                    <div className="px-8 py-7 flex flex-col items-center gap-5 text-center">
                      {/* Game emoji */}
                      <div className="text-6xl leading-none" style={{filter:`drop-shadow(0 0 24px ${wheelSelectedGame.glow})`}}>
                        {visibleGames.find(g=>g.slug===wheelSelectedGame.slug)?.emoji ?? '🎮'}
                      </div>
                      {/* Title */}
                      <div>
                        <div className="text-[11px] font-black tracking-widest uppercase mb-1.5"
                          style={{color:wheelSelectedGame.color}}>La ruota ha scelto</div>
                        <div className="text-3xl font-black text-white leading-tight"
                          style={{textShadow:`0 0 30px ${wheelSelectedGame.glow}88`}}>
                          {wheelSelectedGame.label}
                        </div>
                      </div>
                      {/* Description */}
                      {visibleGames.find(g=>g.slug===wheelSelectedGame.slug)?.description && (
                        <div className="text-sm text-white/50 leading-relaxed">
                          {visibleGames.find(g=>g.slug===wheelSelectedGame.slug)?.description}
                        </div>
                      )}
                      {/* CTA */}
                      <motion.button
                        onClick={() => { setPostSpinModal(false); void selectGame(wheelSelectedGame.slug); }}
                        disabled={!!selectingGame}
                        className="w-full rounded-2xl py-4 font-black text-lg text-white disabled:opacity-50"
                        style={{background:`linear-gradient(135deg,${wheelSelectedGame.color},${wheelSelectedGame.glow})`,boxShadow:`0 0 40px ${wheelSelectedGame.color}66,0 6px 0 rgba(0,0,0,0.4)`}}
                        whileHover={{scale:1.03}} whileTap={{scale:0.97}}>
                        {selectingGame ? <Loader2 className="inline h-5 w-5 animate-spin mr-2"/> : <Play className="inline h-5 w-5 mr-2" style={{fill:'white'}}/>}
                        Avvia gioco
                      </motion.button>
                      {/* Dismiss */}
                      <button onClick={() => setPostSpinModal(false)}
                        className="text-xs text-white/25 hover:text-white/50 transition-colors">
                        ← Torna alla ruota
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ══ PLAYING ══ */}
        {phase === 'playing' && session && (
          <motion.div key="playing" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="relative z-10 flex flex-1 flex-col">

            {/* Top bar */}
            <div className="flex items-center justify-between px-6 py-3"
              style={{background:'rgba(0,0,0,0.5)',backdropFilter:'blur(14px)',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
              <div className="flex items-center gap-3">
                <JonnyAvatar mood={jonnyMood} size={40}/>
                <div>
                  <div className="text-xs uppercase tracking-widest text-white/30">
                    {ALL_GAMES.find(g=>g.slug===session.gameSlug)?.name ?? session.gameSlug}
                  </div>
                  <div className="text-xl font-black text-white">
                    {session.currentRound+1}<span className="text-lg text-white/30"> / {session.totalRounds}</span>
                  </div>
                </div>
              </div>

              {/* Timer */}
              <div className="rounded-2xl px-7 py-2 text-center transition-all"
                style={timeLeft!==null&&timeLeft<=5
                  ? {background:'rgba(239,68,68,0.22)',border:'2px solid rgba(239,68,68,0.65)',boxShadow:'0 0 35px rgba(239,68,68,0.35)'}
                  : {background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.14)'}}>
                <div className="flex items-center gap-2">
                  <Timer className="h-4 w-4" style={{color:timeLeft!==null&&timeLeft<=5?'#F87171':'rgba(255,255,255,0.4)'}}/>
                  <div className="text-4xl font-black tabular-nums"
                    style={{color:timeLeft!==null&&timeLeft<=5?'#F87171':'#fff'}}>
                    {timeLeft ?? '—'}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={nextRound}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-2xl px-5 py-2 text-sm font-bold disabled:opacity-40"
                  style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.14)',color:'rgba(255,255,255,0.65)'}}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <SkipForward className="h-4 w-4"/>} Avanti
                </button>
                <button onClick={endGame} disabled={loading}
                  className="flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-bold disabled:opacity-40"
                  style={{background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.35)',color:'rgba(239,68,68,0.7)'}}>
                  <X className="h-4 w-4"/> Fine gioco
                </button>
                <button
                  disabled={loading || players.length === 0}
                  onClick={async () => {
                    if (window.confirm('Vuoi chiudere la partita e mostrare la classifica con i punteggi attuali?')) {
                      await goToChampion();
                    }
                  }}
                  className="flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-bold disabled:opacity-40"
                  style={{background:'rgba(245,182,66,0.12)',border:'1px solid rgba(245,182,66,0.35)',color:'rgba(245,182,66,0.8)'}}>
                  <Trophy className="h-4 w-4"/> Chiudi &amp; classifica
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex flex-1 items-center justify-center overflow-auto px-6 py-3">
              <RoundBoard key={session.currentRound} session={session} revealed={revealed}
                onReveal={() => { setRevealed(true); if(timerRef.current) clearInterval(timerRef.current); setJonnyMood('correct'); }}
                onNext={nextRound} players={players} balloEnergies={balloEnergies} balloCurrent={balloCurrent} balloResult={balloResult}
                balloVotes={balloVotes}
                onBalloReset={async () => {
                  if (!session?.id) return;
                  try {
                    await fetch(`/api/home/sessions/${session.id}/ballo-reset-booking`, { method: 'POST' });
                    setBalloVotes({});
                    setBalloEnergies({});
                    setBalloCurrent({});
                    setBalloResult(null);
                  } catch { /* server broadcasts state update */ }
                }}
                onStageNext={async () => {
                  if (!session?.id) return;
                  await fetch(`/api/home/sessions/${session.id}/ballo-stage-next`, { method: 'POST', credentials: 'include' });
                  setBalloVotes({});
                  setBalloEnergies({});
                  setBalloCurrent({});
                  setBalloResult(null);
                  balloRoundEndedRef.current = false;
                }}
                onEndBallo={endGame}
                saraMusicaWinner={saraMusicaWinner}
                balloSensitivity={balloSensitivity} onSensitivity={handleBalloSensitivity} sensorReadyMap={sensorReadyMap}
                tabooAlarm={tabooAlarm}
                onScore={async (pid,pts) => {
                  // Optimistic update — score appears immediately in bar + partial leaderboard
                  setPlayers(prev => prev.map(p => p.id === pid ? { ...p, score: pts } : p));
                  await fetch(`/api/home/sessions/${session.id}/score`, {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({ playerId:pid, points:pts }),
                  });
                  // Socket broadcastState reconciles with authoritative server state
                }}/>
            </div>

            {/* Score bar */}
            <div className="flex shrink-0 items-center gap-3 overflow-x-auto px-6 py-3"
              style={{background:'rgba(0,0,0,0.55)',backdropFilter:'blur(14px)',borderTop:'1px solid rgba(255,255,255,0.06)'}}>
              {[...players].sort((a,b)=>b.score-a.score).map((p,i)=>(
                <div key={p.id} className="flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2"
                  style={{background:`linear-gradient(135deg,${AVATAR_RING[i%AVATAR_RING.length]}22,transparent)`,border:`1px solid ${AVATAR_RING[i%AVATAR_RING.length]}45`}}>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black text-black"
                    style={{background:`linear-gradient(135deg,${AVATAR_RING[i%AVATAR_RING.length]},${AVATAR_RING[(i+1)%AVATAR_RING.length]})`}}>
                    {p.nickname.slice(0,2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-black text-white">{p.nickname}</div>
                    <div className="text-xs font-black" style={{color:'#F5B642'}}>{p.score}pt</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ══ CHAMPION ══ */}
        {phase === 'champion' && (
          <motion.div key="champion" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 px-8 text-center">

            <motion.div initial={{scale:0,rotate:-20}} animate={{scale:1,rotate:0}}
              transition={{type:'spring',stiffness:180}}>
              <img src="/jonny-world-logo-nobg.png" alt="Jonny's World" className="mx-auto mb-2 h-36 w-auto object-contain"
                style={{filter:'drop-shadow(0 0 60px rgba(245,182,66,0.85))'}}/>
            </motion.div>

            <div>
              <h2 className="text-display text-7xl font-black"
                style={{background:'linear-gradient(135deg,#fff,#F5B642)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',filter:'drop-shadow(0 0 40px #F5B64270)'}}>
                Champion!
              </h2>
              <div className="mt-2 text-xl text-white/45">🏆 Classifica Suprema di JONNY'S WORLD 🏆</div>
            </div>

            <div className="flex w-full max-w-xl flex-col gap-3">
              {[...players].sort((a,b)=>b.score-a.score).map((p,i)=>{
                const BG=['linear-gradient(135deg,#F5B642,#FF8C00)','linear-gradient(135deg,#94A3B8,#64748B)','linear-gradient(135deg,#CD7F32,#8B4513)'];
                const GLOW=['rgba(245,182,66,0.35)','rgba(148,163,184,0.22)','rgba(205,127,50,0.22)'];
                const MEDALS=['🥇','🥈','🥉'];
                return (
                  <motion.div key={p.id}
                    initial={{x:-80,opacity:0}} animate={{x:0,opacity:1}}
                    transition={{delay:i*0.13,type:'spring',stiffness:120}}
                    className="flex items-center gap-4 rounded-2xl px-5 py-4"
                    style={i<3?{background:BG[i],boxShadow:`0 0 40px ${GLOW[i]}`}:{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)'}}>
                    <div className="text-4xl w-12 text-center">{MEDALS[i]??`#${i+1}`}</div>
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-lg font-black"
                      style={i<3?{background:'rgba(0,0,0,0.25)',color:'#fff'}:{background:AVATAR_RING[i%AVATAR_RING.length],color:'#000'}}>
                      {p.nickname.slice(0,2).toUpperCase()}
                    </div>
                    <div className="flex-1 text-left">
                      <div className={`text-xl font-black ${i===0?'text-black':'text-white'}`}>{p.nickname}</div>
                    </div>
                    <div className={`text-3xl font-black ${i===0?'text-black':'text-yellow-400'}`}>{p.score} pt</div>
                  </motion.div>
                );
              })}
            </div>

            {/* Games summary */}
            <div className="flex gap-2 flex-wrap justify-center">
              {ALL_GAMES.map(g => (
                <div key={g.slug} className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black"
                  style={gamesPlayed.includes(g.slug)
                    ? {background:`${g.color}25`,border:`1px solid ${g.color}55`,color:g.color}
                    : {background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'rgba(255,255,255,0.3)'}}>
                  {gamesPlayed.includes(g.slug) && <Check className="h-3 w-3"/>}
                  {g.emoji} {g.name}
                </div>
              ))}
            </div>

            <div className="flex gap-4">
              <motion.button whileHover={{scale:1.05}} whileTap={{scale:0.96}}
                onClick={() => navigate('/home-setup')}
                className="flex items-center gap-3 rounded-2xl px-8 py-4 font-black text-black"
                style={{background:'linear-gradient(135deg,#F5B642,#FF8C00)',boxShadow:'0 0 45px #F5B64255'}}>
                <Sparkles className="h-5 w-5"/> Nuova Serata
              </motion.button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>

      {/* ══ INTRO VIDEO ══ */}
      {introVideo && (
        <motion.div
          key="intro-video"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black">

          {/* Loading state — shown until onLoadedMetadata fires */}
          {videoLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 pointer-events-none">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-[#F5B642]"/>
              <span className="text-sm font-bold tracking-widest text-white/50 uppercase">
                Prepariamo lo spettacolo…
              </span>
            </div>
          )}

          <video
            key={introVideo.url}
            src={introVideo.url}
            autoPlay
            playsInline
            className={`h-full w-full object-contain transition-opacity duration-300 ${videoLoading ? 'opacity-0' : 'opacity-100'}`}
            onLoadedMetadata={(e) => {
              const dur = (e.target as HTMLVideoElement).duration;
              // Metadata validation: invalid duration → skip intro immediately
              if (!isFinite(dur) || isNaN(dur) || dur === 0) {
                safeStartGame(introVideo);
                return;
              }
              setVideoLoading(false);
            }}
            onEnded={() => safeStartGame(introVideo)}
            onError={() => safeStartGame(introVideo)}
            onStalled={() => {
              // Clear any existing stall timer before setting a new one
              if (introStallTimerRef.current) clearTimeout(introStallTimerRef.current);
              introStallTimerRef.current = setTimeout(() => safeStartGame(introVideo), 3000);
            }}
            onWaiting={() => {
              if (!introStallTimerRef.current) {
                introStallTimerRef.current = setTimeout(() => safeStartGame(introVideo), 3000);
              }
            }}
            onPlaying={() => {
              if (introStallTimerRef.current) { clearTimeout(introStallTimerRef.current); introStallTimerRef.current = null; }
            }}
            onCanPlay={() => {
              if (introStallTimerRef.current) { clearTimeout(introStallTimerRef.current); introStallTimerRef.current = null; }
            }}
          />

          <button
            onClick={() => safeStartGame(introVideo)}
            className="absolute bottom-8 right-8 rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-black text-white/60 backdrop-blur-sm transition-colors hover:text-white/90">
            Salta ▶
          </button>
        </motion.div>
      )}

      {/* ══ POST-GAME LEADERBOARD OVERLAY ══ */}
      <AnimatePresence>
        {postGame && (
          <motion.div
            key="postGame"
            initial={{opacity:0, scale:0.92}}
            animate={{opacity:1, scale:1}}
            exit={{opacity:0, scale:0.92}}
            transition={{type:'spring', stiffness:220, damping:28}}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{background:'rgba(4,2,20,0.9)', backdropFilter:'blur(22px)'}}>

            <div className="flex w-full max-w-lg flex-col items-center gap-6 px-8 text-center">

              {/* Game completed header */}
              <motion.div initial={{y:-20,opacity:0}} animate={{y:0,opacity:1}} transition={{delay:0.1}}>
                <div className="text-5xl mb-2">
                  {ALL_GAMES.find(g => g.slug === postGame.gameSlug)?.emoji ?? '🎮'}
                </div>
                <div className="text-xl font-black tracking-wide text-white">
                  {ALL_GAMES.find(g => g.slug === postGame.gameSlug)?.name ?? postGame.gameSlug}
                </div>
                <div className="mt-1 text-xs font-black tracking-[0.3em] uppercase"
                  style={{color:'#F5B642'}}>completato!</div>
              </motion.div>

              <div className="text-[10px] font-black tracking-[0.35em] uppercase text-white/30">
                — Classifica Parziale —
              </div>

              {/* Ranking rows */}
              <div className="flex w-full flex-col gap-2">
                {[...postGame.players].sort((a,b) => b.score - a.score).map((p, i) => (
                  <motion.div
                    key={p.id}
                    initial={{x:-30,opacity:0}}
                    animate={{x:0,opacity:1}}
                    transition={{delay: 0.15 + i * 0.07}}
                    className="flex items-center gap-4 rounded-2xl px-5 py-3"
                    style={{
                      background: i === 0
                        ? 'linear-gradient(135deg,rgba(245,182,66,0.22),rgba(245,182,66,0.06))'
                        : i === 1
                        ? 'linear-gradient(135deg,rgba(203,213,225,0.14),rgba(203,213,225,0.04))'
                        : i === 2
                        ? 'linear-gradient(135deg,rgba(205,127,50,0.14),rgba(205,127,50,0.04))'
                        : 'rgba(255,255,255,0.04)',
                      border: i === 0
                        ? '1px solid rgba(245,182,66,0.38)'
                        : '1px solid rgba(255,255,255,0.08)',
                    }}>
                    <div className="w-8 text-center text-2xl font-black">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-base text-white/30">{i+1}</span>}
                    </div>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black text-black"
                      style={{background:`linear-gradient(135deg,${AVATAR_RING[i%AVATAR_RING.length]},${AVATAR_RING[(i+1)%AVATAR_RING.length]})`}}>
                      {p.nickname.slice(0,2).toUpperCase()}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="font-black text-white">{p.nickname}</div>
                    </div>
                    <div className="text-xl font-black tabular-nums" style={{color:'#F5B642'}}>{p.score}<span className="text-xs text-white/40 ml-1">pt</span></div>
                  </motion.div>
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center gap-2 text-xs text-white/25">
                <Loader2 className="h-3 w-3 animate-spin"/>
                {allDone
                  ? `Classifica finale in ${postGameCountdown}…`
                  : `Torno alla lavagna in ${postGameCountdown}…`}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── RoundBoard ─────────────────────────────────────────────────────────────────

function RoundBoard({ session, revealed, onReveal, onNext, players, onScore, balloEnergies, balloCurrent, balloResult, balloVotes, onBalloReset, onStageNext, onEndBallo, saraMusicaWinner, balloSensitivity, onSensitivity, sensorReadyMap, tabooAlarm }: {
  session: HomeSession;
  revealed: boolean;
  onReveal: () => void;
  onNext?: () => void;
  players: HomePlayer[];
  onScore: (playerId: string, points: number) => Promise<void>;
  balloEnergies?: Record<string, number>;
  balloCurrent?: Record<string, number>;
  balloResult?: { winnerId: string | null; winnerNickname: string | null; points: number; teamResult?: { winnerTeamId: string; winnerTeamPlayers: { id: string; nickname: string }[]; perPlayer: number; teamScores: { teamId: string; players: { id: string; nickname: string }[]; totalEnergy: number }[] } | null } | null;
  balloVotes?: Record<string, { total: number; count: number }>;
  onBalloReset?: () => void;
  onStageNext?: () => Promise<void>;
  onEndBallo?: () => void;
  saraMusicaWinner?: { nickname: string; points: number; round: number } | null;
  balloSensitivity?: number;
  onSensitivity?: (s: number) => void;
  sensorReadyMap?: Record<string, boolean>;
  tabooAlarm?: TabooAlarmEvent | null;
}) {
  const p = session.roundPayload;
  const mode = String(p.mode ?? 'home-quiz');

  if (mode === 'home-flow')       return <GameFlowEngine session={session} players={players} sensorReadyMap={sensorReadyMap}/>;
  if (mode === 'home-quiz')       return <QuizBoard payload={p} revealed={revealed} onReveal={onReveal}/>;
  if (mode === 'home-ballo')      return <BalloBoard session={session} payload={p} players={players} balloEnergies={balloEnergies ?? {}} balloCurrent={balloCurrent ?? {}} balloResult={balloResult ?? null} balloVotes={balloVotes ?? {}} onReset={onBalloReset} onStageNext={onStageNext} onEndBallo={onEndBallo} sensitivity={balloSensitivity ?? 1} onSensitivity={onSensitivity}/>;
  if (mode === 'home-percorso')   return <PercorsoBoard payload={p} onReveal={onReveal} players={players} onScore={onScore}/>;
  if (mode === 'home-coppie')     return <CoppieBoard payload={p} onNext={onNext}/>;
  if (mode === 'home-saramusica') return <SaraMusicaBoard payload={p} revealed={revealed} onReveal={onReveal} winner={saraMusicaWinner ?? null}/>;
  if (mode === 'home-adult')      return <AdultOnlyBoard payload={p} revealed={revealed} onReveal={onReveal} players={players} onScore={onScore}/>;
  if (mode === 'home-wordback')   return <WordBackBoard payload={p} players={players} onScore={onScore} onReveal={onReveal} tabooAlarm={tabooAlarm ?? null} sessionId={session.id}/>;
  if (mode === 'home-karaoke')    return <KaraokeBoard payload={p} onReveal={onReveal} players={players} onScore={onScore}/>;
  if (mode === 'home-freestyle')  return <FreestyleBoard payload={p} onReveal={onReveal} players={players} onScore={onScore}/>;
  return <div className="text-white/40 text-2xl">Caricamento gioco…</div>;
}

// ── QuizBoard ─────────────────────────────────────────────────────────────────

function QuizBoard({ payload, revealed, onReveal }: { payload: Record<string,unknown>; revealed: boolean; onReveal: () => void }) {
  const answers = (payload.answers as string[]) ?? [];
  const correct = Number(payload.correctIndex ?? 0);
  const points = Number(payload.points ?? 200);
  const LETTERS = ['A','B','C','D'];
  const ANS_COLORS = ['#3B82F6','#EC4899','#EAB308','#10B981'];
  const ANS_GLOW   = ['rgba(59,130,246,0.55)','rgba(236,72,153,0.55)','rgba(234,179,8,0.55)','rgba(16,185,129,0.55)'];

  return (
    <div className="flex w-full max-w-3xl flex-col gap-5">
      <motion.div key={String(payload.roundIndex)} initial={{y:24,opacity:0}} animate={{y:0,opacity:1}}
        className="rounded-3xl p-8 text-center"
        style={{background:'linear-gradient(135deg,rgba(168,85,247,0.22),rgba(245,182,66,0.08))',border:'1px solid rgba(168,85,247,0.45)',backdropFilter:'blur(14px)'}}>
        <div className="mb-2 text-xs font-black uppercase tracking-widest" style={{color:'rgba(245,182,66,0.8)'}}>
          {String(payload.category ?? 'Quiz')}
        </div>
        <div className="text-display text-2xl font-black leading-snug text-white">{String(payload.question ?? '')}</div>
        <div className="mt-4">
          <span className="rounded-full px-4 py-1.5 text-sm font-black"
            style={{background:'rgba(245,182,66,0.18)',color:'#F5B642',border:'1px solid rgba(245,182,66,0.4)'}}>
            {points} punti
          </span>
        </div>
      </motion.div>
      <div className="grid grid-cols-2 gap-4">
        {answers.map((ans,i) => {
          const isCorrect = i===correct;
          let bg: string, border: string, shadow: string, textCol: string;
          if (revealed) {
            if (isCorrect) { bg='linear-gradient(135deg,#22c55e,#16a34a)'; border='2px solid #4ade80'; shadow='0 0 45px rgba(34,197,94,0.55)'; textCol='#fff'; }
            else { bg='rgba(255,255,255,0.04)'; border='2px solid rgba(255,255,255,0.08)'; shadow='none'; textCol='rgba(255,255,255,0.3)'; }
          } else {
            bg=`linear-gradient(135deg,${ANS_COLORS[i]},${ANS_COLORS[i]}cc)`;
            border=`2px solid ${ANS_COLORS[i]}`; shadow=`0 0 35px ${ANS_GLOW[i]}`; textCol='#fff';
          }
          return (
            <motion.div key={i} initial={{scale:0.88,opacity:0}} animate={{scale:1,opacity:1}} transition={{delay:i*0.07}}
              className="flex items-center gap-4 rounded-2xl px-6 py-5 text-left"
              style={{background:bg,border,boxShadow:shadow}}>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-black"
                style={{background:'rgba(0,0,0,0.3)',color:revealed&&isCorrect?'#4ade80':textCol}}>
                {LETTERS[i]}
              </div>
              <div className="flex-1 text-base font-black leading-snug" style={{color:textCol}}>{ans}</div>
              {revealed && isCorrect && <Check className="h-6 w-6 shrink-0 text-white"/>}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ── BalloBoard — 3-stage tournament TV view ────────────────────────────────────

type BurstItem = { key: number; label: string };
type BalloTeamDef = { teamId: string; players: { id: string; nickname: string; avatarColor: string }[]; pendingRequests: { id: string; nickname: string; avatarColor: string }[] };

function BalloBoard({ session, payload, players, balloEnergies, balloCurrent, balloResult, balloVotes, onReset, onStageNext, onEndBallo, sensitivity = 1, onSensitivity }: {
  session: HomeSession;
  payload: Record<string,unknown>;
  players: HomePlayer[];
  balloEnergies: Record<string, number>;
  balloCurrent: Record<string, number>;
  balloResult: { winnerId: string | null; winnerNickname: string | null; points: number; teamResult?: { winnerTeamId: string; winnerTeamPlayers: { id: string; nickname: string }[]; perPlayer: number; teamScores: { teamId: string; players: { id: string; nickname: string }[]; totalEnergy: number }[] } | null } | null;
  balloVotes: Record<string, { total: number; count: number }>;
  onReset?: () => void;
  onStageNext?: () => Promise<void>;
  onEndBallo?: () => void;
  sensitivity?: number;
  onSensitivity?: (s: number) => void;
}) {
  const balloPhase = String(payload.balloPhase ?? 'dancing');
  const balloStage = Number(payload.balloStage ?? 1);
  const teams = (payload.teams ?? []) as BalloTeamDef[];
  const prizePoints = Number(payload.prizePoints ?? 150);
  const [startingDance, setStartingDance] = useState(false);

  // Stage 1 never has balloPhase in payload (uses old flow path) — treat as dancing
  const effectivePhase = balloStage >= 2 ? balloPhase : (balloResult ? 'result' : 'dancing');

  // ── BOOKING PHASE (stages 2 & 3 only) ───────────────────────────────────────
  if (effectivePhase === 'booking') {
    const requiredPerTeam = balloStage;
    const teamsReady = teams.every(t => t.players.length >= requiredPerTeam);
    const stageLabel = balloStage === 2 ? 'Sfida 2: Coppie' : 'Sfida Finale: Terzetti';
    const stageDesc = balloStage === 2
      ? 'Servono 2 nuovi giocatori — ognuno sceglie una squadra.'
      : 'Servono altri 2 giocatori — si uniscono alle coppie per formare i terzetti.';
    return (
      <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}}
        className="flex w-full flex-col items-center gap-5">
        {/* Stage header */}
        <div className="flex flex-col items-center gap-1 text-center">
          <div className="text-4xl">💃</div>
          <div className="text-display text-2xl font-black text-white">{stageLabel}</div>
          <div className="text-sm text-white/50 max-w-sm">{stageDesc}</div>
          <div className="mt-1 rounded-xl px-5 py-2 text-base font-black"
            style={{background:'rgba(245,182,66,0.15)',border:'1px solid rgba(245,182,66,0.5)',color:'#F5B642'}}>
            🏆 {prizePoints.toLocaleString()} punti in palio
          </div>
        </div>
        {/* Team cards */}
        <div className="flex w-full max-w-2xl gap-4">
          {teams.map(team => (
            <div key={team.teamId} className="flex-1 rounded-3xl p-4 flex flex-col gap-3"
              style={{background:'rgba(167,139,250,0.07)',border:'1.5px solid rgba(167,139,250,0.3)'}}>
              <div className="text-center font-black text-white text-lg">
                Squadra {team.teamId} {team.teamId === 'A' ? '🔵' : '🔴'}
              </div>
              {/* Existing members */}
              {team.players.map(p => (
                <div key={p.id} className="flex items-center gap-2 rounded-xl px-3 py-2"
                  style={{background:`${p.avatarColor}18`,border:`1px solid ${p.avatarColor}44`}}>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-black"
                    style={{background:p.avatarColor,color:'#0a0015'}}>{p.nickname[0]?.toUpperCase()}</div>
                  <div className="font-bold text-white text-sm flex-1">{p.nickname}</div>
                  <div className="text-xs" style={{color:'rgba(255,255,255,0.4)'}}>✓</div>
                </div>
              ))}
              {/* Pending requests */}
              {team.pendingRequests.map(p => (
                <div key={p.id} className="flex items-center gap-2 rounded-xl px-3 py-2 border-dashed"
                  style={{background:'rgba(255,255,255,0.03)',border:'1.5px dashed rgba(255,255,255,0.2)'}}>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-black"
                    style={{background:p.avatarColor,color:'#0a0015'}}>{p.nickname[0]?.toUpperCase()}</div>
                  <div className="font-bold text-white/60 text-sm flex-1">{p.nickname}</div>
                  <div className="text-xs text-yellow-400 animate-pulse">attesa…</div>
                </div>
              ))}
              {/* Empty slots */}
              {Array.from({length: Math.max(0, requiredPerTeam - team.players.length - team.pendingRequests.length)}).map((_, i) => (
                <div key={`empty-${i}`} className="flex items-center gap-2 rounded-xl px-3 py-2 border-dashed"
                  style={{background:'rgba(255,255,255,0.02)',border:'1.5px dashed rgba(255,255,255,0.12)'}}>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs text-white/20 border border-dashed border-white/15">?</div>
                  <div className="text-white/25 text-sm">In attesa…</div>
                </div>
              ))}
            </div>
          ))}
        </div>
        {/* Avvia Sfida button */}
        <motion.button
          disabled={!teamsReady || startingDance}
          onClick={async () => {
            if (!teamsReady || startingDance) return;
            setStartingDance(true);
            await fetch(`/api/home/sessions/${session.id}/ballo-start-dance`, { method: 'POST', credentials: 'include' });
            setStartingDance(false);
          }}
          whileHover={teamsReady ? {scale:1.04} : {}}
          whileTap={teamsReady ? {scale:0.96} : {}}
          className="flex items-center gap-2 rounded-2xl px-10 py-4 text-xl font-black text-white disabled:opacity-40 disabled:cursor-not-allowed"
          style={{background: teamsReady ? 'linear-gradient(135deg,#A78BFA,#7C3AED)' : 'rgba(255,255,255,0.07)',
            boxShadow: teamsReady ? '0 0 40px rgba(167,139,250,0.6)' : 'none',border:'none'}}>
          {startingDance ? '…' : teamsReady ? '▶ AVVIA SFIDA' : `In attesa giocatori (${teams.map(t=>t.players.length).join('/')})`}
        </motion.button>
      </motion.div>
    );
  }

  // ── RESULT PHASE ─────────────────────────────────────────────────────────────
  if (effectivePhase === 'result') {
    const stageLabels = ['Sfida 1: Duello d\'ingresso','Sfida 2: Coppie','Sfida Finale: Terzetti'];
    const stageLabel = stageLabels[balloStage - 1] ?? 'Risultato';
    const isFinal = balloStage >= 3;
    const teamResult = balloResult?.teamResult;
    return (
      <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}}
        className="flex w-full flex-col items-center gap-5">
        <div className="text-display text-xl font-black text-white/60 tracking-widest uppercase">{stageLabel}</div>
        {/* Solo result (stage 1) */}
        {!teamResult && balloResult?.winnerId && (
          <motion.div initial={{scale:0.7,opacity:0}} animate={{scale:1,opacity:1}} transition={{type:'spring',stiffness:280,damping:20}}
            className="flex flex-col items-center gap-2 rounded-3xl px-10 py-5"
            style={{background:'linear-gradient(135deg,rgba(245,182,66,0.22),rgba(249,115,22,0.12))',border:'2px solid rgba(245,182,66,0.7)',boxShadow:'0 0 60px rgba(245,182,66,0.4)'}}>
            <div className="text-5xl">🏆</div>
            <div className="text-display text-3xl font-black text-yellow-400 tracking-wide">
              VINCE {(balloResult.winnerNickname ?? '').toUpperCase()}!
            </div>
            <div className="text-xl font-black" style={{color:'#F5B642'}}>+{balloResult.points} punti</div>
          </motion.div>
        )}
        {/* Team result (stages 2/3) */}
        {teamResult && (
          <motion.div initial={{scale:0.7,opacity:0}} animate={{scale:1,opacity:1}} transition={{type:'spring',stiffness:280,damping:20}}
            className="flex flex-col items-center gap-3">
            <div className="flex flex-col items-center gap-2 rounded-3xl px-10 py-5"
              style={{background:'linear-gradient(135deg,rgba(245,182,66,0.22),rgba(249,115,22,0.12))',border:'2px solid rgba(245,182,66,0.7)',boxShadow:'0 0 60px rgba(245,182,66,0.4)'}}>
              <div className="text-5xl">🏆</div>
              <div className="text-display text-2xl font-black text-yellow-400">
                VINCE SQUADRA {teamResult.winnerTeamId}!
              </div>
              <div className="text-base font-bold text-white/70">
                {teamResult.winnerTeamPlayers.map(p=>p.nickname).join(' + ')}
              </div>
              <div className="text-xl font-black" style={{color:'#F5B642'}}>
                +{teamResult.perPlayer} punti ciascuno · {prizePoints} totali
              </div>
            </div>
            {/* Team energy scores */}
            <div className="flex gap-4 mt-1">
              {teamResult.teamScores.map(ts => (
                <div key={ts.teamId} className="flex flex-col items-center gap-1 rounded-2xl px-5 py-3"
                  style={{background: ts.teamId===teamResult.winnerTeamId ? 'rgba(245,182,66,0.12)' : 'rgba(255,255,255,0.05)',
                    border:`1.5px solid ${ts.teamId===teamResult.winnerTeamId ? 'rgba(245,182,66,0.5)' : 'rgba(255,255,255,0.12)'}`}}>
                  <div className="font-black text-sm" style={{color: ts.teamId===teamResult.winnerTeamId ? '#F5B642' : 'rgba(255,255,255,0.5)'}}>
                    Squadra {ts.teamId} {ts.teamId===teamResult.winnerTeamId ? '🏆':''}
                  </div>
                  <div className="text-xs text-white/40">{ts.players.map(p=>p.nickname).join(' + ')}</div>
                  <div className="text-base font-black" style={{color:'#A78BFA'}}>⚡ {ts.totalEnergy}</div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
        {/* No motion data */}
        {!balloResult && (
          <div className="text-white/40 text-sm">Nessun dato di energia ricevuto</div>
        )}
        {/* Votes */}
        {Object.keys(balloVotes).length > 0 && (
          <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:0.3}}
            className="flex flex-wrap justify-center gap-3">
            {(payload.bookedPlayers as {id:string;nickname:string;avatarColor:string}[]??[]).map(p => {
              const vd = balloVotes[p.id];
              if (!vd || vd.count === 0) return null;
              const avg = vd.total / vd.count;
              return (
                <div key={p.id} className="flex flex-col items-center gap-1 rounded-2xl px-4 py-2"
                  style={{background:`${p.avatarColor}15`,border:`1px solid ${p.avatarColor}44`}}>
                  <div className="text-xs font-black" style={{color:p.avatarColor}}>{p.nickname}</div>
                  <div className="text-base">{'⭐'.repeat(Math.round(avg))}{'☆'.repeat(Math.max(0,5-Math.round(avg)))}</div>
                  <div className="text-xs" style={{color:'rgba(255,255,255,0.35)'}}>{avg.toFixed(1)} · {vd.count} voti</div>
                </div>
              );
            })}
          </motion.div>
        )}
        {/* Action buttons */}
        <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:0.5}}
          className="flex flex-col items-center gap-2">
          {!isFinal && onStageNext && (
            <motion.button onClick={onStageNext}
              whileHover={{scale:1.04}} whileTap={{scale:0.96}}
              className="flex items-center gap-2 rounded-2xl px-10 py-4 text-xl font-black text-white"
              style={{background:'linear-gradient(135deg,#A78BFA,#7C3AED)',boxShadow:'0 0 40px rgba(167,139,250,0.6)',border:'none'}}>
              PROSSIMA SFIDA →
            </motion.button>
          )}
          {isFinal && onEndBallo && (
            <motion.button onClick={onEndBallo}
              whileHover={{scale:1.04}} whileTap={{scale:0.96}}
              className="flex items-center gap-2 rounded-2xl px-10 py-4 text-xl font-black text-white"
              style={{background:'linear-gradient(135deg,#F5B642,#f97316)',boxShadow:'0 0 40px rgba(245,182,66,0.5)',border:'none'}}>
              🏆 FINE BALLO →
            </motion.button>
          )}
          {onReset && (
            <button onClick={onReset}
              className="text-xs font-semibold px-4 py-2 rounded-xl"
              style={{background:'rgba(255,255,255,0.05)',color:'rgba(255,255,255,0.25)',border:'1px solid rgba(255,255,255,0.1)'}}>
              ↺ Ricomincia dal Duello
            </button>
          )}
        </motion.div>
      </motion.div>
    );
  }

  // ── DANCING PHASE (all stages) ────────────────────────────────────────────────
  // Stage header for stages 2/3
  const dancingStageLabel = balloStage >= 2 ? (balloStage === 2 ? 'Sfida 2: Coppie' : 'Sfida Finale: Terzetti') : null;

  const pts = Number(payload.points ?? 150);
  const prevCurrentRef = useRef<Record<string, number>>({});
  const burstKeyRef = useRef(0);
  const [bursts, setBursts] = useState<Record<string, BurstItem[]>>({});

  const spawnBurst = useCallback((pid: string, label: string) => {
    const bKey = ++burstKeyRef.current;
    setBursts(prev => ({ ...prev, [pid]: [...(prev[pid] ?? []).slice(-2), { key: bKey, label }] }));
    setTimeout(() => {
      setBursts(prev => ({ ...prev, [pid]: (prev[pid] ?? []).filter(b => b.key !== bKey) }));
    }, 900);
  }, []);

  useEffect(() => {
    if (balloResult) { prevCurrentRef.current = {}; return; }
    for (const [pid, curr] of Object.entries(balloCurrent)) {
      const prev = prevCurrentRef.current[pid] ?? 0;
      const rise = curr - prev;
      if (rise >= 5) spawnBurst(pid, rise >= 30 ? 'COMBO! 🔥' : `+${rise}`);
    }
    prevCurrentRef.current = { ...balloCurrent };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balloCurrent, balloResult]);

  const hasLiveData = Object.keys(balloCurrent).length > 0 || Object.keys(balloEnergies).length > 0;

  // Filter to activeDancerIds (stages 2/3) or bookedPlayers (stage 1), fallback all
  const activeDancerIds = (payload.activeDancerIds ?? []) as string[];
  const rawBooked = (payload.bookedPlayers ?? []) as { id: string }[];
  const bookedIds = new Set(rawBooked.map(b => b.id));
  const filterIds = activeDancerIds.length > 0 ? new Set(activeDancerIds) : bookedIds.size > 0 ? bookedIds : null;
  const activePlayers = filterIds ? players.filter(p => filterIds.has(p.id)) : players;

  const sortedPlayers = [...activePlayers].sort((a, b) => {
    const ea = balloCurrent[a.id] ?? balloEnergies[a.id] ?? 0;
    const eb = balloCurrent[b.id] ?? balloEnergies[b.id] ?? 0;
    return eb - ea;
  });
  const isManyPlayers = activePlayers.length > 3;

  return (
    <motion.div key={String(payload.roundIndex)} initial={{opacity:0,y:16}} animate={{opacity:1,y:0}}
      className="flex w-full flex-col items-center gap-5">

      {/* Header */}
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="text-5xl">💃</div>
        {dancingStageLabel && (
          <div className="text-xs font-black uppercase tracking-widest" style={{color:'rgba(167,139,250,0.7)'}}>{dancingStageLabel}</div>
        )}
        <div className="text-display text-3xl font-black text-white" style={{textShadow:'0 0 24px rgba(167,139,250,0.5)'}}>
          {String(payload.name ?? 'Sfida di Ballo')}
        </div>
        <div className="text-sm text-white/55 max-w-md">{String(payload.description ?? '')}</div>
        {balloStage >= 2 && (
          <div className="rounded-lg px-4 py-1 text-sm font-black" style={{background:'rgba(245,182,66,0.12)',color:'#F5B642'}}>
            🏆 {prizePoints.toLocaleString()} punti in palio
          </div>
        )}
      </div>

      {/* Contestant cards */}
      {sortedPlayers.length > 0 && (
        <div className={`flex w-full gap-4 justify-center ${isManyPlayers ? 'flex-wrap' : 'flex-row'} items-end`}>
          {sortedPlayers.map((p, i) => {
            const currE    = balloCurrent[p.id] ?? 0;
            const barPct   = Math.min(100, currE);
            const isLeader = i === 0 && (currE > 0 || (balloEnergies[p.id] ?? 0) > 0);
            const livePts  = Math.round((currE / 100) * pts);
            const borderCol = isLeader ? 'rgba(245,182,66,0.45)' : `${p.avatarColor}66`;
            const glowCol   = isLeader ? '0 0 40px rgba(245,182,66,0.25)' : '0 0 20px rgba(0,0,0,0.5)';
            const meterBg   = isLeader ? 'linear-gradient(0deg,#F5B642,#f97316)' : `linear-gradient(0deg,${p.avatarColor},${p.avatarColor}bb)`;
            const meterGlow = isLeader ? '0 0 18px rgba(245,182,66,0.8)' : `0 0 12px ${p.avatarColor}88`;

            return (
              <motion.div key={p.id}
                initial={{y:24,opacity:0}} animate={{y:0,opacity:1}} transition={{delay: i*0.08}}
                className="flex flex-col items-center gap-3 rounded-3xl p-5"
                style={{
                  position:'relative',
                  flex: isManyPlayers ? '1 1 160px' : '1 1 200px',
                  maxWidth: isManyPlayers ? 180 : 260,
                  minWidth: 140,
                  background:'linear-gradient(160deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))',
                  border:`2px solid ${borderCol}`,
                  boxShadow: glowCol,
                }}>

                {/* Burst particles */}
                <div style={{position:'absolute',top:4,left:0,right:0,pointerEvents:'none',display:'flex',flexDirection:'column',alignItems:'center'}}>
                  <AnimatePresence>
                    {(bursts[p.id] ?? []).map(b => (
                      <motion.div key={b.key}
                        initial={{opacity:1,y:0,scale:0.8}} animate={{opacity:0,y:-44,scale:1.2}}
                        exit={{opacity:0}} transition={{duration:0.85,ease:'easeOut'}}
                        style={{position:'absolute',color:'#F5B642',fontSize:13,fontWeight:900,textShadow:'0 0 12px rgba(245,182,66,0.8)',whiteSpace:'nowrap'}}>
                        {b.label}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                {/* Rank + Avatar */}
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{isLeader ? '🥇' : `${i+1}`}</span>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-black"
                    style={{background:p.avatarColor, color:'#000', boxShadow:`0 0 14px ${p.avatarColor}88`}}>
                    {p.nickname.slice(0,2).toUpperCase()}
                  </div>
                </div>

                {/* Nickname */}
                <div className="text-center text-sm font-black leading-tight"
                  style={{color: isLeader ? '#F5B642' : 'rgba(255,255,255,0.9)'}}>
                  {p.nickname}
                </div>

                {/* Vertical energy meter — height = CURRENT live energy, not peak */}
                <div className="flex flex-col items-center gap-1">
                  <div className="text-xs font-bold tabular-nums" style={{color:'#A78BFA'}}>{currE}%</div>
                  <div style={{position:'relative', height:160, width:26, background:'rgba(255,255,255,0.07)', borderRadius:13, overflow:'hidden'}}>
                    <motion.div
                      animate={{height:`${barPct}%`}}
                      transition={{duration:0.18, type:'spring', stiffness:380, damping:38}}
                      style={{position:'absolute', bottom:0, left:0, right:0, background:meterBg, boxShadow:meterGlow, borderRadius:13}}
                    />
                  </div>
                </div>

                {/* Provisional live points — TV excitement only, never persisted */}
                {!balloResult && currE > 0 && (
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="text-xs text-white/30">provvisori</div>
                    <motion.div key={livePts}
                      initial={{scale:1.25,color:'#F5B642'}} animate={{scale:1,color:'rgba(255,255,255,0.65)'}}
                      transition={{duration:0.3}}
                      className="text-sm font-black tabular-nums">
                      +{livePts}
                    </motion.div>
                  </div>
                )}

                {/* Official score */}
                <div className="flex flex-col items-center">
                  <div className="text-xs text-white/35">punti</div>
                  <div className="text-lg font-black text-white tabular-nums">{p.score}</div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Waiting for first data */}
      {!hasLiveData && (
        <motion.div animate={{opacity:[0.4,1,0.4]}} transition={{repeat:Infinity,duration:1.8}}
          className="text-sm text-white/40">
          💃 Muovete il telefono — l'energia appare in tempo reale!
        </motion.div>
      )}

      <div className="text-xs text-white/20">⚡ energia assegnata automaticamente al termine del timer</div>
    </motion.div>
  );
}

// ── PercorsoBoard ─────────────────────────────────────────────────────────────

function PercorsoBoard({ payload, onReveal, players, onScore }: {
  payload: Record<string,unknown>;
  onReveal: () => void;
  players: HomePlayer[];
  onScore: (pid: string, pts: number) => Promise<void>;
}) {
  const [awarded, setAwarded] = useState<string|null>(null);
  const pts = Number(payload.points ?? 150);
  const TYPE_ICONS: Record<string,string> = { sfida:'⚡',domanda:'❓',mimo:'🎭',ballo:'💃',veloce:'🏃',coppia:'👫',reazione:'😱',fantasia:'🌟' };
  const icon = TYPE_ICONS[String(payload.challengeType??'sfida')]??'⚡';
  return (
    <motion.div key={String(payload.roundIndex)} initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}}
      className="flex w-full max-w-2xl flex-col items-center gap-7 text-center">
      <div className="flex h-28 w-28 items-center justify-center rounded-3xl text-7xl"
        style={{background:'linear-gradient(135deg,rgba(52,211,153,0.35),rgba(52,211,153,0.15))',border:'2px solid rgba(52,211,153,0.55)',boxShadow:'0 0 60px rgba(52,211,153,0.4)'}}>
        {icon}
      </div>
      <div className="text-display text-5xl font-black text-white" style={{textShadow:'0 0 30px rgba(52,211,153,0.5)'}}>
        {String(payload.title??'Sfida')}
      </div>
      <div className="max-w-lg text-lg text-white/65 leading-relaxed">{String(payload.description??'')}</div>
      <div className="flex items-center gap-6">
        <div className="rounded-2xl px-5 py-2" style={{background:'rgba(52,211,153,0.18)',border:'1px solid rgba(52,211,153,0.45)',color:'#34D399'}}>
          <span className="text-xl font-black">{pts} pt</span>
        </div>
        <div className="rounded-2xl px-5 py-2" style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.14)',color:'rgba(255,255,255,0.6)'}}>
          <Timer className="inline h-4 w-4 mr-1"/><span className="text-xl font-black">{Number(payload.timeLimit??60)}s</span>
        </div>
      </div>
      <div className="text-base text-white/50">Chi ha superato la sfida? Assegna i punti ({pts}pt):</div>
      <div className="flex flex-wrap justify-center gap-3">
        {players.map(p => (
          <button key={p.id} disabled={!!awarded}
            onClick={async () => { setAwarded(p.id); await onScore(p.id, p.score + pts); onReveal(); }}
            className="rounded-2xl px-5 py-3 text-sm font-black transition-all disabled:opacity-50"
            style={awarded===p.id
              ? {background:'linear-gradient(135deg,#34D399,#059669)',color:'#fff',boxShadow:'0 0 30px rgba(52,211,153,0.6)'}
              : {background:`linear-gradient(135deg,${p.avatarColor},${p.avatarColor}cc)`,color:'#000'}}>
            {p.nickname} {awarded===p.id && '✓'}
          </button>
        ))}
        <button disabled={!!awarded} onClick={() => onReveal()}
          className="rounded-2xl px-5 py-3 text-sm font-black transition-all"
          style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.14)',color:'rgba(255,255,255,0.5)'}}>
          Nessuno
        </button>
      </div>
    </motion.div>
  );
}

// ── AudioPlayer (shared) ──────────────────────────────────────────────────────

function AudioPlayer({ src, label = 'Riproduci', color = '#60A5FA' }: { src: string | null; label?: string; color?: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { return () => { audioRef.current?.pause(); }; }, []);

  useEffect(() => {
    if (audioRef.current) { audioRef.current.pause(); setPlaying(false); }
  }, [src]);

  if (!src) return (
    <div className="flex items-center gap-2 rounded-xl px-5 py-2.5"
      style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.12)'}}>
      <span className="text-sm text-white/35">🔇 Nessun file audio — aggiorna URL in /admin/sara-musica</span>
    </div>
  );

  const toggle = async () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(src);
      audioRef.current.loop = true;
      audioRef.current.onended = () => setPlaying(false);
    }
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else {
      setLoading(true);
      try { await audioRef.current.play(); setPlaying(true); } catch { /* autoplay blocked */ }
      finally { setLoading(false); }
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <motion.button onClick={toggle} whileHover={{scale:1.05}} whileTap={{scale:0.95}}
        className="flex items-center gap-3 rounded-2xl px-8 py-4 text-lg font-black text-white"
        style={{background:`linear-gradient(135deg,${color}cc,${color}77)`,boxShadow:`0 0 40px ${color}66`}}>
        {loading ? <Loader2 className="h-6 w-6 animate-spin"/> : playing ? '⏸ Pausa' : `▶ ${label}`}
      </motion.button>
      {playing && (
        <div className="flex items-center gap-1.5">
          {[1,2,3,4,5].map(i => (
            <motion.div key={i} className="w-1.5 rounded-full"
              style={{background:color,height:24}}
              animate={{scaleY:[0.2,1,0.2]}}
              transition={{duration:0.7,repeat:Infinity,delay:i*0.11}}/>
          ))}
        </div>
      )}
    </div>
  );
}

// ── SaraMusicaBoard ───────────────────────────────────────────────────────────

function SaraMusicaBoard({ payload, revealed, onReveal, winner }: {
  payload: Record<string,unknown>;
  revealed: boolean;
  onReveal: () => void;
  winner?: { nickname: string; points: number; round: number } | null;
}) {
  const audioUrl = payload.audioUrl ? String(payload.audioUrl) : null;
  return (
    <motion.div key={String(payload.roundIndex)} initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}}
      className="flex w-full max-w-2xl flex-col items-center gap-7 text-center">
      <div className="flex h-28 w-28 items-center justify-center rounded-3xl text-7xl"
        style={{background:'linear-gradient(135deg,rgba(96,165,250,0.35),rgba(96,165,250,0.15))',border:'2px solid rgba(96,165,250,0.55)',boxShadow:'0 0 60px rgba(96,165,250,0.4)'}}>
        🎵
      </div>
      {!revealed ? (
        <>
          <div className="text-display text-4xl font-black text-white">Indovina la Canzone!</div>
          <AudioPlayer src={audioUrl} label="Riproduci canzone" color="#60A5FA"/>
          <div className="max-w-lg rounded-3xl p-6"
            style={{background:'rgba(96,165,250,0.12)',border:'1px solid rgba(96,165,250,0.4)'}}>
            <div className="text-xs font-black uppercase tracking-widest mb-2" style={{color:'rgba(96,165,250,0.8)'}}>SUGGERIMENTO</div>
            <div className="text-lg text-white/80 italic leading-relaxed">"{String(payload.snippetHint??'...')}"</div>
          </div>
          <button onClick={onReveal} className="flex items-center gap-3 rounded-2xl px-10 py-5 text-xl font-black text-white"
            style={{background:'linear-gradient(135deg,#60A5FA,#2563eb)',boxShadow:'0 0 50px rgba(96,165,250,0.55)'}}>
            🎵 Rivela canzone
          </button>
        </>
      ) : (
        <>
          {winner && (
            <motion.div initial={{scale:0,opacity:0}} animate={{scale:1,opacity:1}} transition={{type:'spring',delay:0.1}}
              className="rounded-3xl px-8 py-4 text-center"
              style={{background:'linear-gradient(135deg,rgba(96,165,250,0.25),rgba(37,99,235,0.15))',border:'2px solid rgba(96,165,250,0.6)',boxShadow:'0 0 60px rgba(96,165,250,0.4)'}}>
              <div className="text-xs font-black uppercase tracking-widest mb-1" style={{color:'rgba(96,165,250,0.8)'}}>🏆 HA INDOVINATO</div>
              <div className="text-3xl font-black text-white">{winner.nickname}</div>
              <div className="text-xl font-bold mt-1" style={{color:'#60A5FA'}}>+{winner.points} punti!</div>
            </motion.div>
          )}
          <div className="text-display text-5xl font-black text-white">{String(payload.title??'?')}</div>
          <div className="text-2xl font-bold" style={{color:'#60A5FA'}}>— {String(payload.artist??'')}</div>
          <AudioPlayer src={audioUrl} label="Riproduci ancora" color="#60A5FA"/>
          {!winner && (
            <div className="rounded-2xl px-5 py-2" style={{background:'rgba(96,165,250,0.18)',border:'1px solid rgba(96,165,250,0.45)',color:'#60A5FA'}}>
              <span className="text-xl font-black">{Number(payload.points??100)} punti a chi l'ha indovinata!</span>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}

// ── AdultOnlyBoard ────────────────────────────────────────────────────────────

function AdultOnlyBoard({ payload, revealed, onReveal, players, onScore }: {
  payload: Record<string,unknown>;
  revealed: boolean;
  onReveal: () => void;
  players: HomePlayer[];
  onScore: (pid: string, pts: number) => Promise<void>;
}) {
  const [awarded, setAwarded] = useState<string|null>(null);
  const pts = Number(payload.points ?? 150);
  return (
    <motion.div key={String(payload.roundIndex)} initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}}
      className="flex w-full max-w-2xl flex-col items-center gap-7 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-3xl text-6xl"
        style={{background:'linear-gradient(135deg,rgba(248,113,113,0.35),rgba(248,113,113,0.15))',border:'2px solid rgba(248,113,113,0.55)',boxShadow:'0 0 60px rgba(248,113,113,0.4)'}}>
        🔞
      </div>
      <div className="text-display text-4xl font-black text-white">{String(payload.title??'Sfida Adult Only')}</div>
      <div className="max-w-xl rounded-3xl p-6"
        style={{background:'rgba(248,113,113,0.12)',border:'1px solid rgba(248,113,113,0.4)'}}>
        <div className="text-lg text-white/80 leading-relaxed">{String(payload.body??'')}</div>
      </div>
      <div className="flex items-center gap-4">
        <div className="rounded-2xl px-4 py-2" style={{background:'rgba(248,113,113,0.18)',color:'#F87171',border:'1px solid rgba(248,113,113,0.45)'}}>
          <span className="font-black">{pts} pt</span>
        </div>
        <div className="rounded-2xl px-4 py-2" style={{background:'rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.6)',border:'1px solid rgba(255,255,255,0.14)'}}>
          <Timer className="inline h-4 w-4 mr-1"/><span className="font-black">{Number(payload.timeLimit??90)}s</span>
        </div>
      </div>
      {!revealed ? (
        <button onClick={onReveal} className="flex items-center gap-3 rounded-2xl px-10 py-5 text-xl font-black text-white"
          style={{background:'linear-gradient(135deg,#F87171,#dc2626)',boxShadow:'0 0 50px rgba(248,113,113,0.55)'}}>
          <Check className="h-6 w-6"/> Sfida completata!
        </button>
      ) : (
        <>
          <div className="text-base text-white/50">Chi l'ha completata? Assegna i punti ({pts}pt):</div>
          <div className="flex flex-wrap justify-center gap-3">
            {players.map(p => (
              <button key={p.id} disabled={!!awarded}
                onClick={async () => { setAwarded(p.id); await onScore(p.id, p.score + pts); }}
                className="rounded-2xl px-5 py-3 text-sm font-black transition-all disabled:opacity-50"
                style={awarded===p.id
                  ? {background:'linear-gradient(135deg,#F87171,#dc2626)',color:'#fff',boxShadow:'0 0 30px rgba(248,113,113,0.6)'}
                  : {background:`linear-gradient(135deg,${p.avatarColor},${p.avatarColor}cc)`,color:'#000'}}>
                {p.nickname} {awarded===p.id && '✓'}
              </button>
            ))}
            <button disabled={!!awarded} onClick={() => {}}
              className="rounded-2xl px-5 py-3 text-sm font-black transition-all"
              style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.14)',color:'rgba(255,255,255,0.5)'}}>
              Nessuno
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}

// ── WordBackBoard ─────────────────────────────────────────────────────────────

function WordBackBoard({ payload, players, onScore, onReveal, tabooAlarm, sessionId }: {
  payload: Record<string,unknown>;
  players: HomePlayer[];
  onScore: (pid: string, pts: number) => Promise<void>;
  onReveal: () => void;
  tabooAlarm: TabooAlarmEvent | null;
  sessionId: string;
}) {
  const [awarded, setAwarded] = useState<string|null>(null);
  const [autoAwarded, setAutoAwarded] = useState(false);
  const pts = Number(payload.points ?? 150);
  const guesserId = String(payload.guesserId ?? '');
  const suggesterId = String(payload.suggesterId ?? '');
  const word = String(payload.word ?? '');
  const tabooWords = (payload.tabooWords as string[] | undefined) ?? [];
  const guesser = players.find(p => p.id === guesserId);
  const suggester = players.find(p => p.id === suggesterId);

  // Listen for phone-triggered correct answer
  const { on } = useHomeSocket(sessionId);
  useEffect(() => {
    const unsub = on<{ guesserId: string; suggesterId: string; pts: number }>('home:wordback_correct', async (d) => {
      if (autoAwarded || awarded) return;
      setAutoAwarded(true);
      const tasks: Promise<void>[] = [];
      const g = players.find(p => p.id === d.guesserId);
      const s = players.find(p => p.id === d.suggesterId);
      if (g) tasks.push(onScore(g.id, g.score + d.pts));
      if (s) tasks.push(onScore(s.id, s.score + d.pts));
      await Promise.all(tasks);
      setTimeout(onReveal, 1800);
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAwarded, awarded, players, pts]);

  return (
    <motion.div key={String(payload.roundIndex)} initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}}
      className="flex w-full max-w-2xl flex-col items-center gap-6 text-center">

      {/* Taboo alarm overlay */}
      <AnimatePresence>
        {tabooAlarm && (
          <motion.div key={tabooAlarm.timestamp}
            initial={{opacity:0,scale:0.7}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.8}}
            transition={{type:'spring',stiffness:400,damping:25}}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="rounded-3xl px-14 py-10 text-center"
              style={{background:'rgba(239,68,68,0.95)',border:'3px solid rgba(255,120,120,0.9)',boxShadow:'0 0 100px rgba(239,68,68,0.9)',backdropFilter:'blur(12px)'}}>
              <div className="text-7xl mb-4">🚨</div>
              <div className="text-5xl font-black text-white tracking-tight">ALLARME TABOO!</div>
              <div className="text-2xl text-white/85 mt-3">premuto da <span className="font-black">{tabooAlarm.nickname}</span></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auto-correct success overlay */}
      <AnimatePresence>
        {autoAwarded && (
          <motion.div initial={{opacity:0,scale:0.7}} animate={{opacity:1,scale:1}} exit={{opacity:0}}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="rounded-3xl px-14 py-10 text-center"
              style={{background:'rgba(34,197,94,0.95)',border:'3px solid rgba(74,222,128,0.9)',boxShadow:'0 0 100px rgba(34,197,94,0.9)',backdropFilter:'blur(12px)'}}>
              <div className="text-7xl mb-4">✅</div>
              <div className="text-5xl font-black text-white tracking-tight">CORRETTO!</div>
              <div className="text-2xl text-white/90 mt-3 font-bold">{word.toUpperCase()}</div>
              <div className="text-lg text-white/70 mt-1">+{pts} a entrambi i giocatori</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top role cards */}
      {(guesser || suggester) && (
        <div className="flex gap-3 w-full">
          {guesser && (
            <div className="flex-1 rounded-2xl px-4 py-3"
              style={{background:'rgba(167,139,250,0.15)',border:'1.5px solid rgba(167,139,250,0.4)'}}>
              <div className="text-xs font-black uppercase tracking-widest mb-1" style={{color:'rgba(167,139,250,0.9)'}}>🙈 INDOVINATORE</div>
              <div className="font-black text-white text-lg">{guesser.nickname}</div>
            </div>
          )}
          {suggester && (
            <div className="flex-1 rounded-2xl px-4 py-3"
              style={{background:'rgba(34,211,238,0.15)',border:'1.5px solid rgba(34,211,238,0.4)'}}>
              <div className="text-xs font-black uppercase tracking-widest mb-1" style={{color:'rgba(34,211,238,0.9)'}}>💬 SUGGERITORE</div>
              <div className="font-black text-white text-lg">{suggester.nickname}</div>
            </div>
          )}
        </div>
      )}

      {/* BIG SECRET WORD */}
      <motion.div
        initial={{scale:0.85,opacity:0}} animate={{scale:1,opacity:1}} transition={{delay:0.1,type:'spring',stiffness:260,damping:22}}
        className="w-full rounded-3xl px-8 py-8"
        style={{background:'linear-gradient(135deg,rgba(34,211,238,0.22),rgba(34,211,238,0.08))',border:'2px solid rgba(34,211,238,0.55)',boxShadow:'0 0 60px rgba(34,211,238,0.35)'}}>
        <div className="text-xs font-black uppercase tracking-widest mb-3" style={{color:'rgba(34,211,238,0.6)'}}>
          💬 PAROLA SEGRETA — {String(payload.category ?? '')}
        </div>
        <div className="text-display font-black tracking-wide" style={{fontSize:'clamp(2.5rem,8vw,5rem)',color:'#22D3EE',textShadow:'0 0 50px rgba(34,211,238,0.7)'}}>
          {word || '???'}
        </div>
      </motion.div>

      {/* Taboo words */}
      <div className="w-full rounded-2xl px-6 py-5"
        style={{background:'rgba(239,68,68,0.1)',border:'1.5px solid rgba(239,68,68,0.4)'}}>
        <div className="text-xs font-black uppercase tracking-widest mb-3" style={{color:'rgba(239,68,68,0.9)'}}>
          🚫 PAROLE VIETATE
        </div>
        {tabooWords.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {tabooWords.map((w, i) => (
              <div key={i} className="text-base font-black text-white/85">{i+1}. {w}</div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-white/35 italic">Nessuna parola taboo caricata</div>
        )}
      </div>

      {/* Manual score buttons — host override */}
      <div className="w-full">
        <div className="text-xs font-black uppercase tracking-widest mb-3 text-center" style={{color:'rgba(255,255,255,0.3)'}}>
          Override manuale animatore
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          {players.map(p => (
            <button key={p.id} disabled={!!awarded || autoAwarded}
              onClick={async () => {
                setAwarded(p.id);
                await onScore(p.id, p.score + pts);
                onReveal();
              }}
              className="rounded-2xl px-5 py-3 text-sm font-black text-black transition-all disabled:opacity-40"
              style={awarded===p.id
                ? {background:'linear-gradient(135deg,#22D3EE,#0891b2)',boxShadow:'0 0 30px rgba(34,211,238,0.6)'}
                : {background:`linear-gradient(135deg,${p.avatarColor},${p.avatarColor}cc)`}}>
              {p.nickname} {awarded===p.id && '✓'}
            </button>
          ))}
          <button disabled={!!awarded || autoAwarded} onClick={() => { onReveal(); }}
            className="rounded-2xl px-5 py-3 text-sm font-black transition-all"
            style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.14)',color:'rgba(255,255,255,0.5)'}}>
            Nessuno
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── KaraokeBoard ──────────────────────────────────────────────────────────────

function KaraokeBoard({ payload, onReveal, players, onScore }: {
  payload: Record<string,unknown>;
  onReveal: () => void;
  players: HomePlayer[];
  onScore: (pid: string, pts: number) => Promise<void>;
}) {
  const [awarded, setAwarded] = useState<string|null>(null);
  const pts = Number(payload.points ?? 150);
  return (
    <motion.div key={String(payload.roundIndex)} initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}}
      className="flex w-full max-w-2xl flex-col items-center gap-7 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-3xl text-6xl"
        style={{background:'linear-gradient(135deg,rgba(251,146,60,0.35),rgba(251,146,60,0.15))',border:'2px solid rgba(251,146,60,0.55)',boxShadow:'0 0 60px rgba(251,146,60,0.4)'}}>
        🎤
      </div>
      <div className="text-display text-5xl font-black text-white">{String(payload.title??'Karaoke')}</div>
      <div className="text-2xl font-bold" style={{color:'#FB923C'}}>— {String(payload.artist??'')}</div>
      {!!payload.lyricSnippet && (
        <div className="max-w-xl rounded-3xl p-6"
          style={{background:'rgba(251,146,60,0.12)',border:'1px solid rgba(251,146,60,0.4)'}}>
          <div className="text-xs font-black uppercase tracking-widest mb-3" style={{color:'rgba(251,146,60,0.8)'}}>TESTO</div>
          <div className="text-lg text-white/80 italic leading-relaxed whitespace-pre-line">
            "{String(payload.lyricSnippet)}"
          </div>
        </div>
      )}
      <div className="text-base text-white/50">Chi ha cantato meglio? Assegna i punti ({pts}pt):</div>
      <div className="flex flex-wrap justify-center gap-3">
        {players.map(p => (
          <button key={p.id} disabled={!!awarded}
            onClick={async () => { setAwarded(p.id); await onScore(p.id, p.score + pts); onReveal(); }}
            className="rounded-2xl px-5 py-3 text-sm font-black transition-all disabled:opacity-50"
            style={awarded===p.id
              ? {background:'linear-gradient(135deg,#FB923C,#ea580c)',color:'#fff',boxShadow:'0 0 30px rgba(251,146,60,0.6)'}
              : {background:`linear-gradient(135deg,${p.avatarColor},${p.avatarColor}cc)`,color:'#000'}}>
            {p.nickname} {awarded===p.id && '✓'}
          </button>
        ))}
        <button disabled={!!awarded} onClick={() => onReveal()}
          className="rounded-2xl px-5 py-3 text-sm font-black transition-all"
          style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.14)',color:'rgba(255,255,255,0.5)'}}>
          Nessuno
        </button>
      </div>
    </motion.div>
  );
}

// ── FreestyleBoard ────────────────────────────────────────────────────────────

function FreestyleBoard({ payload, onReveal, players, onScore }: {
  payload: Record<string,unknown>;
  onReveal: () => void;
  players: HomePlayer[];
  onScore: (pid: string, pts: number) => Promise<void>;
}) {
  const [awarded, setAwarded] = useState<string|null>(null);
  const pts = Number(payload.points ?? 200);
  const trackIdx = Number(payload.roundIndex ?? 0) % FREESTYLE_TRACKS.length;
  const trackUrl = FREESTYLE_TRACKS[trackIdx] ?? FREESTYLE_TRACKS[0];
  return (
    <motion.div key={String(payload.roundIndex)} initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}}
      className="flex w-full max-w-2xl flex-col items-center gap-7 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-3xl text-6xl"
        style={{background:'linear-gradient(135deg,rgba(251,146,60,0.35),rgba(251,146,60,0.15))',border:'2px solid rgba(251,146,60,0.55)',boxShadow:'0 0 60px rgba(251,146,60,0.4)'}}>
        🎙️
      </div>
      <div className="text-xs font-black uppercase tracking-widest" style={{color:'rgba(251,146,60,0.8)'}}>FREESTYLE RAP</div>
      <div className="rounded-3xl px-10 py-6"
        style={{background:'linear-gradient(135deg,rgba(251,146,60,0.2),rgba(251,146,60,0.08))',border:'2px solid rgba(251,146,60,0.55)',boxShadow:'0 0 60px rgba(251,146,60,0.4)'}}>
        <div className="text-display text-7xl font-black" style={{color:'#FB923C',textShadow:'0 0 50px rgba(251,146,60,0.7)'}}>
          {String(payload.word??'Improvvisa!')}
        </div>
      </div>
      <div className="text-lg text-white/55">Improvvisa un freestyle su questa parola — {Number(payload.timeLimit??30)} secondi!</div>
      <AudioPlayer src={trackUrl} label="Avvia base musicale" color="#FB923C"/>
      <div className="text-base text-white/50">Chi ha rappato meglio? Assegna i punti ({pts}pt):</div>
      <div className="flex flex-wrap justify-center gap-3">
        {players.map(p => (
          <button key={p.id} disabled={!!awarded}
            onClick={async () => { setAwarded(p.id); await onScore(p.id, p.score + pts); onReveal(); }}
            className="rounded-2xl px-5 py-3 text-sm font-black transition-all disabled:opacity-50"
            style={awarded===p.id
              ? {background:'linear-gradient(135deg,#FB923C,#ea580c)',color:'#fff',boxShadow:'0 0 30px rgba(251,146,60,0.6)'}
              : {background:`linear-gradient(135deg,${p.avatarColor},${p.avatarColor}cc)`,color:'#000'}}>
            {p.nickname} {awarded===p.id && '✓'}
          </button>
        ))}
        <button disabled={!!awarded} onClick={() => onReveal()}
          className="rounded-2xl px-5 py-3 text-sm font-black transition-all"
          style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.14)',color:'rgba(255,255,255,0.5)'}}>
          Nessuno
        </button>
      </div>
    </motion.div>
  );
}

// ── CoppieBoard ───────────────────────────────────────────────────────────────

interface CoppieCard { id: string; text: string; imageUrl?: string; pairId: number; flipped: boolean; matched: boolean; }

function CoppieBoard({ payload, onNext }: { payload: Record<string,unknown>; onNext?: () => void }) {
  const cards = (payload.cards as CoppieCard[]) ?? [];
  const matched = Number(payload.matchedPairs ?? 0);
  const total = Number(payload.totalPairs ?? 0);
  const cols = Math.min(Math.ceil(Math.sqrt(cards.length)), 6);
  const [preview, setPreview] = useState(false);
  const [previewSecs, setPreviewSecs] = useState(0);
  const previewTimer = useRef<ReturnType<typeof setInterval>|null>(null);

  const startPreview = () => {
    if (previewTimer.current) clearInterval(previewTimer.current);
    setPreview(true);
    setPreviewSecs(10);
    let t = 10;
    previewTimer.current = setInterval(() => {
      t -= 1;
      setPreviewSecs(t);
      if (t <= 0) { clearInterval(previewTimer.current!); setPreview(false); }
    }, 1000);
  };
  useEffect(() => () => { if (previewTimer.current) clearInterval(previewTimer.current); }, []);

  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-5">
      <div className="flex items-center gap-4 flex-wrap justify-center">
        <div className="text-display text-3xl font-black" style={{color:'#F472B6'}}>
          {String(payload.category ?? 'Coppie')}
        </div>
        <div className="rounded-full px-5 py-1.5 text-base font-black"
          style={{background:'rgba(244,114,182,0.18)',color:'#F472B6',border:'1px solid rgba(244,114,182,0.45)'}}>
          {matched}/{total} coppie
        </div>
        {!preview && matched < total && (
          <button onClick={startPreview}
            className="flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-black"
            style={{background:'rgba(244,114,182,0.12)',border:'1px solid rgba(244,114,182,0.4)',color:'#F472B6'}}>
            👁 Mostra carte 10s
          </button>
        )}
        {preview && (
          <div className="rounded-full px-4 py-1.5 text-sm font-black"
            style={{background:'rgba(244,114,182,0.25)',border:'1px solid rgba(244,114,182,0.6)',color:'#F472B6'}}>
            👁 Visibili {previewSecs}s…
          </div>
        )}
      </div>
      <div className={`grid gap-3`} style={{gridTemplateColumns:`repeat(${cols}, minmax(0, 1fr))`,width:'100%'}}>
        {cards.map(card => {
          const showFace = card.matched || card.flipped || preview;
          return (
            <div key={card.id}
              className="relative flex min-h-16 items-center justify-center rounded-2xl text-sm font-black"
              style={card.matched
                ? {background:'linear-gradient(135deg,#22c55e,#16a34a)',border:'2px solid #4ade80',boxShadow:'0 0 20px rgba(34,197,94,0.4)',color:'#fff'}
                : showFace
                ? {background:'linear-gradient(135deg,#F472B6,#ec4899)',border:'2px solid #F472B6',boxShadow:'0 0 25px rgba(244,114,182,0.5)',color:'#fff'}
                : {background:'rgba(255,255,255,0.05)',border:'2px solid rgba(244,114,182,0.3)',color:'rgba(255,255,255,0.5)'}}>
              {showFace ? (
                card.imageUrl
                  ? <img src={card.imageUrl} alt={card.text} className="h-16 w-16 rounded-xl object-cover"/>
                  : <span className="px-2 text-center text-sm font-black">{card.text}</span>
              ) : (
                card.imageUrl
                  ? <img src={card.imageUrl} alt="" className="h-16 w-16 rounded-xl object-cover"
                      style={{filter:'blur(8px)',opacity:0.15}}/>
                  : <span className="text-2xl text-white/25">?</span>
              )}
            </div>
          );
        })}
      </div>
      {matched >= total && total > 0 && (
        <motion.button initial={{scale:0}} animate={{scale:1}} transition={{type:'spring'}}
          onClick={onNext}
          className="flex items-center gap-3 rounded-2xl px-10 py-5 text-xl font-black text-black"
          style={{background:'linear-gradient(135deg,#F5B642,#FF8C00)',boxShadow:'0 0 50px #F5B64255'}}>
          <Trophy className="h-6 w-6"/> Tutte le coppie! Avanti
        </motion.button>
      )}
    </div>
  );
}
