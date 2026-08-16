export type DomainRoutingConfig = {
  appHostname: string;
  appOrigin: string;
  publicOrigin: string;
};

export type DomainRoutingRequest = {
  hostname: string;
  pathname: string;
  search: string;
  hasSession: boolean;
};

export type DomainRoutingDecision =
  | { type: 'next' }
  | { type: 'redirect'; destination: string };

const AUTH_PATHS = [
  '/login',
  '/recuperar-contrasena',
  '/restablecer-contrasena',
  '/acceso-denegado',
];

const PRIVATE_ROOTS = [
  '/administracion-henry',
  '/agenda',
  '/analitica',
  '/auditoria',
  '/automatizaciones',
  '/comunicaciones',
  '/configuracion',
  '/conocimiento',
  '/crm',
  '/dashboard',
  '/formacion',
  '/perfil',
  '/prospectos',
  '/reuniones',
  '/roles',
  '/usuarios',
];

function matchesRoot(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some((root) => matchesRoot(pathname, root));
}

function isPrivatePath(pathname: string): boolean {
  if (pathname === '/henry/memoria' || pathname.startsWith('/henry/memoria/')) return true;
  if (pathname.startsWith('/meet/') && pathname !== '/meet/invitado') return true;
  return PRIVATE_ROOTS.some((root) => matchesRoot(pathname, root));
}

function isAppGuestPath(pathname: string): boolean {
  return pathname === '/meet/invitado';
}

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/:\d+$/, '').replace(/^https?:\/\//, '').split('/')[0];
}

function appendPath(origin: string, pathname: string, search: string): string {
  return `${origin.replace(/\/$/, '')}${pathname}${search}`;
}

function loginDestination(origin: string, pathname: string, search: string): string {
  const next = `${pathname}${search}`;
  return `${origin.replace(/\/$/, '')}/login?next=${encodeURIComponent(next)}`;
}

export function resolveDomainRouting(
  request: DomainRoutingRequest,
  config: DomainRoutingConfig,
): DomainRoutingDecision {
  const hostname = normalizeHostname(request.hostname);
  const configuredAppHostname = normalizeHostname(config.appHostname);
  const publicOrigin = config.publicOrigin.replace(/\/$/, '');
  const publicHostname = normalizeHostname(publicOrigin);
  const configuredAppOrigin = config.appOrigin.replace(/\/$/, '');

  if (hostname === configuredAppHostname) {
    if (request.pathname === '/') {
      return {
        type: 'redirect',
        destination: `${configuredAppOrigin}${request.hasSession ? '/dashboard' : '/login'}`,
      };
    }
    if (isAuthPath(request.pathname)) {
      if (request.pathname === '/login' && request.hasSession)
        return { type: 'redirect', destination: `${configuredAppOrigin}/dashboard` };
      return { type: 'next' };
    }
    if (isAppGuestPath(request.pathname)) return { type: 'next' };
    if (isPrivatePath(request.pathname)) {
      if (request.hasSession) return { type: 'next' };
      return {
        type: 'redirect',
        destination: loginDestination(configuredAppOrigin, request.pathname, request.search),
      };
    }
    return {
      type: 'redirect',
      destination: appendPath(publicOrigin, request.pathname, request.search),
    };
  }

  if (hostname === publicHostname || hostname === `www.${publicHostname}`) {
    if (isAppGuestPath(request.pathname)) {
      return {
        type: 'redirect',
        destination: appendPath(configuredAppOrigin, request.pathname, request.search),
      };
    }
    if (isAuthPath(request.pathname)) {
      return {
        type: 'redirect',
        destination: appendPath(configuredAppOrigin, request.pathname, request.search),
      };
    }
    if (isPrivatePath(request.pathname)) {
      return {
        type: 'redirect',
        destination: request.hasSession
          ? appendPath(configuredAppOrigin, request.pathname, request.search)
          : loginDestination(configuredAppOrigin, request.pathname, request.search),
      };
    }
  }

  return { type: 'next' };
}
