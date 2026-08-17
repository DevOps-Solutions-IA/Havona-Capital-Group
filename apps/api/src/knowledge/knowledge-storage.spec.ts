import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ConfiguredMalwareScanner,
  KnowledgeStorageConfig,
  PersistentFilesystemStorageProvider,
} from './knowledge.providers';

describe('PersistentFilesystemStorageProvider', () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'havona-knowledge-test-')); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it('rechaza fallback temporal en producción y exige path absoluto', () => {
    expect(() => new KnowledgeStorageConfig({ NODE_ENV: 'production' } as any))
      .toThrow('KNOWLEDGE_STORAGE_PROVIDER_INVALID');
    expect(() => new KnowledgeStorageConfig({
      NODE_ENV: 'production', KNOWLEDGE_STORAGE_PROVIDER: 'temp',
    } as any)).toThrow('KNOWLEDGE_STORAGE_FILESYSTEM_REQUIRED_IN_PRODUCTION');
    expect(() => new KnowledgeStorageConfig({
      NODE_ENV: 'production', KNOWLEDGE_STORAGE_PROVIDER: 'filesystem',
      KNOWLEDGE_STORAGE_PATH: 'relative/path',
    } as any)).toThrow('KNOWLEDGE_STORAGE_PATH_INVALID');
  });

  it('escribe atómicamente, verifica, lee, stat y elimina', async () => {
    const provider = new PersistentFilesystemStorageProvider(new KnowledgeStorageConfig({
      NODE_ENV: 'test', KNOWLEDGE_STORAGE_PROVIDER: 'filesystem', KNOWLEDGE_STORAGE_PATH: root,
    } as any));
    const data = Buffer.from('evidencia PALIG');
    await provider.put('originals/abc123', data);
    expect(await provider.exists('originals/abc123')).toBe(true);
    expect(await provider.get('originals/abc123')).toEqual(data);
    expect((await provider.stat('originals/abc123')).size).toBe(data.length);
    expect((await readdir(join(root, 'originals'))).filter((name) => name.includes('.tmp-'))).toEqual([]);
    await provider.delete('originals/abc123');
    expect(await provider.exists('originals/abc123')).toBe(false);
  });

  it.each(['../secret', 'originals/../../secret', '/absolute', 'name with spaces'])(
    'bloquea storage key insegura %s', async (key) => {
      const provider = new PersistentFilesystemStorageProvider(new KnowledgeStorageConfig({
        NODE_ENV: 'test', KNOWLEDGE_STORAGE_PROVIDER: 'filesystem', KNOWLEDGE_STORAGE_PATH: root,
      } as any));
      await expect(provider.put(key, Buffer.from('x'))).rejects.toThrow('KNOWLEDGE_STORAGE_KEY_INVALID');
    },
  );

  it('scanner inexistente nunca reporta CLEAN', async () => {
    const priorNode = process.env.NODE_ENV;
    const priorScanner = process.env.KNOWLEDGE_MALWARE_SCANNER;
    process.env.NODE_ENV = 'production';
    process.env.KNOWLEDGE_MALWARE_SCANNER = 'unavailable';
    await expect(new ConfiguredMalwareScanner().scan(Buffer.from('x'), {
      mimeType: 'text/plain', sha256: 'a'.repeat(64),
    })).resolves.toMatchObject({ status: 'PENDING_SCAN' });
    if (priorNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = priorNode;
    if (priorScanner === undefined) delete process.env.KNOWLEDGE_MALWARE_SCANNER;
    else process.env.KNOWLEDGE_MALWARE_SCANNER = priorScanner;
  });
});
