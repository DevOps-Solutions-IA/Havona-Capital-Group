import Redis, { RedisOptions } from 'ioredis';

export function createRedisClient(
  options: RedisOptions = {},
  url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
) {
  return new Redis(url, {
    ...options,
    password: process.env.REDIS_PASSWORD || undefined,
  });
}
