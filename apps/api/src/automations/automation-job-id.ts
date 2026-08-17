import { createHash } from 'node:crypto';

const MAX_BULLMQ_JOB_ID_LENGTH = 128;
const SAFE_BULLMQ_JOB_ID = /^[A-Za-z0-9_-]+$/;

export function toBullMqJobId(value: string): string {
  if (SAFE_BULLMQ_JOB_ID.test(value) && value.length <= MAX_BULLMQ_JOB_ID_LENGTH) return value;

  const hash = createHash('sha256').update(value).digest('hex').slice(0, 20);
  const maxSlugLength = MAX_BULLMQ_JOB_ID_LENGTH - hash.length - 1;
  const slug =
    value
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-')
      .slice(0, maxSlugLength) || 'job';

  return `${slug}-${hash}`;
}

export function toDeterministicUuid(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
