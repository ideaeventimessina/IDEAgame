/**
 * HomeV5 — Cinematic Game Show Arena (visual experiment, zero backend)
 * Environment staging only: LED wall, side screens, 3D floor, spotlights,
 * crowd silhouettes, particles, alive Jonny.
 * DO NOT touch HomeV4.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { Trophy, Zap, Star, Users, ChevronRight } from 'lucide-react';

/* ─── types ───────────────────────────────────────── */
type Screen = 'arena' | 'podium';
interface Game   { slug:string; label:string; short:string; color:string; glow:string; desc:string; players:string; diff:string; }
interface Player { id:number; name:string; score:number; delta:number; }

/* ─── data ───────────────────────────────────────── */
const GAMES: Game[] = [
  { slug:'freestyle', label:'Freestyle Battle',   short:'FREESTYLE', color:'#E6A800', glow:'#FFD040', desc:'Creatività senza limiti — ogni risposta vale',       players:'2-20', diff:'Facile' },
  { slug:'percorso',  label:'Percorso a Risate',  short:'PERCORSO',  color:'#7C3AED', glow:'#A855F7', desc:'Sfide a tappe — supera ogni livello del percorso',   players:'4-20', diff:'Media'  },
  { slug:'coppie',    label:'Gioco delle Coppie', short:'COPPIE',    color:'#CC2244', glow:'#F472B6', desc:'Memory visivo per squadre — trova la coppia giusta', players:'4-16', diff:'Media'  },
  { slug:'quizzone',  label:'Quizzone',           short:'QUIZZONE',  color:'#E87E04', glow:'#FBBF24', desc:'Quiz rapido — chi risponde prima vince il punto',    players:'2-20', diff:'Media'  },
  { slug:'adult',     label:'Adult Only 🔥',      short:'ADULT',     color:'#CC3300', glow:'#F97316', desc:'Sfide piccanti — solo per adulti 18+',               players:'4-16', diff:'Alta'   },
  { slug:'sfida',     label:'Sfida di Ballo',     short:'SFIDA',     color:'#1A8F3C', glow:'#34D399', desc:'Muoviti — il telefono misura i tuoi movimenti',      players:'2-12', diff:'Alta'   },
  { slug:'parola',    label:'Parola alle Spalle', short:'PAROLA',    color:'#0055CC', glow:'#60A5FA', desc:'Indovina senza guardare — il team ti aiuta',         players:'4-20', diff:'Facile' },
  { slug:'karaoke',   label:'Karaoke Battle',     short:'KARAOKE',   color:'#6633CC', glow:'#C084FC', desc:'Canta e vinci — chi stona di più perde un punto',   players:'2-16', diff:'Facile' },
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

/* ─── helpers ────────────────────────────────────── */
const BASE = (import.meta.env.BASE_URL as string) ?? '/';
function pub(p: string) { const b = BASE.endsWith('/') ? BASE.slice(0,-1) : BASE; return `${b}${p}`; }
function sr(seed:number){ const x=Math.sin(seed+1)*10000; return x-Math.floor(x); }
function polar(cx:number,cy:number,r:number,deg:number){ const rad=((deg-90)*Math.PI)/180; return { x:cx+r*Math.cos(rad), y:cy+r*Math.sin(rad) }; }
function sector(cx:number,cy:number,r:number,ri:number,a1:number,a2:number){ const o1=polar(cx,cy,r,a1),o2=polar(cx,cy,r,a2),i1=polar(cx,cy,ri,a1),i2=polar(cx,cy,ri,a2),lg=a2-a1>180?1:0; return `M${o1.x},${o1.y} A${r},${r},0,${lg},1,${o2.x},${o2.y} L${i2.x},${i2.y} A${ri},${ri},0,${lg},0,${i1.x},${i1.y} Z`; }
function midPt(cx:number,cy:number,r:number,a1:number,a2:number){ return polar(cx,cy,r,(a1+a2)/2); }

/* ─── shared easing constant ─────────────────────── */
const EI = 'easeInOut' as const;

/* ══════════════════════════════════════════════════
   CINEMATIC ENVIRONMENT COMPONENTS
══════════════════════════════════════════════════ */

/* ─── 1. Deep LED Arena Wall ─────────────────────── */
function LedArenaWall({ selectedGlow }:{ selectedGlow:string }) {
  const rows = 14, cols = 32;
  const cells = useMemo(()=>Array.from({length:rows*cols},(_,i)=>({
    id:i, row:Math.floor(i/cols), col:i%cols,
    baseColor:['#A855F7','#F5B642','#EC4899','#22D3EE','#34D399','#F97316'][i%6],
    dur:sr(i*17)*2+1.5, delay:sr(i*23)*3,
  })),[]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex:1 }}>
      {/* base void */}
      <div className="absolute inset-0" style={{
        background:'radial-gradient(ellipse 180% 80% at 50% -10%, #2D0870 0%, #12024A 30%, #050018 70%, #000008 100%)'
      }}/>

      {/* pixel LED matrix — top 65% */}
      <div className="absolute inset-x-0 top-0" style={{ height:'65%', overflow:'hidden' }}>
        <div style={{ display:'grid', gridTemplateColumns:`repeat(${cols},1fr)`, gridTemplateRows:`repeat(${rows},1fr)`, width:'100%', height:'100%', gap:2, padding:2 }}>
          {cells.map(c=>(
            <motion.div key={c.id}
              style={{ borderRadius:2, background:`${c.baseColor}18`, boxShadow:`inset 0 0 4px ${c.baseColor}22` }}
              animate={{ opacity:[0.15, sr(c.id*7)>0.5?0.85:0.25, 0.15], backgroundColor:[`${c.baseColor}18`,`${c.baseColor}${c.row<4?'55':'28'}`,`${c.baseColor}18`] }}
              transition={{ duration:c.dur, repeat:Infinity, delay:c.delay, ease:EI }}/>
          ))}
        </div>
        {/* scanlines */}
        <div className="absolute inset-0" style={{ backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 5px,rgba(0,0,0,0.15) 5px,rgba(0,0,0,0.15) 6px)', pointerEvents:'none' }}/>
        {/* horizontal color band — game accent */}
        <motion.div className="absolute inset-x-0" style={{ top:'30%', height:4, opacity:0.7 }}
          animate={{ background:[`linear-gradient(90deg,transparent,${selectedGlow},transparent)`, `linear-gradient(90deg,transparent,#EC4899,transparent)`, `linear-gradient(90deg,transparent,${selectedGlow},transparent)`] }}
          transition={{ duration:4, repeat:Infinity, ease:EI }}/>
        {/* fade bottom */}
        <div className="absolute inset-x-0 bottom-0" style={{ height:'50%', background:'linear-gradient(0deg,rgba(5,0,24,1) 0%,transparent 100%)' }}/>
      </div>

      {/* center LED halo behind wheel */}
      <motion.div className="absolute" style={{ left:'50%', top:'50%', transform:'translate(-50%,-55%)', width:'55vw', height:'55vw', borderRadius:'50%', background:`radial-gradient(ellipse 60% 60% at 50% 50%,${selectedGlow}18 0%,transparent 70%)` }}
        animate={{ opacity:[0.6,1,0.6], scale:[0.96,1.04,0.96] }}
        transition={{ duration:3.5, repeat:Infinity, ease:EI }}/>

      {/* top deep shadow to mask LED wall ceiling */}
      <div className="absolute inset-x-0 top-0" style={{ height:'8%', background:'linear-gradient(180deg,rgba(0,0,10,1) 0%,transparent 100%)' }}/>
    </div>
  );
}

/* ─── 2. Giant Side Screens ──────────────────────── */
function SideScreen({ side, selectedGame }:{ side:'left'|'right'; selectedGame:Game }) {
  const isLeft = side==='left';
  const screenGames = useMemo(()=>[...GAMES,...GAMES],[]);

  return (
    <div className="absolute pointer-events-none" style={{
      top:'8%', bottom:'22%',
      [isLeft?'left':'right']:0,
      width:'16vw',
      zIndex:3,
      perspective:'800px',
    }}>
      <div style={{
        width:'100%', height:'100%',
        transform:`rotateY(${isLeft?'28deg':'-28deg'})`,
        transformOrigin:isLeft?'left center':'right center',
        borderRadius:8,
        overflow:'hidden',
        border:`1.5px solid rgba(${isLeft?'168,85,247':'245,182,66'},0.45)`,
        boxShadow:`${isLeft?'':'- '}0 0 40px rgba(${isLeft?'168,85,247':'245,182,66'},0.35), inset 0 0 30px rgba(0,0,0,0.6)`,
        background:'rgba(4,0,18,0.9)',
        position:'relative',
      }}>
        {/* scanlines */}
        <div className="absolute inset-0 z-10" style={{ backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.18) 3px,rgba(0,0,0,0.18) 4px)' }}/>
        {/* static noise overlay */}
        <div className="absolute inset-0 z-10 opacity-5" style={{ backgroundImage:'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")', backgroundSize:'80px 80px' }}/>

        {/* header bar */}
        <div className="relative z-20 flex items-center gap-1.5 px-2 py-1.5" style={{ background:`linear-gradient(90deg,rgba(${isLeft?'168,85,247':'245,182,66'},0.4),transparent)`, borderBottom:`1px solid rgba(${isLeft?'168,85,247':'245,182,66'},0.3)` }}>
          <motion.div className="w-2 h-2 rounded-full" style={{ background:isLeft?'#A855F7':'#F5B642' }}
            animate={{ opacity:[1,0.3,1] }} transition={{ duration:0.9, repeat:Infinity }}/>
          <span className="font-black uppercase text-white" style={{ fontSize:'0.5rem', letterSpacing:'0.2em' }}>{isLeft?'PLAYERS':'NEXT UP'}</span>
        </div>

        {/* content — scrolling game list */}
        <div className="relative z-20 overflow-hidden" style={{ height:'calc(100% - 28px)' }}>
          <motion.div style={{ display:'flex', flexDirection:'column', gap:4, padding:'6px 4px' }}
            animate={{ y:[0,-((screenGames.length*32)/2)] }}
            transition={{ duration:screenGames.length*1.8, repeat:Infinity, ease:'linear' as const }}>
            {screenGames.map((g,i)=>(
              <div key={i} className="rounded flex items-center gap-2 px-2 py-1.5"
                style={{ background:g.slug===selectedGame.slug?`${g.color}28`:'rgba(255,255,255,0.04)', border:`1px solid ${g.slug===selectedGame.slug?g.color+'55':'rgba(255,255,255,0.07)'}`, minHeight:28 }}>
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background:g.color }}/>
                <span className="font-black text-white truncate" style={{ fontSize:'0.52rem', letterSpacing:'0.04em' }}>{g.short}</span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* bottom glow */}
        <div className="absolute inset-x-0 bottom-0 z-20 h-8" style={{ background:`linear-gradient(0deg,rgba(${isLeft?'168,85,247':'245,182,66'},0.3),transparent)` }}/>
      </div>
    </div>
  );
}

/* ─── 3. Cinematic Spotlights ────────────────────── */
function CinematicSpotlights() {
  const beams = useMemo(()=>[
    { x:8,  color:'168,85,247',  dur:6.0, delay:0,   width:'10vw', angle:-6,  opacity:[0.4,0.9,0.4]  },
    { x:18, color:'245,182,66',  dur:4.5, delay:1.0, width:'9vw',  angle:-3,  opacity:[0.3,0.75,0.3] },
    { x:30, color:'255,255,255', dur:5.5, delay:0.3, width:'11vw', angle:-1,  opacity:[0.15,0.5,0.15]},
    { x:48, color:'236,72,153',  dur:7.0, delay:2.0, width:'14vw', angle:0,   opacity:[0.2,0.6,0.2]  },
    { x:65, color:'34,211,153',  dur:4.8, delay:0.7, width:'10vw', angle:2,   opacity:[0.25,0.65,0.25]},
    { x:77, color:'255,255,255', dur:5.2, delay:1.5, width:'9vw',  angle:4,   opacity:[0.12,0.45,0.12]},
    { x:88, color:'245,182,66',  dur:4.2, delay:2.5, width:'10vw', angle:6,   opacity:[0.3,0.8,0.3]  },
    { x:96, color:'168,85,247',  dur:6.5, delay:0.8, width:'9vw',  angle:7,   opacity:[0.35,0.85,0.35]},
  ],[]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex:2 }}>
      {beams.map((b,i)=>(
        <motion.div key={i} className="absolute"
          style={{
            top:0, left:`${b.x}%`,
            width:b.width, height:'88%',
            transformOrigin:'top center',
            transform:`rotate(${b.angle}deg)`,
            background:`linear-gradient(180deg,rgba(${b.color},0.6) 0%,rgba(${b.color},0.2) 25%,rgba(${b.color},0.06) 60%,transparent 100%)`,
            clipPath:'polygon(38% 0%,62% 0%,100% 100%,0% 100%)',
          }}
          animate={{ opacity:b.opacity, scaleX:[0.8,1.2,0.8] }}
          transition={{ duration:b.dur, repeat:Infinity, delay:b.delay, ease:EI }}/>
      ))}
      {/* ceiling fixture dots */}
      {beams.map((b,i)=>(
        <motion.div key={`dot-${i}`} className="absolute rounded-full"
          style={{ top:0, left:`${b.x}%`, width:6, height:6, marginLeft:-3,
            background:`rgba(${b.color},1)`, boxShadow:`0 0 12px rgba(${b.color},1)` }}
          animate={{ opacity:[0.6,1,0.6] }}
          transition={{ duration:b.dur*0.6, repeat:Infinity, delay:b.delay, ease:EI }}/>
      ))}
    </div>
  );
}

/* ─── 4. 3D Perspective Floor ────────────────────── */
function PerspectiveFloor3D({ selectedGlow }:{ selectedGlow:string }) {
  return (
    <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{ height:'35%', zIndex:2 }}>
      {/* deep perspective grid */}
      <div className="absolute inset-0" style={{
        transform:'perspective(280px) rotateX(38deg)',
        transformOrigin:'center bottom',
        overflow:'hidden',
      }}>
        {/* base surface */}
        <div className="absolute inset-0" style={{
          background:'linear-gradient(0deg,rgba(8,2,30,1) 0%,rgba(18,5,55,0.85) 50%,rgba(30,8,80,0.5) 100%)'
        }}/>
        {/* radial grid lines — perspective effect */}
        <svg className="absolute inset-0" width="100%" height="100%" viewBox="0 0 1280 360" preserveAspectRatio="none">
          <defs>
            <linearGradient id="gridFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(168,85,247,0.5)"/>
              <stop offset="100%" stopColor="rgba(168,85,247,0.05)"/>
            </linearGradient>
          </defs>
          {/* vertical converging lines */}
          {Array.from({length:18},(_,i)=>{
            const t = (i/(17))*1280;
            return <line key={i} x1={t} y1="0" x2={640} y2="360" stroke="url(#gridFade)" strokeWidth="0.8" opacity="0.6"/>;
          })}
          {/* horizontal lines — closer = wider spacing */}
          {[40,90,145,210,285,360].map((y,i)=>(
            <line key={i} x1="0" y1={y} x2="1280" y2={y} stroke="rgba(168,85,247,0.25)" strokeWidth="0.8"/>
          ))}
        </svg>
        {/* reflective glow patch */}
        <div className="absolute inset-x-0 top-0" style={{ height:'40%',
          background:`radial-gradient(ellipse 60% 100% at 50% 0%,${selectedGlow}22 0%,transparent 70%)` }}/>
      </div>

      {/* bright stage edge line */}
      <motion.div className="absolute left-0 right-0"
        style={{ top:'1%', height:3, boxShadow:`0 0 30px ${selectedGlow}99, 0 0 60px ${selectedGlow}44` }}
        animate={{ background:[
          `linear-gradient(90deg,transparent 0%,rgba(168,85,247,0.5) 10%,${selectedGlow} 35%,rgba(255,255,255,1) 50%,${selectedGlow} 65%,rgba(236,72,153,0.5) 90%,transparent 100%)`,
          `linear-gradient(90deg,transparent 0%,rgba(236,72,153,0.5) 10%,rgba(255,255,255,0.8) 35%,${selectedGlow} 50%,rgba(255,255,255,0.8) 65%,rgba(168,85,247,0.5) 90%,transparent 100%)`,
          `linear-gradient(90deg,transparent 0%,rgba(168,85,247,0.5) 10%,${selectedGlow} 35%,rgba(255,255,255,1) 50%,${selectedGlow} 65%,rgba(236,72,153,0.5) 90%,transparent 100%)`,
        ] }}
        transition={{ duration:4, repeat:Infinity, ease:EI }}/>

      {/* floor → dark fade */}
      <div className="absolute inset-x-0 bottom-0" style={{ height:'55%', background:'linear-gradient(0deg,rgba(3,0,16,1) 0%,transparent 100%)' }}/>
    </div>
  );
}

/* ─── 5. Crowd Alive ─────────────────────────────── */
function CrowdAlive() {
  return (
    <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{ height:'26%', overflow:'hidden', zIndex:3 }}>
      <svg viewBox="0 0 1280 200" width="100%" height="100%" preserveAspectRatio="none">
        <defs>
          <linearGradient id="crowdTop" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(60,10,140,0.4)"/>
            <stop offset="100%" stopColor="transparent"/>
          </linearGradient>
        </defs>
        {/* back row — furthest */}
        <path d="M0,130 Q20,100 40,120 Q55,90 75,110 Q95,75 115,100 Q135,65 160,95 Q185,70 210,100 Q240,60 270,90 Q300,70 330,100 Q360,55 390,85 Q420,65 450,95 Q480,50 510,80 Q540,60 570,90 Q600,50 630,80 Q660,60 690,90 Q720,55 750,85 Q780,70 810,100 Q840,60 870,90 Q900,70 930,100 Q960,55 990,85 Q1020,65 1050,95 Q1080,70 1110,100 Q1140,75 1170,105 Q1200,85 1230,115 Q1255,100 1280,120 L1280,200 L0,200 Z"
          fill="rgba(10,4,28,0.7)"/>
        {/* mid row */}
        <path d="M0,155 Q25,130 50,148 Q80,118 110,140 Q140,120 170,145 Q200,125 230,148 Q260,130 290,152 Q320,128 350,150 Q385,125 415,148 Q450,130 480,155 Q510,132 540,155 Q570,135 600,158 Q630,138 660,160 Q690,142 720,162 Q750,142 780,160 Q815,138 845,158 Q875,135 905,155 Q935,132 965,152 Q995,132 1025,155 Q1060,135 1090,158 Q1120,140 1150,162 Q1185,142 1215,162 L1280,175 L1280,200 L0,200 Z"
          fill="rgba(6,2,18,0.88)"/>
        {/* front row — arms up here and there */}
        <path d="M0,175 Q30,160 60,172 Q95,158 125,170 Q160,155 195,168 Q230,155 265,170 Q300,158 335,172 Q370,160 405,174 Q440,160 475,174 Q510,162 545,176 Q580,162 615,176 Q650,160 685,175 Q720,162 755,176 Q790,162 825,174 Q860,158 895,172 Q930,158 965,172 Q1000,160 1035,174 Q1070,160 1105,174 Q1140,160 1175,174 Q1210,162 1245,175 L1280,182 L1280,200 L0,200 Z"
          fill="rgba(3,1,10,0.96)"/>
        {/* raised arms — scattered */}
        {[120,250,390,530,640,780,920,1060,1200].map((x,i)=>(
          <g key={i} transform={`translate(${x},155)`} opacity="0.7">
            <line x1="-6" y1="0" x2="-14" y2="-28" stroke="rgba(3,1,10,0.98)" strokeWidth="4"/>
            <line x1="6"  y1="0" x2="16"  y2="-22" stroke="rgba(3,1,10,0.98)" strokeWidth="4"/>
          </g>
        ))}
        {/* crowd ambient glow */}
        <rect x="0" y="0" width="1280" height="200" fill="url(#crowdTop)"/>
      </svg>

      {/* subtle crowd head-bob on front layer */}
      <motion.div className="absolute inset-0"
        animate={{ y:[0,-2,0,1,0] }}
        transition={{ duration:2.4, repeat:Infinity, ease:EI }}
        style={{ transformOrigin:'bottom center', opacity:0.4,
          background:'linear-gradient(0deg,rgba(3,1,10,0.96) 0%,transparent 40%)' }}/>
    </div>
  );
}

/* ─── 6. Floating Particles ──────────────────────── */
function FloatingParticles() {
  const ps = useMemo(()=>Array.from({length:35},(_,i)=>({
    id:i, x:sr(i*5)*100, sz:sr(i*9)*5+1.5,
    dur:sr(i*13)*12+6, delay:sr(i*19)*10,
    color:['#F5B642','#A855F7','#EC4899','#34D399','#22D3EE','#F97316'][i%6],
    drift:sr(i*31)*60-30,
  })),[]);
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex:2 }}>
      {ps.map(p=>(
        <motion.div key={p.id} className="absolute rounded-full"
          style={{ left:`${p.x}%`, bottom:'-3%', width:p.sz, height:p.sz,
            background:p.color, boxShadow:`0 0 ${p.sz*4}px ${p.color}` }}
          animate={{ y:[0,-900], x:[0,p.drift,0], opacity:[0,0.85,0.85,0] }}
          transition={{ duration:p.dur, repeat:Infinity, delay:p.delay, ease:'linear' as const }}/>
      ))}
    </div>
  );
}

/* ─── 7. Neon Pillars ────────────────────────────── */
function NeonPillars() {
  const pillars = [
    { left:'3%',  color:'168,85,247' },
    { left:'12%', color:'245,182,66', opacity:'0.4' },
    { left:'88%', color:'245,182,66', opacity:'0.4' },
    { left:'97%', color:'236,72,153' },
  ];
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex:2 }}>
      {pillars.map((p,i)=>(
        <motion.div key={i} className="absolute top-0 bottom-0" style={{ left:p.left, width:3,
          background:`linear-gradient(180deg,transparent 0%,rgba(${p.color},0.8) 20%,rgba(255,220,100,1) 50%,rgba(${p.color},0.8) 80%,transparent 100%)`,
          boxShadow:`0 0 20px rgba(${p.color},0.6),0 0 50px rgba(${p.color},0.25)` }}
          animate={{ opacity:[0.7,1,0.7] }}
          transition={{ duration:3+i*0.7, repeat:Infinity, delay:i*0.5, ease:EI }}/>
      ))}
    </div>
  );
}

/* ─── 8. Composite Cinematic Stage ───────────────── */
function CinematicStage({ selectedGlow, selectedGame }:{ selectedGlow:string; selectedGame:Game }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <LedArenaWall selectedGlow={selectedGlow}/>
      <CinematicSpotlights/>
      <NeonPillars/>
      <SideScreen side="left" selectedGame={selectedGame}/>
      <SideScreen side="right" selectedGame={selectedGame}/>
      <FloatingParticles/>
      <PerspectiveFloor3D selectedGlow={selectedGlow}/>
      <CrowdAlive/>
      {/* vignette */}
      <div className="absolute inset-0" style={{ background:'radial-gradient(ellipse 100% 100% at 50% 50%,transparent 25%,rgba(0,0,12,0.75) 100%)', zIndex:4 }}/>
      {/* subtle scanlines */}
      <div className="absolute inset-0" style={{ backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.04) 3px,rgba(0,0,0,0.04) 4px)', zIndex:5 }}/>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   JONNY ALIVE
══════════════════════════════════════════════════ */
function JonnyAlive({ glow }:{ glow:string }) {
  return (
    /* absolute positioned, right edge, centered vertically vs wheel */
    <div className="absolute pointer-events-none select-none"
      style={{ right:'-1%', bottom:'12vh', zIndex:12, width:'23%' }}>

      {/* pedestal shadow */}
      <div style={{ position:'absolute', bottom:-10, left:'15%', right:'15%', height:20,
        background:'rgba(0,0,0,0.65)', borderRadius:'50%', filter:'blur(18px)' }}/>
      {/* foot glow */}
      <div style={{ position:'absolute', bottom:-6, left:'10%', right:'10%', height:10,
        background:`linear-gradient(90deg,transparent,${glow}99,rgba(168,85,247,0.7),${glow}99,transparent)`,
        borderRadius:'50%', filter:'blur(6px)' }}/>
      {/* ambient body halo */}
      <div style={{ position:'absolute', inset:'-10% -20%',
        background:`radial-gradient(ellipse 60% 70% at 50% 60%,${glow}22 0%,transparent 70%)`,
        pointerEvents:'none' }}/>

      {/* FLOAT: outer wrapper */}
      <motion.div
        animate={{ y:[0,-10,0,-4,0] }}
        transition={{ duration:4.2, repeat:Infinity, ease:EI }}>

        {/* BREATHE: scale wrapper — chest expand/contract */}
        <motion.div
          style={{ transformOrigin:'50% 75%' }}
          animate={{ scaleX:[1,1.018,1,0.988,1], scaleY:[1,0.985,1,1.012,1] }}
          transition={{ duration:2.6, repeat:Infinity, ease:EI }}>

          {/* MIC GESTURE: img rotates very slightly for arm movement */}
          <motion.img
            src={pub('/jonny-master-nobg.png')} alt="Jonny host"
            style={{ height:'min(52vh,430px)', display:'block', objectFit:'contain', width:'100%',
              filter:`drop-shadow(0 0 45px ${glow}bb) drop-shadow(-4px 0 20px rgba(168,85,247,0.45)) drop-shadow(0 8px 30px rgba(0,0,0,0.6))`,
              transformOrigin:'50% 80%',
            }}
            animate={{
              rotate:[0, 0, 2.5, -1.5, 1, 0, 0],
              filter:[
                `drop-shadow(0 0 45px ${glow}bb) drop-shadow(-4px 0 20px rgba(168,85,247,0.45))`,
                `drop-shadow(0 0 65px ${glow}dd) drop-shadow(-4px 0 25px rgba(168,85,247,0.6))`,
                `drop-shadow(0 0 45px ${glow}bb) drop-shadow(-4px 0 20px rgba(168,85,247,0.45))`,
              ],
            }}
            transition={{ duration:7.5, repeat:Infinity, times:[0,0.35,0.5,0.62,0.72,0.85,1], ease:EI }}/>

        </motion.div>
      </motion.div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   REUSED UI COMPONENTS (same as V4, local copy)
══════════════════════════════════════════════════ */

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

function GameWheel({ selected, onSelect, spinning }:{ selected:Game; onSelect:(g:Game)=>void; spinning:boolean }) {
  const cx=220, cy=220, r=183, ri=60;
  const controls = useAnimation();
  useEffect(()=>{
    if(spinning){
      const idx=GAMES.findIndex(g=>g.slug===selected.slug);
      controls.start({ rotate:[0,1620+idx*45], transition:{ duration:2.8, ease:EI } });
    }
  },[spinning,selected,controls]);
  const BULBS=48, bulbR=r+17;
  return (
    <div style={{ width:'100%', height:'100%', transform:'perspective(900px) rotateX(6deg)', transformOrigin:'center bottom' }}>
      <motion.div animate={controls} style={{ transformOrigin:'center', width:'100%', height:'100%' }}>
        <svg viewBox="0 0 440 440" width="100%" height="100%">
          <defs>
            {GAMES.map(g=>(<radialGradient key={g.slug} id={`v5gw-${g.slug}`} cx="38%" cy="28%" r="75%"><stop offset="0%" stopColor={g.glow}/><stop offset="55%" stopColor={g.color}/><stop offset="100%" stopColor={g.color} stopOpacity="0.75"/></radialGradient>))}
            <linearGradient id="v5ring1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FFF4A0"/><stop offset="25%" stopColor="#F5B642"/><stop offset="50%" stopColor="#FFE066"/><stop offset="75%" stopColor="#C8810A"/><stop offset="100%" stopColor="#FFF4A0"/></linearGradient>
            <linearGradient id="v5ring2" x1="100%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#8B5E00"/><stop offset="50%" stopColor="#F5B642"/><stop offset="100%" stopColor="#8B5E00"/></linearGradient>
            <radialGradient id="v5hub" cx="40%" cy="30%" r="70%"><stop offset="0%" stopColor="#3B1280"/><stop offset="100%" stopColor="#0A0320"/></radialGradient>
            <filter id="v5glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            <filter id="v5bulb" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            <filter id="v5txt"><feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor="rgba(0,0,0,1)" floodOpacity="1"/></filter>
          </defs>
          <ellipse cx={cx} cy={cy+15} rx={r+40} ry={r+30} fill="rgba(0,0,0,0.55)" filter="url(#v5glow)"/>
          <circle cx={cx} cy={cy} r={r+22} fill="none" stroke="url(#v5ring2)" strokeWidth="5"/>
          <circle cx={cx} cy={cy} r={r+14} fill="rgba(0,0,0,0.6)"/>
          <circle cx={cx} cy={cy} r={r+12} fill="none" stroke="url(#v5ring1)" strokeWidth="11" style={{ filter:'drop-shadow(0 0 10px rgba(245,182,66,0.95))' }}/>
          <circle cx={cx} cy={cy} r={r+5}  fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>
          {GAMES.map((g,i)=>{
            const a1=i*45,a2=(i+1)*45,isSel=g.slug===selected.slug;
            const lbl=midPt(cx,cy,r*0.70,a1,a2),icon=midPt(cx,cy,r*0.52,a1,a2);
            return (<g key={g.slug} onClick={()=>onSelect(g)} style={{ cursor:'pointer' }}>
              <path d={sector(cx,cy,r,ri,a1,a2)} fill="rgba(0,0,0,0.35)" style={{ transform:'translate(2px,3px)' }}/>
              <path d={sector(cx,cy,r-(isSel?0:4),ri+(isSel?0:3),a1,a2)} fill={`url(#v5gw-${g.slug})`} stroke={isSel?'rgba(255,255,255,0.75)':'rgba(0,0,0,0.6)'} strokeWidth={isSel?2.5:1.5} filter={isSel?'url(#v5glow)':undefined}/>
              <g transform={`translate(${icon.x},${icon.y}) scale(0.92)`}><SectorIcon slug={g.slug}/></g>
              <text x={lbl.x} y={lbl.y} textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight="900" fontFamily="'Outfit','Arial Black',sans-serif" fill="white" stroke="rgba(0,0,0,0.95)" strokeWidth="3" paintOrder="stroke" filter="url(#v5txt)" style={{ userSelect:'none', letterSpacing:'0.06em' }}>{g.short}</text>
            </g>);
          })}
          {GAMES.map((_,i)=>{ const p1=polar(cx,cy,ri+4,i*45),p2=polar(cx,cy,r-4,i*45); return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(0,0,0,0.65)" strokeWidth="1.5"/>; })}
          {Array.from({length:BULBS},(_,i)=>{ const ang=i*(360/BULBS),pt=polar(cx,cy,bulbR,ang),lit=i%2===0; return (<motion.circle key={i} cx={pt.x} cy={pt.y} r={lit?5:3.5} fill={lit?'#FFE55C':'#7A5200'} style={{ filter:lit?'url(#v5bulb)':undefined }} animate={lit?{ opacity:[0.65,1,0.65] }:{}} transition={lit?{ duration:1.1+((i%7)*0.18), repeat:Infinity, delay:(i%9)*0.12, ease:EI }:{}}/>); })}
          <circle cx={cx} cy={cy} r={ri+5} fill="rgba(0,0,0,0.85)"/>
          <circle cx={cx} cy={cy} r={ri}   fill="url(#v5hub)" stroke="url(#v5ring1)" strokeWidth="3" style={{ filter:'drop-shadow(0 0 12px rgba(168,85,247,0.7))' }}/>
          <circle cx={cx} cy={cy} r={ri-6} fill="transparent" stroke="rgba(255,255,255,0.12)" strokeWidth="1"/>
          <text x={cx} y={cy-9} textAnchor="middle" dominantBaseline="middle" fontSize="10.5" fontWeight="900" fontFamily="'Outfit','Arial Black',sans-serif" fill="#F5B642" style={{ userSelect:'none', letterSpacing:'0.14em' }}>SCEGLI</text>
          <text x={cx} y={cy+8} textAnchor="middle" dominantBaseline="middle" fontSize="10.5" fontWeight="900" fontFamily="'Outfit','Arial Black',sans-serif" fill="#FFD700" style={{ userSelect:'none', letterSpacing:'0.08em' }}>IL GIOCO</text>
        </svg>
      </motion.div>
      <div style={{ position:'absolute', top:'-3%', left:'50%', transform:'translateX(-50%)', zIndex:10, pointerEvents:'none' }}>
        <svg width="28" height="38" viewBox="0 0 28 38"><defs><linearGradient id="v5ptr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FFE55C"/><stop offset="100%" stopColor="#D97706"/></linearGradient></defs><polygon points="14,36 0,6 28,6" fill="url(#v5ptr)" style={{ filter:'drop-shadow(0 0 8px rgba(245,182,66,1)) drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}/><polygon points="14,36 3,9 25,9" fill="rgba(255,255,255,0.2)"/></svg>
      </div>
    </div>
  );
}

function ArcadeBtn({ children, onClick, bg, glow, border }:{ children:React.ReactNode; onClick:()=>void; bg:string; glow:string; border:string }) {
  return (
    <motion.button onClick={onClick} className="relative overflow-hidden font-black rounded-full flex items-center justify-center gap-3 text-white"
      style={{ background:bg, border:`3px solid ${border}`, boxShadow:`0 0 30px ${glow}66, 0 6px 0 rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)`, padding:'0 2.5vw', height:'7vh', fontSize:'clamp(0.85rem,1.5vw,1.2rem)', minWidth:'18vw' }}
      whileHover={{ scale:1.05, boxShadow:`0 0 60px ${glow}aa, 0 6px 0 rgba(0,0,0,0.5)` }}
      whileTap={{ scale:0.97, y:3 }}>
      <div className="absolute inset-0 opacity-25 pointer-events-none rounded-full" style={{ background:'radial-gradient(ellipse 80% 40% at 50% 5%,rgba(255,255,255,0.7),transparent)' }}/>
      <span className="relative z-10 flex items-center gap-2.5">{children}</span>
    </motion.button>
  );
}

function GameCard({ game }:{ game:Game }) {
  const DC:Record<string,string> = { Facile:'#34D399', Media:'#F5B642', Alta:'#F87171' };
  return (
    <AnimatePresence mode="wait">
      <motion.div key={game.slug} className="rounded-2xl"
        style={{ background:'rgba(6,1,20,0.92)', border:`1.5px solid ${game.color}99`, boxShadow:`0 0 30px ${game.color}44,0 0 60px ${game.color}18, inset 0 1px 0 rgba(255,255,255,0.06)` }}
        initial={{ opacity:0, y:10, scale:0.97 }} animate={{ opacity:1, y:0, scale:1 }} exit={{ opacity:0, y:-10 }}
        transition={{ duration:0.25 }}>
        <div className="px-4 py-4">
          <div className="font-black text-white mb-1" style={{ fontSize:'clamp(0.95rem,1.4vw,1.15rem)', fontFamily:"'Outfit','Arial Black',sans-serif", textShadow:`0 0 20px ${game.glow}88` }}>{game.label}</div>
          <div className="mb-3" style={{ fontSize:'0.72rem', color:'rgba(255,255,255,0.48)', lineHeight:1.45 }}>{game.desc}</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <span className="flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold" style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)', fontSize:'0.6rem', color:'rgba(255,255,255,0.65)' }}><Users size={8}/> {game.players} giocatori</span>
            <span className="flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold" style={{ background:`${DC[game.diff]??'#F5B642'}18`, border:`1px solid ${DC[game.diff]??'#F5B642'}44`, color:DC[game.diff]??'#F5B642', fontSize:'0.6rem' }}><Star size={8}/> {game.diff}</span>
          </div>
          <motion.button className="w-full rounded-xl py-2 font-black text-white flex items-center justify-center gap-1.5"
            style={{ background:`linear-gradient(135deg,${game.color} 0%,${game.glow} 100%)`, boxShadow:`0 0 18px ${game.color}55`, border:'none', fontSize:'0.8rem' }}
            whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}>
            Gioca ora <ChevronRight size={13}/>
          </motion.button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function Classifica() {
  const glowFor =(i:number)=>i===0?'rgba(245,182,66,0.7)':i===1?'rgba(192,192,192,0.5)':i===2?'rgba(205,127,50,0.45)':undefined;
  const borderFor=(i:number)=>i===0?'rgba(245,182,66,0.5)':i===1?'rgba(192,192,192,0.35)':i===2?'rgba(205,127,50,0.35)':'rgba(255,255,255,0.07)';
  const bgFor   =(i:number)=>i===0?'linear-gradient(135deg,rgba(245,182,66,0.22),rgba(245,182,66,0.06))':i===1?'linear-gradient(135deg,rgba(192,192,192,0.12),rgba(192,192,192,0.04))':i===2?'linear-gradient(135deg,rgba(205,127,50,0.12),rgba(205,127,50,0.04))':'rgba(255,255,255,0.04)';
  const avSize  =(i:number)=>i<3?'w-10 h-10':'w-8 h-8';
  const rankLabel=(i:number)=>['🥇','🥈','🥉'][i]??`${i+1}`;
  return (
    <div className="rounded-2xl overflow-hidden h-full flex flex-col"
      style={{ background:'rgba(8,2,22,0.9)', border:'1.5px solid rgba(255,255,255,0.11)', backdropFilter:'blur(14px)', boxShadow:'0 4px 40px rgba(0,0,0,0.7),inset 0 1px 0 rgba(255,255,255,0.08)' }}>
      <div className="px-4 py-2.5 font-black uppercase shrink-0 flex items-center gap-2"
        style={{ background:'linear-gradient(135deg,rgba(245,182,66,0.3),rgba(245,182,66,0.08))', borderBottom:'1px solid rgba(245,182,66,0.25)' }}>
        <Trophy size={13} className="text-yellow-400"/>
        <span style={{ fontSize:'0.6rem', letterSpacing:'0.22em', color:'#F5B642' }}>Classifica Live</span>
        <span className="ml-auto rounded-full px-2 py-0.5 font-black" style={{ background:'rgba(245,182,66,0.2)', color:'#F5B642', fontSize:'0.55rem' }}>LIVE</span>
      </div>
      <div className="flex flex-col p-2 gap-1.5 flex-1">
        {PLAYERS.map((p,i)=>(
          <motion.div key={p.id} className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5`}
            initial={{ x:-30,opacity:0 }} animate={{ x:0,opacity:1 }} transition={{ delay:i*0.07, ease:'easeOut' as const }}
            style={{ background:bgFor(i), border:`1px solid ${borderFor(i)}`, boxShadow:glowFor(i)?`0 0 18px ${glowFor(i)}`:undefined }}>
            <span className="shrink-0 text-center" style={{ fontSize:i<3?'0.9rem':'0.7rem', width:i<3?20:16, lineHeight:1 }}>{rankLabel(i)}</span>
            <div className={`${avSize(i)} rounded-full flex items-center justify-center font-black shrink-0`}
              style={{ background:`${PLAYER_COLORS[i]}2A`, border:`2.5px solid ${PLAYER_COLORS[i]}${i<3?'cc':'66'}`, color:PLAYER_COLORS[i], fontSize:i<3?'0.85rem':'0.72rem', boxShadow:i<3?`0 0 14px ${PLAYER_COLORS[i]}66`:undefined }}>
              {p.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-black text-white truncate" style={{ fontSize:i<3?'0.85rem':'0.78rem' }}>{p.name}</div>
              {i<3&&<div style={{ fontSize:'0.58rem', color:'rgba(52,211,153,0.8)' }}>+{p.delta}</div>}
            </div>
            <div className="font-black shrink-0" style={{ color:i===0?'#F5B642':i===1?'#C8C8C8':i===2?'#CD7F32':'rgba(255,255,255,0.55)', fontSize:i<3?'0.88rem':'0.78rem', textShadow:i<3?`0 0 12px ${PLAYER_COLORS[i]}`:undefined }}>
              {(p.score/1000).toFixed(1)}k
            </div>
          </motion.div>
        ))}
      </div>
      <div className="mx-3 mb-3 rounded-xl px-3 py-2 flex items-center gap-2 shrink-0"
        style={{ background:'rgba(124,58,237,0.2)', border:'1px solid rgba(124,58,237,0.35)' }}>
        <Users size={12} className="text-purple-400 shrink-0"/>
        <span className="font-black text-white" style={{ fontSize:'0.72rem' }}><span style={{ color:'#A855F7' }}>{PLAYERS.length}</span> Giocatori Connessi</span>
        <motion.div className="ml-auto w-2 h-2 rounded-full bg-green-400 shrink-0" animate={{ opacity:[1,0,1] }} transition={{ duration:1.2, repeat:Infinity }}/>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   ARENA V5 LAYOUT
══════════════════════════════════════════════════ */
function V5Arena() {
  const [selected, setSelected] = useState<Game>(GAMES[0]);
  const [spinning, setSpinning] = useState(false);

  const handleSpin = useCallback(()=>{
    if(spinning) return;
    const next = GAMES[Math.floor(Math.random()*GAMES.length)];
    setSelected(next);
    setSpinning(true);
    setTimeout(()=>setSpinning(false), 3000);
  },[spinning]);

  return (
    <motion.div key="v5arena" className="absolute inset-0"
      style={{ display:'grid', gridTemplateColumns:'22% 1fr 30%', gridTemplateRows:'auto 1fr auto', position:'relative' }}
      initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ duration:0.6 }}>

      {/* ── cinematic environment (behind everything) ── */}
      <CinematicStage selectedGlow={selected.glow} selectedGame={selected}/>

      {/* ── LOGO top-center ── */}
      <div className="col-span-3 flex justify-center items-start pt-2 z-20">
        <motion.img src={pub('/jonny-world-logo.png')} alt="Jonny's World"
          style={{ height:'clamp(3rem,6.5vh,5.5rem)', objectFit:'contain',
            filter:`drop-shadow(0 0 24px ${selected.glow}99) drop-shadow(0 0 50px rgba(168,85,247,0.4))` }}
          initial={{ y:-15, opacity:0 }} animate={{ y:0, opacity:1 }} transition={{ delay:0.1, duration:0.7, ease:'easeOut' as const }}/>
      </div>

      {/* ── LEFT: classifica ── */}
      <div className="flex flex-col pl-4 pr-2 pb-1 pt-1 z-20">
        <Classifica/>
      </div>

      {/* ── CENTER: wheel ── */}
      <div className="flex items-center justify-center z-20 py-2" style={{ minHeight:0 }}>
        <div style={{ width:'min(100%,460px)', aspectRatio:'1/1', position:'relative' }}>
          <GameWheel selected={selected} onSelect={setSelected} spinning={spinning}/>
        </div>
      </div>

      {/* ── RIGHT: game card ── */}
      <div className="flex flex-col pr-4 pl-1 pb-1 z-20 relative justify-center" style={{ paddingRight:'2vw' }}>
        <GameCard game={selected}/>
      </div>

      {/* ── JONNY ALIVE — absolute, not in grid flow ── */}
      <JonnyAlive glow={selected.glow}/>

      {/* ── BOTTOM-LEFT: spacer ── */}
      <div className="z-20"/>

      {/* ── BOTTOM-CENTER: CTAs ── */}
      <div className="flex flex-col items-center gap-1.5 pb-2 z-20">
        <div className="flex gap-4">
          <ArcadeBtn onClick={handleSpin}
            bg="linear-gradient(135deg,#5B21B6 0%,#7C3AED 100%)"
            glow="#7C3AED" border="#A855F7">
            <Zap size={18} fill="white"/> GIRA LA RUOTA
          </ArcadeBtn>
          <ArcadeBtn onClick={()=>{}}
            bg="linear-gradient(135deg,#92400E 0%,#D97706 100%)"
            glow="#F5B642" border="#F5B642">
            <Trophy size={18} fill="white"/> CLASSIFICA
          </ArcadeBtn>
        </div>
        <div className="flex gap-3">
          {['★ 8 Giochi','◎ Per Tutti','♦ Divertimento','⚡ Live'].map(s=>(
            <div key={s} className="flex items-center gap-1.5 rounded-full px-3 py-1"
              style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)' }}>
              <span className="font-bold text-white/55" style={{ fontSize:'0.62rem', letterSpacing:'0.04em' }}>{s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── BOTTOM-RIGHT: spacer ── */}
      <div className="z-20"/>
    </motion.div>
  );
}

/* ─── export ─────────────────────────────────────── */
export default function HomeV5() {
  return (
    <div className="fixed inset-0 overflow-hidden"
      style={{ background:'#030010', fontFamily:"'Outfit','Space Grotesk','Arial Black',sans-serif" }}>
      <V5Arena/>
    </div>
  );
}
