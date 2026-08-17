import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { createConnection } from 'node:net';

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');
export const MALWARE_SCANNER = Symbol('MALWARE_SCANNER');

export type StorageMetadata = { size: number; modifiedAt: Date };
export interface StorageProvider {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  stat(key: string): Promise<StorageMetadata>;
  delete(key: string): Promise<void>;
}
export interface EmbeddingProvider {
  readonly model: string;
  readonly dimension: number;
  embed(texts: string[]): Promise<number[][]>;
}
export type MalwareScanResult = {
  status: 'CLEAN' | 'QUARANTINED' | 'PENDING_SCAN' | 'SCAN_FAILED';
  scanner: string;
  errorCode?: string;
};
export interface MalwareScanner {
  scan(data: Buffer, metadata: { mimeType: string; sha256: string }): Promise<MalwareScanResult>;
}

export class ClamAvMalwareScanner implements MalwareScanner {
  private readonly host: string;
  private readonly port: number;
  private readonly timeoutMs: number;
  private readonly maxFileSize: number;

  constructor(environment: NodeJS.ProcessEnv = process.env) {
    this.host = environment.CLAMAV_HOST?.trim() ?? '';
    this.port = Number(environment.CLAMAV_PORT ?? 3310);
    this.timeoutMs = Number(environment.CLAMAV_TIMEOUT_MS ?? 15_000);
    this.maxFileSize = Number(environment.KNOWLEDGE_MAX_FILE_SIZE ?? 15_000_000);
    if (!this.host) throw new Error('CLAMAV_HOST_REQUIRED');
    if (!Number.isInteger(this.port) || this.port < 1 || this.port > 65_535)
      throw new Error('CLAMAV_PORT_INVALID');
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 120_000)
      throw new Error('CLAMAV_TIMEOUT_INVALID');
    if (!Number.isInteger(this.maxFileSize) || this.maxFileSize < 1)
      throw new Error('KNOWLEDGE_MAX_FILE_SIZE_INVALID');
  }

  async scan(data: Buffer, _metadata: { mimeType: string; sha256: string }): Promise<MalwareScanResult> {
    if (!data.length)
      return { status: 'SCAN_FAILED', scanner: 'clamav', errorCode: 'KNOWLEDGE_SCAN_EMPTY_FILE' };
    if (data.length > this.maxFileSize)
      return { status: 'SCAN_FAILED', scanner: 'clamav', errorCode: 'KNOWLEDGE_SCAN_SIZE_EXCEEDED' };

    try {
      const response = await this.scanStream(data);
      if (response === 'stream: OK') return { status: 'CLEAN', scanner: 'clamav' };
      if (/^stream: [^\r\n\0]+ FOUND$/.test(response))
        return { status: 'QUARANTINED', scanner: 'clamav' };
      return { status: 'SCAN_FAILED', scanner: 'clamav', errorCode: 'KNOWLEDGE_SCAN_RESPONSE_INVALID' };
    } catch (error) {
      return {
        status: 'SCAN_FAILED',
        scanner: 'clamav',
        errorCode: error instanceof Error && error.message === 'CLAMAV_SCAN_TIMEOUT'
          ? 'KNOWLEDGE_SCAN_TIMEOUT'
          : 'KNOWLEDGE_SCAN_UNAVAILABLE',
      };
    }
  }

  private scanStream(data: Buffer): Promise<string> {
    return new Promise((resolveScan, rejectScan) => {
      const socket = createConnection({ host: this.host, port: this.port });
      const response: Buffer[] = [];
      let responseSize = 0;
      let settled = false;
      const finish = (error?: Error, value?: string) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error) rejectScan(error);
        else resolveScan(value ?? '');
      };

      socket.setTimeout(this.timeoutMs, () => finish(new Error('CLAMAV_SCAN_TIMEOUT')));
      socket.once('error', (error) => finish(error));
      socket.on('data', (chunk: Buffer) => {
        responseSize += chunk.length;
        if (responseSize > 4096) return finish(new Error('CLAMAV_RESPONSE_TOO_LARGE'));
        response.push(chunk);
        const combined = Buffer.concat(response);
        const terminator = combined.indexOf(0);
        if (terminator >= 0) finish(undefined, combined.subarray(0, terminator).toString('utf8'));
      });
      socket.once('end', () => {
        if (!settled) finish(new Error('CLAMAV_RESPONSE_INCOMPLETE'));
      });
      socket.once('connect', () => {
        socket.write(Buffer.from('zINSTREAM\0'));
        for (let offset = 0; offset < data.length; offset += 64 * 1024) {
          const chunk = data.subarray(offset, Math.min(offset + 64 * 1024, data.length));
          const length = Buffer.allocUnsafe(4);
          length.writeUInt32BE(chunk.length);
          socket.write(length);
          socket.write(chunk);
        }
        socket.end(Buffer.alloc(4));
      });
    });
  }
}

@Injectable()
export class KnowledgeStorageConfig {
  readonly provider: 'filesystem' | 'temp';
  readonly root: string;

  constructor(environment: NodeJS.ProcessEnv = process.env) {
    const production = environment.NODE_ENV === 'production';
    const provider = environment.KNOWLEDGE_STORAGE_PROVIDER ?? (production ? '' : 'temp');
    if (provider !== 'filesystem' && provider !== 'temp') {
      throw new Error('KNOWLEDGE_STORAGE_PROVIDER_INVALID');
    }
    if (production && provider !== 'filesystem') {
      throw new Error('KNOWLEDGE_STORAGE_FILESYSTEM_REQUIRED_IN_PRODUCTION');
    }
    const configuredPath = environment.KNOWLEDGE_STORAGE_PATH?.trim();
    if (provider === 'filesystem' && !configuredPath) {
      throw new Error('KNOWLEDGE_STORAGE_PATH_REQUIRED');
    }
    const root = configuredPath ?? '/tmp/havona-knowledge-test';
    if (!isAbsolute(root) || resolve(root) === '/') {
      throw new Error('KNOWLEDGE_STORAGE_PATH_INVALID');
    }
    this.provider = provider;
    this.root = resolve(root);
  }
}

@Injectable()
export class PersistentFilesystemStorageProvider implements StorageProvider {
  constructor(private readonly config: KnowledgeStorageConfig) {}

  private path(key: string) {
    if (!/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/i.test(key)) {
      throw new BadRequestException('KNOWLEDGE_STORAGE_KEY_INVALID');
    }
    const target = resolve(this.config.root, key);
    if (!target.startsWith(`${this.config.root}/`)) {
      throw new BadRequestException('KNOWLEDGE_STORAGE_KEY_INVALID');
    }
    return target;
  }

  async put(key: string, data: Buffer) {
    const target = this.path(key);
    await mkdir(resolve(target, '..'), { recursive: true, mode: 0o700 });
    const temporary = `${target}.tmp-${randomUUID()}`;
    try {
      await writeFile(temporary, data, { mode: 0o600, flag: 'wx' });
      const written = await readFile(temporary);
      if (
        written.length !== data.length ||
        createHash('sha256').update(written).digest('hex') !==
          createHash('sha256').update(data).digest('hex')
      ) {
        throw new Error('KNOWLEDGE_STORAGE_INTEGRITY_FAILED');
      }
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  get(key: string) {
    return readFile(this.path(key));
  }

  async exists(key: string) {
    try {
      await stat(this.path(key));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  async stat(key: string) {
    const metadata = await stat(this.path(key));
    return { size: metadata.size, modifiedAt: metadata.mtime };
  }

  async delete(key: string) {
    await unlink(this.path(key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

// Backward-compatible technical name. It is no longer allowed to select /tmp in production.
export class LocalKnowledgeStorage extends PersistentFilesystemStorageProvider {}

@Injectable()
export class ConfiguredMalwareScanner implements MalwareScanner {
  private readonly provider: 'clamav' | 'unavailable' | 'noop-test';
  private readonly clamav?: ClamAvMalwareScanner;

  constructor(environment: NodeJS.ProcessEnv = process.env) {
    const provider = environment.KNOWLEDGE_MALWARE_SCANNER ??
      (environment.NODE_ENV === 'test' ? 'noop-test' : 'unavailable');
    if (!['clamav', 'unavailable', 'noop-test'].includes(provider))
      throw new Error('KNOWLEDGE_MALWARE_SCANNER_INVALID');
    if (provider === 'noop-test' && environment.NODE_ENV !== 'test')
      throw new Error('KNOWLEDGE_MALWARE_NOOP_TEST_FORBIDDEN');
    this.provider = provider as typeof this.provider;
    if (this.provider === 'clamav') this.clamav = new ClamAvMalwareScanner(environment);
  }

  async scan(data: Buffer, metadata: { mimeType: string; sha256: string }) {
    if (this.provider === 'noop-test') {
      return { status: 'CLEAN' as const, scanner: 'noop-test' };
    }
    if (this.clamav) return this.clamav.scan(data, metadata);
    return {
      status: 'PENDING_SCAN' as const,
      scanner: 'unavailable',
      errorCode: 'KNOWLEDGE_MALWARE_SCANNER_UNAVAILABLE',
    };
  }
}

@Injectable()
export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly model = 'havona/deterministic-test-v1';
  readonly dimension = 64;
  async embed(texts: string[]) {
    return texts.map((text) => {
      const bytes = createHash('sha512').update(text.normalize('NFKC').toLowerCase()).digest();
      const vector = [...bytes].map((byte) => byte / 127.5 - 1);
      const norm = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0)) || 1;
      return vector.map((item) => item / norm);
    });
  }
}

@Injectable()
export class ConfiguredEmbeddingProvider implements EmbeddingProvider {
  private readonly deterministic = new DeterministicEmbeddingProvider();
  readonly model = process.env.EMBEDDING_MODEL ??
    (process.env.NODE_ENV === 'test' ? this.deterministic.model : '');
  readonly dimension = Number(process.env.EMBEDDING_DIMENSION ??
    (process.env.NODE_ENV === 'test' ? this.deterministic.dimension : 0));

  async embed(texts: string[]) {
    const provider = process.env.EMBEDDING_PROVIDER ??
      (process.env.NODE_ENV === 'test' ? 'deterministic' : '');
    if (provider === 'deterministic') {
      if (process.env.NODE_ENV !== 'test' && process.env.ALLOW_DETERMINISTIC_EMBEDDINGS !== 'true')
        throw new ServiceUnavailableException('KNOWLEDGE_EMBEDDING_CONFIGURATION_REQUIRED');
      return this.deterministic.embed(texts);
    }
    const baseUrl = process.env.EMBEDDING_BASE_URL?.replace(/\/$/, '');
    const apiKey = process.env.EMBEDDING_API_KEY || process.env.OPENROUTER_API_KEY;
    if (!provider || !baseUrl || !apiKey || !this.model || !this.dimension)
      throw new ServiceUnavailableException('KNOWLEDGE_EMBEDDING_CONFIGURATION_REQUIRED');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number(process.env.EMBEDDING_REQUEST_TIMEOUT_MS ?? 30_000));
    try {
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: this.model, input: texts }), signal: controller.signal,
      });
      if (!response.ok)
        throw new ServiceUnavailableException(`KNOWLEDGE_EMBEDDING_PROVIDER_${response.status}`);
      const payload = (await response.json()) as { data?: Array<{ index: number; embedding: number[] }> };
      const vectors = [...(payload.data ?? [])].sort((a, b) => a.index - b.index).map((item) => item.embedding);
      if (vectors.length !== texts.length || vectors.some((item) => item.length !== this.dimension))
        throw new ServiceUnavailableException('KNOWLEDGE_EMBEDDING_RESPONSE_INVALID');
      return vectors;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(error instanceof Error && error.name === 'AbortError'
        ? 'KNOWLEDGE_EMBEDDING_TIMEOUT' : 'KNOWLEDGE_EMBEDDING_PROVIDER_UNAVAILABLE');
    } finally { clearTimeout(timer); }
  }
}

export const cosineSimilarity = (left: number[], right: number[]) => {
  if (left.length !== right.length || !left.length) return 0;
  return left.reduce((sum, item, index) => sum + item * (right[index] ?? 0), 0);
};
