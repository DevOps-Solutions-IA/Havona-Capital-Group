import { describe, expect, it, vi } from 'vitest';
const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect }));
import LegacyProspectsPage from './page';
describe('ruta histórica de prospectos', () => {
  it('conduce a la bandeja CRM sin mantener dos experiencias', () => {
    LegacyProspectsPage();
    expect(redirect).toHaveBeenCalledWith('/crm/prospectos');
  });
});
