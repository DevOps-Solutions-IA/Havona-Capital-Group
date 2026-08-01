import { redactSensitiveValues } from './index';

describe('redactSensitiveValues', () => {
  it('redacts nested secrets without mutating safe fields', () => {
    expect(redactSensitiveValues({ user: 'a', nested: { accessToken: 'x' } })).toEqual({
      user: 'a',
      nested: { accessToken: '[REDACTED]' },
    });
  });
});
