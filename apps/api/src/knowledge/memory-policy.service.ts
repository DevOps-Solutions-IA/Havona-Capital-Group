import { BadRequestException, Injectable } from '@nestjs/common';

const SECRET_PATTERN =
  /(password|contrase(?:ñ|n)a|api[_ -]?key|token|secret|clave privada|tarjeta|cvv)/i;
const ALLOWED_KEYS = new Set([
  'explanation.preference',
  'learning.products',
  'learning.difficulty',
  'operational.preference',
]);

@Injectable()
export class MemoryPolicy {
  classify(key: string, value: unknown) {
    const serialized = JSON.stringify(value);
    if (SECRET_PATTERN.test(key) || SECRET_PATTERN.test(serialized)) return 'PROHIBITED' as const;
    if (ALLOWED_KEYS.has(key)) return 'PERSISTENT_ALLOWED' as const;
    return 'PERSISTENT_REQUIRES_CONFIRMATION' as const;
  }
  assertWrite(key: string, value: unknown, confirmed: boolean) {
    const category = this.classify(key, value);
    if (category === 'PROHIBITED') throw new BadRequestException('MEMORY_PROHIBITED');
    if (category === 'PERSISTENT_REQUIRES_CONFIRMATION' && !confirmed)
      throw new BadRequestException('MEMORY_CONFIRMATION_REQUIRED');
    return category;
  }
}
