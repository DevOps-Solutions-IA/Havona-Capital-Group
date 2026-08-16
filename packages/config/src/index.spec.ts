import { loadWorkerEnvironment } from './index';

describe('loadWorkerEnvironment', () => {
  it('coerces safe defaults', () => {
    expect(loadWorkerEnvironment({ NODE_ENV: 'test' })).toMatchObject({
      NODE_ENV: 'test',
      REDIS_PORT: 6379,
      WORKER_CONCURRENCY: 5,
    });
  });

  it('rejects invalid concurrency', () => {
    expect(() => loadWorkerEnvironment({ WORKER_CONCURRENCY: '0' })).toThrow(
      'Invalid worker environment',
    );
  });

  it('allows production workers without the optional SMTP transport', () => {
    expect(loadWorkerEnvironment({ NODE_ENV: 'production' })).toMatchObject({
      NODE_ENV: 'production',
    });
  });

  it('rejects a partially configured SMTP transport', () => {
    expect(() =>
      loadWorkerEnvironment({ NODE_ENV: 'production', SMTP_HOST: 'smtp.example.com' }),
    ).toThrow('SMTP_USER');
  });
});
