import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');

export interface StorageProvider {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}
export interface EmbeddingProvider {
  readonly model: string;
  readonly dimension: number;
  embed(texts: string[]): Promise<number[][]>;
}

@Injectable()
export class LocalKnowledgeStorage implements StorageProvider {
  private readonly root = resolve(process.env.KNOWLEDGE_STORAGE_PATH ?? '/tmp/havona-knowledge');
  private path(key: string) {
    if (!/^[a-f0-9/-]+$/.test(key)) throw new Error('KNOWLEDGE_STORAGE_KEY_INVALID');
    const target = resolve(this.root, key);
    if (!target.startsWith(`${this.root}/`)) throw new Error('KNOWLEDGE_STORAGE_KEY_INVALID');
    return target;
  }
  async put(key: string, data: Buffer) {
    const target = this.path(key);
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, data, { mode: 0o600 });
  }
  get(key: string) {
    return readFile(this.path(key));
  }
  async delete(key: string) {
    await unlink(this.path(key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

// Deterministic embeddings are safe for CI and local validation. Production must
// configure a provider with a reviewed model before publishing corporate content.
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
  readonly model =
    process.env.EMBEDDING_MODEL ??
    (process.env.NODE_ENV === 'test' ? this.deterministic.model : '');
  readonly dimension = Number(
    process.env.EMBEDDING_DIMENSION ??
      (process.env.NODE_ENV === 'test' ? this.deterministic.dimension : 0),
  );

  async embed(texts: string[]) {
    const provider =
      process.env.EMBEDDING_PROVIDER ?? (process.env.NODE_ENV === 'test' ? 'deterministic' : '');
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
    const timer = setTimeout(
      () => controller.abort(),
      Number(process.env.EMBEDDING_REQUEST_TIMEOUT_MS ?? 30_000),
    );
    try {
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: this.model, input: texts }),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new ServiceUnavailableException(`KNOWLEDGE_EMBEDDING_PROVIDER_${response.status}`);
      const payload = (await response.json()) as {
        data?: Array<{ index: number; embedding: number[] }>;
      };
      const vectors = [...(payload.data ?? [])]
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);
      if (vectors.length !== texts.length || vectors.some((item) => item.length !== this.dimension))
        throw new ServiceUnavailableException('KNOWLEDGE_EMBEDDING_RESPONSE_INVALID');
      return vectors;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(
        error instanceof Error && error.name === 'AbortError'
          ? 'KNOWLEDGE_EMBEDDING_TIMEOUT'
          : 'KNOWLEDGE_EMBEDDING_PROVIDER_UNAVAILABLE',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

export const cosineSimilarity = (left: number[], right: number[]) => {
  if (left.length !== right.length || !left.length) return 0;
  return left.reduce((sum, item, index) => sum + item * (right[index] ?? 0), 0);
};
