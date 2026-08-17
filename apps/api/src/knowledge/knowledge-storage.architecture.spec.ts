import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Knowledge persistent storage architecture', () => {
  const root = resolve(__dirname, '../../../..');
  const compose = readFileSync(resolve(root, 'docker-compose.yml'), 'utf8');

  it('monta storage persistente solo en API y no publica puertos de storage', () => {
    const api = compose.slice(compose.indexOf('\n  api:'), compose.indexOf('\n  worker:'));
    const worker = compose.slice(compose.indexOf('\n  worker:'), compose.indexOf('\n  web:'));
    expect(api).toContain('KNOWLEDGE_STORAGE_PROVIDER');
    expect(api).toContain('/var/lib/havona/knowledge');
    expect(api).toContain('KNOWLEDGE_STORAGE_HOST_PATH');
    expect(worker).not.toContain('/var/lib/havona/knowledge');
    expect(api).not.toMatch(/ports:[\s\S]*knowledge/);
  });
});
