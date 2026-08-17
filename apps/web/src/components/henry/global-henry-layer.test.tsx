import { describe, expect, it } from 'vitest';
import { shouldShowPublicHenry } from './global-henry-layer';

describe('GlobalHenryLayer', () => {
  it.each([
    '/',
    '/pension',
    '/educacion',
    '/patrimonio',
    '/proteccion',
    '/accidentes',
    '/empresarios',
    '/socios',
    '/socio-unico',
    '/consultores',
  ])('muestra el único Henry público en %s', (pathname) =>
    expect(shouldShowPublicHenry(pathname)).toBe(true),
  );

  it.each([
    '/henry',
    '/login',
    '/dashboard',
    '/crm',
    '/agenda',
    '/comunicaciones',
    '/automatizaciones',
    '/analitica',
    '/conocimiento',
    '/formacion',
    '/administracion-henry',
  ])('no monta Henry público sobre la experiencia dedicada o autenticada en %s', (pathname) =>
    expect(shouldShowPublicHenry(pathname)).toBe(false),
  );
});
