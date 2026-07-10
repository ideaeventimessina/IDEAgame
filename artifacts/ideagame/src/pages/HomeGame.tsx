/**
 * HomeGame — Modalità HOME (TV/Proiettore)
 *
 * Flusso:
 *   welcome → join (QR + giocatori) → board (8 giochi) → playing → board → ... → champion
 *
 * URL: /home?s=SESSION_ID
 */

import { useState, useEffect, useRef, useCallback, useMemo, Component } from 'react';
import { createPortal } from 'react-dom';
import type { ErrorInfo, ReactNode } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import {
  Sparkles, Users, QrCode, Trophy, Timer,
  Play, SkipForward, Home, Loader2, Check, X, Music,
  Laugh, Star, Mic, ShieldAlert, Zap, MessageSquare, ChevronRight,
} from 'lucide-react';
import { QrPlaceholder } from '@/components/QrPlaceholder';
import { QRCodeSVG } from 'qrcode.react';
import { JonnyAvatar } from '@/components/JonnyAvatar';
import { useEventSocket, getSocket } from '@/hooks/useEventSocket';
import { RISATE_MISSIONS, YOGA_POSES, type RisateState } from '@/data/risate-missions';
import {
  type KaraokeHomeState, type KaraokePerformanceResult, type KaraokeAward,
  POSITIVE_REACTIONS, NEGATIVE_REACTIONS, DURATION_OPTIONS,
  formatCountdown, remainingSessionSeconds, computeAwards,
} from '@/data/karaoke-home';
import { GameFlowEngine } from '@/components/GameFlowEngine';
import { AudioManager } from '@/audio/AudioManager';
import { useAudioSettings } from '@/contexts/AudioContext';
import { IS_LOW_POWER, IS_PS4 } from '@/hooks/useLowPower';

// Gate verbose logs in production
const _log: typeof console.log = import.meta.env.DEV ? console.log.bind(console) : () => {};

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
    const sid = sessionId;
    emit('join:home', sid);
    // Re-join home room on socket reconnect — useEventSocket only re-joins event:* rooms
    const socket = getSocket();
    const onReconnect = () => {
      _log('[HomeFlow] TV socket reconnected — re-joining home room', sid);
      emit('join:home', sid);
    };
    socket.on('connect', onReconnect);
    return () => {
      socket.off('connect', onReconnect);
      emit('leave:home', sid);
    };
  }, [sessionId, emit]);
  return { on, emit };
}

// ── isSafeToShowTvMessages ────────────────────────────────────────────────────
// Returns true when it is safe to show the TV message batch overlay.
// Unsafe = any moment where players are actively performing / answering.
function isSafeToShowTvMessages(session: HomeSession | null, phase: string): boolean {
  if (!session) return false;
  if (phase === 'board' || phase === 'champion') return true;
  if (session.status !== 'playing') return true;

  const rp = session.roundPayload as Record<string, unknown>;
  const mode = String(rp['mode'] ?? '');

  if (!mode) return true; // no game active

  if (mode === 'home-karaoke') {
    const ks = rp['karaokeState'] as Record<string, unknown> | undefined;
    const kp = String(ks?.['phase'] ?? '');
    return kp === 'voting' || kp === 'transition' || kp === 'queue_open' || kp === 'finale';
  }
  if (mode === 'home-ballo') {
    const bp = String(rp['balloPhase'] ?? '');
    return bp === 'result' || bp === 'booking' || bp === '';
  }
  if (mode === 'home-wordback-setup') return false; // setup board handles interactions internally
  if (mode === 'home-wordback-booking') return true;
  if (mode === 'home-wordback') return String(rp['phase'] ?? '') === 'result';
  if (mode === 'home-quizzone') {
    const qp = String(rp['phase'] ?? '');
    return qp === 'result' || qp === 'podium';
  }
  if (mode === 'home-percorso') {
    return rp['timerStartedAt'] === null || rp['timerStartedAt'] === undefined;
  }
  if (mode === 'home-flow') {
    const gfp = String(rp['gameFlowPhase'] ?? '');
    return gfp === 'booking' || gfp === 'theme_select';
  }
  if (mode === 'home-adult') return false;
  if (mode === 'home-saramusica') return false; // board handles all phases internally
  if (mode === 'home-freestyle') {
    const fp = String(rp['phase'] ?? '');
    return fp !== 'performing' && fp !== 'battle';
  }
  return false; // default unsafe (home-coppie, unknown modes)
}

// ── Main ──────────────────────────────────────────────────────────────────────

type Phase = 'welcome' | 'join' | 'board' | 'playing' | 'champion';

const BUILD_STAMP = `bfb3131 · ${new Date().toISOString().slice(0,16).replace('T',' ')} · HomeGame`;
export default function HomeGame() {
  useEffect(() => {
    _log('[BuildCheck] HomeGame BUILD=' + BUILD_STAMP);
  }, []);
  const [, navigate] = useLocation();
  const urlParams = new URLSearchParams(window.location.search);
  const urlSessionId = urlParams.get('s');
  const liveCode = urlParams.get('live') ?? '';

  // No sessionId → redirect to home-v4 (generic entry); sessionId present → wait for load effect
  const [phase, setPhase] = useState<Phase>('board');
  useEffect(() => {
    if (!urlSessionId) {
      _log('[RoutingCheck] /home without session redirected to /home-v4');
      navigate('/home-v4');
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  const [session, setSession] = useState<HomeSession | null>(null);
  const [players, setPlayers] = useState<HomePlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  // Live remote: comandi da Presenter/Regia sul runtime Home (iframe TV)
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [showRanking, setShowRanking] = useState(false);
  // Ballo: brano YouTube di sottofondo scelto dal prescelto/presentatore
  const balloVideoRef = useRef<{ videoId: string; title: string } | null>(null);
  // Timer autoritativo: chiave del round in corso + istante di fine (ms epoch)
  const timerKeyRef = useRef<string>('');
  const timerEndsAtRef = useRef<number>(0);
  const [addTimeFlash, setAddTimeFlash] = useState<{ id: number; seconds: number } | null>(null);
  const [selectingGame, setSelectingGame] = useState<string | null>(null);
  const [jonnyMood, setJonnyMood] = useState<'idle' | 'excited' | 'thinking' | 'winner' | 'scoreboard' | 'correct'>('excited');
  const [jonnyMsg, setJonnyMsg] = useState('Benvenuti a JONNY\'S WORLD!');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tracks the last known roundPayload.mode so home:state can detect flow→ballo transition
  // even when slug/round haven't changed (both stay at sfida-ballo / 0 through the whole flow).
  const currentModeRef = useRef<string>('');
  // Tracks last known gameFlowPhase so playing-phase poll can detect home-flow transitions
  const flowPhaseRef = useRef<string>('');
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [audioWarning, setAudioWarning] = useState(false);
  const { audioEnabled, setAudioEnabled } = useAudioSettings();
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
  const [wordbackTimeoutOverlay, setWordbackTimeoutOverlay] = useState<{ reason: string; guesserNickname: string; word: string; bonusNicknames: string[]; bonusPoints: number } | null>(null);
  const [wordbackWrongOverlay, setWordbackWrongOverlay] = useState<{ guesserNickname: string; wrongAttempts: number; remainingAttempts: number } | null>(null);
  // Reset wordback overlays when round changes
  useEffect(() => { setWordbackTimeoutOverlay(null); setWordbackWrongOverlay(null); }, [session?.currentRound]);
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

  // ── Live mode Accedi ──────────────────────────────────────────────────────
  const [showAccedi, setShowAccedi] = useState(false);
  const [showPresenterQR, setShowPresenterQR] = useState(false);
  const [liveMeta, setLiveMeta] = useState<{ id: string; tvCode: string; presenterCode: string } | null>(null);
  const accediGameRef        = useRef<HTMLDivElement>(null);
  const accediGameTriggerRef = useRef<HTMLButtonElement>(null);
  const [accediGamePos, setAccediGamePos] = useState<{ top: number; right: number } | null>(null);
  useEffect(() => {
    if (!liveCode) return;
    fetch(`/api/live-sessions/by-code/${liveCode}`)
      .then(r => r.ok ? r.json() as Promise<{ id: string; tvCode: string; presenterCode: string }> : null)
      .then(d => {
        if (d) {
          setLiveMeta(d);
          console.log('[LiveAccess] liveMeta loaded (HomeGame)', { liveCode, id: d.id, presenterCode: d.presenterCode, tvCode: d.tvCode });
        }
      })
      .catch(() => {});
  }, [liveCode]);

  // ── Join live session socket room → receive presenter commands (audio, blackout…) ──
  useEffect(() => {
    if (!liveMeta?.id) return;
    const liveSessionId = liveMeta.id;
    emit('live:join', { sessionId: liveSessionId });
    console.log('[LiveCmd] TV joined live socket room', liveSessionId);
    return () => { emit('live:leave', { sessionId: liveSessionId }); };
  }, [liveMeta?.id, emit]);

  useEffect(() => {
    return on('live:command', (evt: unknown) => {
      const e = evt as { command: string; payload?: Record<string, unknown> };
      console.log('[LiveCmd] received', e.command, e.payload);
      if (e.command === 'stop_audio') {
        setAudioEnabled(false);
      } else if (e.command === 'toggle_audio') {
        setAudioEnabled(!audioEnabled);
      } else if (e.command === 'set_audio_muted') {
        setAudioEnabled(!(e.payload?.muted ?? true));
      }
    });
  }, [on, setAudioEnabled, audioEnabled]);

  // ── home:command — presenter bridges game-flow commands through /home-command ──
  useEffect(() => {
    const sid = session?.id;
    if (!sid) return;
    const BASE = (import.meta.env.BASE_URL as string) ?? '/';
    const homePost = (path: string, body?: unknown) =>
      fetch(`${BASE}api/home/sessions/${sid}/${path}`.replace(/\/\//g, '/'), {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    return on('home:command', (evt: unknown) => {
      const e = evt as { command: string; payload?: Record<string, unknown> };
      console.log('[HomeCmd] TV received', e.command, e.payload);
      if (e.command === 'select_game' && e.payload?.gameSlug) {
        void homePost('select-game', { gameSlug: e.payload.gameSlug });
      } else if (e.command === 'next_phase') {
        void homePost('next');
      } else if (e.command === 'end_game') {
        void homePost('end-game');
      } else if (e.command === 'set_audio_muted') {
        setAudioEnabled(!(e.payload?.muted ?? true));
      } else if (e.command === 'force_reveal') {
        if (timerRef.current) clearInterval(timerRef.current);
        setRevealed(true);
        setJonnyMood('correct');
      } else if (e.command === 'force_ranking') {
        // toggle esplicito se payload.show è definito, altrimenti alterna
        setShowRanking(prev => (typeof e.payload?.show === 'boolean' ? (e.payload!.show as boolean) : !prev));
      } else if (e.command === 'pause') {
        pausedRef.current = true;
        setPaused(true);
      } else if (e.command === 'resume') {
        pausedRef.current = false;
        setPaused(false);
      }
    });
  }, [on, session?.id, setAudioEnabled]);
  // Close Accedi portal panel on outside click
  useEffect(() => {
    if (!showAccedi) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insidePanel   = accediGameRef.current?.contains(target) ?? false;
      const insideTrigger = accediGameTriggerRef.current?.contains(target) ?? false;
      if (!insidePanel && !insideTrigger) setShowAccedi(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAccedi]);

  // ── TV Messaggi Segreti state ─────────────────────────────────────────────
  interface TvChatMsg { id: string; senderNickname: string; isAnonymous: boolean; text: string; createdAt: string; }
  const [tvChatQueue, setTvChatQueue] = useState<TvChatMsg[]>([]);
  const [tvChatBatch, setTvChatBatch] = useState<TvChatMsg[]>([]);
  const [tvChatVisible, setTvChatVisible] = useState(false);
  const tvChatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Ballo: video di sottofondo (presente solo se il prescelto/presentatore l'ha scelto)
  const balloVideo = useMemo<{ videoId: string; title: string } | null>(() => {
    const cfg = session?.gameConfig ?? {};
    return (cfg.balloVideo as { videoId: string; title: string } | null) ?? null;
  }, [session]);
  useEffect(() => { balloVideoRef.current = balloVideo; }, [balloVideo]);
  const balloActive = useMemo(() => {
    const rp = session?.roundPayload as Record<string, unknown> | undefined;
    return String(rp?.mode ?? '') === 'home-ballo';
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
            _log('[AudioFlowDebug] load-session status=playing phase=board — playLoop hub/lobby_loop');
            setPhase('board');
            AudioManager.stopLoop(true);
            void AudioManager.playLoop('hub', 'lobby_loop');
          } else {
            // Game in progress — restore correct music based on mode
            const flowMode = String(data.session.roundPayload?.mode ?? '');
            _log('[AudioFlowDebug] load-session status=playing phase=playing flowMode=' + flowMode + ' slug=' + (data.session.gameSlug ?? 'null'));
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
      const newFlowPhase = String(d.session.roundPayload?.gameFlowPhase ?? '');
      const prevMode = currentModeRef.current;
      _log('[HomeFlow] TV received home:state — mode:', newMode, '| gameFlowPhase:', newFlowPhase, '| status:', d.session.status);
      // ── Fallback: flow→ballo detected in home:state (handles missed home:round) ──
      // currentModeRef is set by home:round first in the normal path, so this only fires
      // when home:round was truly missed.
      if (prevMode === 'home-flow' && newMode === 'home-ballo') {
        _log('[BalloFlow] home:state (TV): flow→ballo fallback — starting ballo timer');
        currentModeRef.current = newMode;
        flowPhaseRef.current = newFlowPhase;
        setBalloEnergies({});
        setBalloCurrent({});
        setBalloResult(null);
        startTimer(Number(d.session.roundPayload?.timeLimit ?? 15), String(d.session.roundPayload?.roundStartedAt ?? 'ballo'));
        AudioManager.stopLoop(true);
        const hasBalloVideo = !!((d.session.gameConfig as Record<string, unknown> | undefined)?.balloVideo);
        if (!hasBalloVideo) void AudioManager.playLoop('sfida-ballo', 'round_loop');
      } else {
        currentModeRef.current = newMode;
        flowPhaseRef.current = newFlowPhase;
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
      _log('[AudioTrace] home:board — stopLoop then playLoop hub/lobby_loop');
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
        _log('[HomeAudioFlow] home:game_started flow — skipping timer+audio, phase=theme_select');
        return;
      }
      startTimer(Number(d.payload?.timeLimit ?? 30), String(d.payload?.roundStartedAt ?? `gs${d.session.currentRound}`));
      _log('[AudioTrace] home:game_started — stopLoop then playLoop', { slug: d.session.gameSlug ?? 'global', type: 'round_loop' });
      AudioManager.stopLoop(true);
      void AudioManager.playLoop(d.session.gameSlug ?? 'global', 'round_loop');
    });
    const u4 = on<{ round: number; payload: Record<string, unknown> }>('home:round', (d) => {
      const roundMode = String(d.payload?.mode ?? '');
      const prevMode  = currentModeRef.current;
      currentModeRef.current = roundMode;
      _log('[BalloFlow] home:round (TV) → mode:', roundMode, '| prevMode:', prevMode, '| round:', d.round);
      setSession(prev => prev ? { ...prev, currentRound: d.round, roundPayload: d.payload } : prev);
      setRevealed(false);
      setBalloEnergies({});
      setBalloCurrent({});
      setBalloResult(null);
      setBalloVotes({});
      startTimer(Number(d.payload?.timeLimit ?? 30), String(d.payload?.roundStartedAt ?? `r${d.round}`));
      setJonnyMood('thinking');
      // Audio switch: covers both normal ballo AND flow→ballo transition
      if (roundMode === 'home-ballo') {
        AudioManager.stopLoop(true);
        // Se il prescelto/presentatore ha scelto un brano YouTube, il video fornisce
        // la musica → NON avviare il loop audio del ballo.
        if (balloVideoRef.current) {
          _log('[HomeAudioFlow] home:round home-ballo — brano YouTube attivo, skip loop');
        } else {
          _log('[HomeAudioFlow] home:round home-ballo — switching to ballo audio');
          void AudioManager.playLoop('sfida-ballo', 'round_loop');
        }
      }
    });
    const u5 = on<{ session: HomeSession; players: HomePlayer[]; gameSlug: string }>('home:game_ended', (d) => {
      setSession(d.session);
      setPlayers(d.players);
      setJonnyMood('winner');
      setJonnyMsg(`${ALL_GAMES.find(g => g.slug === d.gameSlug)?.name ?? 'Gioco'} completato! 🎉`);
      _log('[AudioFlowDebug] home:game_ended — stopLoop then playLoop hub/lobby_loop for post-game screen');
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
      _log('[BalloTrace:tv] received home:ballo_live', { current: d.currentEnergies, peak: d.peakEnergies });
      setBalloCurrent(d.currentEnergies);
      setBalloEnergies(d.peakEnergies);
    });
    const u9 = on<{ winnerId: string | null; winnerNickname: string | null; points: number; energies: Record<string, number>; teamResult?: { winnerTeamId: string; winnerTeamPlayers: { id: string; nickname: string }[]; perPlayer: number; teamScores: { teamId: string; players: { id: string; nickname: string }[]; totalEnergy: number }[] } | null }>('home:ballo_result', (d) => {
      _log('[BalloTrace:tv] received home:ballo_result', { winnerId: d.winnerId, teamResult: d.teamResult });
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
      _log('[QuizTrace:tv] received home:quiz_all_answered', d);
      // All players answered — freeze timer and reveal correct answer on TV
      if (timerRef.current) { clearInterval(timerRef.current); _log('[QuizTrace:tv] timer stopped'); }
      setRevealed(true);
      _log('[QuizTrace:tv] set revealed true');
      setJonnyMood('correct');
    });
    const u11 = on<{ playerId: string; nickname: string; round: number; points: number }>('home:saramusica_winner', (d) => {
      _log('[SaraTrace:tv] received home:saramusica_winner', d);
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

    const u15 = on<{ reason: string; guesserId: string; suggesterId: string; guesserNickname?: string; word: string; wrongAttempts?: number; bonusPlayerIds: string[]; bonusNicknames: string[]; bonusPoints: number }>('home:wordback_timeout', (d) => {
      setWordbackTimeoutOverlay({ reason: d.reason, guesserNickname: d.guesserNickname ?? '', word: d.word, bonusNicknames: d.bonusNicknames, bonusPoints: d.bonusPoints });
      if (timerRef.current) clearInterval(timerRef.current);
    });

    const u16 = on<{ guesserId: string; guesserNickname: string; word: string; wrongAttempts: number; remainingAttempts: number; penalty: number }>('home:wordback_wrong', (d) => {
      setWordbackWrongOverlay({ guesserNickname: d.guesserNickname, wrongAttempts: d.wrongAttempts, remainingAttempts: d.remainingAttempts });
      setTimeout(() => setWordbackWrongOverlay(null), 2500);
    });

    const u17 = on<{ queue: unknown[] }>('home:chat_tv_queue_update', (d) => {
      setTvChatQueue(d.queue as TvChatMsg[]);
    });
    // Secondi aggiuntivi da Regia/Presenter → estende il countdown + mostra "+Ns" verde
    const u18 = on<{ seconds: number }>('home:add_time', (d) => addTimerSeconds(Number(d.seconds ?? 15)));
    return () => { u1?.(); u2?.(); u3?.(); u4?.(); u5?.(); u6?.(); u7?.(); u8?.(); u9?.(); u10?.(); u11?.(); u12?.(); u13?.(); u14?.(); u15?.(); u16?.(); u17?.(); u18?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  // ── TV Messaggi Segreti: safe-window batch display ───────────────────────────
  useEffect(() => {
    if (tvChatQueue.length === 0 || tvChatVisible) return;
    if (!isSafeToShowTvMessages(session, phase)) return;
    const batch = tvChatQueue.slice(0, 5);
    setTvChatBatch(batch);
    setTvChatVisible(true);
    setTvChatQueue(prev => prev.slice(batch.length));
    if (session?.id) emit('home:chat_tv_batch_shown', { sessionId: session.id, messageIds: batch.map(m => m.id) });
    if (tvChatTimerRef.current) clearTimeout(tvChatTimerRef.current);
    tvChatTimerRef.current = setTimeout(() => { setTvChatVisible(false); setTvChatBatch([]); }, 6000);
  }, [tvChatQueue.length, tvChatVisible, session, phase, emit]);

  // ── Polling fallback in playing phase (home-flow sessions only) ──────────────
  // Catches gameFlowPhase transitions (theme_select→booking, booking→confirm, etc.)
  // that socket delivery may miss after a reconnect.
  useEffect(() => {
    if (phase !== 'playing' || !session?.id) return;
    const sid = session.id;
    const interval = setInterval(() => {
      if (document.hidden) return;
      fetch(`/api/home/sessions/${sid}`)
        .then(r => r.ok ? r.json() : null)
        .then((d: { session: HomeSession; players: HomePlayer[] } | null) => {
          if (!d) return;
          const polledMode = String(d.session.roundPayload?.mode ?? '');
          const polledPhase = String(d.session.roundPayload?.gameFlowPhase ?? '');
          const isFlow = polledMode === 'home-flow' || currentModeRef.current === 'home-flow';
          const phaseChanged = isFlow && polledPhase !== flowPhaseRef.current;
          // P3: During booking, always refresh — bookedPlayers may change without the
          // gameFlowPhase changing, so a phase-diff check alone misses new bookings.
          const bookingRefresh = isFlow && polledPhase === 'booking';
          if (phaseChanged || bookingRefresh) {
            _log('[HomeFlow] TV polling: phase', flowPhaseRef.current, '→', polledPhase, '| bookingRefresh:', bookingRefresh);
            flowPhaseRef.current = polledPhase;
            currentModeRef.current = polledMode;
            setSession(d.session);
            setPlayers(d.players);
          }
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, session?.id]);

  // ── Polling fallback in join ──────────────────────────────────────────────────
  useEffect(() => {
    if ((phase !== 'join' && phase !== 'board') || !session?.id) return;
    const sid = session.id;
    const interval = setInterval(() => {
      if (document.hidden) return;
      fetch(`/api/home/sessions/${sid}`)
        .then(r => r.ok ? r.json() : null)
        .then((d: { session: HomeSession; players: HomePlayer[] } | null) => {
          if (!d) return;
          setPlayers(d.players);
          setSession(d.session);
          if (d.session.status === 'playing') {
            setPhase('playing');
            setRevealed(false);
            startTimer(Number(d.session.roundPayload?.timeLimit ?? 30), String(d.session.roundPayload?.roundStartedAt ?? `poll${d.session.currentRound}`));
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
  // Timer autoritativo basato su un istante di fine. `key` identifica il round
  // (di solito roundStartedAt): se il timer per la STESSA key è già in corso non
  // viene resettato → niente più countdown che rimbalzano (30→20→30) quando
  // socket/poll riconsegnano lo stesso round.
  const startTimer = useCallback((seconds: number, key?: string) => {
    const k = key ?? '';
    if (k && k === timerKeyRef.current && timerRef.current) return;
    timerKeyRef.current = k;
    if (timerRef.current) clearInterval(timerRef.current);
    timerEndsAtRef.current = Date.now() + seconds * 1000;
    setTimeLeft(seconds);
    const tick = () => {
      if (pausedRef.current) { timerEndsAtRef.current += 250; return; } // pausa: sposta la fine
      const rem = Math.max(0, Math.ceil((timerEndsAtRef.current - Date.now()) / 1000));
      setTimeLeft(rem);
      if (rem <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        setRevealed(true);
        setJonnyMood('correct');
      }
    };
    tick();
    timerRef.current = setInterval(tick, 250);
  }, []);

  // Aggiunge secondi al countdown in corso (solo Regia/Presenter via home:add_time).
  const addTimerSeconds = useCallback((n: number) => {
    if (timerEndsAtRef.current) {
      timerEndsAtRef.current += n * 1000;
      setTimeLeft(Math.max(0, Math.ceil((timerEndsAtRef.current - Date.now()) / 1000)));
    }
    setAddTimeFlash({ id: Date.now(), seconds: n });
  }, []);
  useEffect(() => {
    if (!addTimeFlash) return;
    const t = setTimeout(() => setAddTimeFlash(null), 1500);
    return () => clearTimeout(t);
  }, [addTimeFlash]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // ── WordBack timer-zero: notify server when TV countdown hits 0 ──────────────
  // The server will close the round, award +50 to eligible players, and emit
  // home:wordback_timeout so all clients (phone + TV) lock the round.
  const wordbackTimeoutFiredRef = useRef(false);
  useEffect(() => {
    if (timeLeft !== 0) { wordbackTimeoutFiredRef.current = false; return; }
    if (!session?.id) return;
    const mode = String(session.roundPayload?.mode ?? '');
    if (mode !== 'home-wordback') return;
    if (wordbackTimeoutFiredRef.current) return;
    wordbackTimeoutFiredRef.current = true;
    _log('[WordBackTimer:tv] timeLeft=0 — POST /wordback-timeout');
    fetch(`/api/home/sessions/${session.id}/wordback-timeout`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    }).catch((err) => _log('[WordBackTimer:tv] timeout POST failed', err));
  }, [timeLeft, session?.id, session?.roundPayload?.mode]);

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
        _log('[HomeAudioFlow] flow mode detected in selectGame — keeping lobby audio, entering theme_select');
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
        _log('[AudioFlowDebug] nextRound gameEnded — stopLoop then playLoop hub/lobby_loop for post-game screen');
        AudioManager.stopLoop(true);
        void AudioManager.playLoop('hub', 'lobby_loop');
        setPostGame({ gameSlug: finishedSlug ?? '', players: d.players ?? players });
      } else {
        setSession(d.session);
        setRevealed(false);
        startTimer(Number(d.payload?.timeLimit ?? 30), String(d.payload?.roundStartedAt ?? `next${d.session.currentRound}`));
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
      _log('[AudioFlowDebug] endGame — stopLoop then playLoop hub/lobby_loop for post-game screen');
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
    <div className="relative flex h-dvh w-full flex-col overflow-hidden"
      style={{ background: 'linear-gradient(-45deg,#07061a,#1d0545,#0a1845,#1a0800,#07061a)', backgroundSize: '500% 500%', animation: 'hgAurora 18s ease infinite' }}>

      <style>{`
        @keyframes hgAurora { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes hgPulse { 0%,100%{box-shadow:0 0 24px #F5B64255,0 0 60px #F5B64218} 50%{box-shadow:0 0 48px #F5B642aa,0 0 100px #F5B64235} }
        @keyframes hgFloat { 0%,100%{transform:translateY(0px) rotate(-1deg)} 50%{transform:translateY(-14px) rotate(1deg)} }
        @keyframes hgBlink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes hgSlideUp { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
        @keyframes hgAddTime { 0%{opacity:0;transform:translateX(-50%) translateY(10px) scale(0.8)} 20%{opacity:1;transform:translateX(-50%) translateY(0) scale(1.1)} 100%{opacity:0;transform:translateX(-50%) translateY(-70px) scale(1)} }
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

      {/* ── Ballo: video YouTube di sottofondo durante i round energia ── */}
      {phase === 'playing' && balloActive && balloVideo && <BalloVideoBg videoId={balloVideo.videoId} />}

      {/* ── +Ns verde (Regia/Presenter ha aggiunto tempo) — sale e sfuma ── */}
      {addTimeFlash && (
        <div key={addTimeFlash.id} className="pointer-events-none fixed left-1/2 top-16 z-[9997]"
          style={{ transform: 'translateX(-50%)', animation: 'hgAddTime 1.5s ease-out forwards' }}>
          <div className="text-6xl font-black" style={{ color: '#34D399', textShadow: '0 0 30px rgba(52,211,153,0.7)', fontFamily: "'Outfit','Arial Black',sans-serif" }}>
            +{addTimeFlash.seconds}s
          </div>
        </div>
      )}

      {/* ── Live remote: overlay PAUSA (comandato da Presenter/Regia) ── */}
      {paused && (
        <div className="pointer-events-none fixed inset-0 z-[9995] flex items-center justify-center"
          style={{ background:'rgba(7,6,26,0.72)', backdropFilter:'blur(6px)' }}>
          <div className="hg-blink text-6xl font-black" style={{ color:'#F5B642', textShadow:'0 0 40px #F5B64288', fontFamily:"'Outfit','Arial Black',sans-serif" }}>
            ⏸ PAUSA
          </div>
        </div>
      )}

      {/* ── Live remote: overlay CLASSIFICA (comandato da Presenter/Regia) ── */}
      {showRanking && (
        <div className="fixed inset-0 z-[9996] flex items-center justify-center"
          style={{ background:'rgba(7,6,26,0.94)', backdropFilter:'blur(8px)' }}>
          <div className="w-full max-w-2xl px-8">
            <div className="mb-6 text-center text-4xl font-black" style={{ color:'#F5B642', textShadow:'0 0 30px #F5B64288', fontFamily:"'Outfit','Arial Black',sans-serif" }}>
              🏆 CLASSIFICA
            </div>
            <div className="flex flex-col gap-2">
              {[...players].sort((a, b) => b.score - a.score).map((p, i) => (
                <div key={p.id} className="flex items-center gap-4 rounded-2xl px-5 py-3"
                  style={{ background:i===0?'rgba(245,182,66,0.18)':'rgba(255,255,255,0.06)', border:`1px solid ${i===0?'rgba(245,182,66,0.55)':'rgba(255,255,255,0.12)'}` }}>
                  <span className="w-8 text-xl font-black" style={{ color:i===0?'#F5B642':'#ffffff88' }}>{i + 1}</span>
                  <span className="h-4 w-4 shrink-0 rounded-full" style={{ background:p.avatarColor }} />
                  <span className="flex-1 truncate text-lg font-bold text-white">{p.nickname}</span>
                  <span className="text-xl font-black" style={{ color:'#F5B642' }}>{p.score}</span>
                </div>
              ))}
              {players.length === 0 && <div className="text-center text-white/50">Nessun giocatore collegato</div>}
            </div>
          </div>
        </div>
      )}

      {/* ── Messaggi Segreti: TV batch overlay ── */}
      {tvChatVisible && tvChatBatch.length > 0 && (
        <div className="fixed inset-x-6 z-[9990] rounded-2xl p-5 shadow-2xl"
          style={{top:80,background:'rgba(7,6,26,0.93)',border:'1px solid rgba(168,85,247,0.45)',backdropFilter:'blur(20px)'}}>
          <div className="mb-3 text-center text-xs font-black uppercase tracking-widest" style={{color:'#A855F7'}}>
            💌 Messaggi dalla sala
          </div>
          <div className="flex flex-col gap-2">
            {tvChatBatch.map(msg => (
              <div key={msg.id} className="rounded-xl px-4 py-2.5 text-sm" style={{background:'rgba(255,255,255,0.06)'}}>
                <span className="font-black" style={{color:'#F5B642'}}>
                  {msg.isAnonymous ? '🎭 Anonimo' : msg.senderNickname}
                </span>
                <span className="ml-2 text-white/80">{msg.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Global audio toggle — bottom-right ──────────────────────────────── */}
      <div className="absolute bottom-5 right-5 z-50 flex flex-col items-end gap-2">

        {/* Grouped [Attiva audio] [Silenzio] toggle pair */}
        <div
          className="flex items-center rounded-2xl overflow-hidden"
          style={{
            border: '1px solid rgba(245,182,66,0.35)',
            backdropFilter: 'blur(10px)',
            background: 'rgba(6,2,19,0.72)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          }}
        >
          {/* Attiva audio */}
          <button
            onClick={() => {
              // Call resumeContext() synchronously (gesture must be sync)
              // then update settings BEFORE starting the loop so playLoop
              // reads muted=false and creates the element already unmuted.
              AudioManager.resumeContext();
              setAudioEnabled(true);          // AudioManager.applySettings called sync → muted=false
              if (!audioUnlocked) {
                setAudioUnlocked(true);
                void AudioManager.playLoop('hub', 'lobby_loop').then(started => {
                  if (!started) setAudioWarning(true);
                });
              }
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-black transition-all duration-200 active:scale-95 select-none"
            style={{
              color:      audioEnabled ? '#F5B642' : 'rgba(255,255,255,0.28)',
              background: audioEnabled ? 'rgba(245,182,66,0.18)' : 'transparent',
              borderRight: '1px solid rgba(245,182,66,0.20)',
            }}
          >
            🎵 Attiva audio
          </button>

          {/* Silenzio */}
          <button
            onClick={() => setAudioEnabled(false)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-black transition-all duration-200 active:scale-95 select-none"
            style={{
              color:      !audioEnabled ? '#f87171' : 'rgba(255,255,255,0.28)',
              background: !audioEnabled ? 'rgba(239,68,68,0.18)' : 'transparent',
            }}
          >
            🔇 Silenzio
          </button>
        </div>

        {/* No-track warning — shown only after unlock if no MP3 uploaded */}
        {audioUnlocked && audioWarning && (
          <div className="flex items-center gap-3 rounded-2xl px-4 py-2.5 text-xs font-bold"
            style={{background:'rgba(245,182,66,0.10)',border:'1px solid rgba(245,182,66,0.30)',color:'rgba(245,182,66,0.70)',backdropFilter:'blur(10px)',maxWidth:260}}>
            <span className="shrink-0">🔇</span>
            <span>Nessun MP3 caricato — vai su <span className="underline">/admin</span></span>
            <button onClick={() => setAudioWarning(false)} className="ml-1 shrink-0 opacity-50 hover:opacity-100">✕</button>
          </div>
        )}
      </div>

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

              {/* 🔑 Accedi — live mode only (portal approach: panel rendered at body level) */}
              {liveCode && (
                <>
                  <button
                    ref={accediGameTriggerRef}
                    onClick={() => {
                      if (!showAccedi && accediGameTriggerRef.current) {
                        const r = accediGameTriggerRef.current.getBoundingClientRect();
                        setAccediGamePos({ top: r.bottom + 6, right: window.innerWidth - r.right });
                      }
                      setShowAccedi(v => !v);
                    }}
                    className="rounded-xl px-3 py-1.5 text-xs font-black transition-all hover:scale-105 active:scale-95"
                    style={{ background: showAccedi ? 'rgba(245,182,66,0.22)' : 'rgba(245,182,66,0.12)', border: `1px solid ${showAccedi ? 'rgba(245,182,66,0.7)' : 'rgba(245,182,66,0.4)'}`, color:'#F5B642', cursor:'pointer' }}>
                    🔑 Accedi
                  </button>

                  {showAccedi && accediGamePos && createPortal(
                    <div ref={accediGameRef} style={{
                      position: 'fixed',
                      top: accediGamePos.top,
                      right: accediGamePos.right,
                      zIndex: 99999,
                      background: 'rgba(8,4,24,0.97)',
                      border: '1.5px solid rgba(255,255,255,0.14)',
                      borderRadius: 18,
                      backdropFilter: 'blur(28px)',
                      boxShadow: '0 16px 60px rgba(0,0,0,0.8)',
                      padding: '13px 13px 11px',
                      display: 'flex', flexDirection: 'column', gap: 7,
                      minWidth: 226,
                    }}>
                      <div style={{ fontSize:'0.57rem', fontWeight:900, letterSpacing:'0.2em', color:'rgba(245,182,66,0.65)', textTransform:'uppercase', textAlign:'center', paddingBottom:4, borderBottom:'1px solid rgba(255,255,255,0.07)', marginBottom:2 }}>
                        🔴 Modalità Live
                      </div>

                      <button
                        onClick={() => { console.log('[LiveAccess] Admin clicked (game)'); window.open('/admin/live', '_blank'); }}
                        style={{ display:'flex', alignItems:'center', gap:9, padding:'10px 14px', background:'rgba(99,102,241,0.15)', border:'1.5px solid rgba(99,102,241,0.4)', borderRadius:11, color:'#a5b4fc', fontSize:'0.82rem', fontWeight:800, cursor:'pointer', width:'100%', transition:'all 0.15s' }}
                        onMouseEnter={e=>{e.currentTarget.style.background='rgba(99,102,241,0.28)';e.currentTarget.style.borderColor='rgba(99,102,241,0.7)';}}
                        onMouseLeave={e=>{e.currentTarget.style.background='rgba(99,102,241,0.15)';e.currentTarget.style.borderColor='rgba(99,102,241,0.4)';}}>
                        🛠 Admin <span style={{marginLeft:'auto',fontSize:'0.58rem',opacity:0.45}}>↗ nuova tab</span>
                      </button>

                      <button
                        onClick={() => {
                          const sid = session?.id ?? urlSessionId;
                          const url = `/home?s=${sid}${liveCode ? `&live=${liveCode}` : ''}`;
                          console.log('[LiveAccess] Regia/TV clicked (game)', { url });
                          window.open(url, '_blank');
                        }}
                        style={{ display:'flex', alignItems:'center', gap:9, padding:'10px 14px', background:'rgba(245,182,66,0.13)', border:'1.5px solid rgba(245,182,66,0.4)', borderRadius:11, color:'#F5B642', fontSize:'0.82rem', fontWeight:800, cursor:'pointer', width:'100%', transition:'all 0.15s' }}
                        onMouseEnter={e=>{e.currentTarget.style.background='rgba(245,182,66,0.25)';e.currentTarget.style.borderColor='rgba(245,182,66,0.7)';}}
                        onMouseLeave={e=>{e.currentTarget.style.background='rgba(245,182,66,0.13)';e.currentTarget.style.borderColor='rgba(245,182,66,0.4)';}}>
                        🖥 Schermo TV / Regia <span style={{marginLeft:'auto',fontSize:'0.58rem',opacity:0.45}}>↗ nuova tab</span>
                      </button>

                      <button
                        onClick={() => {
                          if (!liveMeta) return;
                          console.log('[LiveAccess] Presenter clicked (game)', { presenterCode: liveMeta.presenterCode });
                          window.open(`/live-presenter?s=${liveMeta.presenterCode}`, '_blank');
                        }}
                        disabled={!liveMeta}
                        style={{ display:'flex', alignItems:'center', gap:9, padding:'10px 14px', background: liveMeta ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)', border: liveMeta ? '1.5px solid rgba(52,211,153,0.4)' : '1.5px solid rgba(255,255,255,0.08)', borderRadius:11, color: liveMeta ? '#6ee7b7' : 'rgba(255,255,255,0.25)', fontSize:'0.82rem', fontWeight:800, cursor: liveMeta ? 'pointer' : 'default', width:'100%', transition:'all 0.15s' }}
                        onMouseEnter={e=>{if(liveMeta){e.currentTarget.style.background='rgba(52,211,153,0.24)';e.currentTarget.style.borderColor='rgba(52,211,153,0.7)';}}}
                        onMouseLeave={e=>{if(liveMeta){e.currentTarget.style.background='rgba(52,211,153,0.12)';e.currentTarget.style.borderColor='rgba(52,211,153,0.4)';}}}>
                        🎤 Presentatore <span style={{marginLeft:'auto',fontSize:'0.58rem',opacity:0.45}}>{liveMeta?'↗ nuova tab':'…'}</span>
                      </button>

                      {liveMeta && (
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5, paddingTop:3 }}>
                          <div style={{ background:'#fff', borderRadius:9, padding:6, lineHeight:0, boxShadow:'0 0 16px rgba(52,211,153,0.22)' }}>
                            <QRCodeSVG value={`${window.location.origin}/live-presenter?s=${liveMeta.presenterCode}`} size={104} bgColor="#ffffff" fgColor="#03000f" level="M"/>
                          </div>
                          <div style={{ fontSize:'0.55rem', fontWeight:700, color:'rgba(255,255,255,0.32)', textAlign:'center' }}>/live-presenter?s={liveMeta.presenterCode}</div>
                        </div>
                      )}
                    </div>,
                    document.body
                  )}
                </>
              )}
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

            {!(session.gameSlug === 'karaoke-battle' &&
                ((session.gameConfig as Record<string,unknown>)?.karaokeHomeState as {version?:number}|undefined)?.version === 3
              ) && <HomeSessionQROverlay joinCode={session.joinCode} />}
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

              {/* Timer — hidden for modes with their own internal timer */}
              {!(['home-percorso','home-coppie','home-quizzone','home-saramusica','home-adult','home-ballo','home-flow','home-wordback','home-wordback-booking','home-wordback-setup'].includes(
                  String((session.roundPayload as Record<string,unknown>)?.mode ?? '')) ||
                (session.gameSlug === 'karaoke-battle' &&
                  ((session.gameConfig as Record<string,unknown>)?.karaokeHomeState as {version?:number}|undefined)?.version === 3)
              ) && (
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
              )}

              <div className="flex gap-2">
                {!(['home-percorso','home-coppie','home-quizzone','home-saramusica','home-adult','home-ballo'].includes(
                    String((session.roundPayload as Record<string,unknown>)?.mode ?? '')) ||
                  (session.gameSlug === 'karaoke-battle' &&
                    ((session.gameConfig as Record<string,unknown>)?.karaokeHomeState as {version?:number}|undefined)?.version === 3)
                ) && (
                <button onClick={nextRound}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-2xl px-5 py-2 text-sm font-bold disabled:opacity-40"
                  style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.14)',color:'rgba(255,255,255,0.65)'}}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <SkipForward className="h-4 w-4"/>} Avanti
                </button>
                )}
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
              <GameBoardErrorBoundary
                key={session.currentRound}
                gameSlug={session.gameSlug ?? ''}
                mode={String((session.roundPayload as Record<string,unknown>)?.mode ?? '')}
                roundPayload={(session.roundPayload as Record<string,unknown>) ?? {}}>
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
                wordbackTimeoutOverlay={wordbackTimeoutOverlay}
                wordbackWrongOverlay={wordbackWrongOverlay}
                onScore={async (pid,pts) => {
                  // Optimistic update — score appears immediately in bar + partial leaderboard
                  setPlayers(prev => prev.map(p => p.id === pid ? { ...p, score: pts } : p));
                  await fetch(`/api/home/sessions/${session.id}/score`, {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({ playerId:pid, points:pts }),
                  });
                  // Socket broadcastState reconciles with authoritative server state
                }}/>
              </GameBoardErrorBoundary>
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

// ── GameBoardErrorBoundary ────────────────────────────────────────────────────

interface GBEBProps {
  children: ReactNode;
  gameSlug: string;
  mode: string;
  roundPayload: Record<string, unknown>;
}
interface GBEBState { hasError: boolean; errorMsg: string }

class GameBoardErrorBoundary extends Component<GBEBProps, GBEBState> {
  constructor(props: GBEBProps) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }
  static getDerivedStateFromError(error: Error): GBEBState {
    return { hasError: true, errorMsg: String(error?.message ?? error) };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    const { gameSlug, mode, roundPayload } = this.props;
    console.error('[GameBoardError]', {
      gameSlug,
      mode,
      roundPayloadSummary: {
        mode: roundPayload.mode,
        roundIndex: roundPayload.roundIndex,
        word: roundPayload.word,
        bookingOpenUntil: roundPayload.bookingOpenUntil,
      },
      error: String(error),
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center gap-6 text-center px-6 py-10">
          <div className="text-6xl">⚠️</div>
          <div className="text-2xl font-black text-white">Errore schermata gioco — recupero in corso</div>
          <div className="text-sm text-white/40 max-w-xs break-words">{this.state.errorMsg}</div>
          <button
            onClick={() => { this.setState({ hasError: false, errorMsg: '' }); window.location.reload(); }}
            className="rounded-2xl px-8 py-3 text-base font-black text-white"
            style={{ background: 'linear-gradient(135deg,#A78BFA,#7C3AED)', boxShadow: '0 0 30px rgba(167,139,250,0.4)' }}>
            Ricarica stato
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── RoundBoard ────────────────────────────────────────────────────────────────

function RoundBoard({ session, revealed, onReveal, onNext, players, onScore, balloEnergies, balloCurrent, balloResult, balloVotes, onBalloReset, onStageNext, onEndBallo, saraMusicaWinner, balloSensitivity, onSensitivity, sensorReadyMap, tabooAlarm, wordbackTimeoutOverlay, wordbackWrongOverlay }: {
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
  wordbackTimeoutOverlay?: { reason: string; guesserNickname: string; word: string; bonusNicknames: string[]; bonusPoints: number } | null;
  wordbackWrongOverlay?: { guesserNickname: string; wrongAttempts: number; remainingAttempts: number } | null;
}) {
  const p = session.roundPayload;
  const mode = String(p.mode ?? 'home-quiz');
  const _ks_probe = session.gameConfig?.karaokeHomeState as KaraokeHomeState | undefined;

  if (mode === 'home-flow')       return <GameFlowEngine session={session} players={players} sensorReadyMap={sensorReadyMap}/>;
  if (mode === 'home-quiz')       return <QuizBoard payload={p} revealed={revealed} onReveal={onReveal}/>;
  if (mode === 'home-quizzone')   return <QuizzoneBoard payload={p} session={session} players={players}/>;
  if (mode === 'home-ballo')      return <BalloBoard session={session} payload={p} players={players} balloEnergies={balloEnergies ?? {}} balloCurrent={balloCurrent ?? {}} balloResult={balloResult ?? null} balloVotes={balloVotes ?? {}} onReset={onBalloReset} onStageNext={onStageNext} onEndBallo={onEndBallo} sensitivity={balloSensitivity ?? 1} onSensitivity={onSensitivity}/>;
  if (mode === 'home-percorso')   return <PercorsoBoard sessionId={session.id} payload={p} onReveal={onReveal} players={players} onScore={onScore}/>;
  if (mode === 'home-coppie')     return <CoppieBoard payload={p} onNext={onNext} sessionId={session.id}/>;
  if (mode === 'home-saramusica') return <SaraMusicaBoard payload={p} session={session} players={players}/>;
  if (mode === 'home-adult')      return <AdultOnlyBoard payload={p} session={session} players={players}/>;
  if (mode === 'home-wordback-setup') return <WordBackSetupBoard payload={p} sessionId={session.id}/>;
  if (mode === 'home-wordback' || mode === 'home-wordback-booking')   return <WordBackBoard payload={p} players={players} onScore={onScore} onReveal={onReveal} tabooAlarm={tabooAlarm ?? null} sessionId={session.id} timeoutOverlay={wordbackTimeoutOverlay} wrongOverlay={wordbackWrongOverlay}/>;
  // FIX: version=3 check MUST come before mode-based routing (mode is still 'home-karaoke' even for new system)
  const ks = _ks_probe;
  if (session.gameSlug === 'karaoke-battle' && ks?.version === 3) {
    // QR "saldato": sempre visibile per tutta la fase karaoke, così si può
    // entrare e prenotare in qualsiasi momento.
    const karaokeJoinUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}${(import.meta.env.BASE_URL as string ?? '/')}home/join?s=${session.joinCode}`
      .replace(/([^:])\/\//g, '$1/');
    return (
      <>
        <KaraokeLiveBoard sessionId={session.id} state={ks} players={players} />
        <KaraokeQROverlay joinUrl={karaokeJoinUrl} />
      </>
    );
  }
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

// ── QuizzoneBoard — full live show TV view ────────────────────────────────────

const QZ = '#F5B642';
const QZ_GLOW = 'rgba(245,182,66,0.55)';
const TYPE_BADGE: Record<string, { label: string; emoji: string; color: string }> = {
  multiple_choice:  { label: 'Risposta Multipla', emoji: '❓', color: '#A78BFA' },
  true_false:       { label: 'Vero o Falso',       emoji: '⚖️', color: '#60A5FA' },
  image_vs_image:   { label: 'Immagine vs Immagine',emoji: '🖼️', color: '#F472B6' },
  speed_round:      { label: 'Speed Round ⚡',      emoji: '⚡', color: '#F97316' },
  progressive_clue: { label: 'Indizi Progressivi',  emoji: '🔍', color: '#34D399' },
  order_choice:     { label: 'Metti in Ordine',     emoji: '📋', color: '#818CF8' },
  final_bomb:       { label: '🔥 DOMANDA FINALE',   emoji: '💣', color: '#EF4444' },
};
const QZ_THEMES_CLIENT = [
  { id:'cultura_generale', label:'Cultura Generale', emoji:'🎓' },
  { id:'cinema',           label:'Cinema',           emoji:'🎬' },
  { id:'musica',           label:'Musica',           emoji:'🎵' },
  { id:'sport',            label:'Sport',            emoji:'⚽' },
  { id:'matrimonio',       label:'Matrimonio',       emoji:'💍' },
  { id:'anni90',           label:'Anni 90',          emoji:'📼' },
  { id:'sicilia',          label:'Sicilia',          emoji:'🍋' },
  { id:'bambini',          label:'Bambini',          emoji:'🎈' },
  { id:'custom',           label:'Custom Mix',       emoji:'✨' },
];
interface QzQuestion {
  id: string; type: string; question: string;
  answers: string[]; correctAnswerIndex: number;
  imageA?: string; imageB?: string; clues?: string[];
  points: number; timeLimit: number;
}
interface QzRevealData {
  correctAnswerIndex: number;
  playerResults: { playerId: string; nickname: string; answerIndex: number | null; correct: boolean; points: number }[];
}
interface QzRankingEntry { playerId: string; nickname: string; score: number; delta: number; avatarColor: string }

function QuizzoneBoard({ payload, session, players }: {
  payload: Record<string,unknown>;
  session: HomeSession;
  players: HomePlayer[];
}) {
  const [busy, setBusy] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [selectedDiff, setSelectedDiff] = useState<"easy"|"medium"|"hard">("medium");
  // Argomenti salvati dal presentatore Live (toggle "visibile in Home")
  const [savedTopics, setSavedTopics] = useState<{ id: string; label: string }[]>([]);

  const phase = String(payload.phase ?? 'setup_theme');
  useEffect(() => {
    if (phase !== 'setup_theme') return;
    fetch('/api/home/quiz-topics')
      .then(r => r.ok ? r.json() : { topics: [] })
      .then((d: { topics?: { id: string; label: string }[] }) => setSavedTopics(d.topics ?? []))
      .catch(() => {});
  }, [phase]);
  const questions = (payload.questions as QzQuestion[]) ?? [];
  const currentIndex = Number(payload.currentIndex ?? -1);
  const currentQ = currentIndex >= 0 && currentIndex < questions.length ? questions[currentIndex] : null;
  const questionCount = Number(payload.questionCount ?? 10);
  const allAnswered = Boolean(payload.allAnsweredForCurrent);
  const answeredCount = Number(payload.answeredCount ?? 0);
  const revealData = payload.revealData as QzRevealData | null;
  const rankingData = (payload.rankingData as QzRankingEntry[]) ?? null;
  const countdownValue = payload.countdownValue as number | null;
  const currentClueIndex = Number(payload.currentClueIndex ?? 0);
  const themeName = String(payload.themeName ?? '');

  // Client-side countdown timer — uses questionEndsAt when available (unified source of truth)
  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (phase !== 'question' || !currentQ) { setTimeLeft(null); return; }
    const endsAt = payload.questionEndsAt
      ? new Date(String(payload.questionEndsAt)).getTime()
      : payload.questionStartedAt
        ? new Date(String(payload.questionStartedAt)).getTime() + (currentQ.timeLimit * 1000)
        : null;
    if (!endsAt) { setTimeLeft(null); return; }
    const tick = () => { setTimeLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))); };
    tick();
    timerRef.current = setInterval(tick, 250);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentIndex]);

  const post = async (path: string, body?: Record<string,unknown>) => {
    if (busy) return;
    setBusy(true);
    try { await fetch(`/api/home/sessions/${session.id}${path}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body ?? {}) }); }
    finally { setBusy(false); }
  };

  const badge = currentQ ? (TYPE_BADGE[currentQ.type] ?? TYPE_BADGE['multiple_choice']!) : null;
  const LETTERS = ['A','B','C','D'];
  const ANS_COLORS = ['#3B82F6','#EC4899','#EAB308','#10B981'];

  // ── setup_theme ────────────────────────────────────────────────────────────
  if (phase === 'setup_theme') {
    const suggestions = (payload.quizSuggestions as { playerId: string; nickname: string; text: string }[] | undefined) ?? [];
    // Count occurrences per suggestion text (case-insensitive)
    const suggCounts: Record<string, { text: string; count: number; nicks: string[] }> = {};
    for (const s of suggestions) {
      const k = s.text.trim().toLowerCase();
      if (!suggCounts[k]) suggCounts[k] = { text: s.text, count: 0, nicks: [] };
      suggCounts[k]!.count++;
      if (!suggCounts[k]!.nicks.includes(s.nickname)) suggCounts[k]!.nicks.push(s.nickname);
    }
    const topSuggs = Object.values(suggCounts).sort((a, b) => b.count - a.count).slice(0, 5);
    const bestThemeId = topSuggs[0]?.text
      ? (QZ_THEMES_CLIENT.find(t => t.label.toLowerCase() === topSuggs[0]!.text.toLowerCase())?.id ?? 'custom')
      : 'random';
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-4xl">
        <div className="text-center">
          <div className="text-display text-4xl font-black text-white mb-2">Che tema vuoi per il</div>
          <div className="text-display text-5xl font-black" style={{ color: QZ, textShadow: `0 0 40px ${QZ_GLOW}` }}>⭐ QUIZZONE?</div>
          <div className="text-sm text-white/40 mt-2">I giocatori propongono il tema dal telefono</div>
        </div>

        {/* Player suggestions */}
        {topSuggs.length > 0 && (
          <div className="w-full rounded-2xl p-5" style={{ background: `${QZ}12`, border: `1px solid ${QZ}33` }}>
            <div className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: QZ }}>
              💬 Proposte dei giocatori ({suggestions.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {topSuggs.map(s => (
                <button key={s.text} onClick={() => void post('/quiz/select-theme', { themeId: QZ_THEMES_CLIENT.find(t => t.label.toLowerCase() === s.text.toLowerCase())?.id ?? s.text })}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-xl px-4 py-2 font-black text-sm transition-all hover:scale-105 disabled:opacity-50"
                  style={{ background: `${QZ}25`, border: `2px solid ${QZ}66`, color: QZ }}>
                  {s.text}
                  {s.count > 1 && <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: `${QZ}33` }}>×{s.count}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Theme grid */}
        <div className="grid grid-cols-3 gap-4 w-full">
          {QZ_THEMES_CLIENT.map(t => (
            <button key={t.id} onClick={() => void post('/quiz/select-theme', { themeId: t.id })}
              disabled={busy}
              className="flex flex-col items-center gap-3 rounded-2xl p-6 transition-all hover:scale-105 disabled:opacity-50"
              style={{ background:'rgba(245,182,66,0.08)', border:`2px solid rgba(245,182,66,0.25)`, backdropFilter:'blur(10px)' }}>
              <span style={{ fontSize:'3rem' }}>{t.emoji}</span>
              <span className="text-base font-black text-white text-center leading-snug">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Argomenti salvati dal Live (visibili in Home) */}
        {savedTopics.length > 0 && (
          <div className="w-full rounded-2xl p-5" style={{ background: 'rgba(96,165,250,0.10)', border: '1px solid rgba(96,165,250,0.3)' }}>
            <div className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: '#60A5FA' }}>
              ✨ Argomenti creati dal vivo
            </div>
            <div className="flex flex-wrap gap-2">
              {savedTopics.map(t => (
                <button key={t.id} onClick={() => void post('/quiz/select-theme', { themeId: t.id })}
                  disabled={busy}
                  className="rounded-xl px-4 py-2 font-black text-sm transition-all hover:scale-105 disabled:opacity-50"
                  style={{ background: 'rgba(96,165,250,0.2)', border: '2px solid rgba(96,165,250,0.5)', color: '#93C5FD' }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* GENERA QUIZZONE CTA */}
        <button onClick={() => void post('/quiz/select-theme', { themeId: bestThemeId })}
          disabled={busy}
          className="w-full rounded-2xl py-5 text-xl font-black text-black transition-all hover:scale-[1.02] disabled:opacity-40"
          style={{ background: `linear-gradient(135deg,${QZ},#F97316)`, boxShadow: `0 0 50px ${QZ_GLOW}` }}>
          {busy ? '⏳ Caricamento…' : suggestions.length > 0
            ? `⚡ GENERA QUIZZONE — "${topSuggs[0]?.text ?? '?'}"`
            : '⚡ GENERA QUIZZONE — Tema Casuale'}
        </button>
      </div>
    );
  }

  // ── setup_count ────────────────────────────────────────────────────────────
  if (phase === 'setup_count') {
    const DIFFS: { id: "easy"|"medium"|"hard"; label: string; emoji: string; desc: string }[] = [
      { id:"easy",   label:"Facile",  emoji:"🟢", desc:"Più tempo · Meno punti" },
      { id:"medium", label:"Medio",   emoji:"🟡", desc:"Bilanciato" },
      { id:"hard",   label:"Difficile",emoji:"🔴", desc:"Meno tempo · Più punti" },
    ];
    return (
      <div className="flex flex-col items-center gap-8 w-full max-w-2xl">
        <div className="text-center">
          <div className="text-xl font-bold text-white/50 mb-1">Tema: <span style={{ color: QZ }}>{themeName}</span></div>
          <div className="text-display text-4xl font-black text-white">Difficoltà e domande</div>
        </div>
        <div className="flex gap-3 w-full">
          {DIFFS.map(d => (
            <button key={d.id} onClick={() => setSelectedDiff(d.id)}
              className="flex-1 flex flex-col items-center gap-1 rounded-2xl py-4 px-2 transition-all hover:scale-105 border-2"
              style={{
                background: selectedDiff === d.id ? `${QZ}22` : 'rgba(255,255,255,0.04)',
                borderColor: selectedDiff === d.id ? QZ : 'rgba(255,255,255,0.1)',
                boxShadow: selectedDiff === d.id ? `0 0 20px ${QZ}44` : 'none',
              }}>
              <span className="text-2xl">{d.emoji}</span>
              <span className="font-black text-white text-sm">{d.label}</span>
              <span className="text-xs text-white/40">{d.desc}</span>
            </button>
          ))}
        </div>
        <div className="text-white/50 text-sm font-bold">Quante domande?</div>
        <div className="grid grid-cols-2 gap-5 w-full">
          {[5,10,15,20].map(n => (
            <button key={n} onClick={() => void post('/quiz/select-count', { count: n, difficulty: selectedDiff })}
              disabled={busy}
              className="flex flex-col items-center gap-1 rounded-3xl py-8 transition-all hover:scale-105"
              style={{ background:`linear-gradient(135deg,${QZ}22,${QZ}08)`, border:`2px solid ${QZ}55`, boxShadow: busy ? 'none' : `0 0 30px ${QZ}22` }}>
              <span className="text-display text-6xl font-black" style={{ color: QZ }}>{n}</span>
              <span className="text-sm font-bold text-white/50">domande</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── generating ─────────────────────────────────────────────────────────────
  if (phase === 'generating') return (
    <div className="flex flex-col items-center gap-8 text-center">
      <motion.div animate={{ scale:[1,1.05,1], opacity:[0.7,1,0.7] }} transition={{ repeat:Infinity, duration:1.8 }}
        className="text-8xl">⭐</motion.div>
      <div className="text-display text-3xl font-black text-white">Jonny sta creando</div>
      <div className="text-display text-4xl font-black" style={{ color: QZ }}>la gara perfetta…</div>
      <div className="flex gap-2 mt-2">
        {[0,1,2,3,4].map(i => (
          <motion.div key={i} className="h-3 w-3 rounded-full" style={{ background: QZ }}
            animate={{ y:[0,-10,0] }} transition={{ repeat:Infinity, duration:0.8, delay:i*0.15 }} />
        ))}
      </div>
    </div>
  );

  // ── countdown ──────────────────────────────────────────────────────────────
  if (phase === 'countdown') return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="text-xl font-bold text-white/50">{questionCount} domande · {themeName}</div>
      <motion.div key={countdownValue} initial={{ scale:0.4, opacity:0 }} animate={{ scale:1, opacity:1 }}
        exit={{ scale:1.4, opacity:0 }} transition={{ type:'spring', stiffness:300, damping:18 }}
        className="text-display font-black" style={{ fontSize:'18rem', lineHeight:1, color: QZ, textShadow:`0 0 120px ${QZ_GLOW}` }}>
        {countdownValue ?? ''}
      </motion.div>
      <div className="text-2xl font-bold text-white/60">Preparatevi!</div>
    </div>
  );

  // ── question ───────────────────────────────────────────────────────────────
  if (phase === 'question' && currentQ) {
    const endsAt = payload.questionEndsAt ? new Date(String(payload.questionEndsAt)).getTime() : null;
    const startAt = payload.questionStartedAt ? new Date(String(payload.questionStartedAt)).getTime() : null;
    const totalDuration = endsAt && startAt ? Math.max(1, (endsAt - startAt) / 1000) : currentQ.timeLimit;
    const timerPct = timeLeft !== null ? timeLeft / totalDuration : 1;
    const timerColor = timerPct > 0.5 ? '#4ade80' : timerPct > 0.25 ? '#facc15' : '#ef4444';
    const clues = currentQ.clues ?? [];
    const visibleClues = clues.slice(0, currentClueIndex + 1);
    return (
      <div className="flex flex-col gap-5 w-full max-w-4xl">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {badge && (
              <div className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black"
                style={{ background:`${badge.color}22`, border:`1px solid ${badge.color}55`, color: badge.color }}>
                {badge.emoji} {badge.label}
              </div>
            )}
            <div className="rounded-full px-3 py-1 text-sm font-bold" style={{ background:'rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.5)' }}>
              {currentIndex + 1} / {questionCount}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {allAnswered && <div className="rounded-full px-4 py-2 text-sm font-black text-white" style={{ background:'rgba(34,197,94,0.2)', border:'1px solid rgba(34,197,94,0.5)' }}>✅ Tutti hanno risposto!</div>}
            {!allAnswered && <div className="text-sm font-bold text-white/40">{answeredCount} risposto</div>}
            {timeLeft !== null && (
              <div className="text-3xl font-black" style={{ color: timerColor, textShadow:`0 0 20px ${timerColor}88` }}>
                {timeLeft === 0 ? '⏰ SCADUTO' : `${timeLeft}s`}
              </div>
            )}
          </div>
        </div>
        {/* Timer bar */}
        <div className="h-2 w-full rounded-full overflow-hidden" style={{ background:'rgba(255,255,255,0.08)' }}>
          <motion.div className="h-full rounded-full" style={{ background: timerColor, width:`${timerPct * 100}%`, transition:'width 0.25s linear' }} />
        </div>
        {/* Question */}
        <div className="rounded-3xl p-7 text-center" style={{ background:`linear-gradient(135deg,${badge?.color ?? QZ}18,rgba(0,0,0,0.3))`, border:`1px solid ${badge?.color ?? QZ}44` }}>
          {currentQ.type === 'progressive_clue' ? (
            <div className="flex flex-col gap-3">
              {visibleClues.map((clue, ci) => (
                <div key={ci} className="text-lg font-bold" style={{ color: ci < currentClueIndex ? 'rgba(255,255,255,0.45)' : 'white' }}>
                  {ci === 0 ? '🔍' : ci === 1 ? '🔎' : '💡'} Indizio {ci+1}: {clue}
                </div>
              ))}
              <div className="text-display text-2xl font-black text-white/70 mt-2">{currentQ.question}</div>
            </div>
          ) : currentQ.type === 'image_vs_image' ? (
            <div>
              <div className="text-display text-2xl font-black text-white mb-4">{currentQ.question}</div>
              <div className="flex gap-4 justify-center">
                {currentQ.imageA && <img src={currentQ.imageA} alt="A" className="h-40 w-48 rounded-2xl object-cover" />}
                <div className="text-3xl font-black text-white/40 self-center">VS</div>
                {currentQ.imageB && <img src={currentQ.imageB} alt="B" className="h-40 w-48 rounded-2xl object-cover" />}
              </div>
            </div>
          ) : (
            <div className="text-display text-2xl font-black text-white leading-snug">{currentQ.question}</div>
          )}
        </div>
        {/* Answers */}
        {currentQ.type === 'image_vs_image' ? (
          <div className="flex gap-4">
            {[0, 1].map(i => {
              const imgSrc = i === 0 ? currentQ.imageA : currentQ.imageB;
              const label = currentQ.answers[i] ?? (i === 0 ? 'A' : 'B');
              const color = ANS_COLORS[i] ?? QZ;
              const placeholder = `https://placehold.co/600x400/1a1a2e/F5B642?text=${encodeURIComponent(label)}`;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-2 rounded-2xl overflow-hidden"
                  style={{ border:`2px solid ${color}55`, background:`${color}12` }}>
                  <img src={imgSrc ?? placeholder} alt={label}
                    className="w-full object-cover" style={{ height:'180px' }}
                    onError={(e) => { (e.target as HTMLImageElement).src = placeholder; }} />
                  <div className="pb-3 px-3 text-center font-black text-base text-white leading-snug">{label}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={currentQ.type === 'true_false' ? 'flex gap-4' : 'grid grid-cols-2 gap-3'}>
            {currentQ.answers.map((ans, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl px-5 py-4"
                style={{ background:`${ANS_COLORS[i] ?? QZ}18`, border:`2px solid ${ANS_COLORS[i] ?? QZ}44`, flex: currentQ.type === 'true_false' ? '1' : undefined }}>
                {currentQ.type !== 'true_false' && (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-black text-sm"
                    style={{ background: ANS_COLORS[i] ?? QZ, color:'#000' }}>{LETTERS[i]}</div>
                )}
                <div className="font-black text-base text-white text-center flex-1">{ans}</div>
              </div>
            ))}
          </div>
        )}
        {/* Host controls */}
        <div className="flex items-center justify-between mt-1">
          {currentQ.type === 'progressive_clue' && currentClueIndex < (clues.length - 1) && (
            <button onClick={() => void post('/quiz/next-clue')} disabled={busy}
              className="rounded-xl px-5 py-3 text-sm font-black"
              style={{ background:'rgba(52,211,153,0.15)', border:'1px solid rgba(52,211,153,0.4)', color:'#34D399' }}>
              🔎 Prossimo indizio
            </button>
          )}
          <div className="flex-1" />
          <button onClick={() => void post('/quiz/reveal')} disabled={busy}
            className="rounded-2xl px-8 py-4 text-base font-black text-black transition-all hover:scale-105"
            style={{ background:`linear-gradient(135deg,${QZ},#F97316)`, boxShadow:`0 0 30px ${QZ_GLOW}` }}>
            {busy ? '…' : '🎯 Rivela risposta'}
          </button>
        </div>
      </div>
    );
  }

  // ── reveal ─────────────────────────────────────────────────────────────────
  if (phase === 'reveal' && revealData && currentQ) {
    const correctIdx = revealData.correctAnswerIndex;
    const correctAns = currentQ.answers[correctIdx] ?? '';
    const correctCount = revealData.playerResults.filter(r => r.correct).length;
    return (
      <div className="flex flex-col gap-5 w-full max-w-4xl">
        {/* Correct answer highlight */}
        <div className="rounded-3xl p-7 text-center" style={{ background:'linear-gradient(135deg,rgba(34,197,94,0.18),rgba(34,197,94,0.06))', border:'2px solid rgba(34,197,94,0.55)' }}>
          <div className="text-xl font-bold text-white/50 mb-2">✅ Risposta corretta</div>
          <div className="text-display text-4xl font-black" style={{ color:'#4ade80' }}>{correctAns}</div>
          <div className="text-sm text-white/40 mt-2">{correctCount}/{revealData.playerResults.length} hanno risposto correttamente</div>
        </div>
        {/* Per-player results */}
        <div className="grid grid-cols-3 gap-3 max-h-40 overflow-y-auto">
          {revealData.playerResults.map(r => (
            <div key={r.playerId} className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{ background: r.correct ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.10)', border:`1px solid ${r.correct ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.25)'}` }}>
              <span>{r.correct ? '✅' : '❌'}</span>
              <span className="text-xs font-bold text-white/80 flex-1 truncate">{r.nickname}</span>
              {r.correct && <span className="text-xs font-black" style={{ color:'#4ade80' }}>+{r.points}</span>}
            </div>
          ))}
        </div>
        {/* Scoreboard mini */}
        <div className="flex gap-2 flex-wrap">
          {[...players].sort((a,b) => b.score - a.score).slice(0,6).map((p,i) => (
            <div key={p.id} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)' }}>
              <span className="text-xs font-black text-white/40">#{i+1}</span>
              <span className="text-xs font-bold text-white">{p.nickname}</span>
              <span className="text-sm font-black" style={{ color: QZ }}>{p.score}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <button onClick={() => void post('/quiz/next')} disabled={busy}
            className="rounded-2xl px-8 py-4 text-base font-black text-black"
            style={{ background:`linear-gradient(135deg,${QZ},#F97316)`, boxShadow:`0 0 30px ${QZ_GLOW}` }}>
            {currentIndex + 1 >= questionCount ? '🏆 Finale →' : busy ? '…' : 'Prossima →'}
          </button>
        </div>
      </div>
    );
  }

  // ── ranking ────────────────────────────────────────────────────────────────
  if (phase === 'ranking' && rankingData) {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-2xl">
        <div className="text-display text-4xl font-black" style={{ color: QZ }}>📊 Classifica</div>
        <div className="flex flex-col gap-3 w-full">
          {rankingData.slice(0,8).map((r,i) => (
            <motion.div key={r.playerId} initial={{ x:-30, opacity:0 }} animate={{ x:0, opacity:1 }} transition={{ delay:i*0.07 }}
              className="flex items-center gap-4 rounded-2xl px-5 py-3"
              style={{ background: i < 3 ? `${QZ}18` : 'rgba(255,255,255,0.07)', border:`1px solid ${i < 3 ? QZ+'44' : 'rgba(255,255,255,0.12)'}` }}>
              <div className="text-2xl font-black w-8 text-center" style={{ color: i === 0 ? '#FCD34D' : i === 1 ? '#CBD5E1' : i === 2 ? '#D97706' : 'rgba(255,255,255,0.4)' }}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}
              </div>
              <div className="flex-1 text-base font-black text-white">{r.nickname}</div>
              {r.delta > 0 && <div className="text-sm font-black" style={{ color:'#4ade80' }}>+{r.delta}</div>}
              <div className="text-xl font-black" style={{ color: QZ }}>{r.score}</div>
            </motion.div>
          ))}
        </div>
        <button onClick={() => void post('/quiz/next')} disabled={busy}
          className="rounded-2xl px-8 py-4 text-base font-black text-black mt-2"
          style={{ background:`linear-gradient(135deg,${QZ},#F97316)`, boxShadow:`0 0 30px ${QZ_GLOW}` }}>
          {busy ? '…' : 'Continua →'}
        </button>
      </div>
    );
  }

  // ── finale ─────────────────────────────────────────────────────────────────
  if (phase === 'finale') {
    const podium = (rankingData ?? [...players].sort((a,b) => b.score - a.score).map(p => ({ ...p, delta: 0 }))).slice(0, 3);
    return (
      <div className="flex flex-col items-center gap-8 w-full max-w-3xl text-center">
        <motion.div initial={{ scale:0, opacity:0 }} animate={{ scale:1, opacity:1 }} transition={{ type:'spring', stiffness:200 }}
          className="text-display text-5xl font-black" style={{ color: QZ, textShadow:`0 0 60px ${QZ_GLOW}` }}>
          🏆 QUIZZONE FINITO!
        </motion.div>
        <div className="text-xl text-white/60">Tema: {themeName} · {questionCount} domande</div>
        {/* Podium */}
        <div className="flex items-end gap-6">
          {[podium[1], podium[0], podium[2]].map((p, vi) => {
            if (!p) return <div key={vi} />;
            const rank = vi === 1 ? 0 : vi === 0 ? 1 : 2;
            const heights = ['h-32','h-24','h-20'];
            const medals = ['🥇','🥈','🥉'];
            const colors = ['#FCD34D','#CBD5E1','#D97706'];
            return (
              <motion.div key={p.playerId} initial={{ y:50, opacity:0 }} animate={{ y:0, opacity:1 }} transition={{ delay:rank*0.15+0.3 }}
                className="flex flex-col items-center gap-2">
                <div className="text-2xl">{medals[rank]}</div>
                <div className="text-base font-black text-white max-w-24 text-center truncate">{p.nickname}</div>
                <div className="text-xl font-black" style={{ color: colors[rank] }}>{p.score}</div>
                <div className={`${heights[rank]} w-20 rounded-t-2xl flex items-end justify-center pb-2 font-black text-lg`}
                  style={{ background:`${colors[rank]}22`, border:`2px solid ${colors[rank]}55`, color: colors[rank] }}>
                  #{rank+1}
                </div>
              </motion.div>
            );
          })}
        </div>
        {/* Full ranking */}
        {(rankingData ?? []).slice(3).map((r,i) => (
          <div key={r.playerId} className="flex items-center gap-3 w-full max-w-sm rounded-xl px-4 py-2"
            style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)' }}>
            <span className="text-sm text-white/40">#{i+4}</span>
            <span className="flex-1 text-sm font-bold text-white">{r.nickname}</span>
            <span className="font-black" style={{ color: QZ }}>{r.score}</span>
          </div>
        ))}
      </div>
    );
  }

  return <div className="text-white/40 text-xl">Caricamento Quizzone…</div>;
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

  // ── ALL HOOKS MUST BE DECLARED BEFORE ANY CONDITIONAL RETURN ─────────────────
  // React rule of hooks: hooks must be called in the same order every render.
  // If these were declared after the booking/result early returns, React would
  // throw "Rendered fewer hooks than previous render" whenever effectivePhase
  // changed from 'dancing' → 'result' (i.e. at the END OF EVERY ROUND).
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
    const teamResult = balloResult?.teamResult ?? null;
    // [BalloCrashGuard] safe defaults — all arrays guarded against undefined
    const safeWinnerPlayers = teamResult?.winnerTeamPlayers ?? [];
    const safeTeamScores   = teamResult?.teamScores ?? [];
    const safeBookedPlayers = (payload.bookedPlayers as {id:string;nickname:string;avatarColor:string}[] | undefined) ?? [];
    _log('[BalloCrashGuard] result phase', { balloStage, balloPhase, teamResult: !!teamResult, winnerId: balloResult?.winnerId ?? null, bookedCount: safeBookedPlayers.length, teamsCount: safeTeamScores.length });
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
                {safeWinnerPlayers.map(p=>p.nickname).join(' + ')}
              </div>
              <div className="text-xl font-black" style={{color:'#F5B642'}}>
                +{teamResult.perPlayer ?? 0} punti ciascuno · {prizePoints} totali
              </div>
            </div>
            {/* Team energy scores */}
            <div className="flex gap-4 mt-1">
              {safeTeamScores.map(ts => (
                <div key={ts.teamId} className="flex flex-col items-center gap-1 rounded-2xl px-5 py-3"
                  style={{background: ts.teamId===teamResult.winnerTeamId ? 'rgba(245,182,66,0.12)' : 'rgba(255,255,255,0.05)',
                    border:`1.5px solid ${ts.teamId===teamResult.winnerTeamId ? 'rgba(245,182,66,0.5)' : 'rgba(255,255,255,0.12)'}`}}>
                  <div className="font-black text-sm" style={{color: ts.teamId===teamResult.winnerTeamId ? '#F5B642' : 'rgba(255,255,255,0.5)'}}>
                    Squadra {ts.teamId} {ts.teamId===teamResult.winnerTeamId ? '🏆':''}
                  </div>
                  <div className="text-xs text-white/40">{(ts.players ?? []).map(p=>p.nickname).join(' + ')}</div>
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
            {safeBookedPlayers.map(p => {
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

                {/* Burst particles — hidden on PS4 */}
                {!IS_PS4 && (
                <div className="particle-layer" style={{position:'absolute',top:4,left:0,right:0,pointerEvents:'none',display:'flex',flexDirection:'column',alignItems:'center'}}>
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
                )}

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

// ── PercorsoBoard — Risate Missioni Improvvise 2.0 (host TV) ─────────────────

const PERCORSO_ACCENT = '#34D399';
const PERCORSO_PHASE_LABELS: Record<string, string> = {
  mission_intro: '📋 Presentazione',
  booking: '🙋 Prenotazioni aperte',
  public_choice: '🗳️ Scelta del Pubblico',
  active: '⚡ In Gioco!',
  voting: '⭐ Votazione',
  result: '🏆 Risultati',
};

function PercorsoBoard({ sessionId, payload, onReveal, players, onScore }: {
  sessionId: string;
  payload: Record<string,unknown>;
  onReveal: () => void;
  players: HomePlayer[];
  onScore: (pid: string, pts: number) => Promise<void>;
}) {
  const BASE = (import.meta.env.BASE_URL as string) ?? '/';
  const { on } = useEventSocket(null);
  const [rs, setRs] = useState<RisateState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // ── Mission countdown timer ────────────────────────────────────────────────
  const [missionTimeLeft, setMissionTimeLeft] = useState<number | null>(null);
  const autoAdvancedRef = useRef(false); // guard: advance called at most once per active phase

  useEffect(() => {
    fetch(`${BASE}api/home/sessions/${sessionId}/risate/state`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !d.error) setRs(d as RisateState); })
      .catch(() => {});
  }, [sessionId, BASE]);

  useEffect(() => {
    return on<{ state: RisateState }>('home:percorso_update', ({ state }) => {
      setRs(state);
      // Reset auto-advance guard when phase changes away from active
      if (state.phase !== 'active') autoAdvancedRef.current = false;
    });
  }, [on]);

  // ── Client-side mission countdown ─────────────────────────────────────────
  useEffect(() => {
    if (!rs || rs.phase !== 'active' || !rs.missionStartedAt) {
      setMissionTimeLeft(null);
      return;
    }
    const mission = RISATE_MISSIONS[rs.missionIndex ?? 0];
    const duration = mission?.duration ?? 60;

    const tick = () => {
      const elapsed = (Date.now() - new Date(rs.missionStartedAt!).getTime()) / 1000;
      return Math.max(0, Math.round(duration - elapsed));
    };

    setMissionTimeLeft(tick());
    const interval = setInterval(() => {
      const tl = tick();
      setMissionTimeLeft(tl);
      if (tl <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [rs?.phase, rs?.missionStartedAt, rs?.missionIndex]);

  // ── Auto-advance when mission timer expires ────────────────────────────────
  useEffect(() => {
    if (missionTimeLeft === 0 && rs?.phase === 'active' && !autoAdvancedRef.current && !busy) {
      autoAdvancedRef.current = true;
      void apiPost('advance');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionTimeLeft, rs?.phase, busy]);

  // ── Booking countdown (10s, server-authoritative from bookingStartedAt) ───
  const [bookingTimeLeft, setBookingTimeLeft] = useState<number | null>(null);
  const autoBookFiredRef = useRef(false);

  useEffect(() => {
    if (!rs || rs.phase !== 'booking' || !rs.bookingStartedAt) {
      setBookingTimeLeft(null);
      return;
    }
    autoBookFiredRef.current = false;
    const tick = () => Math.max(0, Math.round(10 - (Date.now() - new Date(rs.bookingStartedAt!).getTime()) / 1000));
    setBookingTimeLeft(tick());
    const iv = setInterval(() => { const tl = tick(); setBookingTimeLeft(tl); if (tl <= 0) clearInterval(iv); }, 1000);
    return () => clearInterval(iv);
  }, [rs?.phase, rs?.bookingStartedAt]);

  useEffect(() => {
    if (bookingTimeLeft === 0 && rs?.phase === 'booking' && !autoBookFiredRef.current && !busy) {
      autoBookFiredRef.current = true;
      void apiPost('auto-book');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingTimeLeft, rs?.phase, busy]);

  // ── Public choice countdown (10s) ─────────────────────────────────────────
  const [choiceTimeLeft, setChoiceTimeLeft] = useState<number | null>(null);
  const autoChoiceFiredRef = useRef(false);

  useEffect(() => {
    if (!rs || rs.phase !== 'public_choice' || !rs.publicChoiceStartedAt) {
      setChoiceTimeLeft(null);
      return;
    }
    autoChoiceFiredRef.current = false;
    const tick2 = () => Math.max(0, Math.round(10 - (Date.now() - new Date(rs.publicChoiceStartedAt!).getTime()) / 1000));
    setChoiceTimeLeft(tick2());
    const iv2 = setInterval(() => { const tl = tick2(); setChoiceTimeLeft(tl); if (tl <= 0) clearInterval(iv2); }, 1000);
    return () => clearInterval(iv2);
  }, [rs?.phase, rs?.publicChoiceStartedAt]);

  useEffect(() => {
    if (choiceTimeLeft === 0 && rs?.phase === 'public_choice' && !autoChoiceFiredRef.current && !busy) {
      autoChoiceFiredRef.current = true;
      void apiPost('auto-choice');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choiceTimeLeft, rs?.phase, busy]);

  // ── Part 3: Voting countdown (server-authoritative votingEndsAt) ───────────
  const [votingTimeLeft, setVotingTimeLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!rs || rs.phase !== 'voting' || !rs.votingEndsAt) { setVotingTimeLeft(null); return; }
    const tick = () => Math.max(0, Math.round((new Date(rs.votingEndsAt!).getTime() - Date.now()) / 1000));
    setVotingTimeLeft(tick());
    const iv = setInterval(() => { const tl = tick(); setVotingTimeLeft(tl); if (tl <= 0) clearInterval(iv); }, 1000);
    return () => clearInterval(iv);
  }, [rs?.phase, rs?.votingEndsAt]);

  // ── Part 2: Ripetilo overlay (flashes 2.5s each time count increments) ────
  const [showRipetiloOverlay, setShowRipetiloOverlay] = useState(false);
  const prevRepeatRef = useRef(0);
  useEffect(() => {
    if (!rs) return undefined;
    const count = rs.repeatRequestsUsed ?? 0;
    if (count > prevRepeatRef.current) {
      prevRepeatRef.current = count;
      setShowRipetiloOverlay(true);
      const t = setTimeout(() => setShowRipetiloOverlay(false), 2500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [rs?.repeatRequestsUsed]);

  const apiPost = async (path: string) => {
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`${BASE}api/home/sessions/${sessionId}/risate/${path}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      });
      const d = await r.json() as { state?: RisateState; error?: string };
      if (d.state) setRs(d.state); else if (d.error) setMsg(d.error);
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  };

  const initRisate = () => apiPost('init');
  const advance = () => apiPost('advance');

  if (!rs) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="flex flex-col items-center gap-6 text-center">
        <div className="text-6xl">🎭</div>
        <div className="text-display text-4xl font-black text-white">Percorso a Risate</div>
        <div className="text-sm text-white/45">10 Missioni Improvvise • tutti sul telefono</div>
        {msg && <div className="text-xs text-red-400">{msg}</div>}
        <button onClick={() => void initRisate()} disabled={busy}
          className="rounded-2xl px-8 py-3 text-lg font-black text-black"
          style={{ background: `linear-gradient(135deg,${PERCORSO_ACCENT},#059669)`, boxShadow: `0 0 40px ${PERCORSO_ACCENT}66` }}>
          {busy ? '⏳ Inizializzazione…' : '🚀 Avvia Missioni!'}
        </button>
      </motion.div>
    );
  }

  const sortedTeams = [...rs.teams].sort((a, b) => b.score - a.score);
  const mission = RISATE_MISSIONS[rs.missionIndex ?? 0];

  if (rs.status === 'ended') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="flex flex-col items-center gap-5 text-center w-full max-w-lg">
        <div className="text-display text-5xl font-black text-white">🏆 Fine Missioni!</div>
        <div className="flex flex-col gap-2 w-full">
          {sortedTeams.map((t, i) => (
            <div key={t.id} className="flex items-center gap-3 rounded-2xl px-4 py-3"
              style={{ background: `${t.color}18`, border: `1px solid ${t.color}45` }}>
              <span className="text-2xl">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
              <span className="flex-1 text-left font-black text-white">{t.name}</span>
              <span className="text-display text-xl font-black tabular-nums" style={{ color: t.color }}>{t.score}pt</span>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  const phaseLabel = PERCORSO_PHASE_LABELS[rs.phase] ?? rs.phase;
  const advanceLabel = (() => {
    switch (rs.phase) {
      case 'mission_intro': return '🙋 Apri Prenotazioni →';
      case 'booking': return `⚡ Inizia! (${rs.bookings.length}/${mission?.playerCount ?? '?'})`;
      case 'public_choice': {
        if (mission?.id === 'venditore') return `🚀 Conferma ${(rs.ambulanteProducts ?? []).length}/5 prodotti →`;
        if (mission?.id === 'oggetto') return `🎯 Conferma ${(rs.oggettoTargets ?? []).length}/3 bersagli →`;
        if (mission?.id === 'poliglotta') {
          if (rs.poliglottaStep === 'language' || !rs.poliglottaStep) return rs.publicChoice ? `🌍 Lingua: ${rs.publicChoice} → Frasi` : '🌍 Aspetta lingua…';
          if (rs.poliglottaStep === 'phrase_input') {
            const phrases = (rs.poliglottaSubmittedPhrases ?? []).length;
            return phrases >= 2 ? '🚀 Traduci e Vai! →' : `📝 Aspetta frasi (${phrases}/2)…`;
          }
          return '🚀 Avanza →';
        }
        return rs.publicChoice ? `🚀 Vai con: ${rs.publicChoice}` : '🚀 Avanza →';
      }
      case 'active': {
        if (mission?.id === 'poliglotta') {
          if (rs.poliglottaStep === 'reading') return `📖 Rivela frase ${(rs.poliglottaPhraseIndex ?? 0) + 1} →`;
          if (rs.poliglottaStep === 'reveal') {
            if ((rs.poliglottaPhraseIndex ?? 0) === 0) return '📖 Frase 2 →';
            return '⭐ Apri Votazione →';
          }
        }
        return mission?.phases.includes('voting') ? '⭐ Apri Votazione →' : '🏆 Risultati →';
      }
      case 'voting': return '🏆 Chiudi e Risultati →';
      case 'result': return rs.missionIndex < 9 ? `🎯 Missione ${rs.missionIndex + 2}/10 →` : '🏁 Fine Serata!';
      default: return '→ Avanza';
    }
  })();

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-5 text-center">
      {/* Phase badge + progress */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl px-4 py-1.5 text-xs font-black uppercase tracking-widest"
          style={{ background: `${PERCORSO_ACCENT}18`, border: `1px solid ${PERCORSO_ACCENT}35`, color: PERCORSO_ACCENT }}>
          {phaseLabel}
        </div>
        <div className="text-xs text-white/35">
          Missione {rs.missionIndex + 1}/10
        </div>
        {/* progress dots */}
        <div className="flex gap-1">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="rounded-full"
              style={{
                width: i === rs.missionIndex ? 16 : 6, height: 6,
                background: i < rs.missionIndex ? PERCORSO_ACCENT : i === rs.missionIndex ? PERCORSO_ACCENT : 'rgba(255,255,255,0.15)',
                transition: 'all 0.3s',
              }} />
          ))}
        </div>
      </div>

      {/* Mission card */}
      {mission && (
        <motion.div key={rs.missionIndex} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center gap-3 w-full">
          <div className="text-7xl">{mission.emoji}</div>
          <div className="text-display text-4xl font-black text-white"
            style={{ textShadow: `0 0 30px ${PERCORSO_ACCENT}44` }}>
            {mission.title}
          </div>
          <div className="text-base text-white/55 leading-relaxed max-w-lg">{mission.subtitle}</div>

          {/* public_choice options */}
          {rs.phase === 'public_choice' && rs.publicChoiceOptions.length > 0 && (() => {
            const isYogaChoice = mission?.id === 'yoga';
            if (isYogaChoice) {
              return (
                <div className="flex flex-wrap justify-center gap-4 mt-2">
                  {rs.publicChoiceOptions.map(opt => {
                    const pose = YOGA_POSES.find(p => opt.includes(p.name));
                    const isSelected = rs.publicChoice === opt;
                    return (
                      <div key={opt}
                        className="flex flex-col items-center gap-2 rounded-2xl px-5 py-4"
                        style={{
                          minWidth: 130,
                          background: isSelected
                            ? `linear-gradient(135deg,${PERCORSO_ACCENT},#059669)`
                            : 'rgba(255,255,255,0.07)',
                          border: isSelected ? `2px solid ${PERCORSO_ACCENT}` : '1px solid rgba(255,255,255,0.14)',
                          boxShadow: isSelected ? `0 0 28px ${PERCORSO_ACCENT}66` : 'none',
                        }}>
                        {pose?.imageUrl
                          ? <img src={pose.imageUrl} alt={pose.name} className="rounded-xl object-cover" style={{ width: '3.5rem', height: '3.5rem' }} />
                          : <span style={{ fontSize: '3.5rem', lineHeight: 1 }}>{pose?.emoji ?? '🧘'}</span>
                        }
                        <span className="font-black text-sm text-center leading-tight"
                          style={{ color: isSelected ? '#000' : 'rgba(255,255,255,0.8)' }}>
                          {pose?.name ?? opt}
                        </span>
                        {isSelected && <span className="text-base">✅</span>}
                      </div>
                    );
                  })}
                </div>
              );
            }
            return (
              <div className="flex flex-wrap justify-center gap-2 mt-1">
                {rs.publicChoiceOptions.map(opt => (
                  <div key={opt} className="rounded-xl px-5 py-2 text-sm font-bold"
                    style={rs.publicChoice === opt
                      ? { background: `linear-gradient(135deg,${PERCORSO_ACCENT},#059669)`, color: '#000', boxShadow: `0 0 20px ${PERCORSO_ACCENT}66` }
                      : { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.7)' }}>
                    {opt}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Part 4: public_choice — venditore ambulante multi-pick (up to 5 products) */}
          {rs.phase === 'public_choice' && mission?.id === 'venditore' && (
            <div className="flex flex-col items-center gap-2 w-full mt-1">
              <div className="text-xs font-black" style={{ color: PERCORSO_ACCENT }}>
                Selezionati: {(rs.ambulanteProducts ?? []).length}/5
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {rs.publicChoiceOptions.map(opt => {
                  const selected = (rs.ambulanteProducts ?? []).includes(opt);
                  return (
                    <div key={opt} className="rounded-xl px-4 py-2 text-sm font-bold transition-all"
                      style={selected
                        ? { background: `linear-gradient(135deg,${PERCORSO_ACCENT},#059669)`, color: '#000', boxShadow: `0 0 16px ${PERCORSO_ACCENT}55` }
                        : { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.65)' }}>
                      {selected ? '✅ ' : ''}{opt}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Part 6: public_choice — oggetto 3-target selection */}
          {rs.phase === 'public_choice' && mission?.id === 'oggetto' && (
            <div className="flex flex-col items-center gap-2 w-full mt-1">
              <div className="text-xs font-black" style={{ color: '#34D399' }}>
                Bersagli: {(rs.oggettoTargets ?? []).length}/3
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {rs.publicChoiceOptions.map(opt => {
                  const selected = (rs.oggettoTargets ?? []).includes(opt);
                  return (
                    <div key={opt} className="rounded-xl px-4 py-2 text-sm font-bold transition-all"
                      style={selected
                        ? { background: 'rgba(52,211,153,0.25)', border: '2px solid rgba(52,211,153,0.6)', color: '#34D399' }
                        : { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.65)' }}>
                      {selected ? '🎯 ' : ''}{opt}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Part 5: public_choice — poliglotta status (phrase_input or translating) */}
          {rs.phase === 'public_choice' && mission?.id === 'poliglotta' && (rs.poliglottaStep === 'phrase_input' || (rs.poliglottaStep as string) === 'translating') && (
            <div className="flex flex-col items-center gap-2 mt-1">
              <div className="rounded-xl px-5 py-2 text-sm font-black"
                style={{ background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.40)', color: '#60A5FA' }}>
                🌍 {rs.publicChoice ?? rs.poliglottaLanguage ?? '—'}
              </div>
              <div className="text-xs text-white/45">
                Frasi ricevute: {(rs.poliglottaSubmittedPhrases ?? []).length}/2 — i giocatori le inseriscono sul telefono
              </div>
              {(rs.poliglottaStep as string) === 'translating' && (
                <div className="text-xs font-black animate-pulse" style={{ color: '#60A5FA' }}>🤖 Traduzione AI in corso…</div>
              )}
            </div>
          )}

          {/* public_choice: per-player assignments for sfilata */}
          {rs.phase === 'public_choice' && mission?.perPlayerChoice && mission.id !== 'venditore' && rs.perPlayerChoices.length > 0 && (
            <div className="flex flex-wrap justify-center gap-3 mt-1">
              {rs.bookings.map((b, i) => (
                <div key={b.playerId} className="flex flex-col items-center gap-1 rounded-xl px-5 py-3 text-sm font-black"
                  style={{ background: `${PERCORSO_ACCENT}14`, border: `1.5px solid ${PERCORSO_ACCENT}30`, minWidth: 130 }}>
                  <span className="text-xs uppercase tracking-widest" style={{ color: PERCORSO_ACCENT }}>{b.role}</span>
                  <span className="text-white font-black">{b.nickname}</span>
                  <span className="text-base">{rs.perPlayerChoices[i] ?? '…'}</span>
                </div>
              ))}
            </div>
          )}

          {/* public_choice countdown */}
          {rs.phase === 'public_choice' && choiceTimeLeft !== null && (
            <div className="flex items-center gap-2 text-xs font-black"
              style={{ color: choiceTimeLeft <= 3 ? '#f87171' : 'rgba(255,255,255,0.3)' }}>
              ⏱ {choiceTimeLeft > 0 ? `Auto-scelta in ${choiceTimeLeft}s` : 'Selezione automatica…'}
            </div>
          )}

          {/* Active: yoga pose display — big on TV */}
          {rs.phase === 'active' && mission?.id === 'yoga' && (() => {
            const yogaPose = rs.publicChoice
              ? YOGA_POSES.find(p => rs.publicChoice!.includes(p.name)) : null;
            return (
              <div className="flex flex-col items-center gap-3 rounded-3xl px-8 py-6 w-full max-w-md"
                style={{ background: 'rgba(52,211,153,0.10)', border: '2px solid rgba(52,211,153,0.4)' }}>
                {yogaPose ? (
                  <>
                    {yogaPose.imageUrl
                    ? <img src={yogaPose.imageUrl} alt={yogaPose.name} className="rounded-2xl object-cover" style={{ width: '6rem', height: '6rem' }} />
                    : <span style={{ fontSize: '6rem', lineHeight: 1 }}>{yogaPose.emoji}</span>
                  }
                    <div className="text-display text-3xl font-black" style={{ color: '#34D399' }}>
                      {yogaPose.name}
                    </div>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: '5rem', lineHeight: 1 }}>🧘</span>
                    <div className="text-base font-bold text-white/50">Posa non ancora scelta</div>
                  </>
                )}
                <div className="text-sm text-white/40">Mantenete la posa per 30 secondi!</div>
              </div>
            );
          })()}

          {/* Active: countdown timer */}
          {rs.phase === 'active' && missionTimeLeft !== null && (
            <div className="flex items-center gap-3 rounded-2xl px-6 py-3"
              style={{
                background: missionTimeLeft <= 5 ? 'rgba(239,68,68,0.18)' : 'rgba(52,211,153,0.10)',
                border: `2px solid ${missionTimeLeft <= 5 ? 'rgba(239,68,68,0.55)' : 'rgba(52,211,153,0.35)'}`,
              }}>
              <span style={{ color: missionTimeLeft <= 5 ? '#f87171' : PERCORSO_ACCENT, fontSize: '2.5rem', fontWeight: 900, fontFamily: 'var(--font-display, monospace)', lineHeight: 1 }}>
                {missionTimeLeft}s
              </span>
              {missionTimeLeft <= 5 && missionTimeLeft > 0 && (
                <span className="text-sm font-black animate-pulse" style={{ color: '#f87171' }}>⏱ Ultimi secondi!</span>
              )}
              {missionTimeLeft === 0 && (
                <span className="text-sm font-black" style={{ color: '#f87171' }}>⏰ Tempo scaduto!</span>
              )}
            </div>
          )}

          {/* Active: question for mission 1 */}
          {rs.phase === 'active' && mission.questions && (
            <div className="rounded-2xl px-6 py-3 text-base font-black text-white max-w-lg"
              style={{ background: 'rgba(245,182,66,0.12)', border: '2px solid rgba(245,182,66,0.35)' }}>
              ❓ {mission.questions[rs.questionIndex] ?? '— Fine domande —'}
              <div className="text-xs text-white/40 mt-1 font-normal">Errori: {rs.errorCount}/2</div>
            </div>
          )}

          {/* Part 2: Active — scioglilingua ripetilo counter */}
          {rs.phase === 'active' && mission?.id === 'scioglilingua' && (
            <div className="flex items-center justify-between rounded-xl px-5 py-2.5 w-full max-w-sm"
              style={{ background: 'rgba(167,139,250,0.10)', border: '1px solid rgba(167,139,250,0.30)' }}>
              <span className="text-sm font-black" style={{ color: '#a78bfa' }}>🔁 RIPETILO</span>
              <span className="text-sm font-black text-white/70">
                rimasti: {Math.max(0, 3 - (rs.repeatRequestsUsed ?? 0))}/3
              </span>
            </div>
          )}

          {/* Part 4: Active — venditore ambulante products list */}
          {rs.phase === 'active' && mission?.id === 'venditore' && (rs.ambulanteProducts ?? []).length > 0 && (
            <div className="flex flex-col items-center gap-2 rounded-2xl px-6 py-4 w-full max-w-md"
              style={{ background: 'rgba(245,182,66,0.10)', border: '2px solid rgba(245,182,66,0.35)' }}>
              <div className="text-xs font-black text-white/55 uppercase tracking-widest">🛒 Prodotti da vendere</div>
              <div className="flex flex-wrap justify-center gap-2">
                {rs.ambulanteProducts!.map((p, i) => (
                  <div key={i} className="rounded-xl px-4 py-2 text-base font-black text-white"
                    style={{ background: 'rgba(245,182,66,0.22)', border: '1.5px solid rgba(245,182,66,0.50)' }}>
                    {p}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Part 5: Active — poliglotta translated phrase (reading/reveal) */}
          {rs.phase === 'active' && mission?.id === 'poliglotta' && (rs.poliglottaStep === 'reading' || rs.poliglottaStep === 'reveal') && (
            <div className="flex flex-col items-center gap-3 rounded-2xl px-6 py-5 w-full max-w-lg"
              style={{ background: 'rgba(96,165,250,0.10)', border: '2px solid rgba(96,165,250,0.35)' }}>
              <div className="flex items-center gap-2 text-sm font-black" style={{ color: '#60A5FA' }}>
                <span>🌍 {rs.poliglottaLanguage ?? rs.publicChoice ?? '—'}</span>
                <span className="text-white/30">·</span>
                <span>Frase {(rs.poliglottaPhraseIndex ?? 0) + 1}/2</span>
              </div>
              <div className="text-2xl font-black text-white leading-relaxed text-center">
                {rs.poliglottaTranslations?.[(rs.poliglottaPhraseIndex ?? 0)] ?? '…'}
              </div>
              {rs.poliglottaStep === 'reveal' && (
                <div className="text-sm text-white/45 text-center border-t border-white/10 pt-2 mt-1 w-full">
                  Originale: <span className="italic">{rs.poliglottaSubmittedPhrases?.[(rs.poliglottaPhraseIndex ?? 0)] ?? '—'}</span>
                </div>
              )}
            </div>
          )}

          {/* Part 6: Active — trova oggetto 3 targets display */}
          {rs.phase === 'active' && mission?.id === 'oggetto' && (rs.oggettoTargets ?? []).length > 0 && (
            <div className="flex flex-col items-center gap-2 rounded-2xl px-6 py-4 w-full max-w-md"
              style={{ background: 'rgba(52,211,153,0.08)', border: '2px solid rgba(52,211,153,0.30)' }}>
              <div className="text-xs font-black text-white/50 uppercase tracking-widest">🔍 Bersagli</div>
              <div className="flex flex-col gap-2 w-full">
                {rs.oggettoTargets!.map((target, i) => {
                  const found = rs.oggettoFound?.[i] ?? false;
                  const cnt = rs.oggettoValidationCounts?.[String(i)] ?? 0;
                  return (
                    <div key={i} className="flex items-center gap-3 rounded-xl px-4 py-2.5 transition-all"
                      style={{
                        background: found ? 'rgba(52,211,153,0.22)' : 'rgba(255,255,255,0.07)',
                        border: `1.5px solid ${found ? 'rgba(52,211,153,0.55)' : 'rgba(255,255,255,0.14)'}`,
                      }}>
                      <span className="text-xl">{found ? '✅' : '🔍'}</span>
                      <span className="flex-1 text-sm font-black text-white text-left">{target}</span>
                      {!found && cnt > 0 && (
                        <span className="text-xs text-white/40">{cnt}/2 voti</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bookings */}
          {(rs.bookings.length > 0 || rs.phase === 'booking') && (
            <div className="flex flex-wrap justify-center gap-2">
              {rs.bookings.map(b => (
                <div key={b.playerId} className="rounded-xl px-4 py-2 text-sm font-black"
                  style={{ background: `${PERCORSO_ACCENT}18`, border: `1px solid ${PERCORSO_ACCENT}35` }}>
                  <span style={{ color: PERCORSO_ACCENT }}>{b.role}</span>
                  <span className="text-white/60 mx-1">→</span>
                  <span className="text-white">{b.nickname}</span>
                </div>
              ))}
              {rs.phase === 'booking' && Array.from({ length: Math.max(0, (mission.playerCount) - rs.bookings.length) }, (_, i) => (
                <div key={`empty-${i}`} className="rounded-xl px-4 py-2 text-sm font-black animate-pulse"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.3)' }}>
                  {mission.roles[rs.bookings.length + i] ?? '?'} · libero
                </div>
              ))}
              {rs.phase === 'booking' && bookingTimeLeft !== null && rs.bookings.length < mission.playerCount && (
                <div className="w-full flex justify-center mt-1">
                  <div className="flex items-center gap-2 rounded-xl px-4 py-1.5 text-xs font-black"
                    style={{ background: bookingTimeLeft <= 3 ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.07)', color: bookingTimeLeft <= 3 ? '#f87171' : 'rgba(255,255,255,0.35)' }}>
                    ⏱ Auto-prenota in {bookingTimeLeft}s
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Part 3: Voting countdown timer */}
          {rs.phase === 'voting' && votingTimeLeft !== null && (
            <div className="flex items-center gap-3 rounded-xl px-5 py-2.5 w-full max-w-sm"
              style={{
                background: votingTimeLeft <= 3 ? 'rgba(239,68,68,0.18)' : 'rgba(245,182,66,0.12)',
                border: `2px solid ${votingTimeLeft <= 3 ? 'rgba(239,68,68,0.55)' : 'rgba(245,182,66,0.40)'}`,
              }}>
              <span className="text-display font-black tabular-nums"
                style={{ fontSize: '2rem', color: votingTimeLeft <= 3 ? '#f87171' : '#F5B642' }}>
                {votingTimeLeft}s
              </span>
              <span className="flex-1 text-sm font-black" style={{ color: votingTimeLeft <= 3 ? '#f87171' : '#F5B642' }}>
                {votingTimeLeft <= 3 ? '⏰ Ultimi secondi!' : '⭐ Vota adesso!'}
              </span>
            </div>
          )}

          {/* Voting: live stars */}
          {rs.phase === 'voting' && rs.bookings.map(b => {
            const vs = rs.votes[b.playerId] ?? [];
            const avg = vs.length > 0 ? vs.reduce((a, v) => a + v.score, 0) / vs.length : 0;
            return (
              <div key={b.playerId} className="flex items-center gap-3 rounded-xl px-5 py-2 w-full max-w-sm"
                style={{ background: 'rgba(245,182,66,0.08)', border: '1px solid rgba(245,182,66,0.25)' }}>
                <span className="font-black text-white">{b.nickname}</span>
                <span className="flex-1 text-yellow-400">{'⭐'.repeat(Math.round(avg)) || '—'}</span>
                <span className="text-xs text-white/40">({vs.length})</span>
              </div>
            );
          })}

          {/* Result */}
          {rs.phase === 'result' && rs.missionResult && (
            <>
              <div className="rounded-2xl px-6 py-4 text-base font-bold text-white text-center max-w-lg"
                style={{ background: `${PERCORSO_ACCENT}15`, border: `2px solid ${PERCORSO_ACCENT}40` }}>
                {rs.missionResult.text}
              </div>
              {rs.missionIndex < 9 && (() => {
                const nextM = RISATE_MISSIONS[rs.missionIndex + 1];
                return nextM ? (
                  <div className="flex items-center gap-3 rounded-xl px-5 py-3 text-sm font-bold mt-1"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <span className="text-white/35 text-xs uppercase tracking-widest">Prossima</span>
                    <span style={{ fontSize: '1.4rem' }}>{nextM.emoji}</span>
                    <span className="text-white/55">{nextM.title}</span>
                  </div>
                ) : null;
              })()}
            </>
          )}
        </motion.div>
      )}

      {/* Score pills */}
      {sortedTeams.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {sortedTeams.map(t => (
            <div key={t.id} className="rounded-xl px-3 py-1.5 text-sm font-black"
              style={{ background: `${t.color}18`, border: `1px solid ${t.color}35` }}>
              <span style={{ color: t.color }}>{t.name}</span>
              <span className="text-white/60 mx-1">·</span>
              <span className="text-white">{t.score}pt</span>
            </div>
          ))}
        </div>
      )}

      {msg && <div className="text-xs text-red-400">{msg}</div>}

      {/* Advance button */}
      <button onClick={() => void advance()} disabled={busy}
        className="rounded-2xl px-8 py-3 text-base font-black text-black transition-all"
        style={{ background: `linear-gradient(135deg,${PERCORSO_ACCENT},#059669)`, boxShadow: `0 0 30px ${PERCORSO_ACCENT}44`, opacity: busy ? 0.6 : 1 }}>
        {busy ? '⏳…' : advanceLabel}
      </button>

      {/* Part 2: Ripetilo TV overlay — flashes 2.5s */}
      {showRipetiloOverlay && (
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          className="fixed inset-0 pointer-events-none flex items-center justify-center z-50">
          <div className="rounded-3xl px-14 py-10 text-center"
            style={{
              background: 'rgba(109,40,217,0.88)',
              border: '3px solid #a78bfa',
              boxShadow: '0 0 120px rgba(167,139,250,0.75)',
            }}>
            <div style={{ fontSize: '5rem', lineHeight: 1 }}>🔁</div>
            <div className="text-display font-black mt-2" style={{ fontSize: '3.5rem', color: '#a78bfa' }}>
              RIPETILO!
            </div>
            <div className="text-white/60 text-lg mt-2">
              rimasti: {Math.max(0, 3 - (rs.repeatRequestsUsed ?? 0))}/3
            </div>
          </div>
        </motion.div>
      )}
    </div>
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

// ── YouTube IFrame API ───────────────────────────────────────────────────────

declare global {
  interface Window {
    YT: { Player: new (el: string | HTMLElement, opts: Record<string,unknown>) => YTPlayerInst };
    onYouTubeIframeAPIReady?: () => void;
  }
}
type YTPlayerInst = { seekTo(s: number, a: boolean): void; playVideo(): void; pauseVideo(): void; destroy(): void };

let _ytLoading = false;
let _ytReady   = false;
const _ytCbs: Array<() => void> = [];

function loadYTApi(): Promise<void> {
  return new Promise(resolve => {
    if (_ytReady) { resolve(); return; }
    _ytCbs.push(resolve);
    if (!_ytLoading) {
      _ytLoading = true;
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        _ytReady = true;
        _log('[SARAMUSICA_YT]', { event: 'api_loaded' });
        _ytCbs.forEach(cb => cb());
        _ytCbs.length = 0;
      };
    }
  });
}

type YTClipStatus = 'idle' | 'loading' | 'playing' | 'done' | 'error';

const CLIP_BADGES: Record<string, { emoji: string; label: string }> = {
  chorus_guess:      { emoji: '🎵', label: 'INDOVINA DAL RITORNELLO' },
  missing_word:      { emoji: '🤐', label: 'PAROLA MANCANTE' },
  artist_guess:      { emoji: '🎤', label: 'CHI CANTA IL CLIP?' },
  stop_and_continue: { emoji: '✋', label: 'COME CONTINUA?' },
  duel_song:         { emoji: '⚔️', label: 'SFIDA CLIP' },
};

// ── Ballo: video YouTube di sottofondo (brano intero, con audio) ─────────────
function BalloVideoBg({ videoId }: { videoId: string }) {
  const containerId = `ballo-bg-${videoId.slice(0, 8)}`;
  const playerRef = useRef<YTPlayerInst | null>(null);
  const [needsTap, setNeedsTap] = useState(false);

  const start = useCallback(async () => {
    await loadYTApi();
    if (playerRef.current) { try { playerRef.current.destroy(); } catch { /**/ } playerRef.current = null; }
    playerRef.current = new window.YT.Player(containerId, {
      videoId,
      width: '100%', height: '100%',
      playerVars: { autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, enablejsapi: 1, loop: 1, playlist: videoId },
      events: {
        onReady: (evt: { target: YTPlayerInst }) => { try { evt.target.playVideo(); } catch { setNeedsTap(true); } },
        onError: () => { /* video non embeddabile → resta lo sfondo scuro */ },
      },
    });
  }, [videoId, containerId]);

  useEffect(() => {
    void start();
    return () => { if (playerRef.current) { try { playerRef.current.destroy(); } catch { /**/ } playerRef.current = null; } };
  }, [start]);

  return (
    <div className="fixed inset-0 z-[2]" style={{ background: '#000' }}>
      <div id={containerId} className="pointer-events-none absolute inset-0 h-full w-full" style={{ opacity: 0.9 }} />
      {/* velo scuro per far risaltare barre energia sopra */}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'rgba(7,6,26,0.35)' }} />
      {needsTap && (
        <button onClick={() => void start()} className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-2xl px-6 py-3 font-black" style={{ background: '#F5B642', color: '#0a0820' }}>
          ▶︎ Avvia il brano
        </button>
      )}
    </div>
  );
}

function YTClipPlayer({ clip, roundIndex, sessionId }: {
  clip: { youtubeId: string; startSecond: number; durationSeconds: number; clipType: string };
  roundIndex: number;
  sessionId: string;
}) {
  const SM = '#60A5FA';
  const containerId = `yt-clip-${roundIndex}-${clip.youtubeId.slice(0, 8)}`;
  const playerRef = useRef<YTPlayerInst | null>(null);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const [status,  setStatus]  = useState<YTClipStatus>('idle');
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (tickRef.current)  clearInterval(tickRef.current);
      if (playerRef.current) { try { playerRef.current.destroy(); } catch { /**/ } playerRef.current = null; }
    };
  }, [clip.youtubeId, roundIndex]);

  // ── startClip: called from button click (satisfies browser gesture requirement) ──
  const startClip = async () => {
    if (status !== 'idle' && status !== 'error') return;
    setStatus('loading'); setElapsed(0);
    _log('[SARAMUSICA_YT]', { event: 'play_clicked', youtubeId: clip.youtubeId, startSecond: clip.startSecond, durationSeconds: clip.durationSeconds, clipType: clip.clipType, sessionId, roundIndex });
    try {
      // Pre-load resolves instantly if already done — keeps gesture context alive
      await loadYTApi();
      _log('[SARAMUSICA_YT]', { event: 'clip_loaded', youtubeId: clip.youtubeId });
      if (playerRef.current) { try { playerRef.current.destroy(); } catch { /**/ } playerRef.current = null; }
      // Use string container ID — more reliable across YT API versions
      playerRef.current = new window.YT.Player(containerId, {
        videoId: clip.youtubeId,
        width: '100%', height: '100%',
        playerVars: { autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, enablejsapi: 1, start: clip.startSecond },
        events: {
          onReady: (evt: { target: YTPlayerInst }) => {
            _log('[SARAMUSICA_YT]', { event: 'player_ready', youtubeId: clip.youtubeId });
            // seekTo + playVideo in same synchronous tick — no delay
            evt.target.seekTo(clip.startSecond, true);
            _log('[SARAMUSICA_YT]', { event: 'seek_to', startSecond: clip.startSecond });
            evt.target.playVideo();
            setStatus('playing');
            _log('[SARAMUSICA_YT]', { event: 'play_started', youtubeId: clip.youtubeId });
            let e = 0;
            tickRef.current = setInterval(() => {
              e += 0.25;
              setElapsed(Math.min(e, clip.durationSeconds));
              if (e >= clip.durationSeconds && tickRef.current) clearInterval(tickRef.current);
            }, 250);
            timerRef.current = setTimeout(() => {
              evt.target.pauseVideo();
              setStatus('done');
              _log('[SARAMUSICA_YT]', { event: 'pause_at_duration', youtubeId: clip.youtubeId, durationSeconds: clip.durationSeconds });
            }, clip.durationSeconds * 1000);
          },
          onError: (e: { data: number }) => {
            _log('[SARAMUSICA_YT]', { event: 'player_error', youtubeId: clip.youtubeId, errorCode: e.data });
            setStatus('error');
          },
        },
      });
    } catch (err) {
      _log('[SARAMUSICA_YT]', { event: 'player_error', youtubeId: clip.youtubeId, err: String(err) });
      setStatus('error');
    }
  };

  const badge = CLIP_BADGES[clip.clipType] ?? { emoji: '🎵', label: 'CLIP MUSICALE' };
  const pct   = clip.durationSeconds > 0 ? Math.min(elapsed / clip.durationSeconds, 1) : 0;

  if (status === 'error') return (
    <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}>
      <div className="text-2xl mb-1">🎵</div>
      <div className="text-white/40 text-sm">Clip non disponibile — continua con il testo</div>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="rounded-full px-3 py-1 text-xs font-black" style={{ background: `${SM}22`, border: `1px solid ${SM}44`, color: SM }}>
          {badge.emoji} {badge.label}
        </div>
        <div className="text-xs text-white/30">{clip.durationSeconds}s · YouTube</div>
        {status === 'done'    && <div className="text-xs font-bold text-green-400">✓ Completato</div>}
        {status === 'loading' && <div className="text-xs font-bold text-yellow-400 animate-pulse">⏩ Caricamento…</div>}
        {status === 'playing' && <div className="text-xs font-bold animate-pulse" style={{ color: SM }}>▶ In riproduzione</div>}
      </div>

      <div className="relative rounded-2xl overflow-hidden" style={{ paddingBottom: '38%', background: '#000' }}>
        <div id={containerId} className="absolute inset-0" />
        {status === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
            style={{ background: 'linear-gradient(135deg,#07061a,#0d0d20)' }}>
            <div className="text-4xl">🎵</div>
            <button onClick={() => void startClip()}
              className="flex items-center gap-2 rounded-2xl px-7 py-3 text-base font-black text-white transition-all hover:scale-105 active:scale-95"
              style={{ background: `linear-gradient(135deg,${SM},#2563eb)`, boxShadow: `0 0 40px ${SM}66` }}>
              ▶ AVVIA CLIP MUSICALE
            </button>
          </div>
        )}
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#07061a' }}>
            <motion.div animate={{ scale: [1,1.12,1], opacity:[0.5,1,0.5] }} transition={{ repeat: IS_LOW_POWER ? 0 : Infinity, duration: 1.2 }} className="text-5xl">🎵</motion.div>
          </div>
        )}
      </div>

      {(status === 'playing' || status === 'done') && (
        <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div className="h-full rounded-full transition-all duration-[250ms] ease-linear"
            style={{ background: status === 'done' ? '#4ade80' : `linear-gradient(90deg,${SM},#3b82f6)`, width: `${pct*100}%` }}/>
        </div>
      )}
      {status === 'done' && (
        <button onClick={() => { setStatus('idle'); setElapsed(0); }}
          className="self-end rounded-xl px-3 py-1.5 text-xs font-black"
          style={{ background: `${SM}18`, border: `1px solid ${SM}40`, color: SM }}>
          🔁 Riascolta
        </button>
      )}
    </div>
  );
}

// ── SaraMusicaBoard ───────────────────────────────────────────────────────────

const SM_THEME_LIST = [
  { id: 'anni80',     label: 'Anni 80',    emoji: '🕺' },
  { id: 'anni90',     label: 'Anni 90',    emoji: '💿' },
  { id: 'anni2000',   label: 'Anni 2000',  emoji: '📀' },
  { id: 'sanremo',    label: 'Sanremo',    emoji: '🌹' },
  { id: 'sigle_tv',   label: 'Sigle TV',   emoji: '📺' },
  { id: 'disney',     label: 'Disney',     emoji: '🏰' },
  { id: 'rock',       label: 'Rock',       emoji: '🎸' },
  { id: 'dance',      label: 'Dance',      emoji: '🎶' },
  { id: 'trap_urban', label: 'Trap/Urban', emoji: '🎤' },
  { id: 'custom',     label: 'Misto',      emoji: '✨' },
];

type SMRound = {
  type: string; question: string; answers: string[]; correctAnswerIndex: number;
  year?: number; clues?: string[]; points: number; timeLimit: number; explanation?: string;
  youtubeClip?: { youtubeId: string; startSecond: number; durationSeconds: number; clipType: string };
  silhouetteUrl?: string;
};

const SM_TYPE_BADGES: Record<string, { emoji: string; label: string; color: string }> = {
  guess_song:             { emoji: '🎵', label: 'INDOVINA LA CANZONE',  color: '#60A5FA' },
  guess_artist:           { emoji: '🎤', label: "INDOVINA L'ARTISTA",   color: '#A78BFA' },
  complete_lyrics:        { emoji: '📝', label: 'COMPLETA IL TESTO',    color: '#34D399' },
  speed_music:            { emoji: '⚡', label: 'RISPOSTA VELOCE',      color: '#FBBF24' },
  song_vs_song:           { emoji: '⚔️', label: 'SFIDA MUSICALE',       color: '#F87171' },
  progressive_clue_music: { emoji: '🔍', label: 'INDIZI MUSICALI',      color: '#F59E0B' },
  final_tormentone:       { emoji: '🏆', label: 'TORMENTONE FINALE',    color: '#F97316' },
  silhouette_guess:       { emoji: '👤', label: 'CHI È QUESTA SAGOMA?',  color: '#C084FC' },
};
const SM_ANS_COLORS = ['#60A5FA', '#A78BFA', '#34D399', '#FBBF24'];

function SaraMusicaBoard({ payload, session, players }: {
  payload: Record<string,unknown>;
  session: HomeSession;
  players: HomePlayer[];
}) {
  const SM = '#60A5FA';
  const SM_GLOW = 'rgba(96,165,250,0.4)';

  const [smSelectedDiff, setSmSelectedDiff] = useState<"easy"|"medium"|"hard">("medium");

  const phase         = String(payload.phase ?? '');
  const themeName     = String(payload.themeName ?? '');
  const roundCount    = Number(payload.roundCount ?? 10);
  const currentIndex  = Number(payload.currentIndex ?? 0);
  const countdownVal  = payload.countdownValue as number | null;
  const rounds        = (payload.rounds ?? []) as SMRound[];
  const currentQ      = rounds[currentIndex] as SMRound | undefined;
  const revealData    = payload.revealData as { correctAnswerIndex: number; playerResults: { playerId: string; nickname: string; answerIndex: number | null; correct: boolean; points: number }[] } | null;
  const rankingData   = payload.rankingData as { playerId: string; nickname: string; score: number; delta: number }[] | null;
  const answeredCount = Number(payload.answeredCount ?? 0);
  const allAnswered   = Boolean(payload.allAnsweredForCurrent);
  const questionEndsAt = payload.questionEndsAt as string | undefined;
  const clueIndex      = Number(payload.currentClueIndex ?? 0);

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!questionEndsAt || phase !== 'question') { setTimeLeft(null); return; }
    const tick = () => setTimeLeft(Math.max(0, Math.ceil((new Date(questionEndsAt).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [questionEndsAt, phase]);

  const [busy, setBusy] = useState(false);
  const smPost = async (sub: string, body?: Record<string,unknown>) => {
    setBusy(true);
    try { await fetch(`/api/home/sessions/${session.id}/saramusica/${sub}`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body ?? {}) }); }
    finally { setBusy(false); }
  };

  // Pre-load YouTube IFrame API as soon as board mounts (before any clip round)
  useEffect(() => { void loadYTApi(); }, []);

  // ── setup_theme ──────────────────────────────────────────────────────────────
  const SM_THEME_COLORS: Record<string, string> = {
    anni80: '#EC4899', anni90: '#06B6D4', anni2000: '#8B5CF6',
    sanremo: '#F43F5E', sigle_tv: '#F97316', disney: '#FBBF24',
    rock: '#EF4444', dance: '#10B981', trap_urban: '#94A3B8',
    custom: '#F5B642',
  };

  if (phase === 'setup_theme') return (
    <div className="flex flex-col items-center gap-8 text-center w-full max-w-5xl">
      <div className="flex flex-col items-center gap-2">
        <div className="text-5xl">🎵</div>
        <div className="text-display text-4xl font-black text-white">Scegli il Tema Musicale</div>
        <div className="text-white/50 text-sm">L'host sceglie, i giocatori si preparano</div>
      </div>
      <div className="grid grid-cols-5 gap-4 w-full">
        {SM_THEME_LIST.map(t => {
          const c = SM_THEME_COLORS[t.id] ?? SM;
          return (
            <button key={t.id} onClick={() => void smPost('select-theme', { themeId: t.id })} disabled={busy}
              className="group relative flex flex-col items-center gap-3 rounded-3xl p-5 transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-40 overflow-hidden"
              style={{ background: `linear-gradient(145deg,${c}28,${c}08,rgba(0,0,0,0.6))`, border: `1.5px solid ${c}50`, boxShadow: `0 4px 32px ${c}20` }}>
              {/* glow ring on hover */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-3xl"
                style={{ background: `radial-gradient(ellipse at 50% 0%,${c}30,transparent 70%)` }} />
              {/* music bars decoration */}
              <div className="flex items-end gap-0.5 h-4 opacity-40" aria-hidden="true">
                {[5,9,6,11,7,10,5].map((h,i) => (
                  <div key={i} className="w-0.5 rounded-full" style={{ height: `${h}px`, background: c }} />
                ))}
              </div>
              <div className="text-4xl drop-shadow-lg leading-none">{t.emoji}</div>
              <div className="text-sm font-black text-white leading-tight tracking-wide">{t.label}</div>
              <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg,transparent,${c}60,transparent)` }} />
            </button>
          );
        })}
      </div>
      <div className="text-white/30 text-xs">{players.length} giocatori connessi</div>
    </div>
  );

  // ── setup_count ──────────────────────────────────────────────────────────────
  if (phase === 'setup_count') {
    const SM_DIFFS: { id: "easy"|"medium"|"hard"; label: string; emoji: string; desc: string }[] = [
      { id:"easy",   label:"Facile",   emoji:"🟢", desc:"Canzoni famose · Più tempo" },
      { id:"medium", label:"Medio",    emoji:"🟡", desc:"Bilanciato" },
      { id:"hard",   label:"Difficile",emoji:"🔴", desc:"Nicchia · Meno tempo" },
    ];
    return (
      <div className="flex flex-col items-center gap-8 w-full max-w-2xl text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="text-5xl">🎵</div>
          <div className="text-white/60">Tema: <span className="font-black" style={{color:SM}}>{themeName}</span></div>
          <div className="text-display text-4xl font-black text-white">Difficoltà e manche</div>
        </div>
        <div className="flex gap-3 w-full">
          {SM_DIFFS.map(d => (
            <button key={d.id} onClick={() => setSmSelectedDiff(d.id)}
              className="flex-1 flex flex-col items-center gap-1 rounded-2xl py-4 px-2 transition-all hover:scale-105 border-2"
              style={{
                background: smSelectedDiff === d.id ? `${SM}22` : 'rgba(255,255,255,0.04)',
                borderColor: smSelectedDiff === d.id ? SM : 'rgba(255,255,255,0.1)',
                boxShadow: smSelectedDiff === d.id ? `0 0 20px ${SM}44` : 'none',
              }}>
              <span className="text-2xl">{d.emoji}</span>
              <span className="font-black text-white text-sm">{d.label}</span>
              <span className="text-xs text-white/40">{d.desc}</span>
            </button>
          ))}
        </div>
        <div className="text-white/50 text-sm font-bold">Quante manche?</div>
        <div className="flex gap-5 justify-center">
          {[5, 10, 15, 20].map(n => (
            <button key={n} onClick={() => void smPost('select-count', { count: n, difficulty: smSelectedDiff })} disabled={busy}
              className="flex flex-col items-center gap-2 rounded-3xl px-10 py-7 text-5xl font-black text-white transition-all hover:scale-110 disabled:opacity-50"
              style={{ background: `linear-gradient(135deg,${SM}30,rgba(0,0,0,0.5))`, border: `2px solid ${SM}66`, boxShadow: `0 0 40px ${SM_GLOW}` }}>
              {n}
              <span className="text-sm opacity-60 font-bold">manche</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── generating ───────────────────────────────────────────────────────────────
  if (phase === 'generating') return (
    <div className="flex flex-col items-center gap-7 text-center">
      <motion.div animate={{ scale: [1,1.08,1], opacity: [0.7,1,0.7] }} transition={{ repeat: IS_LOW_POWER ? 0 : Infinity, duration: 1.8 }}
        className="text-8xl">🎵</motion.div>
      <div className="text-display text-3xl font-black text-white">Jonny sta preparando</div>
      <div className="text-display text-4xl font-black" style={{color:SM}}>la sfida musicale…</div>
      <div className="flex gap-2">
        {[0,1,2,3,4].map(i => (
          <motion.div key={i} className="h-3 w-3 rounded-full" style={{background:SM}}
            animate={{ y: [0,-12,0] }} transition={{ repeat: IS_LOW_POWER ? 0 : Infinity, duration: 0.8, delay: i * 0.15 }}/>
        ))}
      </div>
      <div className="text-white/40 text-sm">Tema: {themeName} · {roundCount} manche</div>
    </div>
  );

  // ── countdown ────────────────────────────────────────────────────────────────
  if (phase === 'countdown') return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="text-xl font-bold text-white/50">{roundCount} domande · {themeName}</div>
      <motion.div key={countdownVal} initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 18 }}
        className="text-display font-black" style={{ fontSize: '18rem', lineHeight: 1, color: SM, textShadow: `0 0 120px ${SM_GLOW}` }}>
        {countdownVal ?? ''}
      </motion.div>
      <div className="text-2xl font-bold text-white/60">🎵 Preparatevi!</div>
    </div>
  );

  // ── question ─────────────────────────────────────────────────────────────────
  if (phase === 'question' && currentQ) {
    const badge      = SM_TYPE_BADGES[currentQ.type] ?? { emoji: '🎵', label: 'DOMANDA', color: SM };
    const tLimit     = currentQ.timeLimit > 0 ? currentQ.timeLimit : 20;
    const timerPct   = timeLeft !== null ? timeLeft / tLimit : 1;
    const timerColor = timerPct > 0.5 ? '#4ade80' : timerPct > 0.25 ? '#facc15' : '#ef4444';
    const isSvS      = currentQ.type === 'song_vs_song';
    const isProgr    = currentQ.type === 'progressive_clue_music';
    const isSpeed    = currentQ.type === 'speed_music';
    const isFinal    = currentQ.type === 'final_tormentone';
    const visClues   = (currentQ.clues ?? []).slice(0, clueIndex + 1);
    const cluePoints = [150, 100, 50];

    return (
      <div className="flex flex-col gap-4 w-full max-w-4xl">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black"
              style={{ background: `${badge.color}22`, border: `1px solid ${badge.color}55`, color: badge.color }}>
              {badge.emoji} {badge.label}
            </div>
            <div className="rounded-full px-3 py-1 text-sm font-bold text-white/50" style={{background:'rgba(255,255,255,0.08)'}}>
              {currentIndex + 1} / {roundCount}
            </div>
            {currentQ.year && (
              <div className="rounded-full px-3 py-1 text-xs font-bold" style={{background:`${SM}18`, color:SM, border:`1px solid ${SM}44`}}>
                {currentQ.year}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {allAnswered && <div className="rounded-full px-4 py-2 text-sm font-black text-white" style={{background:'rgba(34,197,94,0.2)',border:'1px solid rgba(34,197,94,0.5)'}}>✅ Tutti risposto!</div>}
            {!allAnswered && answeredCount > 0 && <div className="text-sm font-bold text-white/40">{answeredCount}/{players.length}</div>}
            {timeLeft !== null && (
              <div className={`text-3xl font-black ${isSpeed ? 'animate-pulse' : ''}`}
                style={{ color: timerColor, textShadow: `0 0 20px ${timerColor}88` }}>
                {timeLeft === 0 ? '⏰' : `${timeLeft}s`}
              </div>
            )}
          </div>
        </div>

        {/* Timer bar */}
        <div className="h-2 w-full rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.08)'}}>
          <div className="h-full rounded-full transition-all duration-[250ms] ease-linear"
            style={{ background: isSpeed ? `linear-gradient(90deg,${timerColor},#FBBF24)` : timerColor, width: `${timerPct * 100}%` }}/>
        </div>

        {/* YouTube Clip Player */}
        {currentQ.youtubeClip?.youtubeId && (
          <YTClipPlayer
            clip={currentQ.youtubeClip}
            roundIndex={currentIndex}
            sessionId={String(session.id ?? '')}
          />
        )}

        {/* Sagoma cantante (type silhouette_guess) — immagine già in silhouette */}
        {currentQ.silhouetteUrl && (
          <div className="flex justify-center">
            <div className="rounded-3xl p-4" style={{ background: 'rgba(192,132,252,0.10)', border: '1px solid rgba(192,132,252,0.35)' }}>
              <img src={currentQ.silhouetteUrl} alt="Sagoma" className="max-h-64 w-auto object-contain" />
            </div>
          </div>
        )}

        {/* Question card */}
        <div className="rounded-3xl p-6"
          style={{ background: `linear-gradient(135deg,${badge.color}18,rgba(0,0,0,0.3))`, border: `1px solid ${badge.color}44` }}>
          {isProgr ? (
            <div className="flex flex-col gap-3">
              {visClues.map((clue, ci) => (
                <div key={ci} className="text-base font-bold"
                  style={{ color: ci < clueIndex ? 'rgba(255,255,255,0.4)' : 'white' }}>
                  {['🔍','🔎','💡'][ci]} Indizio {ci + 1} <span className="text-xs font-bold opacity-60">({cluePoints[ci]}pt)</span>: {clue}
                </div>
              ))}
              <div className="text-display text-xl font-black text-white/60 mt-2">{currentQ.question}</div>
            </div>
          ) : isFinal ? (
            <div className="flex flex-col items-center gap-3">
              <div className="text-5xl animate-pulse">🏆</div>
              <div className="text-display text-2xl font-black" style={{color:'#F97316',textShadow:'0 0 40px rgba(249,115,22,0.6)'}}>
                TORMENTONE FINALE!
              </div>
              <div className="text-display text-xl font-black text-white">{currentQ.question}</div>
              <div className="text-base font-black" style={{color:'#F97316'}}>200 PUNTI — DOPPIO!</div>
            </div>
          ) : (
            <div className="text-display text-2xl font-black text-white leading-snug">{currentQ.question}</div>
          )}
        </div>

        {/* Answers grid */}
        <div className={isSvS ? 'flex gap-4' : 'grid grid-cols-2 gap-3'}>
          {currentQ.answers.map((ans, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl px-4 py-4"
              style={{ background: `${SM_ANS_COLORS[i] ?? SM}18`, border: `2px solid ${SM_ANS_COLORS[i] ?? SM}44`, flex: isSvS ? '1' : undefined }}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-black text-sm"
                style={{ background: SM_ANS_COLORS[i] ?? SM, color: '#000' }}>
                {isSvS ? (i === 0 ? 'A' : 'B') : ['A','B','C','D'][i]}
              </div>
              <div className="font-black text-sm text-white flex-1 text-left leading-tight">{ans}</div>
            </div>
          ))}
        </div>

        {/* Host controls */}
        <div className="flex items-center justify-between mt-1">
          {isProgr && clueIndex < 2 && (
            <button onClick={() => void smPost('next-clue')} disabled={busy}
              className="rounded-xl px-5 py-3 text-sm font-black"
              style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.4)', color: '#34D399' }}>
              🔎 Prossimo indizio
            </button>
          )}
          <div className="flex-1"/>
          <button onClick={() => void smPost('reveal')} disabled={busy}
            className="rounded-2xl px-8 py-4 text-base font-black text-black transition-all hover:scale-105 disabled:opacity-50"
            style={{ background: `linear-gradient(135deg,${SM},#2563eb)`, boxShadow: `0 0 30px ${SM_GLOW}` }}>
            {busy ? '…' : '🎵 Rivela risposta'}
          </button>
        </div>
      </div>
    );
  }

  // ── reveal ───────────────────────────────────────────────────────────────────
  if (phase === 'reveal' && currentQ && revealData) {
    const badge      = SM_TYPE_BADGES[currentQ.type] ?? { emoji: '🎵', label: 'RISPOSTA', color: SM };
    const correctIdx = revealData.correctAnswerIndex;
    const winners    = revealData.playerResults.filter(r => r.correct);
    return (
      <div className="flex flex-col gap-4 w-full max-w-4xl">
        <div className="flex items-center justify-between">
          <div className="rounded-full px-4 py-2 text-sm font-black"
            style={{ background: `${badge.color}22`, border: `1px solid ${badge.color}55`, color: badge.color }}>
            {badge.emoji} {badge.label}
          </div>
          <div className="text-sm text-white/40">{currentIndex + 1} / {roundCount}</div>
        </div>

        <motion.div initial={{scale:0.85,opacity:0}} animate={{scale:1,opacity:1}} transition={{type:'spring'}}
          className="rounded-3xl p-6 text-center"
          style={{ background: 'linear-gradient(135deg,rgba(34,197,94,0.25),rgba(0,0,0,0.4))', border: '2px solid rgba(34,197,94,0.6)', boxShadow: '0 0 60px rgba(34,197,94,0.3)' }}>
          <div className="text-xs font-black uppercase tracking-widest mb-2 text-green-400">✅ RISPOSTA CORRETTA</div>
          <div className="text-display text-3xl font-black text-white">{currentQ.answers[correctIdx]}</div>
          {currentQ.explanation && <div className="text-white/50 text-sm mt-2 italic">{currentQ.explanation}</div>}
        </motion.div>

        <div className={currentQ.type === 'song_vs_song' ? 'flex gap-4' : 'grid grid-cols-2 gap-3'}>
          {currentQ.answers.map((ans, i) => {
            const isCorrect = i === correctIdx;
            const whos = revealData.playerResults.filter(p => p.answerIndex === i);
            return (
              <div key={i} className="rounded-2xl px-4 py-3 flex items-center gap-3"
                style={{ background: isCorrect ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.1)', border: `2px solid ${isCorrect ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.3)'}`, flex: currentQ.type === 'song_vs_song' ? '1' : undefined }}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-black text-sm"
                  style={{ background: isCorrect ? '#22c55e' : 'rgba(239,68,68,0.4)', color: '#fff' }}>
                  {isCorrect ? '✓' : ['A','B','C','D'][i]}
                </div>
                <div className="flex-1">
                  <div className={`font-black text-sm ${isCorrect ? 'text-white' : 'text-white/50'}`}>{ans}</div>
                  {whos.length > 0 && <div className="text-xs text-white/40 mt-0.5">{whos.map(p => p.nickname).join(', ')}</div>}
                </div>
                {isCorrect && whos.length > 0 && <div className="text-green-400 font-black text-sm">+{whos[0]?.points}pt</div>}
              </div>
            );
          })}
        </div>

        {winners.length > 0 ? (
          <div className="flex gap-3 flex-wrap justify-center">
            {winners.map((w, i) => (
              <motion.div key={w.playerId} initial={{scale:0}} animate={{scale:1}} transition={{type:'spring',delay:i*0.07}}
                className="rounded-2xl px-5 py-3 text-center"
                style={{ background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.5)' }}>
                <div className="text-white font-black">{w.nickname}</div>
                <div className="text-green-400 font-black">+{w.points}pt</div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center text-white/40 font-bold text-sm">Nessuno ha indovinato questa volta…</div>
        )}

        <div className="flex justify-end">
          <button onClick={() => void smPost('next')} disabled={busy}
            className="rounded-2xl px-8 py-4 text-base font-black text-black disabled:opacity-50"
            style={{ background: `linear-gradient(135deg,${SM},#2563eb)`, boxShadow: `0 0 30px ${SM_GLOW}` }}>
            {busy ? '…' : currentIndex + 1 >= roundCount ? '🏆 Finale' : '▶ Prossima domanda'}
          </button>
        </div>
      </div>
    );
  }

  // ── ranking ──────────────────────────────────────────────────────────────────
  if (phase === 'ranking' && rankingData) return (
    <div className="flex flex-col gap-5 w-full max-w-2xl">
      <div className="text-center">
        <div className="text-4xl">📊</div>
        <div className="text-display text-3xl font-black text-white mt-2">Classifica</div>
        <div className="text-white/50 text-sm">{themeName} · {currentIndex + 1} / {roundCount}</div>
      </div>
      <div className="flex flex-col gap-2">
        {rankingData.map((p, i) => (
          <motion.div key={p.playerId} initial={{x:-20,opacity:0}} animate={{x:0,opacity:1}} transition={{delay:i*0.07}}
            className="flex items-center gap-4 rounded-2xl px-5 py-4"
            style={{ background: i===0?'linear-gradient(135deg,rgba(234,179,8,0.2),rgba(0,0,0,0.4))':'rgba(255,255,255,0.06)', border: i===0?'2px solid rgba(234,179,8,0.5)':'1px solid rgba(255,255,255,0.1)' }}>
            <div className="text-2xl font-black w-8 text-center">{i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}`}</div>
            <div className="flex-1 font-black text-white">{p.nickname}</div>
            {p.delta > 0 && <div className="text-green-400 text-sm font-bold">+{p.delta}</div>}
            <div className="text-xl font-black" style={{color:i===0?'#EAB308':SM}}>{p.score}pt</div>
          </motion.div>
        ))}
      </div>
      <div className="flex justify-end">
        <button onClick={() => void smPost('next')} disabled={busy}
          className="rounded-2xl px-8 py-4 text-base font-black text-black disabled:opacity-50"
          style={{ background: `linear-gradient(135deg,${SM},#2563eb)`, boxShadow: `0 0 30px ${SM_GLOW}` }}>
          {busy ? '…' : '▶ Continua'}
        </button>
      </div>
    </div>
  );

  // ── finale ───────────────────────────────────────────────────────────────────
  if (phase === 'finale' && rankingData) {
    const top3 = [rankingData[1], rankingData[0], rankingData[2]];
    return (
      <div className="flex flex-col items-center gap-6 text-center w-full max-w-2xl">
        <motion.div initial={{scale:0,opacity:0}} animate={{scale:1,opacity:1}} transition={{type:'spring',delay:0.2}}>
          <div className="text-8xl">🎵🏆🎵</div>
        </motion.div>
        <div className="text-display text-4xl font-black text-white">Fine dello Spettacolo!</div>
        <div className="text-white/50">{themeName} · {roundCount} manche</div>
        <div className="flex gap-5 items-end justify-center">
          {top3.map((p, i) => p && (
            <motion.div key={p.playerId} initial={{y:40,opacity:0}} animate={{y:0,opacity:1}} transition={{delay:0.2+i*0.1}}
              className="flex flex-col items-center gap-2">
              <div className="text-2xl">{i===1?'🥇':i===0?'🥈':'🥉'}</div>
              <div className="rounded-2xl px-5 py-3 text-center"
                style={{ background: i===1?'rgba(234,179,8,0.2)':'rgba(255,255,255,0.08)', border: `2px solid ${i===1?'rgba(234,179,8,0.6)':'rgba(255,255,255,0.2)'}`, minWidth:'100px' }}>
                <div className="font-black text-white text-sm">{p.nickname}</div>
                <div className="font-black mt-1" style={{color:i===1?'#EAB308':SM}}>{p.score}pt</div>
              </div>
            </motion.div>
          ))}
        </div>
        <div className="flex flex-col gap-2 w-full">
          {rankingData.slice(0, 8).map((p, i) => (
            <div key={p.playerId} className="flex items-center gap-3 rounded-xl px-4 py-2"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-white/40 text-sm w-5 text-center">{i+1}</div>
              <div className="flex-1 text-white font-bold text-sm">{p.nickname}</div>
              <div className="font-black text-sm" style={{color:SM}}>{p.score}pt</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="text-5xl">🎵</div>
      <div className="text-white/50">Sara'Musica in caricamento…</div>
    </div>
  );
}

// ── AdultOnlyBoard ────────────────────────────────────────────────────────────

const AO_BOARD_LEVELS = [
  { level: 1, label: 'Sociale',    emoji: '🥂', color: '#34D399', desc: 'Rompighiaccio per tutti' },
  { level: 2, label: 'Flirt',      emoji: '💋', color: '#FB7185', desc: 'Un po\' più audace' },
  { level: 3, label: 'Hot',        emoji: '🔥', color: '#EF4444', desc: 'Per i coraggiosi' },
  { level: 4, label: 'Pack Admin', emoji: '🔒', color: '#A855F7', desc: 'Contenuti personalizzati' },
  { level: 5, label: 'Esclusivo',  emoji: '🌙', color: '#818CF8', desc: 'Solo adulti intrepidi' },
] as const;

const AO_BOARD_POWERS: Record<string, { label: string; emoji: string }> = {
  reroll:        { label: 'Rigioca',     emoji: '🎲' },
  extra_time:    { label: '+30 sec',     emoji: '⏱️' },
  swap_player:   { label: 'Scambia',     emoji: '🔄' },
  validate:      { label: 'Auto-Valida', emoji: '✅' },
  double_points: { label: 'Doppio',      emoji: '2️⃣' },
  public_vote:   { label: 'Voto totale', emoji: '👥' },
};

function AdultOnlyBoard({ payload, session, players }: {
  payload: Record<string,unknown>;
  session: HomeSession;
  players: HomePlayer[];
}) {
  const phase             = String(payload.phase ?? 'consent');
  const level             = Number(payload.level ?? 1);
  const levelLabel        = String(payload.levelLabel ?? `Livello ${level}`);
  const roundNumber       = Number(payload.roundNumber ?? 0);
  const consentMap        = (payload.consentMap ?? {}) as Record<string, string>;
  const activePlayers     = (payload.activePlayers ?? []) as string[];
  const spectatorPlayers  = (payload.spectatorPlayers ?? []) as string[];
  const selectedNickname  = payload.selectedPlayerNickname as string | null;
  const challenge         = payload.currentChallenge as { text: string; category: string; durationSeconds: number; allowPublicVote: boolean } | null;
  const challengeEndsAt   = payload.challengeEndsAt as string | null;
  type AoStarVote = { intensity: number; courage: number; show: number; performance: number };
  const votes             = (payload.votes ?? {}) as Record<string, AoStarVote>;
  const lastValidated     = payload.lastValidated as boolean | null;
  const lastPoints        = Number(payload.lastPoints ?? 0);
  const doublePoints      = Boolean(payload.doublePoints);
  const activePower       = payload.activePower as { nickname: string; power: string } | null;
  const spectatorPowers   = (payload.spectatorPowers ?? {}) as Record<string, string | null>;
  const escalationTarget  = payload.escalationTarget as number | null;
  const escalationVotes   = (payload.escalationVotes ?? {}) as Record<string, boolean>;
  const rankingData       = (payload.rankingData ?? []) as { playerId: string; nickname: string; score: number; delta: number }[];
  const emergencyStop     = Boolean(payload.emergencyStop);
  const spinFinalAngle    = Number(payload.spinFinalAngle ?? 1440);
  const spinDurationMs    = Number(payload.spinDurationMs ?? 4000);
  const spinStartedAt     = payload.spinStartedAt as string | null;
  const votingEndsAt      = payload.votingEndsAt as string | null;
  const chosenType        = payload.chosenType as string | null;
  const choiceDeadlineAt  = payload.choiceDeadlineAt as string | null;

  const levelObj  = AO_BOARD_LEVELS.find(l => l.level === level) ?? AO_BOARD_LEVELS[0]!;
  const AC        = levelObj.color;
  const AC_GLOW   = `${AC}44`;

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!challengeEndsAt || phase !== 'challenge') { setTimeLeft(null); return; }
    const tick = () => setTimeLeft(Math.max(0, Math.ceil((new Date(challengeEndsAt).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [challengeEndsAt, phase]);

  const [votingTimeLeft, setVotingTimeLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!votingEndsAt || phase !== 'voting') { setVotingTimeLeft(null); return; }
    const tick = () => setVotingTimeLeft(Math.max(0, Math.ceil((new Date(votingEndsAt).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [votingEndsAt, phase]);

  const [choiceTimeLeft, setChoiceTimeLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!choiceDeadlineAt || phase !== 'choice') { setChoiceTimeLeft(null); return; }
    const tick = () => setChoiceTimeLeft(Math.max(0, Math.ceil((new Date(choiceDeadlineAt).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [choiceDeadlineAt, phase]);

  const autoCloseVoteCalledRef = useRef(false);
  useEffect(() => {
    if (phase !== 'voting') { autoCloseVoteCalledRef.current = false; return; }
    if (votingTimeLeft !== 0 || autoCloseVoteCalledRef.current) return;
    autoCloseVoteCalledRef.current = true;
    void fetch(`/api/home/sessions/${session.id}/adult/close-vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  }, [votingTimeLeft, phase, session.id]);

  const [busy, setBusy] = useState(false);
  // ── MUST be declared here (top level), NOT inside any conditional branch ──────
  const [showEscalationMenu, setShowEscalationMenu] = useState(false);

  const aoPost = async (sub: string, body?: Record<string,unknown>) => {
    setBusy(true);
    try {
      _log('[ADULT_ONLY_PHASE] aoPost', sub, { phase, roundNumber, challengeId: String((challenge as Record<string,unknown> | null)?.text ?? '').slice(0, 30) });
      await fetch(`/api/home/sessions/${session.id}/adult/${sub}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    }
    finally { setBusy(false); }
  };

  // Auto-complete when challenge timer reaches 0
  const autoCompleteCalledRef = useRef(false);
  useEffect(() => {
    if (phase !== 'challenge') { autoCompleteCalledRef.current = false; return; }
    if (timeLeft !== 0 || autoCompleteCalledRef.current) return;
    autoCompleteCalledRef.current = true;
    void fetch(`/api/home/sessions/${session.id}/adult/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  }, [timeLeft, phase, session.id]);

  // Bottle spin animation state + auto-reveal after spin
  const [bottleTargetAngle, setBottleTargetAngle] = useState(0);
  const spinRevealCalledRef = useRef(false);
  useEffect(() => {
    if (phase !== 'spinning') {
      spinRevealCalledRef.current = false;
      setBottleTargetAngle(0);
      return;
    }
    const t1 = setTimeout(() => setBottleTargetAngle(spinFinalAngle), 80);
    if (spinRevealCalledRef.current) return;
    const elapsed = spinStartedAt ? Date.now() - new Date(spinStartedAt).getTime() : spinDurationMs;
    const remaining = Math.max(600, spinDurationMs - elapsed + 900);
    const t2 = setTimeout(() => {
      if (spinRevealCalledRef.current) return;
      spinRevealCalledRef.current = true;
      void fetch(`/api/home/sessions/${session.id}/adult/reveal-spin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    }, remaining);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [phase, spinFinalAngle, spinStartedAt, spinDurationMs, session.id]);

  const LevelBadge = () => (
    <div className="rounded-full px-4 py-2 text-sm font-black"
      style={{ background: `${AC}22`, border: `1px solid ${AC}55`, color: AC }}>
      {levelObj.emoji} {levelLabel}
    </div>
  );

  const MiniRanking = ({ max = 5 }: { max?: number }) => (
    <div className="flex flex-col gap-1.5 w-full">
      {rankingData.slice(0, max).map((p, i) => (
        <div key={p.playerId} className="flex items-center gap-3 rounded-xl px-4 py-2"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="text-white/30 text-sm w-5 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</div>
          <div className="flex-1 text-white font-bold text-sm">{p.nickname}</div>
          {p.delta > 0 && <div className="text-xs font-bold" style={{ color: AC }}>+{p.delta}</div>}
          <div className="font-black text-sm" style={{ color: AC }}>{p.score}pt</div>
        </div>
      ))}
    </div>
  );

  // ── consent ───────────────────────────────────────────────────────────────
  if (phase === 'consent') {
    const consentedCount = Object.values(consentMap).filter(v => v === 'participate').length;
    return (
      <div className="flex flex-col items-center gap-6 text-center w-full max-w-4xl">
        <div className="flex flex-col items-center gap-2">
          <div className="text-7xl" style={{ filter: `drop-shadow(0 0 40px ${AC_GLOW})` }}>🍾</div>
          <div className="text-display text-4xl font-black text-white">Jonny After Dark</div>
          <div className="text-white/40 text-sm">{players.length} giocatori · {consentedCount} pronti a giocare</div>
        </div>

        {/* Level selector */}
        <div className="grid grid-cols-5 gap-3 w-full">
          {AO_BOARD_LEVELS.map(lv => (
            <button key={lv.level} disabled={busy}
              onClick={() => void aoPost('set-level', { level: lv.level })}
              className="flex flex-col items-center gap-2 rounded-2xl p-4 transition-all hover:scale-105 disabled:opacity-50"
              style={{ background: lv.level === level ? `${lv.color}30` : `${lv.color}10`, border: `2px solid ${lv.level === level ? lv.color : lv.color + '30'}` }}>
              <div className="text-3xl">{lv.emoji}</div>
              <div className="text-xs font-black text-white">{lv.label}</div>
              <div className="text-xs text-white/30 leading-tight">{lv.desc}</div>
            </button>
          ))}
        </div>

        {/* Player consent grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full">
          {players.map(pl => {
            const c = consentMap[pl.id];
            const cColor = c === 'participate' ? '#4ADE80' : c === 'watch' ? '#94A3B8' : c === 'leave' ? '#EF4444' : 'rgba(255,255,255,0.2)';
            const cLabel = c === 'participate' ? '🎮 Partecipa' : c === 'watch' ? '👀 Guarda' : c === 'leave' ? '🚪 Via' : '⏳ In attesa';
            return (
              <div key={pl.id} className="rounded-xl px-3 py-2 flex items-center gap-2"
                style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${cColor}44` }}>
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cColor }}/>
                <div className="font-bold text-sm text-white truncate">{pl.nickname}</div>
                <div className="text-xs ml-auto flex-shrink-0" style={{ color: cColor }}>{cLabel}</div>
              </div>
            );
          })}
        </div>

        <button onClick={() => void aoPost('spin')} disabled={busy || consentedCount === 0}
          className="rounded-2xl px-16 py-5 text-2xl font-black text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-40"
          style={{ background: `linear-gradient(135deg,${AC},${AC}88)`, boxShadow: `0 0 60px ${AC_GLOW}` }}>
          {busy ? '…' : consentedCount === 0 ? 'Aspetta i giocatori…' : '🍾 Gira la Bottiglia!'}
        </button>
        <div className="text-white/20 text-xs">I giocatori scelgono dal loro telefono — poi clicca per girare</div>
      </div>
    );
  }

  // ── choice (selected player picks Obbligo or Verità) ─────────────────────
  if (phase === 'choice') {
    const isObbligo = chosenType === 'obbligo';
    const isVerita  = chosenType === 'verita';
    return (
      <div className="flex flex-col items-center gap-8 text-center w-full max-w-3xl">
        <div className="flex items-center justify-between w-full">
          <LevelBadge />
          <div className="text-white/40 text-sm">Round {roundNumber}</div>
        </div>
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }}
          className="rounded-3xl px-10 py-8 w-full"
          style={{ background: `${AC}18`, border: `2px solid ${AC}55`, boxShadow: `0 0 60px ${AC}33` }}>
          <div className="text-xs font-black uppercase tracking-widest text-white/30 mb-2">🍾 LA BOTTIGLIA PUNTA SU</div>
          <div className="text-display text-5xl font-black mb-4" style={{ color: AC }}>{selectedNickname ?? '?'}</div>
          <div className="text-xl font-bold text-white/60">STA SCEGLIENDO…</div>
        </motion.div>
        <div className="flex gap-8 items-center justify-center w-full">
          <div className={`flex flex-col items-center gap-2 transition-all ${isObbligo ? 'scale-110' : isVerita ? 'opacity-20' : 'opacity-50'}`}>
            <div className="text-7xl">🔥</div>
            <div className="text-2xl font-black text-white">OBBLIGO</div>
            {isObbligo && <div className="text-sm font-black text-red-400 animate-pulse">SCELTO!</div>}
          </div>
          <div className="flex flex-col items-center gap-2">
            {choiceTimeLeft !== null && (
              <motion.div key={choiceTimeLeft} animate={{ scale: [1.15, 1] }} transition={{ duration: 0.25 }}
                className="text-5xl font-black tabular-nums"
                style={{ color: choiceTimeLeft > 3 ? AC : '#ef4444', textShadow: `0 0 30px ${choiceTimeLeft > 3 ? AC : '#ef444488'}` }}>
                {choiceTimeLeft}s
              </motion.div>
            )}
            <div className="text-white/20 text-xs">o</div>
          </div>
          <div className={`flex flex-col items-center gap-2 transition-all ${isVerita ? 'scale-110' : isObbligo ? 'opacity-20' : 'opacity-50'}`}>
            <div className="text-7xl">👀</div>
            <div className="text-2xl font-black text-white">VERITÀ</div>
            {isVerita && <div className="text-sm font-black text-blue-400 animate-pulse">SCELTA!</div>}
          </div>
        </div>
        <div className="text-white/25 text-xs">Il giocatore sceglie dal suo telefono • auto-scelta tra {choiceTimeLeft ?? 8}s</div>
      </div>
    );
  }

  // ── spinning (bottle animation) ───────────────────────────────────────────
  if (phase === 'spinning') {
    const N      = Math.max(1, activePlayers.length);
    const R      = N <= 3 ? 160 : N <= 6 ? 178 : 192;
    const SZ     = 460;
    const CENTER = SZ / 2;
    return (
      <div className="flex flex-col items-center gap-5 w-full max-w-3xl">
        <div className="flex items-center justify-between w-full">
          <LevelBadge />
          <div className="text-white/40 text-sm">Round {roundNumber}</div>
        </div>
        <div className="text-white/60 text-sm font-bold animate-pulse tracking-widest uppercase">
          🍾 La bottiglia sta girando…
        </div>

        <div className="relative flex-shrink-0" style={{ width: SZ, height: SZ }}>
          <div className="absolute inset-0 rounded-full"
            style={{ background: `radial-gradient(circle at 50% 50%, ${AC}18 0%, transparent 68%)` }}/>
          <div className="absolute rounded-full" style={{ inset: 8, border: `1px solid ${AC}20`, borderRadius: '50%' }}/>

          {activePlayers.map((pid, i) => {
            const pl       = players.find(p => p.id === pid);
            const angleDeg = i * 360 / N - 90;
            const angleRad = angleDeg * Math.PI / 180;
            const x        = CENTER + Math.cos(angleRad) * R;
            const y        = CENTER + Math.sin(angleRad) * R;
            return (
              <div key={pid} className="absolute flex flex-col items-center gap-1"
                style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}>
                <div className="rounded-full flex items-center justify-center font-black text-sm"
                  style={{ width: 44, height: 44, background: `${AC}18`, border: `2px solid ${AC}40`, color: 'rgba(255,255,255,0.7)' }}>
                  {(pl?.nickname ?? '?').slice(0, 2).toUpperCase()}
                </div>
                <div className="text-xs font-bold max-w-[56px] truncate text-center" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  {pl?.nickname ?? '?'}
                </div>
              </div>
            );
          })}

          {/* Bottle — rotates via CSS transition toward selected player */}
          <div className="absolute" style={{
            left: CENTER, top: CENTER,
            transform: `translate(-50%, -50%) rotate(${bottleTargetAngle}deg)`,
            transition: `transform ${(spinDurationMs / 1000).toFixed(1)}s cubic-bezier(0.17, 0.67, 0.12, 0.99)`,
            fontSize: 'clamp(120px, 13vw, 220px)', lineHeight: 1,
            filter: `drop-shadow(0 0 48px ${AC}cc) drop-shadow(0 0 20px ${AC}88)`,
            userSelect: 'none',
          }}>🍾</div>

          <div className="absolute rounded-full"
            style={{ width: 12, height: 12, left: CENTER - 6, top: CENTER - 6, background: AC, boxShadow: `0 0 12px ${AC}` }}/>
        </div>

        <div className="text-white/20 text-xs">La sfida sarà rivelata a fine animazione</div>
      </div>
    );
  }

  // ── challenge ─────────────────────────────────────────────────────────────
  if (phase === 'challenge') {
    const dur = challenge?.durationSeconds ?? 60;
    const timerPct = timeLeft !== null ? timeLeft / dur : 1;
    const timerColor = timerPct > 0.5 ? '#4ade80' : timerPct > 0.25 ? '#facc15' : '#ef4444';
    return (
      <div className="flex flex-col gap-5 w-full max-w-3xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <LevelBadge />
            {doublePoints && (
              <div className="rounded-full px-3 py-1 text-xs font-black" style={{ background: 'rgba(251,191,36,0.2)', color: '#FBBF24', border: '1px solid rgba(251,191,36,0.4)' }}>
                2️⃣ Doppio punti!
              </div>
            )}
            {activePower && (
              <div className="rounded-full px-3 py-1 text-xs font-black animate-pulse" style={{ background: 'rgba(168,85,247,0.2)', color: '#A855F7', border: '1px solid rgba(168,85,247,0.4)' }}>
                ⚡ {activePower.nickname}: {AO_BOARD_POWERS[activePower.power]?.label ?? activePower.power}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-white/40">Round {roundNumber}</div>
            {timeLeft !== null && (
              <div className="text-3xl font-black tabular-nums" style={{ color: timerColor, textShadow: `0 0 20px ${timerColor}88` }}>
                {timeLeft === 0 ? '⏰' : `${timeLeft}s`}
              </div>
            )}
          </div>
        </div>

        <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div className="h-full rounded-full transition-all duration-[250ms] ease-linear" style={{ background: timerColor, width: `${timerPct * 100}%` }}/>
        </div>

        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }}
          className="rounded-2xl px-6 py-4 flex items-center gap-4"
          style={{ background: `${AC}18`, border: `2px solid ${AC}55`, boxShadow: `0 0 40px ${AC}33` }}>
          <div className="text-4xl">🍾</div>
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-white/40 mb-1">LA BOTTIGLIA PUNTA SU</div>
            <div className="text-display text-3xl font-black" style={{ color: AC }}>{selectedNickname ?? '?'}</div>
          </div>
          <div className="ml-auto flex flex-col gap-1 text-right">
            {activePlayers.length > 0 && <div className="text-xs text-white/30">{activePlayers.length} attivi</div>}
            {spectatorPlayers.length > 0 && <div className="text-xs text-white/20">{spectatorPlayers.length} spettatori</div>}
          </div>
        </motion.div>

        {challenge && (
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}
            className="rounded-3xl p-7"
            style={{ background: `linear-gradient(135deg,${AC}1A,rgba(0,0,0,0.4))`, border: `1px solid ${AC}44` }}>
            <div className="text-xs font-black uppercase tracking-widest mb-3 text-white/40">🎯 {challenge.category || 'SFIDA'}</div>
            <div className="text-display text-2xl font-black text-white leading-snug">{challenge.text}</div>
            {challenge.allowPublicVote && (
              <div className="mt-3 text-xs text-white/30">📊 Voto pubblico abilitato</div>
            )}
          </motion.div>
        )}

        {/* Spectator powers overview */}
        {Object.entries(spectatorPowers).filter(([, p]) => p !== null).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(spectatorPowers).filter(([, p]) => p !== null).map(([pid, pw]) => {
              const pl = players.find(p => p.id === pid);
              const pwInfo = pw ? AO_BOARD_POWERS[pw] : null;
              return pl && pwInfo ? (
                <div key={pid} className="rounded-full px-3 py-1 text-xs font-bold"
                  style={{ background: 'rgba(251,191,36,0.15)', color: '#FBBF24', border: '1px solid rgba(251,191,36,0.3)' }}>
                  {pwInfo.emoji} {pl.nickname}
                </div>
              ) : null;
            })}
          </div>
        )}

        <div className="flex gap-4 justify-center">
          <button onClick={() => void aoPost('skip')} disabled={busy}
            className="rounded-2xl px-8 py-4 text-base font-black text-white/60 disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
            {busy ? '…' : '⏭ Salta'}
          </button>
          <button onClick={() => void aoPost('complete')} disabled={busy}
            className="flex-1 rounded-2xl px-8 py-4 text-xl font-black text-white disabled:opacity-50"
            style={{ background: `linear-gradient(135deg,${AC},${AC}88)`, boxShadow: `0 0 50px ${AC_GLOW}` }}>
            {busy ? '…' : '✅ Completata!'}
          </button>
        </div>
      </div>
    );
  }

  // ── voting ─────────────────────────────────────────────────────────────────
  if (phase === 'voting') {
    const starEntries = Object.values(votes);
    const total       = starEntries.length;
    const voters      = [...activePlayers, ...spectatorPlayers].filter(id => id !== payload.selectedPlayerId);
    const avgCat = (key: keyof typeof starEntries[0]) =>
      total > 0 ? (starEntries.reduce((s, v) => s + (v[key] ?? 0), 0) / total) : 0;
    const CATS: { key: keyof AoStarVote; emoji: string; label: string }[] = [
      { key: 'intensity',   emoji: '🔥', label: 'Intensità'  },
      { key: 'courage',     emoji: '😈', label: 'Coraggio'   },
      { key: 'show',        emoji: '😂', label: 'Spettacolo' },
      { key: 'performance', emoji: '👑', label: 'Performance' },
    ];
    const timerColor = (votingTimeLeft ?? 15) <= 5 ? '#ef4444' : (votingTimeLeft ?? 15) <= 8 ? '#facc15' : '#4ade80';
    return (
      <div className="flex flex-col gap-5 w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <LevelBadge />
          <div className="flex items-center gap-3">
            <div className="text-sm text-white/40">{total} / {voters.length} voti</div>
            {votingTimeLeft !== null && (
              <div className="text-3xl font-black tabular-nums" style={{ color: timerColor, textShadow: `0 0 20px ${timerColor}88` }}>
                {votingTimeLeft}s
              </div>
            )}
          </div>
        </div>

        {/* Timer bar */}
        <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div className="h-full rounded-full transition-all duration-[250ms] ease-linear"
            style={{ background: timerColor, width: `${((votingTimeLeft ?? 0) / 15) * 100}%` }}/>
        </div>

        {/* Performer card */}
        <div className="rounded-3xl p-6 text-center" style={{ background: `${AC}18`, border: `2px solid ${AC}44` }}>
          <div className="text-xs font-black uppercase tracking-widest text-white/40 mb-2">VOTAZIONE PERFORMANCE</div>
          <div className="text-display text-4xl font-black" style={{ color: AC }}>{selectedNickname ?? '?'}</div>
          <div className="text-white/40 text-sm mt-1">Valuta la performance dal tuo telefono</div>
        </div>

        {/* Category averages */}
        <div className="grid grid-cols-2 gap-3">
          {CATS.map(cat => {
            const avg = avgCat(cat.key);
            return (
              <div key={cat.key} className="rounded-2xl px-5 py-4"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-black text-white/70">{cat.emoji} {cat.label}</span>
                  <span className="text-sm font-black" style={{ color: AC }}>{total > 0 ? avg.toFixed(1) : '—'}</span>
                </div>
                <div className="flex gap-0.5">
                  {[1,2,3,4,5].map(s => (
                    <div key={s} className="h-1.5 flex-1 rounded-full"
                      style={{ background: s <= Math.round(avg) ? AC : 'rgba(255,255,255,0.12)' }}/>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Progress + close button */}
        <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ background: AC, width: voters.length > 0 ? `${(total / voters.length) * 100}%` : '0%' }}/>
        </div>
        <button onClick={() => void aoPost('close-vote')} disabled={busy}
          className="rounded-2xl px-10 py-4 text-lg font-black text-white disabled:opacity-50"
          style={{ background: `linear-gradient(135deg,${AC},${AC}88)`, boxShadow: `0 0 40px ${AC_GLOW}` }}>
          {busy ? '…' : '🔒 Chiudi Votazione'}
        </button>
      </div>
    );
  }

  // ── escalation ────────────────────────────────────────────────────────────
  if (phase === 'escalation') {
    const tgtObj = AO_BOARD_LEVELS.find(l => l.level === escalationTarget) ?? { label: `Livello ${escalationTarget}`, emoji: '🔼', color: '#A855F7' };
    const approvedCount = activePlayers.filter(pid => escalationVotes[pid] === true).length;
    const declinedCount = activePlayers.filter(pid => escalationVotes[pid] === false).length;
    const totalVoted = approvedCount + declinedCount;
    return (
      <div className="flex flex-col items-center gap-6 text-center w-full max-w-2xl">
        <div className="text-6xl">🔼</div>
        <div className="text-display text-3xl font-black text-white">Escalation!</div>
        <div className="rounded-2xl px-6 py-3 font-black text-lg" style={{ background: `${tgtObj.color}25`, border: `2px solid ${tgtObj.color}55`, color: tgtObj.color }}>
          {tgtObj.emoji} {tgtObj.label}
        </div>
        <div className="flex justify-center gap-12 w-full">
          <div className="flex flex-col items-center gap-1">
            <div className="text-4xl font-black text-green-400">{approvedCount}</div>
            <div className="text-xs text-white/30">👍 SÌ</div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="text-4xl font-black text-red-400">{declinedCount}</div>
            <div className="text-xs text-white/30">👎 NO</div>
          </div>
        </div>
        <div className="text-white/30 text-sm">{totalVoted} / {activePlayers.length} hanno votato</div>
      </div>
    );
  }

  // ── result ────────────────────────────────────────────────────────────────
  if (phase === 'result') {
    return (
      <div className="flex flex-col gap-5 w-full max-w-2xl">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }}
          className="rounded-3xl p-7 text-center"
          style={{ background: lastValidated ? `linear-gradient(135deg,${AC}25,rgba(0,0,0,0.4))` : 'rgba(255,255,255,0.05)', border: `2px solid ${lastValidated ? AC : 'rgba(255,255,255,0.12)'}`, boxShadow: lastValidated ? `0 0 60px ${AC}33` : 'none' }}>
          {lastValidated ? (
            <>
              <div className="text-5xl mb-3">🎉</div>
              <div className="text-xs font-black uppercase tracking-widest mb-1 text-white/40">SFIDA COMPLETATA</div>
              <div className="text-display text-2xl font-black text-white">{selectedNickname ?? '?'}</div>
              {lastPoints > 0 && <div className="text-xl font-black mt-2" style={{ color: AC }}>+{lastPoints} punti{doublePoints ? ' (doppio!)' : ''}!</div>}
            </>
          ) : (
            <>
              <div className="text-5xl mb-3">😅</div>
              <div className="text-xs font-black uppercase tracking-widest mb-1 text-white/40">SALTATA</div>
              <div className="text-display text-xl font-black text-white/60">Nessun punto assegnato</div>
            </>
          )}
        </motion.div>

        {rankingData.length > 0 && <MiniRanking />}

        <div className="flex gap-3 flex-wrap justify-end">
          <button onClick={() => void aoPost('emergency')} disabled={busy}
            className="rounded-xl px-4 py-3 text-xs font-black text-red-400/60 disabled:opacity-50"
            style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
            🛑 Stop
          </button>
          {level < 5 && !showEscalationMenu && (
            <button onClick={() => setShowEscalationMenu(true)} disabled={busy}
              className="rounded-xl px-5 py-3 text-sm font-black disabled:opacity-50"
              style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.4)', color: '#A855F7' }}>
              🔼 Scala livello
            </button>
          )}
          {showEscalationMenu && (
            <div className="flex gap-2 flex-wrap">
              {AO_BOARD_LEVELS.filter(l => l.level > level).map(lv => (
                <button key={lv.level} disabled={busy}
                  onClick={() => { void aoPost('propose-level', { targetLevel: lv.level }); setShowEscalationMenu(false); }}
                  className="rounded-xl px-4 py-2 text-xs font-black disabled:opacity-50"
                  style={{ background: `${lv.color}20`, border: `1px solid ${lv.color}50`, color: lv.color }}>
                  {lv.emoji} {lv.label}
                </button>
              ))}
              <button onClick={() => setShowEscalationMenu(false)} className="rounded-xl px-3 py-2 text-xs text-white/30"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>✕</button>
            </div>
          )}
          <button onClick={() => void aoPost('end')} disabled={busy}
            className="rounded-xl px-5 py-3 text-sm font-black text-white/40 disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            Fine serata
          </button>
          <button onClick={() => void aoPost('spin')} disabled={busy}
            className="rounded-2xl px-10 py-4 text-base font-black text-white disabled:opacity-50"
            style={{ background: `linear-gradient(135deg,${AC},${AC}88)`, boxShadow: `0 0 40px ${AC_GLOW}` }}>
            {busy ? '…' : '🍾 Prossima!'}
          </button>
        </div>
      </div>
    );
  }

  // ── ended ─────────────────────────────────────────────────────────────────
  if (phase === 'ended') {
    const top3 = [rankingData[1], rankingData[0], rankingData[2]];
    return (
      <div className="flex flex-col items-center gap-6 text-center w-full max-w-2xl">
        <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', delay: 0.2 }}>
          <div className="text-8xl">{emergencyStop ? '🛑' : '🍾🏆🍾'}</div>
        </motion.div>
        <div className="text-display text-4xl font-black text-white">{emergencyStop ? 'Gioco interrotto' : 'Fine After Dark!'}</div>
        <div className="text-white/40">{levelLabel} · Round {roundNumber}</div>
        {rankingData.length >= 2 && (
          <div className="flex gap-5 items-end justify-center">
            {top3.map((p, i) => p && (
              <motion.div key={p.playerId} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 + i * 0.1 }}
                className="flex flex-col items-center gap-2">
                <div className="text-2xl">{i === 1 ? '🥇' : i === 0 ? '🥈' : '🥉'}</div>
                <div className="rounded-2xl px-5 py-3 text-center"
                  style={{ background: i === 1 ? `${AC}25` : 'rgba(255,255,255,0.06)', border: `2px solid ${i === 1 ? AC : 'rgba(255,255,255,0.15)'}`, minWidth: '90px' }}>
                  <div className="font-black text-white text-sm">{p.nickname}</div>
                  <div className="font-black mt-1" style={{ color: i === 1 ? AC : 'rgba(255,255,255,0.5)' }}>{p.score}pt</div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
        <MiniRanking max={8} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="text-5xl">🍾</div>
      <div className="text-white/50">Jonny After Dark…</div>
    </div>
  );
}

// ── WordBackSetupBoard (TV view: choose preset or Jonny AI generation) ───────────

const WB_COUNTS = [5, 10, 15, 20] as const;
const WB_COLOR = '#67E8F9';

function WordBackSetupBoard({ payload, sessionId }: {
  payload: Record<string, unknown>;
  sessionId: string;
}) {
  const phase       = String(payload.phase ?? 'setup_choice');
  const proposals   = (payload.proposals as Array<{ theme: string; nickname: string }>) ?? [];
  const builtinPacks= (payload.builtinPacks as Array<{ id: string; name: string; emoji: string }>) ?? [];
  const availableDb = (payload.availableDbThemes as Array<{ id: string; name: string }>) ?? [];
  const proposalEndsAt = String(payload.proposalEndsAt ?? '');
  const selectedJonnyTheme = String(payload.selectedJonnyTheme ?? '');

  const [busy, setBusy] = useState(false);
  const [selectedThemeId, setSelectedThemeId] = useState<string>('');
  const [selectedThemeName, setSelectedThemeName] = useState<string>('');
  const [selectedDiff, setSelectedDiff] = useState<'easy'|'medium'|'hard'>('medium');
  const [selectedCount, setSelectedCount] = useState<number>(10);
  const [selectedJonnyInput, setSelectedJonnyInput] = useState<string>('');
  const [proposalCountdown, setProposalCountdown] = useState<number>(20);

  // Countdown timer for jonny_input phase
  useEffect(() => {
    if (phase !== 'setup_jonny_input' || !proposalEndsAt) return;
    const update = () => {
      const left = Math.max(0, Math.round((new Date(proposalEndsAt).getTime() - Date.now()) / 1000));
      setProposalCountdown(left);
    };
    update();
    const iv = setInterval(update, 500);
    return () => clearInterval(iv);
  }, [phase, proposalEndsAt]);

  const post = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await fetch(`/api/home/sessions/${sessionId}/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify(body),
      });
    } finally { setBusy(false); }
  };

  const allThemes = [
    ...builtinPacks,
    ...availableDb.map(d => ({ id: d.id, name: d.name, emoji: '📦' })),
  ];

  // ── setup_choice ──────────────────────────────────────────────────────────────
  if (phase === 'setup_choice') return (
    <motion.div key="wb-choice" initial={{opacity:0,scale:0.92}} animate={{opacity:1,scale:1}}
      className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
      <div>
        <div className="text-5xl font-black tracking-tight text-white mb-2">PAROLA ALLE SPALLE</div>
        <div className="text-xl text-white/60">Come vuoi giocare?</div>
      </div>
      <div className="flex flex-col gap-4 w-full">
        <motion.button whileHover={{scale:1.03}} whileTap={{scale:0.97}}
          onClick={() => post('wordback/select-mode', { mode: 'preset' })}
          disabled={busy}
          className="w-full rounded-2xl px-8 py-5 text-left flex items-center gap-4 font-bold text-lg transition-all disabled:opacity-50"
          style={{background:'rgba(103,232,249,0.12)',border:'2px solid rgba(103,232,249,0.35)'}}>
          <span className="text-3xl">📚</span>
          <div>
            <div className="text-white text-xl font-black">A — Temi predefiniti</div>
            <div className="text-white/50 text-sm font-normal">Film, Sport, Disney e altri 6 temi pronti</div>
          </div>
        </motion.button>
        <motion.button whileHover={{scale:1.03}} whileTap={{scale:0.97}}
          onClick={() => post('wordback/select-mode', { mode: 'jonny' })}
          disabled={busy}
          className="w-full rounded-2xl px-8 py-5 text-left flex items-center gap-4 font-bold text-lg transition-all disabled:opacity-50"
          style={{background:'rgba(251,191,36,0.12)',border:'2px solid rgba(251,191,36,0.35)'}}>
          <span className="text-3xl">🤖</span>
          <div>
            <div className="text-yellow-300 text-xl font-black">B — Genera con Jonny</div>
            <div className="text-white/50 text-sm font-normal">I giocatori propongono un tema, Jonny crea le parole</div>
          </div>
        </motion.button>
      </div>
    </motion.div>
  );

  // ── setup_preset ──────────────────────────────────────────────────────────────
  if (phase === 'setup_preset') return (
    <motion.div key="wb-preset" initial={{opacity:0,y:16}} animate={{opacity:1,y:0}}
      className="flex w-full max-w-2xl flex-col items-center gap-6">
      <div className="text-3xl font-black text-white tracking-tight">Scegli un tema</div>
      <div className="grid grid-cols-3 gap-3 w-full">
        {allThemes.map(t => (
          <motion.button key={t.id} whileHover={{scale:1.04}} whileTap={{scale:0.96}}
            onClick={() => { setSelectedThemeId(t.id); setSelectedThemeName(t.name); }}
            className="rounded-xl px-3 py-4 flex flex-col items-center gap-1 text-sm font-bold transition-all"
            style={{
              background: selectedThemeId === t.id ? `rgba(103,232,249,0.25)` : 'rgba(255,255,255,0.06)',
              border: `2px solid ${selectedThemeId === t.id ? WB_COLOR : 'rgba(255,255,255,0.1)'}`,
              color: selectedThemeId === t.id ? WB_COLOR : 'rgba(255,255,255,0.75)',
            }}>
            <span className="text-2xl">{t.emoji}</span>
            <span>{t.name}</span>
          </motion.button>
        ))}
      </div>

      {selectedThemeId && (
        <motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col items-center gap-4 w-full">
          <div className="text-white/60 text-sm">Numero di parole</div>
          <div className="flex gap-3">
            {WB_COUNTS.map(c => (
              <motion.button key={c} whileTap={{scale:0.92}}
                onClick={() => setSelectedCount(c)}
                className="w-16 h-16 rounded-xl font-black text-xl transition-all"
                style={{
                  background: selectedCount === c ? WB_COLOR : 'rgba(255,255,255,0.08)',
                  color: selectedCount === c ? '#0f172a' : 'white',
                }}>
                {c}
              </motion.button>
            ))}
          </div>
          <motion.button whileHover={{scale:1.03}} whileTap={{scale:0.97}}
            onClick={() => post('wordback/preset-start', { themeId: selectedThemeId, themeName: selectedThemeName, count: selectedCount })}
            disabled={busy}
            className="rounded-2xl px-10 py-3 font-black text-lg text-slate-900 transition-all disabled:opacity-50"
            style={{background: WB_COLOR}}>
            {busy ? 'Avvio…' : `Inizia con ${selectedThemeName} →`}
          </motion.button>
        </motion.div>
      )}
    </motion.div>
  );

  // ── setup_jonny_input ─────────────────────────────────────────────────────────
  if (phase === 'setup_jonny_input') return (
    <motion.div key="wb-jonny-input" initial={{opacity:0,y:16}} animate={{opacity:1,y:0}}
      className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
      <div>
        <div className="text-4xl font-black text-yellow-300 tracking-tight mb-1">CHE TEMA VUOI?</div>
        <div className="text-white/60">I giocatori propongono un tema dal telefono</div>
      </div>

      {/* Countdown ring */}
      <div className="relative w-24 h-24 flex items-center justify-center">
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8"/>
          <circle cx="48" cy="48" r="42" fill="none" stroke="#FACC15" strokeWidth="8"
            strokeDasharray={`${2 * Math.PI * 42}`}
            strokeDashoffset={`${2 * Math.PI * 42 * (1 - proposalCountdown / 20)}`}
            strokeLinecap="round" style={{transition:'stroke-dashoffset 0.5s linear'}}/>
        </svg>
        <span className="text-3xl font-black text-white">{proposalCountdown}</span>
      </div>

      {/* Proposals feed */}
      <div className="w-full flex flex-col gap-2 min-h-[120px]">
        <AnimatePresence>
          {proposals.length === 0 && (
            <div className="text-white/30 text-sm py-4">In attesa di proposte…</div>
          )}
          {proposals.map((p, i) => (
            <motion.div key={p.theme} initial={{opacity:0,x:-12}} animate={{opacity:1,x:0}}
              className="flex items-center gap-3 rounded-xl px-4 py-2"
              style={{background:'rgba(250,204,21,0.1)',border:'1px solid rgba(250,204,21,0.2)'}}>
              <span className="text-yellow-300 font-black text-sm w-6">{i+1}</span>
              <span className="text-white font-bold">{p.theme}</span>
              <span className="text-white/40 text-xs ml-auto">— {p.nickname}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <motion.button whileTap={{scale:0.96}}
        onClick={() => post('wordback/jonny-advance', {})}
        disabled={busy}
        className="rounded-xl px-6 py-2 text-sm font-bold text-white/60 transition-all disabled:opacity-40"
        style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)'}}>
        Chiudi proposte →
      </motion.button>
    </motion.div>
  );

  // ── setup_jonny_diff ──────────────────────────────────────────────────────────
  if (phase === 'setup_jonny_diff') {
    const themeOptions = proposals.length > 0
      ? proposals.map(p => p.theme)
      : ['Tema libero'];
    const jonnyTheme = selectedJonnyInput || (themeOptions[0] ?? '');

    return (
      <motion.div key="wb-jonny-diff" initial={{opacity:0,y:16}} animate={{opacity:1,y:0}}
        className="flex w-full max-w-xl flex-col items-center gap-6">
        <div className="text-3xl font-black text-yellow-300 tracking-tight text-center">Configura Jonny</div>

        {/* Proposals to pick or custom */}
        {proposals.length > 0 ? (
          <div className="w-full">
            <div className="text-white/50 text-xs mb-2 text-center">Scegli un tema proposto</div>
            <div className="flex flex-wrap gap-2 justify-center">
              {themeOptions.map(t => (
                <motion.button key={t} whileTap={{scale:0.92}}
                  onClick={() => setSelectedJonnyInput(t)}
                  className="rounded-xl px-4 py-2 text-sm font-bold transition-all"
                  style={{
                    background: jonnyTheme === t ? 'rgba(250,204,21,0.25)' : 'rgba(255,255,255,0.06)',
                    border: `2px solid ${jonnyTheme === t ? '#FACC15' : 'rgba(255,255,255,0.12)'}`,
                    color: jonnyTheme === t ? '#FACC15' : 'rgba(255,255,255,0.7)',
                  }}>
                  {t}
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <div className="w-full">
            <div className="text-white/50 text-xs mb-1 text-center">Scrivi il tema</div>
            <input
              className="w-full rounded-xl px-4 py-3 text-white font-bold text-center outline-none"
              style={{background:'rgba(255,255,255,0.08)',border:'2px solid rgba(250,204,21,0.35)'}}
              placeholder="es. Cucina italiana, Anni 80, Sport estremi…"
              value={selectedJonnyInput}
              onChange={e => setSelectedJonnyInput(e.target.value)}
              maxLength={40}
            />
          </div>
        )}

        {/* Difficulty */}
        <div className="flex flex-col items-center gap-2 w-full">
          <div className="text-white/50 text-xs">Difficoltà</div>
          <div className="flex gap-3">
            {(['easy','medium','hard'] as const).map(d => {
              const labels = { easy: '😊 Facile', medium: '😐 Medio', hard: '🔥 Difficile' };
              const colors = { easy: '#34D399', medium: '#60A5FA', hard: '#F87171' };
              return (
                <motion.button key={d} whileTap={{scale:0.92}}
                  onClick={() => setSelectedDiff(d)}
                  className="rounded-xl px-5 py-2 text-sm font-bold transition-all"
                  style={{
                    background: selectedDiff === d ? `${colors[d]}22` : 'rgba(255,255,255,0.06)',
                    border: `2px solid ${selectedDiff === d ? colors[d] : 'rgba(255,255,255,0.12)'}`,
                    color: selectedDiff === d ? colors[d] : 'rgba(255,255,255,0.6)',
                  }}>
                  {labels[d]}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Count */}
        <div className="flex flex-col items-center gap-2">
          <div className="text-white/50 text-xs">Numero di parole</div>
          <div className="flex gap-3">
            {WB_COUNTS.map(c => (
              <motion.button key={c} whileTap={{scale:0.92}}
                onClick={() => setSelectedCount(c)}
                className="w-14 h-14 rounded-xl font-black text-lg transition-all"
                style={{
                  background: selectedCount === c ? '#FACC15' : 'rgba(255,255,255,0.08)',
                  color: selectedCount === c ? '#0f172a' : 'white',
                }}>
                {c}
              </motion.button>
            ))}
          </div>
        </div>

        <motion.button whileHover={{scale:1.03}} whileTap={{scale:0.97}}
          onClick={() => post('wordback/jonny-generate', {
            theme: jonnyTheme,
            difficulty: selectedDiff,
            count: selectedCount,
          })}
          disabled={busy || !jonnyTheme.trim()}
          className="rounded-2xl px-10 py-3 font-black text-lg text-slate-900 transition-all disabled:opacity-40"
          style={{background:'#FACC15'}}>
          {busy ? 'Avvio…' : '🤖 Genera con Jonny →'}
        </motion.button>
      </motion.div>
    );
  }

  // ── setup_jonny_generating ────────────────────────────────────────────────────
  return (
    <motion.div key="wb-generating" initial={{opacity:0}} animate={{opacity:1}}
      className="flex flex-col items-center gap-6 text-center">
      <motion.div
        animate={{scale:[1,1.08,1],rotate:[0,5,-5,0]}}
        transition={{duration:1.2,repeat:Infinity,ease:'easeInOut'}}
        className="text-7xl">🤖</motion.div>
      <div className="text-3xl font-black text-yellow-300">Jonny sta creando le parole proibite…</div>
      <div className="text-white/50">
        {selectedJonnyTheme
          ? <>Tema: <span className="text-yellow-300 font-bold">{selectedJonnyTheme}</span></>
          : 'Generazione in corso…'}
      </div>
      <div className="flex gap-2">
        {[0,1,2].map(i => (
          <motion.div key={i} className="w-3 h-3 rounded-full bg-yellow-300"
            animate={{y:[0,-10,0]}} transition={{duration:0.8,delay:i*0.15,repeat:Infinity}}/>
        ))}
      </div>
    </motion.div>
  );
}

// ── WordBackBookingBoard (TV view during pair-rotation window) ─────────────────

function WordBackBookingBoard({ payload }: { payload: Record<string, unknown> }) {
  const bookingUntil = Number(payload.bookingOpenUntil ?? 0);
  const bookedRoles = (payload.bookedRoles as {
    guesser:   { id: string; nickname: string } | null;
    suggester: { id: string; nickname: string } | null;
  } | null) ?? { guesser: null, suggester: null };
  const bookingError = payload.bookingError as string | undefined;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const iid = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(iid);
  }, []);

  const secsLeft  = Math.max(0, Math.ceil((bookingUntil - now) / 1000));
  const pct       = Math.min(1, secsLeft / 10);

  return (
    <motion.div key="wordback-booking"
      initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}}
      className="flex w-full max-w-2xl flex-col items-center gap-7 text-center">
      <div className="text-6xl">🔄</div>
      <div className="text-display text-4xl font-black text-white">Cambio giocatori!</div>

      {bookingError ? (
        <div className="w-full rounded-2xl px-6 py-5"
          style={{background:'rgba(239,68,68,0.12)',border:'1.5px solid rgba(239,68,68,0.45)',color:'#f87171'}}>
          <div className="text-2xl mb-2">⚠️</div>
          <div className="text-base font-black">{bookingError}</div>
        </div>
      ) : (
        <>
          <div className="text-lg text-white/55">I giocatori si prenotano sul telefono</div>

          {/* Countdown ring */}
          <div className="relative flex h-28 w-28 items-center justify-center rounded-full"
            style={{
              background:`conic-gradient(rgba(167,139,250,0.9) ${pct * 100}%, rgba(255,255,255,0.1) 0)`,
              boxShadow:'0 0 50px rgba(167,139,250,0.35)',
            }}>
            <div className="flex items-center justify-center rounded-full bg-[#0f0f23]"
              style={{width:'5.5rem',height:'5.5rem'}}>
              <span className="text-3xl font-black text-white tabular-nums">{secsLeft}</span>
            </div>
          </div>

          {/* Role slots */}
          <div className="flex gap-4 w-full">
            <div className="flex-1 rounded-2xl px-5 py-6 text-center"
              style={bookedRoles.guesser
                ? {background:'rgba(167,139,250,0.25)',border:'2px solid rgba(167,139,250,0.7)',boxShadow:'0 0 30px rgba(167,139,250,0.3)'}
                : {background:'rgba(255,255,255,0.04)',border:'2px dashed rgba(167,139,250,0.3)'}}>
              <div className="text-xs font-black uppercase tracking-widest mb-3"
                style={{color:'rgba(167,139,250,0.8)'}}>🙈 INDOVINO</div>
              {bookedRoles.guesser
                ? <div className="text-2xl font-black text-white">{bookedRoles.guesser.nickname}</div>
                : <div className="text-sm text-white/30 italic">— in attesa —</div>
              }
            </div>
            <div className="flex-1 rounded-2xl px-5 py-6 text-center"
              style={bookedRoles.suggester
                ? {background:'rgba(34,211,238,0.25)',border:'2px solid rgba(34,211,238,0.7)',boxShadow:'0 0 30px rgba(34,211,238,0.3)'}
                : {background:'rgba(255,255,255,0.04)',border:'2px dashed rgba(34,211,238,0.3)'}}>
              <div className="text-xs font-black uppercase tracking-widest mb-3"
                style={{color:'rgba(34,211,238,0.8)'}}>💬 SUGGERITORE</div>
              {bookedRoles.suggester
                ? <div className="text-2xl font-black text-white">{bookedRoles.suggester.nickname}</div>
                : <div className="text-sm text-white/30 italic">— in attesa —</div>
              }
            </div>
          </div>

          {secsLeft <= 0 && (
            <div className="text-white/40 text-sm italic">Scelta casuale in corso…</div>
          )}
        </>
      )}
    </motion.div>
  );
}

// ── WordBackBoard ─────────────────────────────────────────────────────────────

function WordBackBoard({ payload, players, onScore, onReveal, tabooAlarm, sessionId, timeoutOverlay, wrongOverlay }: {
  payload: Record<string,unknown>;
  players: HomePlayer[];
  onScore: (pid: string, pts: number) => Promise<void>;
  onReveal: () => void;
  tabooAlarm: TabooAlarmEvent | null;
  sessionId: string;
  timeoutOverlay?: { reason: string; guesserNickname: string; word: string; bonusNicknames: string[]; bonusPoints: number } | null;
  wrongOverlay?: { guesserNickname: string; wrongAttempts: number; remainingAttempts: number } | null;
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

  // Timer ref — prevents duplicate timers if home:wordback_correct fires more than once
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for server-confirmed correct answer (server already awarded scores)
  const { on } = useHomeSocket(sessionId);
  const [correctData, setCorrectData] = useState<{ guesserNickname: string; word: string } | null>(null);
  useEffect(() => {
    const unsub = on<{ guesserId: string; guesserNickname?: string; word?: string; pts: number }>('home:wordback_correct', (d) => {
      if (autoAwarded || awarded) return;
      _log('[WordBackCorrect] correct received — TV overlay shown');
      setAutoAwarded(true);
      setCorrectData({ guesserNickname: d.guesserNickname ?? '', word: d.word ?? word });

      // Guard: cancel any previous timer (duplicate event protection)
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);

      // Auto-clear overlay after 2 s, then hand off to host (next-round button)
      overlayTimerRef.current = setTimeout(() => {
        _log('[WordBackCorrect] TV overlay cleared — returning to board');
        setAutoAwarded(false);
        setCorrectData(null);
        onReveal(); // stops the round timer, transitions host view
      }, 2000);
    });
    // Booking phase — delegate to dedicated component (hooks already called above)
    if (String(payload.mode ?? '') === 'home-wordback-booking') {
      unsub();
    }
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAwarded, awarded, word]);

  // Cleanup overlay timer on unmount to avoid state-update-after-unmount warnings
  useEffect(() => () => { if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current); }, []);

  // Booking phase dispatches to its own component (after all hooks are called)
  if (String(payload.mode ?? '') === 'home-wordback-booking') {
    return <WordBackBookingBoard payload={payload} />;
  }

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
              <div className="text-5xl font-black text-white tracking-tight">RISPOSTA CORRETTA!</div>
              {correctData?.guesserNickname && (
                <div className="text-2xl text-white/85 mt-3 font-bold">{correctData.guesserNickname} ha indovinato:</div>
              )}
              <div className="text-display text-4xl font-black mt-2" style={{color:'#4ade80',textShadow:'0 0 30px rgba(74,222,128,0.7)'}}>
                {(correctData?.word ?? word).toUpperCase()}
              </div>
              <div className="text-lg text-white/60 mt-2">+{pts} a entrambi i giocatori</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Wrong-answer TV overlay — flashes briefly (2.5 s, auto-dismissed in parent) */}
      <AnimatePresence>
        {wrongOverlay && (
          <motion.div initial={{opacity:0,scale:0.7}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.9}}
            transition={{type:'spring',stiffness:380,damping:28}}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="rounded-3xl px-14 py-10 text-center"
              style={{background:'rgba(239,68,68,0.95)',border:'3px solid rgba(255,100,100,0.9)',boxShadow:'0 0 100px rgba(239,68,68,0.9)',backdropFilter:'blur(12px)'}}>
              <div className="text-7xl mb-4">❌</div>
              <div className="text-5xl font-black text-white tracking-tight">RISPOSTA SBAGLIATA</div>
              <div className="text-2xl text-white/85 mt-3">-50 a <span className="font-black">{wrongOverlay.guesserNickname}</span></div>
              <div className="mt-4 text-xl font-bold"
                style={{color: wrongOverlay.remainingAttempts <= 1 ? 'rgba(251,146,60,1)' : 'rgba(255,255,255,0.7)'}}>
                Tentativi rimasti: {wrongOverlay.remainingAttempts}
                {wrongOverlay.remainingAttempts === 1 && ' — ULTIMO TENTATIVO!'}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timeout / 3-wrong TV overlay — stays until next round */}
      <AnimatePresence>
        {timeoutOverlay && (
          <motion.div initial={{opacity:0,scale:0.7}} animate={{opacity:1,scale:1}} exit={{opacity:0}}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="rounded-3xl px-14 py-10 text-center"
              style={{background:'rgba(30,10,60,0.97)',border:'3px solid rgba(239,68,68,0.7)',boxShadow:'0 0 100px rgba(239,68,68,0.6)',backdropFilter:'blur(12px)'}}>
              <div className="text-7xl mb-4">⏰</div>
              <div className="text-5xl font-black tracking-tight" style={{color:'#f87171'}}>
                {timeoutOverlay.reason === 'too_many_wrong_answers' ? 'PAROLA PERSA' : 'TEMPO SCADUTO'}
              </div>
              {timeoutOverlay.reason === 'too_many_wrong_answers' && (
                <div className="text-2xl text-white/75 mt-3">Troppi errori di <span className="font-black text-white">{timeoutOverlay.guesserNickname}</span></div>
              )}
              {timeoutOverlay.bonusNicknames.length > 0 && (
                <div className="mt-5 rounded-2xl px-6 py-4"
                  style={{background:'rgba(34,197,94,0.15)',border:'1px solid rgba(34,197,94,0.4)'}}>
                  <div className="text-lg font-black" style={{color:'#4ade80'}}>+{timeoutOverlay.bonusPoints} agli altri giocatori</div>
                  <div className="text-base text-white/60 mt-1">{timeoutOverlay.bonusNicknames.join(', ')}</div>
                </div>
              )}
              <div className="text-xl text-white/40 mt-5">In attesa del prossimo round…</div>
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

const BASE_URL_COPPIE = (import.meta.env.BASE_URL as string | undefined) ?? '/';

function CoppieBoard({ payload, onNext, sessionId }: { payload: Record<string,unknown>; onNext?: () => void; sessionId?: string }) {
  const themePhase = String(payload.themePhase ?? 'playing');
  const cards = (payload.cards as CoppieCard[]) ?? [];
  const matched = Number(payload.matchedPairs ?? 0);
  const total = Number(payload.totalPairs ?? 0);
  const proposedThemes = (payload.proposedThemes ?? []) as { id: string; text: string; proposedBy: string }[];
  const themeTimerEndsAt = payload.themeTimerEndsAt as string | null;
  const visibilityActiveUntil = Number(payload.visibilityActiveUntil ?? 0);
  const cols = 5;

  const [preview, setPreview] = useState(false);
  const [previewSecs, setPreviewSecs] = useState(0);
  const [themeTimerLeft, setThemeTimerLeft] = useState<number | null>(null);
  const [themeBusy, setThemeBusy] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setInterval>|null>(null);

  // Theme countdown
  useEffect(() => {
    if (themePhase !== 'suggestion' || !themeTimerEndsAt) { setThemeTimerLeft(null); return; }
    const endsAt = new Date(themeTimerEndsAt).getTime();
    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setThemeTimerLeft(left);
      if (left <= 0 && sessionId) {
        // Auto-select when timer expires: pick last proposed or random
        void fetch(`/api/home/sessions/${sessionId}/coppie/select-theme`, {
          method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({}),
        });
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [themePhase, themeTimerEndsAt, sessionId]);

  // Visibility countdown from server timestamp
  useEffect(() => {
    if (!visibilityActiveUntil || visibilityActiveUntil <= Date.now()) {
      if (preview) setPreview(false);
      return;
    }
    setPreview(true);
    const remaining = visibilityActiveUntil - Date.now();
    setPreviewSecs(Math.ceil(remaining / 1000));
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((visibilityActiveUntil - Date.now()) / 1000));
      setPreviewSecs(left);
      if (left <= 0) { clearInterval(id); setPreview(false); }
    }, 500);
    return () => clearInterval(id);
  }, [visibilityActiveUntil]);

  const startPreview = () => {
    if (previewTimer.current) clearInterval(previewTimer.current);
    if (sessionId) {
      void fetch(`/api/home/sessions/${sessionId}/coppie-preview`, {
        method: 'POST', credentials: 'include',
      });
    }
  };

  const selectTheme = async (opts?: { text?: string; setId?: string }) => {
    if (!sessionId || themeBusy) return;
    setThemeBusy(true);
    try {
      const body = opts?.setId ? { setId: opts.setId } : { themeText: opts?.text };
      await fetch(`/api/home/sessions/${sessionId}/coppie/select-theme`, {
        method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(body),
      });
    } finally { setThemeBusy(false); }
  };

  useEffect(() => () => { if (previewTimer.current) clearInterval(previewTimer.current); }, []);

  // ── Theme suggestion phase — Quizzone-style grid ───────────────────────────
  if (themePhase === 'suggestion') {
    const CP = '#F472B6';
    const CP_GLOW = 'rgba(244,114,182,0.55)';
    const availableSets = (payload.availableSets as { id: string; name: string; pairCount: number }[] | undefined) ?? [];
    const WORD_THEMES = [
      { id:'animali',    label:'Animali',    emoji:'🦁' },
      { id:'cibo',       label:'Cibo',       emoji:'🍕' },
      { id:'sport',      label:'Sport',      emoji:'⚽' },
      { id:'cinema',     label:'Cinema',     emoji:'🎬' },
      { id:'musica',     label:'Musica',     emoji:'🎵' },
      { id:'città',      label:'Città',      emoji:'🏙️' },
      { id:'natura',     label:'Natura',     emoji:'🌿' },
      { id:'colori',     label:'Colori',     emoji:'🎨' },
      { id:'animazioni', label:'Animazioni', emoji:'✨' },
    ];

    // Build the unified grid: DB sets first (as primary cards), then word themes to fill
    // Show up to 9 items total in the grid
    const setCards = availableSets.map(s => ({
      id: `set:${s.id}`, label: s.name, emoji: '🃏',
      onClick: () => selectTheme({ setId: s.id }),
      isPrimary: true,
    }));
    const wordCards = WORD_THEMES.map(t => ({
      id: `word:${t.id}`, label: t.label, emoji: t.emoji,
      onClick: () => selectTheme({ text: t.id }),
      isPrimary: false,
    }));
    // Merge: DB sets shown first, word themes fill the rest of the grid
    const gridCards = [...setCards, ...wordCards].slice(0, 9);

    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-4xl">
        {/* Header + countdown */}
        <div className="flex items-start justify-between w-full">
          <div>
            <div className="text-display text-3xl font-black text-white mb-1">Che tema vuoi per le</div>
            <div className="text-display text-5xl font-black" style={{ color: CP, textShadow: `0 0 40px ${CP_GLOW}` }}>
              💞 COPPIE?
            </div>
          </div>
          {themeTimerLeft !== null && (
            <div className="flex flex-col items-center gap-1 min-w-[80px]">
              <div className="text-5xl font-black tabular-nums leading-none"
                style={{ color: themeTimerLeft <= 5 ? '#ef4444' : CP }}>
                {themeTimerLeft}
              </div>
              <div className="text-[10px] font-bold tracking-widest" style={{ color: CP + '99' }}>SECONDI</div>
              <div className="h-1.5 w-16 rounded-full overflow-hidden mt-1" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ background: CP, width: `${Math.min(100, ((themeTimerLeft ?? 25) / 25) * 100)}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Main theme grid — DB sets (primary) + word themes */}
        <div className="grid grid-cols-3 gap-4 w-full">
          {gridCards.map(card => (
            <button key={card.id} onClick={() => { void card.onClick(); }} disabled={themeBusy}
              className="flex flex-col items-center gap-3 rounded-2xl p-5 transition-all hover:scale-105 disabled:opacity-50"
              style={{
                background: card.isPrimary ? `rgba(244,114,182,0.14)` : `rgba(244,114,182,0.06)`,
                border: `2px solid ${card.isPrimary ? 'rgba(244,114,182,0.5)' : 'rgba(244,114,182,0.2)'}`,
                backdropFilter: 'blur(10px)',
                boxShadow: card.isPrimary ? `0 0 20px rgba(244,114,182,0.15)` : 'none',
              }}>
              <span style={{ fontSize: '2.5rem' }}>{card.emoji}</span>
              <span className="text-sm font-black text-white text-center leading-snug">{card.label}</span>
              {card.isPrimary && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(244,114,182,0.25)', color: CP }}>DECK PRONTO</span>
              )}
            </button>
          ))}
        </div>

        {/* Player-proposed themes */}
        {proposedThemes.length > 0 && (
          <div className="flex flex-col gap-2 w-full">
            <div className="text-[11px] font-bold tracking-widest" style={{ color: 'rgba(255,255,255,0.35)' }}>
              PROPOSTE DEI GIOCATORI
            </div>
            <div className="flex flex-wrap gap-2">
              {proposedThemes.map(t => (
                <button key={t.id} onClick={() => void selectTheme({ text: t.text })} disabled={themeBusy}
                  className="rounded-xl px-4 py-2 text-sm font-black transition-all hover:scale-105 disabled:opacity-50"
                  style={{ background: 'rgba(244,114,182,0.18)', border: '2px solid rgba(244,114,182,0.5)', color: CP }}>
                  {t.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* GENERA button */}
        <button onClick={() => void selectTheme()} disabled={themeBusy}
          className="w-full rounded-2xl py-4 text-lg font-black transition-all hover:scale-[1.02] disabled:opacity-40"
          style={{
            background: `linear-gradient(135deg, rgba(244,114,182,0.25), rgba(244,114,182,0.1))`,
            border: `2px solid rgba(244,114,182,0.55)`,
            color: CP,
            boxShadow: `0 0 30px rgba(244,114,182,0.2)`,
          }}>
          {themeBusy ? '⏳ Caricamento…' : '🎲 GENERA — Tema Casuale'}
        </button>
      </div>
    );
  }

  // Loading guard: theme selected but cards not yet built (transient server state)
  if (cards.length === 0) return (
    <div className="flex flex-col items-center gap-7 text-center">
      <motion.div animate={{ scale: [1,1.08,1], opacity: [0.7,1,0.7] }} transition={{ repeat: IS_LOW_POWER ? 0 : Infinity, duration: 1.8 }}
        className="text-8xl">💞</motion.div>
      <div className="text-display text-3xl font-black text-white">Jonny sta creando</div>
      <div className="text-display text-4xl font-black" style={{ color: '#F472B6' }}>gli abbinamenti…</div>
      <div className="flex gap-2 mt-2">
        {[0,1,2,3,4].map(i => (
          <motion.div key={i} className="h-3 w-3 rounded-full" style={{ background: '#F472B6' }}
            animate={{ y: [0,-10,0] }} transition={{ repeat: IS_LOW_POWER ? 0 : Infinity, duration: 0.8, delay: i*0.15 }} />
        ))}
      </div>
    </div>
  );

  // Card width: 5 columns fixed
  const cardW = `clamp(120px, ${Math.floor(84 / cols)}vw, 230px)`;
  const cardH = `clamp(80px, ${Math.floor(56 / cols)}vw, 154px)`;

  return (
    <div className="flex w-full max-w-6xl flex-col items-center gap-4">
      <div className="flex items-center gap-4 flex-wrap justify-center">
        <div className="text-display text-3xl font-black" style={{color:'#F472B6'}}>
          {String(payload.selectedTheme ?? payload.category ?? 'Coppie')}
        </div>
        <div className="rounded-full px-5 py-1.5 text-base font-black"
          style={{background:'rgba(244,114,182,0.18)',color:'#F472B6',border:'1px solid rgba(244,114,182,0.45)'}}>
          {matched}/{total} coppie
        </div>
        {!preview && matched < total && (
          <button onClick={startPreview}
            className="flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-black"
            style={{background:'rgba(244,114,182,0.12)',border:'1px solid rgba(244,114,182,0.4)',color:'#F472B6'}}>
            👁 Attiva visibilità 10 secondi
          </button>
        )}
        {preview && (
          <div className="rounded-full px-4 py-1.5 text-sm font-black"
            style={{background:'rgba(244,114,182,0.25)',border:'1px solid rgba(244,114,182,0.6)',color:'#F472B6'}}>
            👁 Visibili {previewSecs}s…
          </div>
        )}
      </div>
      <div className="grid gap-3" style={{
        gridTemplateColumns: `repeat(${cols}, ${cardW})`,
        justifyContent: 'center',
      }}>
        {cards.map(card => {
          const showFace = card.matched || card.flipped || preview;
          return (
            <div key={card.id}
              className="relative overflow-hidden rounded-2xl"
              style={{
                width: cardW, height: cardH,
                ...(card.matched
                  ? {background:'linear-gradient(135deg,#22c55e,#16a34a)',border:'3px solid #4ade80',boxShadow:'0 0 30px rgba(34,197,94,0.5)'}
                  : showFace
                  ? {background:'linear-gradient(135deg,#F472B6,#ec4899)',border:'3px solid #F472B6',boxShadow:'0 0 35px rgba(244,114,182,0.6)'}
                  : {background:'rgba(255,255,255,0.06)',border:'3px solid rgba(244,114,182,0.35)'}),
              }}>
              {showFace ? (
                card.imageUrl ? (
                  <>
                    <img src={card.imageUrl} alt={card.text}
                      className="absolute inset-0 h-full w-full object-cover"
                      style={{borderRadius:'inherit'}}/>
                    {/* text label overlay for image cards when matched */}
                    {card.matched && (
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center px-2 py-1"
                        style={{background:'rgba(0,0,0,0.55)',backdropFilter:'blur(2px)'}}>
                        <span className="text-center font-black text-white leading-tight"
                          style={{fontSize:'clamp(0.75rem,1.4vw,1.1rem)'}}>{card.text}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex h-full w-full items-center justify-center p-3">
                    <span className="text-center font-black text-white leading-tight"
                      style={{fontSize:'clamp(1rem,2.2vw,1.8rem)'}}>{card.text}</span>
                  </div>
                )
              ) : (
                card.imageUrl
                  ? <img src={card.imageUrl} alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                      style={{borderRadius:'inherit',filter:'blur(14px)',opacity:0.1}}/>
                  : null
              )}
              {!showFace && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span style={{fontSize:'clamp(2rem,4vw,3.5rem)',opacity:0.3,color:'#F472B6'}}>?</span>
                </div>
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

// ── KaraokeLiveBoard (v3 — TV / proiettore) ────────────────────────────────

const KK = '#FB923C';
const KK2 = '#ea580c';
const apiFetch = (path: string, body?: unknown) =>
  fetch(`${(import.meta.env.BASE_URL as string) ?? '/'}api${path}`.replace(/\/\//g,'/'),
    { method: body !== undefined ? 'POST' : 'GET', credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined });

function KaraokeLiveBoard({ sessionId, state, players }: {
  sessionId: string;
  state: KaraokeHomeState;
  players: HomePlayer[];
}) {
  const { on } = useEventSocket(null);
  const [liveState, setLiveState] = useState<KaraokeHomeState>(state);
  const [floatingEmojis, setFloatingEmojis] = useState<{ id: number; emoji: string; x: number }[]>([]);
  const emojiCtr = useRef(0);
  const [remaining, setRemaining] = useState(0);
  const [votingCountdown, setVotingCountdown] = useState(30);
  const votingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Dedication intro
  const [dedicationIntro, setDedicationIntro] = useState(false);
  const lastDedicationItemId = useRef<string | null>(null);
  // Awards carousel
  const [awardsPhase, setAwardsPhase] = useState(false);
  const [awardsIdx, setAwardsIdx] = useState(0);
  // ── Backstage preload engine ──────────────────────────────────────────────
  const slotARef = useRef<HTMLIFrameElement>(null);
  const slotBRef = useRef<HTMLIFrameElement>(null);
  const [slotAVideoId, setSlotAVideoId] = useState<string | null>(null);
  const [slotBVideoId, setSlotBVideoId] = useState<string | null>(null);
  const [liveSlot, setLiveSlot] = useState<'A' | 'B'>('A');
  const [backstageStatus, setBackstageStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [backstageReadyVideoId, setBackstageReadyVideoId] = useState<string | null>(null);
  // YouTube player error tracking
  const [videoError, setVideoError] = useState<{ videoId: string; title: string; errorCode: number } | null>(null);
  // Refs for stable closures (avoid stale state in listeners)
  const liveStateRef = useRef<KaraokeHomeState>(state);
  const liveSlotRef = useRef<'A' | 'B'>('A');
  const slotAVideoIdRef = useRef<string | null>(null);
  const slotBVideoIdRef = useRef<string | null>(null);
  const backstageStatusRef = useRef<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const prevCurrentItemIdRef = useRef<string | null>(null);

  // Sync incoming state from parent or socket
  useEffect(() => { setLiveState(state); }, [state]);
  useEffect(() => {
    const u1 = on<{ state: KaraokeHomeState }>('home:karaoke_state', ({ state: s }) => { setLiveState(s); liveStateRef.current = s; });
    const u2 = on<{ emoji: string }>('home:karaoke_reaction', ({ emoji }) => {
      const id = emojiCtr.current++;
      setFloatingEmojis(prev => [...prev.slice(-12), { id, emoji, x: Math.random() * 80 + 10 }]);
      setTimeout(() => setFloatingEmojis(prev => prev.filter(e => e.id !== id)), 3000);
    });
    return () => { u1(); u2(); };
  }, [on]);

  // Session timer
  useEffect(() => {
    const tick = () => setRemaining(remainingSessionSeconds(liveState));
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [liveState.sessionEndAt]);

  // Dedication intro: show 4s card when a new song starts with a dedication
  useEffect(() => {
    const item = liveState.queue.find(q => q.id === liveState.currentQueueItemId);
    if (liveState.karaokePhase === 'playing' && item?.dedicationTargetNickname && item.id !== lastDedicationItemId.current) {
      lastDedicationItemId.current = item.id;
      setDedicationIntro(true);
      const t = setTimeout(() => setDedicationIntro(false), 4000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [liveState.currentQueueItemId, liveState.karaokePhase, liveState.queue]);

  // Awards carousel: auto-advance every 2.5s
  useEffect(() => {
    if (!awardsPhase) return;
    const awards = computeAwards(liveState.results);
    if (awardsIdx >= awards.length) return;
    const t = setTimeout(() => setAwardsIdx(i => i + 1), 2500);
    return () => clearTimeout(t);
  }, [awardsPhase, awardsIdx, liveState.results]);

  // Voting countdown (30s)
  useEffect(() => {
    if (liveState.karaokePhase === 'voting') {
      setVotingCountdown(30);
      votingTimer.current = setInterval(() => setVotingCountdown(p => Math.max(0, p - 1)), 1000);
    } else {
      if (votingTimer.current) clearInterval(votingTimer.current);
    }
    return () => { if (votingTimer.current) clearInterval(votingTimer.current); };
  }, [liveState.karaokePhase]);

  // ── Keep refs in sync with state ─────────────────────────────────────────
  useEffect(() => { liveSlotRef.current = liveSlot; }, [liveSlot]);
  useEffect(() => { slotAVideoIdRef.current = slotAVideoId; }, [slotAVideoId]);
  useEffect(() => { slotBVideoIdRef.current = slotBVideoId; }, [slotBVideoId]);
  useEffect(() => { backstageStatusRef.current = backstageStatus; }, [backstageStatus]);

  // ── YouTube postMessage listener — detect backstage readiness + errors ────
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data as string) as { event?: string; info?: unknown };
        const isSlotA = e.source === slotARef.current?.contentWindow;
        const isSlotB = e.source === slotBRef.current?.contentWindow;
        const isLive = (isSlotA && liveSlotRef.current === 'A') || (isSlotB && liveSlotRef.current === 'B');

        // ── Error detection ──────────────────────────────────────────────────
        if (data.event === 'onError' && isLive) {
          const errorCode = typeof data.info === 'number' ? data.info : -1;
          const liveVid = liveSlotRef.current === 'A' ? slotAVideoIdRef.current : slotBVideoIdRef.current;
          const queue = liveStateRef.current?.queue ?? [];
          const item = queue.find(q => q.videoId === liveVid);
          _log(`[KARAOKE_PLAYER_ERROR] videoId=${liveVid ?? '?'} title="${item?.title ?? '?'}" errorCode=${errorCode} embedUrl=https://www.youtube-nocookie.com/embed/${liveVid ?? '?'}`);
          setVideoError({ videoId: liveVid ?? '', title: item?.title ?? '', errorCode });
          return;
        }

        if (data.event !== 'onStateChange') return;
        const ytState = typeof data.info === 'number' ? data.info : -99;
        const isBackstage = (isSlotA && liveSlotRef.current === 'B') || (isSlotB && liveSlotRef.current === 'A');
        if (!isBackstage) return;
        const vid = liveSlotRef.current === 'B' ? slotAVideoIdRef.current : slotBVideoIdRef.current;
        if (ytState === 1 || ytState === 5) {
          if (backstageStatusRef.current !== 'ready') {
            _log(`[KARAOKE_BACKSTAGE] ready | videoId=${vid ?? '?'}`);
            setBackstageStatus('ready');
            backstageStatusRef.current = 'ready';
            setBackstageReadyVideoId(vid);
            if (vid) void apiFetch(`/home/sessions/${sessionId}/karaoke/backstage-status`, { nextVideoId: vid, status: 'ready' });
          }
        } else if (ytState === 3) {
          _log(`[KARAOKE_BACKSTAGE] buffering | videoId=${vid ?? '?'}`);
          if (backstageStatusRef.current === 'idle') {
            setBackstageStatus('loading');
            backstageStatusRef.current = 'loading';
          }
        }
      } catch { /* ignore non-JSON */ }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── Slot manager — swap or load when current song changes ─────────────────
  useEffect(() => {
    if (liveState.karaokePhase !== 'playing' || !liveState.currentQueueItemId) return;
    setVideoError(null); // clear any previous error when song changes
    const queue = liveState.queue ?? [];
    const currentItem = queue.find(q => q.id === liveState.currentQueueItemId);
    if (!currentItem) return;
    if (prevCurrentItemIdRef.current === currentItem.id) return;
    prevCurrentItemIdRef.current = currentItem.id;

    const vid = currentItem.videoId;
    const waitingQ = queue.filter(q => q.status === 'queued')
      .sort((a, b) => (a.estimatedStartAt ?? '').localeCompare(b.estimatedStartAt ?? ''));
    const nextVid = waitingQ[0]?.videoId ?? null;
    const curLive = liveSlotRef.current;
    const backstageVid = curLive === 'A' ? slotBVideoIdRef.current : slotAVideoIdRef.current;
    const liveIframeRef  = curLive === 'A' ? slotARef : slotBRef;
    const bkstIframeRef  = curLive === 'A' ? slotBRef : slotARef;

    const ytCmd = (ref: React.RefObject<HTMLIFrameElement | null>, func: string) =>
      ref.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: '' }), '*');

    if (backstageVid === vid && backstageStatusRef.current === 'ready') {
      // ── INSTANT SWAP ────────────────────────────────────────────────────
      _log(`[KARAOKE_BACKSTAGE] live swap | in=${vid}`);
      ytCmd(bkstIframeRef, 'unMute');
      ytCmd(liveIframeRef, 'mute');
      const newLive = curLive === 'A' ? 'B' : 'A';
      setLiveSlot(newLive);
      liveSlotRef.current = newLive;
      setBackstageStatus('idle');
      backstageStatusRef.current = 'idle';
      setBackstageReadyVideoId(null);
      // Reload old live slot (new backstage) with next video
      if (nextVid) {
        if (curLive === 'A') { setSlotAVideoId(nextVid); slotAVideoIdRef.current = nextVid; }
        else                  { setSlotBVideoId(nextVid); slotBVideoIdRef.current = nextVid; }
        setBackstageStatus('loading');
        backstageStatusRef.current = 'loading';
        _log(`[KARAOKE_BACKSTAGE] preload start | videoId=${nextVid}`);
        void apiFetch(`/home/sessions/${sessionId}/karaoke/backstage-status`, { nextVideoId: nextVid, status: 'loading' });
      }
    } else {
      // ── NORMAL LOAD (fallback — no ready preload) ─────────────────────
      _log(`[KARAOKE_BACKSTAGE] preload missed — loading normally | videoId=${vid}`);
      if (curLive === 'A') { setSlotAVideoId(vid); slotAVideoIdRef.current = vid; }
      else                  { setSlotBVideoId(vid); slotBVideoIdRef.current = vid; }
      // Unmute live after brief init delay
      setTimeout(() => ytCmd(liveIframeRef, 'unMute'), 900);
      // Preload next in backstage
      if (nextVid) {
        if (curLive === 'A') { setSlotBVideoId(nextVid); slotBVideoIdRef.current = nextVid; }
        else                  { setSlotAVideoId(nextVid); slotAVideoIdRef.current = nextVid; }
        setBackstageStatus('loading');
        backstageStatusRef.current = 'loading';
        _log(`[KARAOKE_BACKSTAGE] preload start | videoId=${nextVid}`);
        void apiFetch(`/home/sessions/${sessionId}/karaoke/backstage-status`, { nextVideoId: nextVid, status: 'loading' });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState.karaokePhase, liveState.currentQueueItemId]);

  const post = useCallback(async (path: string, body?: unknown) => {
    await apiFetch(`/home/sessions/${sessionId}${path}`, body ?? {});
  }, [sessionId]);

  const s = liveState;
  const queue = s.queue ?? [];
  const currentItem = queue.find(q => q.id === s.currentQueueItemId);
  const waitingQueue = queue.filter(q => q.status === 'queued').sort((a, b) =>
    (a.estimatedStartAt ?? '').localeCompare(b.estimatedStartAt ?? ''));
  const sortedResults = [...(s.results ?? [])].sort((a, b) => b.score - a.score);

  // ── Mode select ──────────────────────────────────────────────────────────
  if (s.subMode === 'mode_select') {
    return (
      <div className="flex flex-col items-center justify-center gap-8 text-center h-full">
        <div className="text-6xl">🎤</div>
        <div className="text-display text-5xl font-black text-white">Scegli la modalità</div>
        <div className="flex flex-col gap-4 w-full max-w-sm">
          {([
            ['karaoke-live', '🎤 Karaoke Live', 'Coda aperta per tutta la serata'],
            ['freestyle', '🎙️ Freestyle Battle', 'Rap battle con parole casuali'],
            ['mixed', '🎭 Mixed Mode', 'Karaoke + Freestyle libero'],
          ] as const).map(([mode, label, sub]) => (
            <button key={mode} onClick={() => void post('/karaoke/set-mode', { mode })}
              className="rounded-2xl px-8 py-5 text-left font-black transition-all hover:scale-[1.02]"
              style={{ background: `linear-gradient(135deg,${KK}22,${KK}10)`, border: `2px solid ${KK}55`, color: '#fff' }}>
              <div className="text-xl">{label}</div>
              <div className="text-sm mt-1" style={{ color: `${KK}cc` }}>{sub}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Duration select ──────────────────────────────────────────────────────
  if ((s.subMode === 'karaoke-live' || s.subMode === 'mixed') && s.karaokePhase === 'duration_select') {
    return (
      <div className="flex flex-col items-center justify-center gap-8 text-center h-full">
        <div className="text-6xl">⏱️</div>
        <div className="text-display text-4xl font-black text-white">Durata della serata karaoke</div>
        <div className="grid grid-cols-3 gap-3 w-full max-w-lg">
          {DURATION_OPTIONS.map(m => (
            <button key={m} onClick={() => void post('/karaoke/set-duration', { minutes: m })}
              className="rounded-2xl py-5 font-black text-2xl transition-all hover:scale-105"
              style={{ background: `linear-gradient(135deg,${KK}30,${KK}15)`, border: `2px solid ${KK}55`, color: '#fff' }}>
              {m < 60 ? `${m}min` : `${m/60}h`}
            </button>
          ))}
        </div>
        {s.subMode === 'mixed' && s.freestylePhase === 'idle' && (
          <button onClick={() => void post('/karaoke/set-mode', { mode: 'freestyle' })}
            className="mt-2 text-sm rounded-xl px-5 py-2 font-bold"
            style={{ background: `${KK}15`, border: `1px solid ${KK}40`, color: `${KK}cc` }}>
            → Vai direttamente a Freestyle Battle
          </button>
        )}
      </div>
    );
  }

  // ── Freestyle mode ───────────────────────────────────────────────────────
  if (s.subMode === 'freestyle' || (s.freestylePhase !== 'idle' && s.subMode === 'mixed')) {
    return <FreestyleBattleBoard sessionId={sessionId} state={s} post={post} />;
  }

  // ── Queue open ───────────────────────────────────────────────────────────
  if (s.karaokePhase === 'queue_open') {
    const nextSinger = waitingQueue[0];
    return (
      <div className="flex flex-col h-full gap-5 p-6">
        <div className="flex items-center justify-between shrink-0">
          <div>
            <div className="text-xs font-black uppercase tracking-widest" style={{ color: KK }}>🎤 Karaoke Live</div>
            <div className="text-display text-3xl font-black text-white mt-1">Coda aperta</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="rounded-2xl px-4 py-3 text-center" style={{ background: `${KK}15`, border: `1px solid ${KK}35` }}>
              <div className="text-xs text-white/40 mb-1">Tempo sessione</div>
              <div className="text-display text-2xl font-black tabular-nums" style={{ color: KK }}>{formatCountdown(remaining)}</div>
            </div>
            <div className="rounded-2xl px-4 py-3 text-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <div className="text-xs text-white/40 mb-1">In coda</div>
              <div className="text-display text-2xl font-black text-white">{waitingQueue.length}</div>
            </div>
          </div>
        </div>

        {nextSinger ? (
          <div className="rounded-3xl p-5" style={{ background: `${KK}15`, border: `2px solid ${KK}55` }}>
            <div className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: `${KK}aa` }}>Prossimo cantante</div>
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full flex items-center justify-center text-xl font-black text-black"
                style={{ background: nextSinger.avatarColor }}>
                {nextSinger.nickname[0]?.toUpperCase()}
              </div>
              <div>
                <div className="text-display text-2xl font-black text-white">{nextSinger.nickname}</div>
                <div className="text-sm text-white/55">{nextSinger.title}</div>
              </div>
              <button onClick={() => void post('/karaoke/start-next')}
                className="ml-auto flex items-center gap-2 rounded-2xl px-6 py-3 font-black text-black"
                style={{ background: `linear-gradient(135deg,${KK},${KK2})`, boxShadow: `0 0 30px ${KK}55` }}>
                <Play className="h-5 w-5"/> Inizia
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl p-8 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="text-4xl mb-3">📱</div>
            <div className="text-xl font-bold text-white/60">Dai giocatori, cercate e prenotate il vostro brano!</div>
          </div>
        )}

        {waitingQueue.length > 0 && (
          <div className="flex-1 overflow-hidden rounded-2xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="p-3 border-b border-white/08">
              <div className="text-xs font-black uppercase tracking-widest text-white/35">Coda ({waitingQueue.length})</div>
            </div>
            <div className="overflow-y-auto max-h-48 divide-y divide-white/05">
              {waitingQueue.map((item, i) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xs text-white/25 w-5">{i + 1}</span>
                  <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-black text-black"
                    style={{ background: item.avatarColor }}>{item.nickname[0]?.toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white truncate">{item.nickname}</div>
                    <div className="text-xs text-white/40 truncate">{item.title}</div>
                  </div>
                  {item.estimatedStartAt && (
                    <div className="text-xs text-white/30 shrink-0">
                      ~{new Date(item.estimatedStartAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {sortedResults.length > 0 && (
          <div className="shrink-0">
            <div className="text-xs font-black uppercase tracking-widest text-white/30 mb-2">Classifica live</div>
            <div className="flex gap-2 flex-wrap">
              {sortedResults.slice(0, 5).map((r, i) => (
                <div key={r.queueItemId} className="rounded-xl px-3 py-2 flex items-center gap-2"
                  style={{ background: `${KK}12`, border: `1px solid ${KK}30` }}>
                  <span className="text-xs text-white/30">{i + 1}.</span>
                  <span className="text-sm font-bold text-white">{r.nickname}</span>
                  <span className="text-sm font-black tabular-nums" style={{ color: KK }}>{r.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Playing ──────────────────────────────────────────────────────────────
  if (s.karaokePhase === 'playing' && currentItem) {
    // Dedication intro overlay
    if (dedicationIntro && currentItem.dedicationTargetNickname) {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center h-full gap-6 text-center"
          style={{ background: 'radial-gradient(ellipse at center, rgba(245,182,66,0.18) 0%, transparent 70%)' }}>
          <div className="text-7xl">🎤</div>
          <div className="text-display text-4xl font-black text-white leading-tight">
            {currentItem.nickname}
          </div>
          <div className="text-xl text-white/60">dedica questo brano a</div>
          <div className="text-display text-5xl font-black" style={{ color: KK }}>
            {currentItem.dedicationTargetNickname} ❤️
          </div>
        </motion.div>
      );
    }

    // Dual-slot URLs: both start muted (unmute via postMessage after mount/swap)
    const slotAUrl = slotAVideoId
      ? `https://www.youtube-nocookie.com/embed/${slotAVideoId}?autoplay=1&mute=1&enablejsapi=1&rel=0&modestbranding=1&playsinline=1`
      : null;
    const slotBUrl = slotBVideoId
      ? `https://www.youtube-nocookie.com/embed/${slotBVideoId}?autoplay=1&mute=1&enablejsapi=1&rel=0&modestbranding=1&playsinline=1`
      : null;
    const nextInQueue = waitingQueue[0];
    const nextIsReady = backstageStatus === 'ready' && nextInQueue?.videoId === backstageReadyVideoId;

    return (
      <div className="flex h-full gap-5 p-4">
        <div className="flex flex-[3] flex-col gap-4">
          <div className="flex items-center gap-4 shrink-0">
            <div className="h-12 w-12 rounded-full flex items-center justify-center text-xl font-black text-black"
              style={{ background: currentItem.avatarColor }}>{currentItem.nickname[0]?.toUpperCase()}</div>
            <div>
              <div className="text-display text-2xl font-black text-white">{currentItem.nickname}</div>
              <div className="text-sm text-white/50">{currentItem.title}</div>
              {currentItem.dedicationTargetNickname && (
                <div className="text-xs mt-0.5" style={{ color: KK }}>❤️ dedicato a {currentItem.dedicationTargetNickname}</div>
              )}
            </div>
            <div className="ml-auto flex gap-2">
              <button onClick={() => void post('/karaoke/open-voting')}
                className="rounded-xl px-4 py-2 text-sm font-black"
                style={{ background: `${KK}25`, border: `1px solid ${KK}55`, color: KK }}>
                ⭐ Apri Voto
              </button>
              <button onClick={() => void post('/karaoke/end-session')}
                className="rounded-xl px-4 py-2 text-sm font-black text-white/40"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
                Fine Serata
              </button>
            </div>
          </div>

          {/* ── Dual-slot video player ── */}
          <div className="flex-1 rounded-2xl overflow-hidden relative" style={{ minHeight: 0 }}>
            {/* Slot A */}
            {slotAUrl && (
              <iframe
                key={`slot-a-${slotAVideoId}`}
                ref={slotARef}
                src={slotAUrl}
                className="absolute inset-0 w-full h-full"
                style={liveSlot === 'A'
                  ? { visibility: 'visible' }
                  : { position: 'absolute', left: '-99999px', width: '1px', height: '1px', opacity: 0 }}
                allow="autoplay; encrypted-media"
                allowFullScreen
                title="karaoke-live-a"
              />
            )}
            {/* Slot B — on PS4, skip backstage iframe; only render when it's the live slot */}
            {slotBUrl && (!IS_PS4 || liveSlot === 'B') && (
              <iframe
                key={`slot-b-${slotBVideoId}`}
                ref={slotBRef}
                src={slotBUrl}
                className="absolute inset-0 w-full h-full"
                style={liveSlot === 'B'
                  ? { visibility: 'visible' }
                  : { position: 'absolute', left: '-99999px', width: '1px', height: '1px', opacity: 0 }}
                allow="autoplay; encrypted-media"
                allowFullScreen
                title="karaoke-live-b"
              />
            )}
            {/* ── YouTube error fallback overlay ── */}
            {videoError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 text-center z-10 rounded-2xl"
                style={{ background: 'rgba(13,6,0,0.92)', border: '2px solid rgba(239,68,68,0.45)' }}>
                <div className="text-4xl">⚠️</div>
                <div className="text-lg font-black text-white leading-snug px-6">
                  Questo video non può essere<br/>riprodotto nell'app
                </div>
                {videoError.title && (
                  <div className="text-sm text-white/45 px-6">"{videoError.title}"</div>
                )}
                <div className="flex gap-3 flex-wrap justify-center px-4">
                  <a href={`https://www.youtube.com/watch?v=${videoError.videoId}`}
                    target="_blank" rel="noopener noreferrer"
                    className="rounded-xl px-5 py-3 text-sm font-black text-white"
                    style={{ background: '#FF0000', border: '1px solid rgba(255,0,0,0.5)' }}>
                    ▶ Apri su YouTube
                  </a>
                  <button onClick={() => void post('/karaoke/open-voting')}
                    className="rounded-xl px-5 py-3 text-sm font-black"
                    style={{ background: `${KK}20`, border: `1px solid ${KK}50`, color: KK }}>
                    ⭐ Salta e vota
                  </button>
                  <button onClick={() => setVideoError(null)}
                    className="rounded-xl px-5 py-3 text-sm font-black text-white/40"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
                    ✕ Chiudi avviso
                  </button>
                </div>
              </div>
            )}
            {/* Floating emoji reactions — hidden on PS4 */}
            {!IS_PS4 && (
            <div className="particle-layer absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }}>
              <AnimatePresence>
                {floatingEmojis.map(e => (
                  <motion.div key={e.id}
                    initial={{ y: '100%', opacity: 1, scale: 0.8 }}
                    animate={{ y: '-120%', opacity: 0, scale: 1.2 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 2.5, ease: 'easeOut' }}
                    className="absolute bottom-0 text-4xl"
                    style={{ left: `${e.x}%` }}>
                    {e.emoji}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            )}
          </div>
        </div>

        <div className="flex flex-[1] flex-col gap-3 min-w-[180px] max-w-[220px]">
          <div className="rounded-xl p-3" style={{ background: `${KK}12`, border: `1px solid ${KK}30` }}>
            <div className="text-xs uppercase tracking-widest mb-2" style={{ color: `${KK}88` }}>Tempo sessione</div>
            <div className="text-display text-xl font-black tabular-nums" style={{ color: KK }}>{formatCountdown(remaining)}</div>
          </div>
          {waitingQueue.length > 0 && (
            <div className="rounded-xl p-3 flex-1 overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="text-xs uppercase tracking-widest text-white/30 mb-2">Coda ({waitingQueue.length})</div>
              <div className="space-y-2 overflow-y-auto max-h-40">
                {waitingQueue.slice(0, 6).map((item, i) => {
                  const isNext = i === 0;
                  const itemReady = isNext && nextIsReady;
                  return (
                    <div key={item.id} className="flex items-center gap-2">
                      <span className="text-xs text-white/20 w-3">{i + 1}</span>
                      <div className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-black text-black shrink-0"
                        style={{ background: item.avatarColor }}>{item.nickname[0]?.toUpperCase()}</div>
                      <span className="text-xs font-bold text-white/60 truncate flex-1">{item.nickname}</span>
                      {isNext && (
                        <span className="text-[9px] font-black shrink-0 rounded px-1 py-0.5"
                          style={itemReady
                            ? { background: 'rgba(34,197,94,0.2)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.4)' }
                            : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.1)' }}>
                          {itemReady ? '🟢' : '⏳'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="rounded-xl p-3 mt-auto" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="text-xs uppercase tracking-widest text-white/25 mb-2">Classifica</div>
            {sortedResults.slice(0, 4).map((r, i) => (
              <div key={r.queueItemId} className="flex items-center gap-2 py-1">
                <span className="text-xs text-white/20 w-3">{i + 1}</span>
                <span className="flex-1 text-xs font-bold text-white/60 truncate">{r.nickname}</span>
                <span className="text-xs font-black tabular-nums" style={{ color: KK }}>{r.score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Voting ───────────────────────────────────────────────────────────────
  if (s.karaokePhase === 'voting' && currentItem) {
    const voteCount = Object.keys(s.currentVotes ?? {}).length;
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
        <div className="text-display text-5xl font-black text-white">⭐ Vota adesso!</div>
        <div className="text-xl font-bold text-white/60">{currentItem.nickname} — {currentItem.title}</div>
        <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
          {(['Intonazione', 'Presenza', 'Emozione', 'Originalità'] as const).map(cat => (
            <div key={cat} className="rounded-2xl p-5" style={{ background: `${KK}15`, border: `1px solid ${KK}35` }}>
              <div className="text-sm font-black uppercase tracking-widest mb-2" style={{ color: KK }}>{cat}</div>
              <div className="flex gap-1 justify-center">
                {[1,2,3,4,5].map(n => <Star key={n} className="h-7 w-7" fill={`${KK}55`} style={{ color: KK }} />)}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-6">
          <div className="rounded-2xl px-6 py-3" style={{ background: `${KK}15`, border: `1px solid ${KK}35` }}>
            <div className="text-xs text-white/40 mb-1">Voti ricevuti</div>
            <div className="text-display text-3xl font-black" style={{ color: KK }}>{voteCount} / {players.length}</div>
          </div>
          <div className="rounded-2xl px-6 py-3" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)' }}>
            <div className="text-xs text-white/40 mb-1">Tempo voto</div>
            <div className={`text-display text-3xl font-black tabular-nums ${votingCountdown <= 5 ? 'text-red-400 animate-pulse' : 'text-white'}`}>{votingCountdown}s</div>
          </div>
        </div>
        <button onClick={() => void post('/karaoke/end-voting')}
          className="rounded-2xl px-8 py-4 font-black text-black"
          style={{ background: `linear-gradient(135deg,${KK},${KK2})`, boxShadow: `0 0 30px ${KK}55` }}>
          Chiudi votazione →
        </button>
      </div>
    );
  }

  // ── Transition ───────────────────────────────────────────────────────────
  if (s.karaokePhase === 'transition') {
    const lastResult = s.results[s.results.length - 1];
    const nextSinger = waitingQueue[0];
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-8">
        {lastResult && (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="rounded-3xl p-6 w-full max-w-md"
            style={{ background: `${KK}15`, border: `2px solid ${KK}55` }}>
            <div className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: `${KK}aa` }}>Risultato</div>
            <div className="text-display text-4xl font-black text-white">{lastResult.nickname}</div>
            <div className="text-display text-6xl font-black mt-2" style={{ color: KK }}>{lastResult.score} pt</div>
            <div className="flex justify-center gap-4 mt-3 text-sm text-white/50">
              <span>❤️ {lastResult.positiveReactions}</span>
              <span>💀 {lastResult.negativeReactions}</span>
            </div>
          </motion.div>
        )}
        <KaraokeRankingMini results={s.results} />
        {nextSinger ? (
          <div className="flex items-center gap-5">
            <div className="text-lg font-bold text-white/60">Prossimo cantante:</div>
            <div className="h-12 w-12 rounded-full flex items-center justify-center text-xl font-black text-black"
              style={{ background: nextSinger.avatarColor }}>{nextSinger.nickname[0]?.toUpperCase()}</div>
            <div className="text-display text-2xl font-black text-white">{nextSinger.nickname}</div>
            <button onClick={() => void post('/karaoke/start-next')}
              className="rounded-2xl px-6 py-3 font-black text-black ml-4"
              style={{ background: `linear-gradient(135deg,${KK},${KK2})`, boxShadow: `0 0 30px ${KK}55` }}>
              <Play className="h-5 w-5 inline mr-2"/>Inizia
            </button>
          </div>
        ) : (
          <button onClick={() => void post('/karaoke/end-session')}
            className="rounded-2xl px-8 py-4 font-black text-black"
            style={{ background: `linear-gradient(135deg,${KK},${KK2})`, boxShadow: `0 0 30px ${KK}55` }}>
            🏆 Finale Karaoke
          </button>
        )}
      </div>
    );
  }

  // ── Finale — Awards carousel then final podium ────────────────────────────
  if (s.karaokePhase === 'finale') {
    const awards = computeAwards(s.results);
    const winner = sortedResults[0];

    // Awards carousel phase
    if (awardsPhase && awards.length > 0) {
      if (awardsIdx < awards.length) {
        const award = awards[awardsIdx];
        return (
          <motion.div key={award.id}
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full gap-6 text-center px-8">
            <div className="text-[5rem] leading-none">{award.emoji}</div>
            <div>
              <div className="text-xs font-black uppercase tracking-[0.25em] mb-3" style={{ color: `${KK}99` }}>
                🏆 PREMIAZIONI FINALI  {awardsIdx + 1} / {awards.length}
              </div>
              <div className="text-display text-3xl font-black mb-1" style={{ color: KK }}>{award.title}</div>
              <div className="text-display text-5xl font-black text-white mt-2">{award.nickname}</div>
              <div className="text-2xl font-black mt-3 text-white/50">{award.valueLabel}</div>
            </div>
            {/* Progress dots */}
            <div className="flex gap-2">
              {awards.map((_, i) => (
                <div key={i} className={`h-2 w-2 rounded-full transition-all ${i === awardsIdx ? 'scale-125' : 'opacity-30'}`}
                  style={{ background: i === awardsIdx ? KK : 'white' }} />
              ))}
            </div>
            <button onClick={() => setAwardsIdx(i => i + 1)}
              className="rounded-2xl px-6 py-2 text-sm font-black text-white/50 border border-white/10">
              Avanti →
            </button>
          </motion.div>
        );
      }
      // All awards shown → fall through to final podium
    }

    // Final podium
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-8">
        <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }}>
          <div className="text-8xl mb-2">🏆</div>
          <div className="text-display text-5xl font-black text-white">Karaoke Finale!</div>
        </motion.div>
        {winner && (
          <div className="rounded-3xl p-6" style={{ background: `${KK}20`, border: `2px solid ${KK}` }}>
            <div className="text-sm text-white/50 mb-1">Vincitore della serata</div>
            <div className="text-display text-4xl font-black text-white">{winner.nickname}</div>
            <div className="text-display text-6xl font-black mt-1" style={{ color: KK }}>{winner.score} pt</div>
            <div className="text-sm text-white/40 mt-1">{winner.title}</div>
          </div>
        )}
        <KaraokeRankingMini results={s.results} />
        <div className="flex gap-3">
          {!awardsPhase && awards.length > 0 && (
            <button onClick={() => { setAwardsPhase(true); setAwardsIdx(0); }}
              className="rounded-2xl px-6 py-3 font-black text-black"
              style={{ background: `linear-gradient(135deg,${KK},${KK2})`, boxShadow: `0 0 30px ${KK}55` }}>
              🏆 Premiazioni speciali
            </button>
          )}
          {winner && (
            <button onClick={() => {
              const url = `https://www.youtube-nocookie.com/embed/${winner.videoId}?autoplay=1&modestbranding=1&rel=0`;
              window.open(url, '_blank');
            }}
              className="rounded-2xl px-6 py-3 font-black text-white/80 border"
              style={{ borderColor: `${KK}55`, background: `${KK}15` }}>
              ▶ Ricanta il vincitore
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}

function HomeSessionQROverlay({ joinCode }: { joinCode: string }) {
  const joinUrl = `${window.location.origin}/home/join?s=${joinCode}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&bgcolor=0a0a0f&color=A78BFA&data=${encodeURIComponent(joinUrl)}`;
  return (
    <div style={{
      position: 'fixed', bottom: 170, right: 14, zIndex: 99999,
      background: 'rgba(10,10,20,0.95)', border: '2px solid rgba(167,139,250,0.55)',
      borderRadius: 16, padding: '12px 14px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      backdropFilter: 'blur(14px)', pointerEvents: 'none',
      boxShadow: '0 4px 32px rgba(0,0,0,0.7), 0 0 0 1px rgba(167,139,250,0.15)',
    }}>
      <img src={qrSrc} alt="" style={{ width: 96, height: 96, borderRadius: 10, display: 'block' }} />
      <div style={{ color: 'rgba(167,139,250,0.95)', fontSize: 10, fontWeight: 900,
        textAlign: 'center', letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1.5 }}>
        Scansiona<br/>per unirti
      </div>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, textAlign: 'center', fontWeight: 700 }}>
        {joinCode}
      </div>
    </div>
  );
}

function KaraokeQROverlay({ joinUrl }: { joinUrl: string }) {
  return (
    <div style={{
      position: 'fixed', top: 14, right: 14, zIndex: 99999,
      background: 'rgba(13,6,0,0.92)', border: '2px solid rgba(251,146,60,0.65)',
      borderRadius: 16, padding: '12px 14px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      backdropFilter: 'blur(14px)', pointerEvents: 'none',
      boxShadow: '0 4px 32px rgba(0,0,0,0.7), 0 0 0 1px rgba(251,146,60,0.2)',
    }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 6, lineHeight: 0 }}>
        <QRCodeSVG value={joinUrl} size={96} bgColor="#ffffff" fgColor="#0d0600" level="M" />
      </div>
      <div style={{ color: 'rgba(251,146,60,0.98)', fontSize: 10, fontWeight: 900,
        textAlign: 'center', letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1.5 }}>
        Scansiona e<br/>prenotati ora
      </div>
      <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 9, textAlign: 'center', fontWeight: 600, lineHeight: 1.4 }}>
        Richiedi il tuo<br/>brano live
      </div>
    </div>
  );
}

function KaraokeRankingMini({ results }: { results: KaraokePerformanceResult[] }) {
  const sorted = [...results].sort((a, b) => b.score - a.score).slice(0, 5);
  if (sorted.length === 0) return null;
  return (
    <div className="w-full max-w-sm">
      <div className="text-xs font-black uppercase tracking-widest text-white/30 mb-2 text-center">Classifica provvisoria</div>
      <div className="space-y-2">
        {sorted.map((r, i) => (
          <div key={r.queueItemId} className="flex items-center gap-3 rounded-xl px-4 py-2"
            style={{ background: i === 0 ? `${KK}20` : 'rgba(255,255,255,0.05)', border: `1px solid ${i === 0 ? KK+'44' : 'rgba(255,255,255,0.1)'}` }}>
            <span className="text-sm text-white/30 w-4">{i + 1}</span>
            <span className="flex-1 text-sm font-bold text-white">{r.nickname}</span>
            <span className="text-sm font-black tabular-nums" style={{ color: KK }}>{r.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── FreestyleBattleBoard (TV) ──────────────────────────────────────────────

function FreestyleBattleBoard({ sessionId, state: s, post }: {
  sessionId: string;
  state: KaraokeHomeState;
  post: (path: string, body?: unknown) => Promise<void>;
}) {
  const FR = '#F59E0B';
  const { on } = useEventSocket(null);
  const [liveState, setLiveState] = useState<KaraokeHomeState>(s);
  const [secsLeft, setSecsLeft] = useState<number>(60);
  const endFiredRef = useRef(false);

  useEffect(() => { setLiveState(s); }, [s]);
  useEffect(() => {
    const u = on<{ state: KaraokeHomeState }>('home:karaoke_state', ({ state: ns }) => setLiveState(ns));
    return u;
  }, [on]);

  const ls = liveState;
  const battle = ls.currentBattle;
  const waitingBookings = ls.freestyleBookings.filter(b => b.status === 'waiting');
  const currentBeat = battle ? ls.beats.find(b => b.id === battle.beatId) : null;

  // Riproduce la base beat scelta (audioUrl impostato in admin) durante la battle.
  const beatAudioRef = useRef<HTMLAudioElement | null>(null);
  const beatUrl = currentBeat?.audioUrl ?? '';
  const battleActive = ls.freestylePhase === 'battling' && !!beatUrl;
  useEffect(() => {
    const el = beatAudioRef.current;
    if (!el) return;
    if (battleActive) {
      if (el.src !== beatUrl) el.src = beatUrl;
      el.loop = true; el.volume = 0.8;
      el.play().catch(() => { /* autoplay bloccato: parte al primo gesto */ });
    } else {
      el.pause();
    }
  }, [battleActive, beatUrl]);
  useEffect(() => () => { beatAudioRef.current?.pause(); }, []);

  // Countdown timer — auto-fires end-battle when time runs out
  useEffect(() => {
    const endsAt = battle?.battleEndsAt;
    endFiredRef.current = false;
    if (!endsAt || (battle.battleLocked ?? false)) { setSecsLeft(0); return; }
    const tick = () => {
      const s = Math.max(0, Math.round((new Date(endsAt).getTime() - Date.now()) / 1000));
      setSecsLeft(s);
      if (s === 0 && !endFiredRef.current) {
        endFiredRef.current = true;
        void post('/freestyle/end-battle');
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [battle?.battleEndsAt, battle?.battleLocked, post]);

  // Booking phase
  if (ls.freestylePhase === 'idle' || ls.freestylePhase === 'booking') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-7 text-center">
        <div className="text-6xl">🎙️</div>
        <div className="text-display text-5xl font-black text-white">Freestyle Battle</div>
        <div className="text-xl text-white/60">Chi vuole rappare? Prenotatevi dal telefono!</div>
        {waitingBookings.length > 0 && (
          <div className="flex flex-wrap gap-3 justify-center">
            {waitingBookings.map(b => (
              <div key={b.id} className="rounded-2xl px-5 py-3 flex items-center gap-3"
                style={{ background: `${b.avatarColor}22`, border: `2px solid ${b.avatarColor}66` }}>
                <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-black text-black"
                  style={{ background: b.avatarColor }}>{b.nickname[0]?.toUpperCase()}</div>
                <span className="font-black text-white">{b.nickname}</span>
              </div>
            ))}
          </div>
        )}
        {waitingBookings.length > 0 && (
          <div className="flex gap-3 flex-wrap justify-center">
            {ls.beats.slice(0, 4).map(beat => (
              <button key={beat.id} onClick={() => void post('/freestyle/start-battle', { beatId: beat.id })}
                className="rounded-xl px-4 py-2 text-sm font-black"
                style={{ background: `${FR}20`, border: `1px solid ${FR}55`, color: FR }}>
                🎵 {beat.title}
              </button>
            ))}
            <button onClick={() => void post('/freestyle/start-battle')}
              className="rounded-2xl px-6 py-3 font-black text-black"
              style={{ background: `linear-gradient(135deg,${FR},#d97706)`, boxShadow: `0 0 30px ${FR}55` }}>
              <Play className="h-5 w-5 inline mr-2"/>Random beat
            </button>
          </div>
        )}
      </div>
    );
  }

  // Battling — full word grid shown simultaneously
  if (ls.freestylePhase === 'battling' && battle) {
    const confirmedCount = battle.words.filter(w => w.validated).length;
    const liveScore = confirmedCount * 20;
    const timerExpired = (battle.battleLocked ?? false) || secsLeft === 0;
    const timerColor = secsLeft <= 10 && !timerExpired ? '#ef4444' : FR;

    return (
      <div className="flex flex-col h-full gap-4 p-6">
        {/* Base beat scelta — riproduce l'audioUrl impostato in admin */}
        <audio ref={beatAudioRef} hidden />
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full flex items-center justify-center text-xl font-black text-black"
              style={{ background: battle.avatarColor }}>{battle.nickname[0]?.toUpperCase()}</div>
            <div>
              <div className="text-xs font-black uppercase tracking-widest" style={{ color: FR }}>🎙️ Sul palco</div>
              <div className="text-display text-2xl font-black text-white">{battle.nickname}</div>
            </div>
            {currentBeat && (
              <div className="ml-3 px-3 py-1 rounded-lg text-xs font-bold"
                style={{ background: `${FR}15`, color: `${FR}cc` }}>
                {currentBeat.title} · {currentBeat.bpm} BPM
              </div>
            )}
          </div>
          {/* Countdown timer */}
          {battle.battleEndsAt && (
            <motion.div
              animate={secsLeft <= 10 && !timerExpired && !IS_LOW_POWER ? { scale: [1, 1.06, 1] } : {}}
              transition={{ repeat: Infinity, duration: 0.8 }}
              className="rounded-2xl px-5 py-3 text-center min-w-[80px]"
              style={{
                background: timerExpired ? '#ef444420' : `${timerColor}20`,
                border: `2px solid ${timerExpired ? '#ef444488' : timerColor + '88'}`,
              }}>
              <div className="text-xs font-black uppercase tracking-widest"
                style={{ color: timerExpired ? '#ef4444' : timerColor }}>
                {timerExpired ? 'TEMPO!' : 'Tempo'}
              </div>
              <div className="text-display text-3xl font-black tabular-nums"
                style={{ color: timerExpired ? '#ef4444' : timerColor }}>
                {timerExpired ? '0' : secsLeft}s
              </div>
            </motion.div>
          )}
        </div>

        {/* Word grid — 4 × 4 */}
        <div className="flex-1 grid grid-cols-4 gap-3 content-center">
          {battle.words.map(w => {
            const tapCount = w.validatedBy.length;
            return (
              <motion.div key={w.id}
                initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300 }}
                className="rounded-2xl px-2 py-3 text-center flex flex-col items-center justify-center gap-1"
                style={{
                  background: w.validated ? '#22c55e18' : tapCount > 0 ? `${FR}18` : 'rgba(255,255,255,0.04)',
                  border: `2px solid ${w.validated ? '#22c55e' : tapCount > 0 ? `${FR}77` : 'rgba(255,255,255,0.08)'}`,
                  boxShadow: w.validated ? '0 0 18px #22c55e40' : undefined,
                }}>
                <div className="font-black text-sm tracking-wide leading-tight"
                  style={{ color: w.validated ? '#4ade80' : tapCount > 0 ? FR : 'rgba(255,255,255,0.45)' }}>
                  {w.word}
                </div>
                {w.validated && <div className="text-green-400 text-xs">✅</div>}
                {!w.validated && tapCount > 0 && (
                  <div className="text-xs" style={{ color: `${FR}99` }}>👆 {tapCount}</div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Score bar + end button */}
        <div className="shrink-0 flex items-center gap-4 rounded-2xl px-5 py-3"
          style={{ background: `${FR}12`, border: `1px solid ${FR}30` }}>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/40 uppercase tracking-widest">Parole</span>
            <span className="text-xl font-black text-white tabular-nums">{confirmedCount}</span>
            <span className="text-xs text-white/30">/ {battle.words.length}</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/40 uppercase tracking-widest">Punti</span>
            <span className="text-2xl font-black tabular-nums" style={{ color: FR }}>{liveScore}</span>
            <span className="text-xs text-white/30">pt</span>
          </div>
          <button onClick={() => void post('/freestyle/end-battle')}
            className="rounded-xl px-4 py-2 font-black text-sm"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)' }}>
            Fine battle ▪
          </button>
        </div>
      </div>
    );
  }

  // Battle result
  if (ls.freestylePhase === 'battle_result') {
    const lastResult = ls.freestyleResults[ls.freestyleResults.length - 1];
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
        <div className="text-display text-4xl font-black text-white">🏁 Risultato Battle</div>
        {lastResult && (
          <div className="rounded-3xl p-6 w-full max-w-xs" style={{ background: `${FR}15`, border: `2px solid ${FR}55` }}>
            <div className="text-display text-3xl font-black text-white">{lastResult.nickname}</div>
            <div className="text-display text-5xl font-black mt-2" style={{ color: FR }}>{lastResult.score} pt</div>
            <div className="text-sm text-white/40 mt-1">{lastResult.wordsValidated} parole confermate</div>
          </div>
        )}
        <div className="space-y-2 w-full max-w-xs">
          {[...ls.freestyleResults].sort((a, b) => b.score - a.score).map((r, i) => (
            <div key={r.playerId} className="flex items-center gap-3 rounded-xl px-4 py-2"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <span className="text-xs text-white/30 w-4">{i + 1}</span>
              <span className="flex-1 text-sm font-bold text-white">{r.nickname}</span>
              <span className="font-black tabular-nums" style={{ color: FR }}>{r.score}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={() => void post('/freestyle/book', {})}
            className="rounded-2xl px-6 py-3 font-black"
            style={{ background: `${FR}20`, border: `1px solid ${FR}55`, color: FR }}>
            Ancora battle!
          </button>
        </div>
      </div>
    );
  }

  return null;
}
