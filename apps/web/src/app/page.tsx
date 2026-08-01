import type {Metadata} from 'next';
import Link from 'next/link';
import {ArrowRight, Building2, Check, Landmark, ShieldCheck, Sparkles, UsersRound} from 'lucide-react';
import {LeadForm} from '@/components/public/lead-form';
import {PublicFooter} from '@/components/public/public-footer';
import {PublicHeader} from '@/components/public/public-header';
import {Reveal} from '@/components/public/reveal';

export const metadata:Metadata={alternates:{canonical:'/'}};

const people=[
 {href:'/proteccion',title:'Protección familiar',text:'Ordene las decisiones que ayudan a cuidar la continuidad de su familia.'},
 {href:'/pension',title:'Pensión',text:'Construya una ruta para su retiro a partir de objetivos y contexto personal.'},
 {href:'/educacion',title:'Educación',text:'Planifique los recursos para acompañar los proyectos educativos de su familia.'},
 {href:'/patrimonio',title:'Acumulación de capital',text:'Conecte sus metas de largo plazo con una estrategia patrimonial estructurada.'},
 {href:'/accidentes',title:'Accidentes personales',text:'Evalúe cómo proteger su estabilidad frente a eventos imprevistos.'},
];
const companies=[
 {href:'/empresarios',title:'Protección empresarial',text:'Identifique riesgos que pueden afectar la continuidad de su organización.'},
 {href:'/socios',title:'Socios',text:'Prepare acuerdos y mecanismos de protección para la estructura societaria.'},
 {href:'/socio-unico',title:'Socio único',text:'Proteja una operación cuyo conocimiento y dirección dependen de una persona clave.'},
 {href:'/empresarios#hombre-clave',title:'Hombre clave',text:'Explore la dependencia de personas esenciales para la operación y continuidad.'},
 {href:'/empresarios#beneficios-empleados',title:'Beneficios para empleados',text:'Converse sobre una estrategia de beneficios coherente con su organización.'},
];

export default function HomePage(){return <div className="public-page">
 <PublicHeader/>
 <main>
  <section className="relative overflow-hidden pb-24 pt-36 sm:pt-44 lg:pb-32">
   <div className="public-orb right-[-9rem] top-16 size-[34rem] bg-blue-300/35"/><div className="public-orb -left-52 top-96 size-[30rem] bg-brand-50"/>
   <div className="public-container grid items-center gap-16 lg:grid-cols-[1.05fr_.95fr]">
    <Reveal><p className="eyebrow">Consultoría patrimonial · Protección · Tecnología</p><h1 className="mt-6 max-w-4xl font-display text-5xl font-semibold leading-[1.02] tracking-[-.045em] text-brand-800 sm:text-6xl lg:text-[4.7rem]">Protegemos su presente. <span className="text-brand-500">Construimos su patrimonio.</span></h1><p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600">HAVONA CAPITAL integra consultoría patrimonial, protección financiera, tecnología e inteligencia artificial para personas, familias y empresas.</p><div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="#consultoria" className="button-primary">Agenda una consultoría <ArrowRight className="size-4"/></Link><Link href="/?experiencia=henry#consultoria" className="button-secondary">Habla con Henry <Sparkles className="size-4"/></Link></div><p className="mt-5 max-w-xl text-sm leading-6 text-slate-500">En esta etapa, Henry abre una captura conversacional segura para que un consultor conozca su necesidad. La experiencia inteligente completa llegará en una fase posterior.</p></Reveal>
    <Reveal delay={.12}><div className="hero-composition" aria-label="Composición que representa patrimonio, familia, empresa y tecnología"><div className="city-grid" aria-hidden="true"/><div className="relative z-10 mx-auto flex min-h-[470px] max-w-[520px] flex-col justify-between p-6 sm:p-9"><div className="flex justify-end"><span className="rounded-full border border-white/50 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[.18em] text-brand-700 backdrop-blur">Visión integral</span></div><div><div className="mb-5 grid size-14 place-items-center rounded-2xl bg-brand-800 text-white shadow-xl"><Landmark/></div><p className="max-w-sm font-display text-3xl font-medium leading-tight text-brand-800">Decisiones patrimoniales con contexto, método y acompañamiento.</p></div><div className="grid grid-cols-3 gap-3"><VisualPill icon={UsersRound} label="Familias"/><VisualPill icon={Building2} label="Empresas"/><VisualPill icon={ShieldCheck} label="Protección"/></div></div></div></Reveal>
   </div>
  </section>

  <section id="soluciones" className="scroll-mt-28 bg-white py-24"><div className="public-container"><Reveal><p className="eyebrow">Soluciones para cada contexto</p><div className="mt-4 grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><h2 className="section-title">Una conversación que parte de lo que realmente importa.</h2><p className="max-w-xl self-end text-lg leading-8 text-slate-600">No existen dos patrimonios iguales. Explore una ruta y cuéntenos qué necesita proteger, construir o proyectar.</p></div></Reveal><div id="personas" className="mt-16 scroll-mt-32"><div className="mb-7 flex items-center gap-3"><UsersRound className="text-brand-500"/><h3 className="font-display text-2xl font-semibold text-brand-800">Personas y familias</h3></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{people.map((item,index)=><SolutionCard key={item.href} {...item} index={index}/>)}</div></div><div id="empresas" className="mt-16 scroll-mt-32"><div className="mb-7 flex items-center gap-3"><Building2 className="text-brand-500"/><h3 className="font-display text-2xl font-semibold text-brand-800">Empresas y socios</h3></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{companies.map((item,index)=><SolutionCard key={item.href} {...item} index={index}/>)}</div></div></div></section>

  <section className="py-24"><div className="public-container grid gap-10 lg:grid-cols-[.85fr_1.15fr]"><Reveal><p className="eyebrow">Acompañamiento humano</p><h2 className="section-title mt-4">Claridad antes de tomar decisiones importantes.</h2><p className="mt-6 text-lg leading-8 text-slate-600">Nuestro punto de partida es comprender su realidad. La información que comparte se utiliza únicamente para atender su solicitud de consultoría según la política de tratamiento de datos.</p><ul className="mt-8 grid gap-4">{['Diagnóstico inicial de su necesidad.','Enrutamiento hacia el perfil consultivo adecuado.','Trazabilidad y consentimiento desde el primer contacto.'].map(item=><li key={item} className="flex gap-3 text-slate-700"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700"><Check className="size-3.5"/></span>{item}</li>)}</ul></Reveal><Reveal delay={.1}><LeadForm landing="home" interest="consultoria"/></Reveal></div></section>
 </main><PublicFooter/>
 </div>}

function VisualPill({icon:Icon,label}:{icon:typeof UsersRound;label:string}){return <div className="rounded-2xl border border-white/70 bg-white/75 p-3 text-center text-brand-800 backdrop-blur"><Icon className="mx-auto mb-2 size-5"/><span className="text-xs font-semibold">{label}</span></div>}
function SolutionCard({href,title,text,index}:{href:string;title:string;text:string;index:number}){return <Reveal delay={Math.min(index*.05,.2)}><Link href={href} className="group flex h-full min-h-52 flex-col rounded-[1.4rem] border border-slate-200/80 bg-slate-50/60 p-6 transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:bg-white hover:shadow-card"><span className="text-xs font-bold uppercase tracking-[.2em] text-brand-500">Explorar</span><h4 className="mt-5 font-display text-2xl font-semibold text-brand-800">{title}</h4><p className="mt-3 flex-1 leading-7 text-slate-600">{text}</p><span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-700">Conocer solución <ArrowRight className="size-4 transition-transform group-hover:translate-x-1"/></span></Link></Reveal>}
