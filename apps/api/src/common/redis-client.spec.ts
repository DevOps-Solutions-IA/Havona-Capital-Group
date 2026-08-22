import { createRedisClient } from './redis-client';

describe('createRedisClient', () => {
  const previousUrl = process.env.REDIS_URL;
  const previousPassword = process.env.REDIS_PASSWORD;

  afterEach(() => {
    if (previousUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousUrl;
    if (previousPassword === undefined) delete process.env.REDIS_PASSWORD;
    else process.env.REDIS_PASSWORD = previousPassword;
  });

  it('mantiene la contraseña fuera de la URL aunque contenga caracteres reservados', () => {
    process.env.REDIS_URL = 'redis://redis:6379';
    process.env.REDIS_PASSWORD = 'test/secret=with+reserved:characters';

    const client = createRedisClient({ lazyConnect: true });

    expect(client.options.host).toBe('redis');
    expect(client.options.password).toBe(process.env.REDIS_PASSWORD);
    client.disconnect();
  });
});
