'use client';

import { usePathname } from 'next/navigation';
import { HenryGlobalAssistant } from './henry-global-assistant';

const PUBLIC_HENRY_ROOTS = new Set([
  'pension',
  'educacion',
  'patrimonio',
  'proteccion',
  'accidentes',
  'empresarios',
  'socios',
  'socio-unico',
  'consultores',
]);

export function shouldShowPublicHenry(pathname: string) {
  if (pathname === '/') return true;
  const [root] = pathname.split('/').filter(Boolean);
  return Boolean(root && PUBLIC_HENRY_ROOTS.has(root));
}

export function GlobalHenryLayer() {
  const pathname = usePathname();
  if (!shouldShowPublicHenry(pathname)) return null;
  return <HenryGlobalAssistant role="PUBLIC" />;
}
