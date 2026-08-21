import { CalendarConfig } from './calendar-config';
import { CalendarTokenVault } from './token-vault.service';

describe('CalendarTokenVault', () => {
  it('cifra con AES-GCM y rechaza manipulación', () => {
    const vault = new CalendarTokenVault({ encryptionKey: 'test-key-with-enough-entropy-for-vault' } as CalendarConfig);
    const encrypted = vault.encrypt('refresh-token-secret');
    expect(encrypted).not.toContain('refresh-token-secret');
    expect(vault.decrypt(encrypted)).toBe('refresh-token-secret');
    expect(() => vault.decrypt(`${encrypted}x`)).toThrow();
  });

  it('exige configuración y nunca incorpora el secreto al error', () => {
    const vault = new CalendarTokenVault({ encryptionKey: '' } as CalendarConfig);
    expect(() => vault.encrypt('do-not-leak')).toThrow('CALENDAR_CONFIGURATION_REQUIRED');
    try { vault.encrypt('do-not-leak'); } catch (error) { expect(String(error)).not.toContain('do-not-leak'); }
  });
});
