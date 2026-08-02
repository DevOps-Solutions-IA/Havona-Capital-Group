import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HenryMessageContent } from './henry-message-content';

describe('HenryMessageContent', () => {
  afterEach(cleanup);
  it('renderiza estructura editorial segura sin interpretar HTML', () => {
    render(<HenryMessageContent content={'## Próximo paso\n\n- **Confirmar** contexto\n- Preparar preguntas\n\n<script>alert(1)</script> [fuente](/privacidad)'} />);
    expect(screen.getByRole('heading', { name: 'Próximo paso' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('<script>alert(1)</script>', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'fuente' })).toHaveAttribute('href', '/privacidad');
  });

  it('no crea enlaces para destinos externos no autorizados', () => {
    render(<HenryMessageContent content="[secreto](https://evil.example)" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
