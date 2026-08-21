import { MemoryPolicy } from './memory-policy.service';

describe('MemoryPolicy', () => {
  const policy = new MemoryPolicy();
  it('permite una preferencia explícita y exige confirmación fuera de catálogo', () => {
    expect(policy.assertWrite('explanation.preference', 'ejemplos cortos', false)).toBe(
      'PERSISTENT_ALLOWED',
    );
    expect(() => policy.assertWrite('contexto.adicional', 'válido', false)).toThrow(
      'MEMORY_CONFIRMATION_REQUIRED',
    );
  });
  it('prohíbe secretos aunque el nombre de la clave parezca inocuo', () => {
    expect(() => policy.assertWrite('nota', 'mi contraseña es secreta', true)).toThrow(
      'MEMORY_PROHIBITED',
    );
  });
});
