import { describe, expect, it } from 'vitest';
import { henryStarters, pageContextFromPath } from './henry';

describe('contexto transversal de Henry', () => {
  it.each([
    ['/dashboard', 'dashboard'],
    ['/crm', 'dashboard'],
    ['/crm/prospectos', 'prospect-list'],
    ['/crm/prospectos/607a72d8-3028-448f-b6cb-523573f117a0', 'prospect-detail'],
    ['/crm/pipeline', 'pipeline'],
    ['/crm/tareas', 'tasks'],
    ['/agenda', 'agenda'],
    ['/comunicaciones', 'communications'],
    ['/automatizaciones', 'automations'],
    ['/analitica', 'analytics'],
    ['/conocimiento', 'knowledge'],
    ['/formacion', 'training'],
    ['/formacion/roleplay', 'training'],
    ['/crm/clientes', 'clients'],
    ['/crm/empresas', 'companies'],
    ['/crm/consultores', 'consultants'],
    ['/administracion-henry', 'henry-admin'],
    ['/usuarios', 'administration'],
  ])('resuelve %s como %s', (pathname, pageType) => {
    expect(pageContextFromPath(pathname).pageType).toBe(pageType);
  });

  it('adjunta sólo el identificador de entidad presente en la ruta', () => {
    expect(
      pageContextFromPath('/crm/prospectos/607a72d8-3028-448f-b6cb-523573f117a0'),
    ).toMatchObject({
      entityType: 'prospect',
      entityId: '607a72d8-3028-448f-b6cb-523573f117a0',
    });
    expect(pageContextFromPath('/crm/prospectos')).not.toHaveProperty('entityId');
  });

  it('diferencia sugerencias públicas, consultivas y gerenciales sin ampliar permisos', () => {
    expect(henryStarters(pageContextFromPath('/pension'), 'PUBLIC')[0]).toMatch(/pensión/i);
    expect(henryStarters(pageContextFromPath('/crm/pipeline'), 'CONSULTANT')[0]).toMatch(
      /oportunidades/i,
    );
    expect(henryStarters(pageContextFromPath('/dashboard'), 'MANAGER')[0]).toMatch(
      /ámbito autorizado/i,
    );
    expect(henryStarters(pageContextFromPath('/dashboard'), 'CLIENT')).toContain(
      'Prefiero hablar con una persona',
    );
  });
});
