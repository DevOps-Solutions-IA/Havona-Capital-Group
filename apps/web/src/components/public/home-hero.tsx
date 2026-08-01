'use client';

import Link from 'next/link';
import {motion,useMotionValue,useReducedMotion,useSpring,useTransform} from 'motion/react';
import {ArrowDownRight,ArrowRight,MessageCircleMore} from 'lucide-react';
import {useRef} from 'react';

const intents=[
  {label:'Quiero revisar mi pensión',interest:'pension'},
  {label:'Quiero proteger mi empresa',interest:'empresarios'},
  {label:'Quiero construir patrimonio',interest:'patrimonio'},
];

export function HomeHero(){
 const reduced=useReducedMotion();const stage=useRef<HTMLDivElement>(null);const pointerX=useMotionValue(.5),pointerY=useMotionValue(.5);const smoothX=useSpring(pointerX,{stiffness:45,damping:24}),smoothY=useSpring(pointerY,{stiffness:45,damping:24});const planeX=useTransform(smoothX,[0,1],[-12,12]),planeY=useTransform(smoothY,[0,1],[-8,8]);
 function track(event:React.PointerEvent<HTMLDivElement>){if(reduced||event.pointerType==='touch')return;const box=stage.current?.getBoundingClientRect();if(!box)return;pointerX.set((event.clientX-box.left)/box.width);pointerY.set((event.clientY-box.top)/box.height)}
 return <section className="home-hero" onPointerMove={track} ref={stage} aria-labelledby="home-title">
  <div className="home-hero-grid" aria-hidden="true"/><div className="home-hero-glow" aria-hidden="true"/>
  <motion.div className="home-architecture" aria-hidden="true" style={reduced?undefined:{x:planeX,y:planeY}}>
   <div className="architecture-axis"/><div className="architecture-tower tower-one"/><div className="architecture-tower tower-two"/><div className="architecture-tower tower-three"/><div className="architecture-orbit orbit-one"/><div className="architecture-orbit orbit-two"/><span className="architecture-node node-one"/><span className="architecture-node node-two"/><span className="architecture-node node-three"/>
  </motion.div>
  <div className="public-container home-hero-inner">
   <div className="home-hero-copy">
    <p className="home-kicker hero-reveal" style={{animationDelay:'.04s'}}>Patrimonio · Estrategia · Tecnología</p>
    <h1 id="home-title" className="home-title" aria-label="Protegemos su presente. Construimos su patrimonio.">
     <span className="home-title-line title-line-one">{['Protegemos','su','presente.'].map((word,index)=><span className="hero-word" style={{animationDelay:`${.1+index*.08}s`}} key={word}>{word}</span>)}</span>
     <span className="home-title-line title-line-two">{['Construimos','su','patrimonio.'].map((word,index)=><span className="hero-word" style={{animationDelay:`${.34+index*.08}s`}} key={word}>{word}</span>)}</span>
    </h1>
    <div className="home-hero-intro hero-reveal" style={{animationDelay:'.62s'}}><p>Consultoría patrimonial y protección financiera conectadas con tecnología para personas, familias y empresas.</p><Link href="#consultoria" className="home-text-link">Iniciar una conversación <ArrowDownRight aria-hidden="true"/></Link></div>
   </div>
   <aside className="henry-entry hero-reveal" style={{animationDelay:'.76s'}} aria-labelledby="henry-title">
    <div className="henry-signal" aria-hidden="true"><span/><span/><span/></div><p className="henry-label">Capacidad digital HAVONA</p><div className="henry-heading"><div className="henry-mark"><MessageCircleMore/></div><div><span>Conoce a</span><h2 id="henry-title">Henry</h2></div></div><p className="henry-description">Tu asistente virtual para iniciar una conversación patrimonial y orientar el primer contacto.</p><p className="henry-options-label">¿Qué quieres conversar?</p><div className="henry-intents">{intents.map((intent,index)=><Link key={intent.interest} href={`/?experiencia=henry&interes=${intent.interest}#consultoria`} className="henry-intent"><span>0{index+1}</span>{intent.label}<ArrowRight aria-hidden="true"/></Link>)}</div><p className="henry-note">Experiencia inicial de captación. La asistencia inteligente completa se incorporará en una fase posterior.</p>
   </aside>
   <motion.div className="hero-index" initial={reduced?false:{opacity:0}} animate={{opacity:1}} transition={{delay:1.1}} aria-hidden="true"><span>01</span><i/><span>HAVONA CAPITAL</span></motion.div>
  </div>
 </section>
}
