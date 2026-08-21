import { describe, expect, it } from 'vitest';
import { deliveryStatusLabel } from './communications';

describe('deliveryStatusLabel', () => {
  it('distingue aceptación, entrega, rebote y fallo', () => {
    expect(deliveryStatusLabel.SENT).toBe('Enviado');
    expect(deliveryStatusLabel.DELIVERED).toBe('Entregado');
    expect(deliveryStatusLabel.BOUNCED).toBe('Rebotado');
    expect(deliveryStatusLabel.COMPLAINED).toBe('Marcado como spam');
    expect(deliveryStatusLabel.FAILED).toBe('Fallido');
  });
});
