/**
 * HomeV4 — Game Show fullscreen 16:9
 * Basato sul mockup Jonny's World Arena.
 * Zero backend · zero socket · zero polling.
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { RotateCcw, Users, Trophy, Zap } from 'lucide-react';

/* ─── Jonny poses (con sfondo nero → mix-blend-mode:screen su palco scuro) */
import jonnyWave      from '@assets/m5QIT_1778798043986.jpg';
import jonnyPresent   from '@assets/Efo0J_1778798043990.jpg';
import jonnyWin       from '@assets/C1Eoc_1778798043990.jpg';
import jonnyPoint     from '@assets/pff8V_1778798043988.jpg';

/* ─── types ──────────────────────────────────────────────────── */
type Screen = 'show' | 'arena' | 'podium';
interface Game  { slug:string; label:string; short:string; color:string; glow:string; desc:string; }
interface Player{ id:number; name:string; score:number; delta:number; }

/* ─── data ───────────────────────────────────────────────────── */
const GAMES: Game[] = [
  { slug:'freestyle', label:'Freestyle Battle',   short:'FREESTYLE', color:'#E6A800', glow:'#FFD040', desc:'Creatività senza limiti'      },
  { slug:'percorso',  label:'Percorso a Risate',  short:'PERCORSO',  color:'#7C3AED', glow:'#A855F7', desc:'Sfide di gruppo a tappe'       },
  { slug:'coppie',    label:'Gioco delle Coppie', short:'COPPIE',    color:'#CC2244', glow:'#F472B6', desc:'Memory visivo per coppie'      },
  { slug:'quizzone',  label:'Quizzone',           short:'QUIZZONE',  color:'#E87E04', glow:'#FBBF24', desc:'Quiz a risposta rapida'        },
  { slug:'adult',     label:'Adult Only',         short:'ADULT',     color:'#CC3300', glow:'#F97316', desc:'Solo per adulti 18+'           },
  { slug:'sfida',     label:'Sfida di Ballo',     short:'SFIDA',     color:'#1A8F3C', glow:'#34D399', desc:'Muoviti con il telefono'       },
  { slug:'parola',    label:'Parola alle Spalle', short:'PAROLA',    color:'#0055CC', glow:'#60A5FA', desc:'Indovina senza guardare'       },
  { slug:'karaoke',   label:'Karaoke Battle',     short:'KARAOKE',   color:'#6633CC', glow:'#C084FC', desc:'Chi canta meglio?'            },
];

const PLAYERS: Player[] = [
  { id:1, name:'Giulia',  score:5100, delta:450 },
  { id:2, name:'Sofia',   score:4800, delta:390 },
  { id:3, name:'Chiara',  score:4650, delta:310 },
  { id:4, name:'Marco',   score:4200, delta:280 },
  { id:5, name:'Lorenzo', score:3900, delta:210 },
  { id:6, name:'Davide',  score:3500, delta:175 },
];

const PLAYER_COLORS = ['#F5B642','#A855F7','#EC4899','#34D399','#60A5FA','#FB923C'];

/* ─── asset helper ───────────────────────────────────────────── */
const BASE = (import.meta.env.BASE_URL as string) ?? '/';
function pub(path: string) {
  const b = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;
  return `${b}${path}`;
}

/* ─── wheel math ─────────────────────────────────────────────── */
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

/* ─── simple SVG icons per sector ────────────────────────────── */
function SectorIcon({ slug }: { slug: string }) {
  const s: Record<string, React.ReactNode> = {
    freestyle: <polygon points="0,-11 2.8,-3.5 11,-3.5 4.8,1.3 7.2,9 0,4.5 -7.2,9 -4.8,1.3 -11,-3.5 -2.8,-3.5" fill="rgba(255,255,255,0.9)" />,
    percorso:  <><rect x="-9" y="-10" width="18" height="20" rx="3" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.2"/><circle cx="-4" cy="-4" r="2" fill="white"/><circle cx="4" cy="0" r="2" fill="white"/><circle cx="-4" cy="4" r="2" fill="white"/></>,
    coppie:    <><rect x="-11" y="-9" width="13" height="18" rx="2" fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.85)" strokeWidth="2"/><rect x="-2" y="-9" width="13" height="18" rx="2" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.85)" strokeWidth="2"/></>,
    quizzone:  <><circle cx="0" cy="0" r="11" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.2"/><text textAnchor="middle" dominantBaseline="central" fontSize="15" fontWeight="900" fill="white">?</text></>,
    adult:     <path d="M0,-13 C-3,-7 -10,-5 -7,2 C-5,7 -2,11 0,13 C2,11 5,7 7,2 C10,-5 3,-7 0,-13 Z" fill="rgba(255,255,255,0.88)"/>,
    sfida:     <path d="M3,-13 L-3,-1 L2,-1 L-4,13 L8,1 L2,1 Z" fill="rgba(255,255,255,0.9)"/>,
    parola:    <><path d="M-11,-9 Q-11,-13 -7,-13 L7,-13 Q11,-13 11,-9 L11,1 Q11,5 7,5 L2,5 L-1,11 L-3,5 L-7,5 Q-11,5 -11,1 Z" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.2"/><circle cx="-3" cy="-4" r="1.8" fill="white"/><circle cx="0" cy="-4" r="1.8" fill="white"/><circle cx="3" cy="-4" r="1.8" fill="white"/></>,
    karaoke:   <><ellipse cx="0" cy="-6" rx="5.5" ry="8" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="2.2"/><line x1="0" y1="2" x2="0" y2="10" stroke="rgba(255,255,255,0.88)" strokeWidth="2.2"/><path d="M-7,10 Q0,14 7,10" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="2.2"/></>,
  };
  return <>{s[slug] ?? <circle cx="0" cy="0" r="8" fill="rgba(255,255,255,0.7)"/>}</>;
}

/* ─── wheel component ────────────────────────────────────────── */
function GameWheel({ selected, onSelect, spinning }: {
  selected: Game; onSelect:(g:Game)=>void; spinning:boolean;
}) {
  const cx=220, cy=220, r=186, ri=58;
  const controls = useAnimation();

  useEffect(()=>{
    if(spinning){
      const idx = GAMES.findIndex(g=>g.slug===selected.slug);
      controls.start({ rotate:[0, 1620+idx*45], transition:{ duration:2.8, ease:'easeInOut' as const } });
    }
  },[spinning, selected, controls]);

  // bulb lights ring
  const BULBS = 48;
  const bulbR = r+16;

  return (
    <motion.div animate={controls} style={{ transformOrigin:'center', width:'100%', height:'100%' }}>
      <svg viewBox="0 0 440 440" width="100%" height="100%">
        <defs>
          {GAMES.map(g=>(
            <radialGradient key={g.slug} id={`g4-${g.slug}`} cx="45%" cy="30%" r="70%">
              <stop offset="0%" stopColor={g.glow} stopOpacity="1"/>
              <stop offset="100%" stopColor={g.color} stopOpacity="1"/>
            </radialGradient>
          ))}
          <filter id="g4-glow" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="g4-bulb" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="2" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="g4-txt" x="-5%" y="-5%" width="110%" height="110%">
            <feDropShadow dx="0" dy="1" stdDeviation="3" floodColor="rgba(0,0,0,1)" floodOpacity="1"/>
          </filter>
        </defs>

        {/* outer shadow ring */}
        <circle cx={cx} cy={cy} r={r+30} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="28"/>

        {/* gold border ring */}
        <circle cx={cx} cy={cy} r={r+8} fill="none"
          stroke="url(#g4-gold)" strokeWidth="12"
          style={{ filter:'drop-shadow(0 0 12px rgba(245,182,66,0.9))' }}/>
        <linearGradient id="g4-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFD700"/>
          <stop offset="50%" stopColor="#F5B642"/>
          <stop offset="100%" stopColor="#B8860B"/>
        </linearGradient>

        {/* sectors */}
        {GAMES.map((g,i)=>{
          const a1=i*45, a2=(i+1)*45;
          const isSel = g.slug===selected.slug;
          const lbl = midPt(cx,cy,r*0.68,a1,a2);
          const iconPt = midPt(cx,cy,r*0.52,a1,a2);
          return (
            <g key={g.slug} onClick={()=>onSelect(g)} style={{ cursor:'pointer' }}>
              <path
                d={sector(cx,cy, r-(isSel?0:5), ri+(isSel?0:4), a1, a2)}
                fill={`url(#g4-${g.slug})`}
                stroke={isSel?'rgba(255,255,255,0.7)':'rgba(0,0,0,0.55)'}
                strokeWidth={isSel?2.5:1.5}
                filter={isSel?'url(#g4-glow)':undefined}
              />
              {/* sector icon */}
              <g transform={`translate(${iconPt.x},${iconPt.y}) scale(0.95)`}>
                <SectorIcon slug={g.slug}/>
              </g>
              {/* sector label */}
              <text
                x={lbl.x} y={lbl.y}
                textAnchor="middle" dominantBaseline="middle"
                fontSize="12.5" fontWeight="900"
                fontFamily="'Outfit','Arial Black',sans-serif"
                fill="white"
                stroke="rgba(0,0,0,0.95)" strokeWidth="3" paintOrder="stroke"
                filter="url(#g4-txt)"
                style={{ userSelect:'none', letterSpacing:'0.06em' }}
              >{g.short}</text>
            </g>
          );
        })}

        {/* separator dividers */}
        {GAMES.map((_,i)=>{
          const p1=polar(cx,cy,ri+4,i*45), p2=polar(cx,cy,r-5,i*45);
          return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(0,0,0,0.55)" strokeWidth="1.5"/>;
        })}

        {/* bulb lights */}
        {Array.from({length:BULBS},(_,i)=>{
          const ang = i*(360/BULBS);
          const pt = polar(cx,cy,bulbR,ang);
          const isOn = i%2===0;
          return (
            <motion.circle key={i} cx={pt.x} cy={pt.y} r="4.5"
              fill={isOn?'#FFE55C':'#8B6200'}
              style={{ filter:isOn?'url(#g4-bulb)':undefined }}
              animate={isOn?{ opacity:[0.7,1,0.7] }:{}}
              transition={isOn?{ duration:1.2+((i%6)*0.2), repeat:Infinity, delay:(i%8)*0.15 }:{}}
            />
          );
        })}

        {/* inner border */}
        <circle cx={cx} cy={cy} r={ri+4} fill="rgba(0,0,0,0.7)"/>
        <circle cx={cx} cy={cy} r={ri} fill="#0A0320" stroke="rgba(245,182,66,0.8)" strokeWidth="3"/>
        <circle cx={cx} cy={cy} r={ri-8} fill="#120540"/>
        <text x={cx} y={cy-7} textAnchor="middle" dominantBaseline="middle"
          fontSize="11" fontWeight="900" fontFamily="'Outfit','Arial Black',sans-serif"
          fill="#F5B642" style={{ userSelect:'none', letterSpacing:'0.12em' }}>SCEGLI</text>
        <text x={cx} y={cy+8} textAnchor="middle" dominantBaseline="middle"
          fontSize="11" fontWeight="900" fontFamily="'Outfit','Arial Black',sans-serif"
          fill="#FFD700" style={{ userSelect:'none', letterSpacing:'0.08em' }}>IL GIOCO</text>
      </svg>
    </motion.div>
  );
}

/* ─── QR code mock ───────────────────────────────────────────── */
function QRMock({ size=80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80">
      <rect width="80" height="80" fill="white" rx="4"/>
      {/* TL finder */}
      <rect x="4" y="4" width="26" height="26" rx="2" fill="#111"/>
      <rect x="8" y="8" width="18" height="18" rx="1" fill="white"/>
      <rect x="11" y="11" width="12" height="12" rx="1" fill="#111"/>
      {/* TR finder */}
      <rect x="50" y="4" width="26" height="26" rx="2" fill="#111"/>
      <rect x="54" y="8" width="18" height="18" rx="1" fill="white"/>
      <rect x="57" y="11" width="12" height="12" rx="1" fill="#111"/>
      {/* BL finder */}
      <rect x="4" y="50" width="26" height="26" rx="2" fill="#111"/>
      <rect x="8" y="54" width="18" height="18" rx="1" fill="white"/>
      <rect x="11" y="57" width="12" height="12" rx="1" fill="#111"/>
      {/* data dots – deterministic pattern */}
      {[38,42,46,50,54,58,62,66,70,74].flatMap(x=>
        [4,8,12,16,20,24,28,32,36,40,44,48,52,56,60,64,68,72,76].map(y=>{
          const on = ((x*7+y*13)%17)>8 && x<76 && y<76 && !(x<34&&y<34) && !(x>46&&y<34) && !(x<34&&y>46);
          return on ? <rect key={`${x}-${y}`} x={x} y={y} width="3" height="3" fill="#111"/> : null;
        })
      )}
    </svg>
  );
}

/* ─── arcade button ──────────────────────────────────────────── */
function ArcadeBtn({ children, onClick, bg, glow, border }:
  { children:React.ReactNode; onClick:()=>void; bg:string; glow:string; border:string }) {
  return (
    <motion.button
      onClick={onClick}
      className="relative overflow-hidden font-black rounded-full flex items-center justify-center gap-3 text-white"
      style={{
        background: bg,
        border: `3px solid ${border}`,
        boxShadow: `0 0 30px ${glow}66, 0 6px 0 rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)`,
        padding: '0 2.5vw',
        height: '7vh',
        fontSize: 'clamp(0.9rem, 1.6vw, 1.3rem)',
        minWidth: '18vw',
      }}
      whileHover={{ scale:1.04, boxShadow:`0 0 55px ${glow}99, 0 6px 0 rgba(0,0,0,0.5)` }}
      whileTap={{ scale:0.97, y:3 }}
    >
      <div className="absolute inset-0 opacity-20 pointer-events-none rounded-full"
        style={{ background:'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(255,255,255,0.6), transparent)' }}/>
      <span className="relative z-10 flex items-center gap-2.5">{children}</span>
    </motion.button>
  );
}

/* ─── stage background ───────────────────────────────────────── */
function Stage() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* base */}
      <div className="absolute inset-0" style={{ background:'radial-gradient(ellipse 160% 90% at 50% 120%, #2D0A70 0%, #0E0230 50%, #04010F 100%)' }}/>
      {/* beams fan */}
      {Array.from({length:14},(_,i)=>({
        angle: -65+i*10,
        col: i%3===0?'168,85,247': i%3===1?'245,182,66':'236,72,153',
        op: 0.04+(i%4)*0.02,
        w: 160+(i%5)*80,
      })).map((b,i)=>(
        <motion.div key={i} className="absolute bottom-0"
          style={{ left:'50%', width:b.w, height:'90%', transformOrigin:'bottom center',
            transform:`translateX(-50%) rotate(${b.angle}deg)`,
            background:`linear-gradient(0deg,rgba(${b.col},${b.op*3.5}) 0%,rgba(${b.col},${b.op}) 45%,transparent 90%)` }}
          animate={{ opacity:[0.6,1,0.6] }}
          transition={{ duration:2.8+(i*0.25), repeat:Infinity, ease:'easeInOut' as const, delay:i*0.3 }}/>
      ))}
      {/* audience silhouette (bottom) */}
      <div className="absolute bottom-0 left-0 right-0" style={{ height:'18%',
        background:'linear-gradient(0deg, rgba(8,2,22,0.98) 0%, rgba(20,5,50,0.6) 50%, transparent 100%)' }}/>
      {/* floor reflection */}
      <div className="absolute" style={{ bottom:'12%', left:0, right:0, height:4,
        background:'linear-gradient(90deg,transparent 0%,rgba(245,182,66,0.5) 20%,rgba(255,255,255,0.9) 50%,rgba(245,182,66,0.5) 80%,transparent 100%)',
        boxShadow:'0 0 30px rgba(245,182,66,0.5)' }}/>
      {/* ceiling bar */}
      <div className="absolute top-0 left-0 right-0 h-14"
        style={{ background:'linear-gradient(180deg,rgba(80,20,160,0.5) 0%,transparent 100%)' }}/>
      {/* side column lights */}
      {[{s:'5%',c:'168,85,247'},{s:'95%',c:'236,72,153'}].map((col,i)=>(
        <div key={i} className="absolute top-0 bottom-0" style={{ left:col.s, width:3,
          background:`linear-gradient(180deg,transparent 0%,rgba(${col.c},0.7) 30%,rgba(245,182,66,0.9) 50%,rgba(${col.c},0.7) 70%,transparent 100%)`,
          boxShadow:`0 0 25px rgba(${col.c},0.6)`, filter:'blur(0.5px)' }}/>
      ))}
      {/* vignette */}
      <div className="absolute inset-0"
        style={{ background:'radial-gradient(ellipse 110% 100% at 50% 50%,transparent 35%,rgba(0,0,0,0.72) 100%)' }}/>
      {/* scanline */}
      <div className="absolute inset-0 opacity-[0.01]"
        style={{ backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,1) 3px,rgba(255,255,255,1) 4px)' }}/>
    </div>
  );
}

/* ─── particles ──────────────────────────────────────────────── */
function Sparks() {
  const ps = Array.from({length:22},(_,i)=>({
    id:i, x:Math.random()*100, sz:2+Math.random()*4,
    dur:6+Math.random()*9, delay:Math.random()*8,
    color:['#F5B642','#A855F7','#EC4899','#34D399','#22D3EE'][i%5],
  }));
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

/* ─── confetti ───────────────────────────────────────────────── */
function Confetti() {
  const ps=Array.from({length:70},(_,i)=>({
    id:i, x:Math.random()*100,
    color:['#F5B642','#A855F7','#EC4899','#34D399','#F87171','#22D3EE','#FCD34D'][i%7],
    w:6+Math.random()*10, dur:2+Math.random()*3, delay:Math.random()*2.5, rot:Math.random()*720,
  }));
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

/* ─── screen: SHOW (landing) ─────────────────────────────────── */
function ShowLanding({ onArena }: { onArena:()=>void }) {
  return (
    <motion.div key="show" className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0, scale:1.04 }}
      transition={{ duration:0.5 }}>

      {/* center content */}
      <div className="relative z-10 flex flex-col items-center text-center" style={{ maxWidth:'60vw' }}>
        <motion.div initial={{ y:-30, opacity:0 }} animate={{ y:0, opacity:1 }} transition={{ delay:0.1, duration:0.6, ease:'easeOut' as const }}>
          <img src={pub('/logo.png')} alt="IDEAgame" className="h-12 mx-auto mb-6 object-contain"
            style={{ filter:'brightness(1.3) drop-shadow(0 0 16px rgba(245,182,66,0.7))' }}/>
          <div className="font-black uppercase mb-3" style={{ fontSize:'clamp(0.6rem,0.9vw,0.8rem)', letterSpacing:'0.35em', color:'#F5B642' }}>
            Il Parco del Divertimento Intelligente
          </div>
          <h1 className="font-black leading-[0.88] mb-4"
            style={{ fontSize:'clamp(3.5rem,8vw,7.5rem)', fontFamily:"'Outfit','Arial Black',sans-serif",
              color:'white', textShadow:'0 0 60px rgba(168,85,247,0.9),0 6px 30px rgba(0,0,0,0.9)' }}>
            JONNY'S<br/>
            <span style={{ color:'#F5B642', textShadow:'0 0 80px rgba(245,182,66,1),0 0 160px rgba(245,182,66,0.5)' }}>WORLD</span>
          </h1>
          <p className="mb-10" style={{ fontSize:'clamp(0.9rem,1.4vw,1.1rem)', color:'rgba(255,255,255,0.55)', lineHeight:1.6 }}>
            8 mondi di gioco · Un palco · Fino a 20 giocatori
          </p>
        </motion.div>

        <motion.div initial={{ y:20, opacity:0 }} animate={{ y:0, opacity:1 }} transition={{ delay:0.45, duration:0.5 }}>
          <ArcadeBtn onClick={onArena}
            bg="linear-gradient(135deg,#F5B642 0%,#FF6B35 100%)"
            glow="#F5B642" border="#FFD700">
            <span style={{ color:'#000', fontSize:'1.4em' }}>&#9654;</span>
            <span style={{ color:'#000' }}>INIZIA IL SHOW</span>
          </ArcadeBtn>
        </motion.div>
      </div>

      {/* Jonny left */}
      <motion.img src={jonnyWave} alt="Jonny"
        className="absolute pointer-events-none"
        style={{ left:'-2%', bottom:0, height:'80vh', mixBlendMode:'screen',
          filter:'drop-shadow(20px 0 40px rgba(168,85,247,0.5))' }}
        initial={{ x:-60, opacity:0 }} animate={{ x:0, opacity:1 }}
        transition={{ delay:0.3, duration:0.9, ease:'easeOut' as const }}/>

      {/* Jonny right */}
      <motion.img src={jonnyPoint} alt="Jonny"
        className="absolute pointer-events-none"
        style={{ right:'-2%', bottom:0, height:'78vh', mixBlendMode:'screen', transform:'scaleX(-1)',
          filter:'drop-shadow(-20px 0 40px rgba(245,182,66,0.4))' }}
        initial={{ x:60, opacity:0 }} animate={{ x:0, opacity:1 }}
        transition={{ delay:0.4, duration:0.9, ease:'easeOut' as const }}/>
    </motion.div>
  );
}

/* ─── screen: ARENA ──────────────────────────────────────────── */
function Arena({ onPodium }: { onPodium:()=>void }) {
  const [selected, setSelected] = useState(GAMES[0]);
  const [spinning, setSpinning]  = useState(false);

  const handleSpin = useCallback(()=>{
    if(spinning) return;
    const rnd = GAMES[Math.floor(Math.random()*GAMES.length)];
    setSelected(rnd);
    setSpinning(true);
    setTimeout(()=>setSpinning(false), 3000);
  },[spinning]);

  return (
    <motion.div key="arena" className="absolute inset-0"
      initial={{ opacity:0, scale:0.98 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0 }}
      transition={{ duration:0.45 }}
      style={{ display:'grid', gridTemplateColumns:'22% 1fr 30%', gridTemplateRows:'auto 1fr auto', gap:0 }}>

      {/* ── TOP ROW ────────────────────────────────────────────── */}

      {/* top-left: logo small */}
      <div className="flex items-center pl-5 pt-3 pb-2 z-20">
        <img src={pub('/logo.png')} alt="" className="h-8 object-contain"
          style={{ filter:'brightness(1.2) drop-shadow(0 0 10px rgba(245,182,66,0.5))' }}/>
        <span className="ml-3 font-black text-white/40 text-xs tracking-widest uppercase">Arena</span>
      </div>

      {/* top-center: JONNY'S WORLD title */}
      <motion.div className="flex flex-col items-center justify-center pt-2 pb-0 z-20"
        initial={{ y:-20, opacity:0 }} animate={{ y:0, opacity:1 }} transition={{ delay:0.1 }}>
        <div className="font-black leading-none text-center"
          style={{ fontSize:'clamp(2rem,3.5vw,3.2rem)', fontFamily:"'Outfit','Arial Black',sans-serif",
            color:'white', textShadow:'0 0 40px rgba(168,85,247,0.8),0 4px 20px rgba(0,0,0,0.9)' }}>
          JONNY'S
        </div>
        <div className="font-black leading-none text-center"
          style={{ fontSize:'clamp(2.6rem,4.8vw,4.4rem)', fontFamily:"'Outfit','Arial Black',sans-serif",
            color:'#F5B642', textShadow:'0 0 60px rgba(245,182,66,0.9),0 0 120px rgba(245,182,66,0.4)',
            WebkitTextStroke:'2px rgba(180,100,0,0.4)', marginTop:'-0.1em' }}>
          WORLD
        </div>
        <div className="font-black uppercase mt-1" style={{ fontSize:'clamp(0.45rem,0.7vw,0.6rem)', letterSpacing:'0.35em', color:'rgba(255,255,255,0.4)' }}>
          Il Parco del Divertimento Intelligente
        </div>
      </motion.div>

      {/* top-right: codice partita + QR */}
      <motion.div className="flex justify-end items-start pr-5 pt-3 z-20"
        initial={{ x:20, opacity:0 }} animate={{ x:0, opacity:1 }} transition={{ delay:0.2 }}>
        <div className="rounded-2xl px-4 py-3 flex items-center gap-4"
          style={{ background:'rgba(10,3,30,0.85)', border:'2px solid rgba(245,182,66,0.5)',
            boxShadow:'0 0 25px rgba(245,182,66,0.2)' }}>
          <div>
            <div className="font-black uppercase mb-0.5" style={{ fontSize:'0.55rem', letterSpacing:'0.25em', color:'rgba(255,255,255,0.5)' }}>Codice Partita</div>
            <div className="font-black tracking-[0.15em]" style={{ fontSize:'clamp(1.3rem,2.2vw,2rem)', color:'#F5B642', textShadow:'0 0 20px rgba(245,182,66,0.8)' }}>CASA42</div>
            <div className="mt-1" style={{ fontSize:'0.55rem', color:'rgba(255,255,255,0.35)', lineHeight:1.4 }}>
              Vai su ideagame.app<br/>e inserisci il codice
            </div>
          </div>
          <div className="rounded-xl overflow-hidden shrink-0" style={{ border:'2px solid rgba(245,182,66,0.4)' }}>
            <QRMock size={72}/>
          </div>
        </div>
      </motion.div>

      {/* ── MAIN ROW ───────────────────────────────────────────── */}

      {/* left: classifica */}
      <div className="flex flex-col pl-4 pr-2 pb-2 z-20">
        <div className="rounded-2xl overflow-hidden h-full"
          style={{ background:'rgba(255,255,255,0.07)', border:'1.5px solid rgba(255,255,255,0.14)',
            backdropFilter:'blur(8px)', boxShadow:'0 4px 30px rgba(0,0,0,0.4)' }}>
          {/* header */}
          <div className="px-4 py-2.5 font-black uppercase"
            style={{ background:'linear-gradient(135deg,rgba(245,182,66,0.25),rgba(245,182,66,0.1))',
              borderBottom:'1px solid rgba(245,182,66,0.3)', fontSize:'0.65rem', letterSpacing:'0.2em', color:'#F5B642' }}>
            Classifica Live
          </div>
          {/* players */}
          <div className="flex flex-col p-2 gap-1.5">
            {PLAYERS.map((p,i)=>(
              <motion.div key={p.id}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2"
                initial={{ x:-30, opacity:0 }} animate={{ x:0, opacity:1 }}
                transition={{ delay:i*0.07, ease:'easeOut' as const }}
                style={{ background: i===0?'linear-gradient(135deg,rgba(245,182,66,0.2),rgba(245,182,66,0.05))':'rgba(255,255,255,0.04)',
                  border:`1px solid ${i===0?'rgba(245,182,66,0.4)':'rgba(255,255,255,0.07)'}` }}>
                <span className="font-black w-4 text-center shrink-0"
                  style={{ color:['#F5B642','#C0C0C0','#CD7F32'][i]??'rgba(255,255,255,0.3)', fontSize:'0.75rem' }}>
                  {i+1}
                </span>
                {/* color avatar */}
                <div className="rounded-full w-7 h-7 flex items-center justify-center font-black text-xs shrink-0"
                  style={{ background:`${PLAYER_COLORS[i]}33`, border:`2px solid ${PLAYER_COLORS[i]}88`, color:PLAYER_COLORS[i] }}>
                  {p.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-white truncate" style={{ fontSize:'0.82rem' }}>{p.name}</div>
                </div>
                <div className="font-black shrink-0" style={{ color:'#F5B642', fontSize:'0.82rem' }}>
                  {(p.score/1000).toFixed(1)}k
                </div>
              </motion.div>
            ))}
          </div>
          {/* footer */}
          <div className="mt-auto mx-3 mb-3 rounded-xl px-3 py-2 flex items-center gap-2"
            style={{ background:'rgba(124,58,237,0.25)', border:'1px solid rgba(124,58,237,0.4)' }}>
            <Users size={13} className="text-purple-400 shrink-0"/>
            <span className="font-black text-white" style={{ fontSize:'0.75rem' }}>
              <span style={{ color:'#A855F7' }}>{PLAYERS.length}</span> Giocatori Connessi
            </span>
          </div>
        </div>
      </div>

      {/* center: wheel */}
      <div className="flex flex-col items-center justify-center relative z-10 py-2">
        <div className="relative" style={{ width:'min(46vw, 62vh)', height:'min(46vw, 62vh)' }}>
          <div className="absolute inset-[-6%] rounded-full pointer-events-none"
            style={{ background:`radial-gradient(circle,${selected.color}12 0%,transparent 70%)`,
              boxShadow:`0 0 80px ${selected.glow}55,0 0 160px ${selected.glow}22` }}/>
          <GameWheel selected={selected} onSelect={setSelected} spinning={spinning}/>
        </div>
      </div>

      {/* right: Jonny + game card */}
      <div className="flex flex-col pr-4 pl-1 pb-2 z-20 relative">
        {/* Jonny — overlapping, large */}
        <motion.img src={jonnyPresent} alt="Jonny host"
          className="pointer-events-none"
          style={{ position:'absolute', right:'-2%', bottom:'28%',
            height:'min(60vh, 560px)', mixBlendMode:'screen',
            filter:`drop-shadow(0 0 35px ${selected.glow}cc)`,
            zIndex:30 }}
          animate={{ y:[0,-8,0] }}
          transition={{ duration:3.5, repeat:Infinity, ease:'easeInOut' as const }}/>

        {/* game card — IN EVIDENZA */}
        <div className="mt-auto relative z-10">
          <AnimatePresence mode="wait">
            <motion.div key={selected.slug}
              className="rounded-2xl overflow-hidden"
              style={{ border:`2px solid ${selected.color}bb`, boxShadow:`0 0 40px ${selected.color}44` }}
              initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-12 }}
              transition={{ duration:0.25 }}>
              {/* card header */}
              <div className="px-4 py-2 flex items-center justify-between"
                style={{ background:`linear-gradient(135deg,${selected.color}cc,${selected.glow}88)` }}>
                <span className="font-black text-white uppercase text-xs tracking-widest">In Evidenza</span>
                <div className="rounded-lg px-2.5 py-0.5 font-black text-xs"
                  style={{ background:'rgba(0,0,0,0.3)', color:'white' }}>{selected.short}</div>
              </div>
              {/* card body */}
              <div className="px-4 py-3" style={{ background:`${selected.color}1A` }}>
                <div className="font-black text-white mb-1" style={{ fontSize:'clamp(0.95rem,1.5vw,1.2rem)' }}>{selected.label}</div>
                <div className="mb-3" style={{ fontSize:'0.78rem', color:'rgba(255,255,255,0.55)' }}>{selected.desc}</div>
                <button className="w-full rounded-xl py-2 font-black text-white text-sm flex items-center justify-center gap-2"
                  style={{ background:`linear-gradient(135deg,${selected.color},${selected.glow})`,
                    boxShadow:`0 0 20px ${selected.color}55`, border:'none' }}>
                  Scopri di più &rarr;
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ── BOTTOM ROW ─────────────────────────────────────────── */}

      {/* bottom-left: empty / logo */}
      <div className="flex items-end pb-3 pl-5 z-20">
        <div>
          <div className="font-black" style={{ fontSize:'clamp(1rem,1.8vw,1.5rem)', color:'#F5B642', lineHeight:1 }}>IDEA</div>
          <div className="font-black" style={{ fontSize:'clamp(1rem,1.8vw,1.5rem)', color:'white', lineHeight:1 }}>GAME</div>
          <div className="font-black" style={{ fontSize:'clamp(0.5rem,0.8vw,0.65rem)', color:'#A855F7', letterSpacing:'0.15em' }}>JONNY'S WORLD</div>
        </div>
      </div>

      {/* bottom-center: buttons + stats */}
      <div className="flex flex-col items-center gap-3 pb-4 z-20">
        {/* buttons */}
        <div className="flex gap-5">
          <ArcadeBtn onClick={handleSpin}
            bg="linear-gradient(135deg,#5B21B6 0%,#7C3AED 100%)"
            glow="#7C3AED" border="#A855F7">
            <Zap size={20} fill="white"/> GIRA LA RUOTA
          </ArcadeBtn>
          <ArcadeBtn onClick={onPodium}
            bg="linear-gradient(135deg,#92400E 0%,#D97706 100%)"
            glow="#F5B642" border="#F5B642">
            <Trophy size={20} fill="white"/> CLASSIFICA
          </ArcadeBtn>
        </div>
        {/* stat badges */}
        <div className="flex gap-4">
          {[
            { icon:'★', label:'8 Giochi Diversi' },
            { icon:'◎', label:'Per Tutti i Pubblici' },
            { icon:'♦', label:'Divertimento Garantito' },
            { icon:'⚡', label:'Sfide in Diretta' },
          ].map(s=>(
            <div key={s.label} className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
              style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)' }}>
              <span style={{ color:'#F5B642', fontSize:'0.75rem' }}>{s.icon}</span>
              <span className="font-bold text-white/60" style={{ fontSize:'0.65rem', letterSpacing:'0.05em' }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* bottom-right: empty */}
      <div className="z-20"/>
    </motion.div>
  );
}

/* ─── screen: PODIUM ─────────────────────────────────────────── */
function Podium({ onRestart }: { onRestart:()=>void }) {
  const sorted = [...PLAYERS].sort((a,b)=>b.score-a.score);
  const disp   = [sorted[1], sorted[0], sorted[2]];
  const heights= [160, 220, 120];
  const medals = ['#C0C0C0','#F5B642','#CD7F32'];
  const glows  = ['rgba(192,192,192,0.6)','rgba(245,182,66,0.9)','rgba(205,127,50,0.6)'];
  const ranks  = [2, 1, 3];
  const rest   = sorted.slice(3);

  return (
    <motion.div key="podium" className="absolute inset-0 flex flex-col"
      initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
      transition={{ duration:0.5 }}>
      <Confetti/>

      {/* Jonny celebrating, right side */}
      <img src={jonnyWin} alt="Jonny festeggia"
        className="absolute pointer-events-none"
        style={{ right:'-1%', bottom:0, height:'70vh', mixBlendMode:'screen', zIndex:5,
          filter:'drop-shadow(0 0 50px rgba(245,182,66,0.7))' }}/>

      {/* header */}
      <div className="flex items-center justify-between px-10 pt-7 shrink-0 z-10">
        <motion.div initial={{ x:-25, opacity:0 }} animate={{ x:0, opacity:1 }} transition={{ delay:0.2 }}>
          <div className="font-black uppercase mb-1" style={{ fontSize:'0.65rem', letterSpacing:'0.3em', color:'#F5B642' }}>Risultati Finali</div>
          <h2 className="font-black text-white" style={{ fontSize:'clamp(2rem,4vw,3.5rem)',
            fontFamily:"'Outfit','Arial Black',sans-serif", textShadow:'0 0 50px rgba(245,182,66,0.8)' }}>
            HALL OF FAME
          </h2>
        </motion.div>
        <motion.button onClick={onRestart}
          className="flex items-center gap-2 rounded-2xl px-6 py-3 font-black text-white"
          style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', fontSize:'0.9rem' }}
          whileHover={{ scale:1.05 }} whileTap={{ scale:0.97 }}
          initial={{ x:25, opacity:0 }} animate={{ x:0, opacity:1 }} transition={{ delay:0.3 }}>
          <RotateCcw size={15}/> Ricomincia
        </motion.button>
      </div>

      {/* podium */}
      <div className="flex-1 flex items-end justify-center gap-5 px-[20%] pb-0 z-10 relative">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[65%] h-36 pointer-events-none"
          style={{ background:'radial-gradient(ellipse 80% 100% at 50% 100%,rgba(245,182,66,0.45) 0%,transparent 70%)' }}/>

        {disp.map((p,di)=>(
          <motion.div key={p.id} className="flex flex-col items-center"
            style={{ flex: di===1?'1.3':'1', maxWidth:di===1?250:190 }}
            initial={{ y:80, opacity:0 }} animate={{ y:0, opacity:1 }}
            transition={{ delay:0.2+di*0.18, duration:0.7, ease:'easeOut' as const }}>

            {ranks[di]===1&&(
              <motion.div className="text-4xl mb-1"
                animate={{ y:[0,-10,0], rotate:[-5,5,-5] }}
                transition={{ duration:2.2, repeat:Infinity, ease:'easeInOut' as const }}>
                &#128081;
              </motion.div>
            )}
            <div className="rounded-full flex items-center justify-center font-black mb-1.5"
              style={{ width:di===1?68:52, height:di===1?68:52,
                background:`linear-gradient(135deg,${medals[di]}44,${medals[di]}22)`,
                border:`3px solid ${medals[di]}`,
                boxShadow:`0 0 30px ${glows[di]}`,
                fontSize:di===1?22:17, color:medals[di] }}>
              {p.name[0]}
            </div>
            <div className="font-black text-white mb-0.5 text-center" style={{ fontSize:di===1?'1.25rem':'0.95rem', fontFamily:"'Outfit','Arial Black',sans-serif" }}>{p.name}</div>
            <div className="font-black mb-2.5" style={{ color:medals[di], fontSize:di===1?'1.05rem':'0.85rem', textShadow:`0 0 18px ${medals[di]}` }}>{p.score.toLocaleString()} pt</div>
            <div className="w-full flex items-end justify-center rounded-t-3xl relative overflow-hidden"
              style={{ height:heights[di],
                background:`linear-gradient(180deg,${medals[di]}2A 0%,${medals[di]}55 100%)`,
                border:`2px solid ${medals[di]}88`, borderBottom:'none',
                boxShadow:`0 0 45px ${glows[di]},inset 0 1px 0 rgba(255,255,255,0.2)` }}>
              <div className="absolute inset-0 pointer-events-none"
                style={{ background:'linear-gradient(135deg,rgba(255,255,255,0.1) 0%,transparent 50%)' }}/>
              <div className="font-black pb-4 relative z-10"
                style={{ fontSize:di===1?'3.2rem':'2.2rem', color:medals[di], textShadow:`0 0 25px ${medals[di]}` }}>
                {ranks[di]}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* floor line */}
      <div className="h-2 mx-8 shrink-0 z-10"
        style={{ background:'linear-gradient(90deg,transparent 0%,rgba(245,182,66,0.6) 20%,rgba(255,255,255,0.9) 50%,rgba(245,182,66,0.6) 80%,transparent 100%)',
          boxShadow:'0 0 25px rgba(245,182,66,0.4)' }}/>

      {/* rest */}
      <div className="flex justify-center gap-4 px-10 py-4 shrink-0 z-10 flex-wrap">
        {rest.map((p,i)=>(
          <motion.div key={p.id} className="flex items-center gap-3 rounded-2xl px-5 py-2.5"
            style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)' }}
            initial={{ y:18, opacity:0 }} animate={{ y:0, opacity:1 }}
            transition={{ delay:0.8+i*0.08 }}>
            <span className="font-black" style={{ color:'rgba(255,255,255,0.3)', fontSize:'0.9rem' }}>{i+4}</span>
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs"
              style={{ background:`${PLAYER_COLORS[i+3]}33`, color:PLAYER_COLORS[i+3], border:`1.5px solid ${PLAYER_COLORS[i+3]}66` }}>
              {p.name[0]}
            </div>
            <span className="font-black text-white" style={{ fontSize:'0.9rem' }}>{p.name}</span>
            <span className="font-black" style={{ color:'#F5B642', fontSize:'0.85rem' }}>{p.score.toLocaleString()}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

/* ─── root ───────────────────────────────────────────────────── */
export default function HomeV4() {
  const [screen, setScreen] = useState<Screen>('show');
  return (
    <div className="fixed inset-0 overflow-hidden"
      style={{ background:'#04010E', fontFamily:"'Outfit','Space Grotesk','Arial Black',sans-serif" }}>
      <Stage/>
      <Sparks/>
      <AnimatePresence mode="wait">
        {screen==='show'   && <ShowLanding onArena={()=>setScreen('arena')}/>}
        {screen==='arena'  && <Arena       onPodium={()=>setScreen('podium')}/>}
        {screen==='podium' && <Podium      onRestart={()=>setScreen('show')}/>}
      </AnimatePresence>
    </div>
  );
}
