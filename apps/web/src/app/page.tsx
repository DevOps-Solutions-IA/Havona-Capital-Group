import type {Metadata} from 'next';
import Link from 'next/link';
import {ArrowRight, Building2, Check, UsersRound} from 'lucide-react';
import {HomeHero} from '@/components/public/home-hero';
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
  <HomeHero/>

  <section id="soluciones" className="scroll-mt-28 bg-white py-24"><div className="public-container"><Reveal><p className="eyebrow">Soluciones para cada contexto</p><div className="mt-4 grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><h2 className="section-title">Una conversación que parte de lo que realmente importa.</h2><p className="max-w-xl self-end text-lg leading-8 text-slate-600">No existen dos patrimonios iguales. Explore una ruta y cuéntenos qué necesita proteger, construir o proyectar.</p></div></Reveal><div id="personas" className="mt-16 scroll-mt-32"><div className="mb-7 flex items-center gap-3"><UsersRound className="text-brand-500"/><h3 className="font-display text-2xl font-semibold text-brand-800">Personas y familias</h3></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{people.map((item,index)=><SolutionCard key={item.href} {...item} index={index}/>)}</div></div><div id="empresas" className="mt-16 scroll-mt-32"><div className="mb-7 flex items-center gap-3"><Building2 className="text-brand-500"/><h3 className="font-display text-2xl font-semibold text-brand-800">Empresas y socios</h3></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{companies.map((item,index)=><SolutionCard key={item.href} {...item} index={index}/>)}</div></div></div></section>

  <section className="py-24"><div className="public-container grid gap-10 lg:grid-cols-[.85fr_1.15fr]"><Reveal><p className="eyebrow">Acompañamiento humano</p><h2 className="section-title mt-4">Claridad antes de tomar decisiones importantes.</h2><p className="mt-6 text-lg leading-8 text-slate-600">Nuestro punto de partida es comprender su realidad. La información que comparte se utiliza únicamente para atender su solicitud de consultoría según la política de tratamiento de datos.</p><ul className="mt-8 grid gap-4">{['Diagnóstico inicial de su necesidad.','Enrutamiento hacia el perfil consultivo adecuado.','Trazabilidad y consentimiento desde el primer contacto.'].map(item=><li key={item} className="flex gap-3 text-slate-700"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700"><Check className="size-3.5"/></span>{item}</li>)}</ul></Reveal><Reveal delay={.1}><LeadForm landing="home" interest="consultoria"/></Reveal></div></section>
 </main><PublicFooter/>
 </div>}

function SolutionCard({href,title,text,index}:{href:string;title:string;text:string;index:number}){return <Reveal delay={Math.min(index*.05,.2)}><Link href={href} className="group flex h-full min-h-52 flex-col rounded-[1.4rem] border border-slate-200/80 bg-slate-50/60 p-6 transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:bg-white hover:shadow-card"><span className="text-xs font-bold uppercase tracking-[.2em] text-brand-500">Explorar</span><h4 className="mt-5 font-display text-2xl font-semibold text-brand-800">{title}</h4><p className="mt-3 flex-1 leading-7 text-slate-600">{text}</p><span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-700">Conocer solución <ArrowRight className="size-4 transition-transform group-hover:translate-x-1"/></span></Link></Reveal>}
