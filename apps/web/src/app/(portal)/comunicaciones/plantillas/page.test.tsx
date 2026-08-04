import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmailTemplatesPage from './page';
import { emailTemplatesApi } from '@/lib/email-templates';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('prospectId=11111111-1111-4111-8111-111111111111'),
}));
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    can: (permission: string) => permission !== 'email_templates.manage_corporate',
  }),
}));
vi.mock('@/lib/email-templates', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/email-templates')>('@/lib/email-templates');
  return {
    ...actual,
    emailTemplatesApi: {
      list: vi.fn(),
      catalog: vi.fn(),
      variables: vi.fn(),
      drafts: vi.fn(),
      create: vi.fn(),
      version: vi.fn(),
      approve: vi.fn(),
      activate: vi.fn(),
      variant: vi.fn(),
      createDraft: vi.fn(),
      preview: vi.fn(),
    },
  };
});

describe('EmailTemplatesPage', () => {
  beforeEach(() => {
    vi.mocked(emailTemplatesApi.list).mockResolvedValue([
      {
        id: '22222222-2222-4222-8222-222222222222',
        key: 'meeting.confirmation',
        name: 'Confirmación',
        category: 'MEETINGS',
        purpose: 'Confirmar',
        locale: 'es-CO',
        status: 'ACTIVE',
        isCorporate: true,
        activeVersionId: 'v1',
        versions: [],
      },
    ]);
    vi.mocked(emailTemplatesApi.catalog).mockResolvedValue([
      { key: 'meeting.confirmation', category: 'MEETINGS', status: 'STRUCTURAL_ONLY' },
    ]);
    vi.mocked(emailTemplatesApi.drafts).mockResolvedValue([]);
    vi.mocked(emailTemplatesApi.createDraft).mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      status: 'DRAFT',
      updatedAt: new Date().toISOString(),
    });
    vi.mocked(emailTemplatesApi.preview).mockResolvedValue({
      subject: 'Confirmación Laura',
      preheader: '',
      html: '<p>Contenido</p>',
      text: 'Contenido',
      missingVariables: [],
      warnings: [],
      messageClassification: 'RELATIONSHIP',
      templateVersion: 1,
    });
  });
  it('crea borrador real y preview sin enviar', async () => {
    render(<EmailTemplatesPage />);
    expect(await screen.findByRole('heading', { name: 'Confirmación' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Crear y previsualizar' }));
    expect(await screen.findByText('Confirmación Laura')).toBeInTheDocument();
    expect(emailTemplatesApi.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ recipientProspectId: '11111111-1111-4111-8111-111111111111' }),
    );
    expect(screen.getByText('Preview solamente. No envía al proveedor.')).toBeInTheDocument();
  });
});
