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

  it('requires SMTP credentials in production', () => {
    expect(() => loadWorkerEnvironment({ NODE_ENV: 'production' })).toThrow('SMTP_HOST');
  });
});
