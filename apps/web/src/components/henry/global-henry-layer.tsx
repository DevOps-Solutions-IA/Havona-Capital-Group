'use client';

import { usePathname } from 'next/navigation';
import { HenryGlobalAssistant } from './henry-global-assistant';

const INTERNAL_ROOTS = ['/dashboard','/crm','/administracion-henry','/usuarios','/roles','/auditoria','/configuracion','/perfil'];
export function GlobalHenryLayer() {
  const pathname = usePathname();
  if (pathname === '/henry' || pathname.startsWith('/login') || INTERNAL_ROOTS.some((root) => pathname.startsWith(root))) return null;
  return <HenryGlobalAssistant />;
}
