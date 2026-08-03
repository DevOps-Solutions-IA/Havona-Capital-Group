import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { CalendarConfig } from './calendar-config';

@Injectable()
export class CalendarTokenVault {
  constructor(private readonly config: CalendarConfig) {}

  encrypt(value: string) {
    const key = this.key(); const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  decrypt(value: string) {
    const [version, iv, tag, encrypted] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !encrypted) throw new Error('CALENDAR_TOKEN_INVALID');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
  }

  private key() {
    if (!this.config.encryptionKey) throw new Error('CALENDAR_CONFIGURATION_REQUIRED');
    return createHash('sha256').update(this.config.encryptionKey, 'utf8').digest();
  }
}
