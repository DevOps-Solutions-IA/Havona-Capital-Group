import { NextRequest, NextResponse } from 'next/server';
import { resolveDomainRouting } from '@/lib/domain-routing';

const APP_DOMAIN = process.env.APP_DOMAIN ?? 'app.havonacapitalgroup.com';
const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL ?? 'https://havonacapitalgroup.com';

export function middleware(request: NextRequest) {
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwardedProtocol || request.nextUrl.protocol.replace(/:$/, '') || 'http';
  const decision = resolveDomainRouting(
    {
      hostname: request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '',
      pathname: request.nextUrl.pathname,
      search: request.nextUrl.search,
      hasSession: request.cookies.has('havona_session'),
    },
    {
      appHostname: APP_DOMAIN,
      appOrigin: `${protocol}://${APP_DOMAIN}`,
      publicOrigin: PUBLIC_SITE_URL,
    },
  );

  if (decision.type === 'next') return NextResponse.next();
  return NextResponse.redirect(decision.destination, 307);
}

export const config = {
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|opengraph-image).*)'],
};
