import type { Metadata } from 'next';
import { HenryExperience } from '@/components/public/henry-experience';
import { PublicFooter } from '@/components/public/public-footer';
import { PublicHeader } from '@/components/public/public-header';

export const metadata: Metadata = {
  title: 'Henry — Asistente virtual',
  description: 'Converse con Henry, asistente virtual de HAVONA CAPITAL GROUP, para orientar su necesidad patrimonial y solicitar acompañamiento humano.',
  alternates: { canonical: '/henry' },
  openGraph: { title: 'Henry — Asistente virtual de HAVONA CAPITAL GROUP', description: 'Inicie una conversación patrimonial clara, segura y conectada con nuestro equipo.', url: '/henry' },
};

export default function HenryPage() {
  return <div className="public-page henry-page"><PublicHeader/><main><HenryExperience/></main><PublicFooter/></div>;
}
