import type {Metadata} from 'next';
import {LeadForm} from '@/components/public/lead-form';
import {HomeHero} from '@/components/public/home-hero';
import {HomeNarrative} from '@/components/public/home-narrative';
import {PublicFooter} from '@/components/public/public-footer';
import {PublicHeader} from '@/components/public/public-header';

export const metadata:Metadata={alternates:{canonical:'/'}};

export default function HomePage(){return <div className="public-page home-page">
 <PublicHeader/>
 <main>
  <HomeHero/>
  <HomeNarrative/>
  <section className="private-consultation"><div className="public-container private-layout"><div className="private-intro"><p className="narrative-index">09 — Solicitud privada</p><h2>Cuéntenos qué quiere proteger, construir o proyectar.</h2><p>Su información inicia una solicitud real y queda registrada con consentimiento y trazabilidad.</p><div className="private-note"><span>01</span><p>Un primer contexto permite orientar la conversación hacia el perfil consultivo adecuado.</p></div></div><LeadForm landing="home" interest="consultoria"/></div></section>
 </main>
 <PublicFooter/>
 </div>}
