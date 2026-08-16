import { describe, expect, it } from 'vitest';
import { resolveDomainRouting } from './domain-routing';

const config = {
  appHostname: 'app.havonacapitalgroup.com',
  appOrigin: 'https://app.havonacapitalgroup.com',
  publicOrigin: 'https://havonacapitalgroup.com',
};

function route(pathname: string, hostname: string, hasSession = false, search = '') {
  return resolveDomainRouting({ hostname, pathname, hasSession, search }, config);
}

describe('resolveDomainRouting', () => {
  it('envía la raíz app al login o dashboard según presencia de sesión', () => {
    expect(route('/', config.appHostname)).toEqual({
      type: 'redirect',
      destination: 'https://app.havonacapitalgroup.com/login',
    });
    expect(route('/', config.appHostname, true)).toEqual({
      type: 'redirect',
      destination: 'https://app.havonacapitalgroup.com/dashboard',
    });
  });

  it('protege rutas privadas del app domain y conserva next', () => {
    expect(route('/crm/prospectos', config.appHostname, false, '?page=2')).toEqual({
      type: 'redirect',
      destination:
        'https://app.havonacapitalgroup.com/login?next=%2Fcrm%2Fprospectos%3Fpage%3D2',
    });
    expect(route('/crm/prospectos', config.appHostname, true)).toEqual({ type: 'next' });
  });

  it('retira las rutas públicas del app domain', () => {
    expect(route('/educacion', config.appHostname)).toEqual({
      type: 'redirect',
      destination: 'https://havonacapitalgroup.com/educacion',
    });
    expect(route('/henry', config.appHostname)).toEqual({
      type: 'redirect',
      destination: 'https://havonacapitalgroup.com/henry',
    });
  });

  it('mantiene la experiencia pública en el dominio institucional', () => {
    expect(route('/', 'havonacapitalgroup.com')).toEqual({ type: 'next' });
    expect(route('/privacidad', 'www.havonacapitalgroup.com')).toEqual({ type: 'next' });
  });

  it('envía login y rutas internas del dominio público al app domain', () => {
    expect(route('/login', 'havonacapitalgroup.com')).toEqual({
      type: 'redirect',
      destination: 'https://app.havonacapitalgroup.com/login',
    });
    expect(route('/dashboard', 'havonacapitalgroup.com')).toEqual({
      type: 'redirect',
      destination: 'https://app.havonacapitalgroup.com/login?next=%2Fdashboard',
    });
  });

  it('mantiene el acceso de invitados a Meet en el app domain', () => {
    expect(route('/meet/invitado', config.appHostname)).toEqual({ type: 'next' });
    expect(route('/meet/invitado', 'havonacapitalgroup.com', false, '?token=fixture')).toEqual({
      type: 'redirect',
      destination: 'https://app.havonacapitalgroup.com/meet/invitado?token=fixture',
    });
  });

  it('no altera hosts locales o no gestionados', () => {
    expect(route('/', 'localhost:3000')).toEqual({ type: 'next' });
  });
});
