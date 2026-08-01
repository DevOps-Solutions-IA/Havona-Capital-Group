import { JsonLogger } from './json-logger';

describe('JsonLogger', () => {
  it('redacts sensitive values', () => {
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    new JsonLogger().log({ token: 'private', event: 'test' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('"token":"[REDACTED]"'));
    spy.mockRestore();
  });
});
