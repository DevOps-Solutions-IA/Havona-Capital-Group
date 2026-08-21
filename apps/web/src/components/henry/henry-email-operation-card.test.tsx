import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HenryEmailOperationCard } from './henry-email-operation-card';
import * as henry from '@/lib/henry';

vi.mock('@/lib/henry', async () => {
  const actual = await vi.importActual<typeof import('@/lib/henry')>('@/lib/henry');
  return {
    ...actual,
    getHenryMessagingOperation: vi.fn(),
    requestHenryEmailConfirmation: vi.fn(),
    confirmHenryEmail: vi.fn(),
    cancelHenryScheduledEmail: vi.fn(),
  };
});

const draft = {
  id: 'draft',
  preview: {
    subject: 'Resumen de reunión',
    text: 'Hola Laura, estos son los próximos pasos.',
    messageClassification: 'RELATIONSHIP',
    attachmentReferences: [],
    missingVariables: [],
  },
};

describe('HenryEmailOperationCard', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('muestra preview real y exige una segunda acción explícita para enviar', async () => {
    vi.mocked(henry.getHenryMessagingOperation)
      .mockResolvedValueOnce({ draft, operation: null })
      .mockResolvedValueOnce({
        draft,
        operation: { id: 'operation', intent: 'EMAIL_SEND', status: 'AWAITING_CONFIRMATION' },
      });
    vi.mocked(henry.requestHenryEmailConfirmation).mockResolvedValue({ operationId: 'operation' });
    render(
      <HenryEmailOperationCard
        session={{ id: 'conversation', accessToken: 'token' }}
        revision={1}
      />,
    );
    expect(await screen.findByText('Resumen de reunión')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y solicitar envío' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Enviar correo' })).toBeInTheDocument(),
    );
    expect(henry.confirmHenryEmail).not.toHaveBeenCalled();
  });

  it('no etiqueta como entregado un mensaje apenas aceptado', async () => {
    vi.mocked(henry.getHenryMessagingOperation).mockResolvedValue({
      draft,
      operation: {
        id: 'operation',
        intent: 'EMAIL_SEND',
        status: 'QUEUED',
        communicationMessageId: 'message',
      },
    });
    render(
      <HenryEmailOperationCard
        session={{ id: 'conversation', accessToken: 'token' }}
        revision={1}
      />,
    );
    expect(await screen.findByText('Aceptado por Communications Core')).toBeInTheDocument();
    expect(screen.queryByText('Entregado')).not.toBeInTheDocument();
  });
});
