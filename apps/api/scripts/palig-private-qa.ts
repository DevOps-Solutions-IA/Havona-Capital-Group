import 'reflect-metadata';
import { writeFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';
import { KnowledgePrivateQaService, PALIG_PRIVATE_QA_SOURCE } from '../src/knowledge/knowledge-private-qa.service';
import { PALIG_PRIVATE_QA_GOLDEN } from '../src/knowledge/palig-private-qa-golden';

async function actor(db: PrismaService) {
  const user = await db.user.findFirst({
    where: { isActive: true, roles: { some: { role: { name: 'SUPER_ADMIN' } } } },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
  });
  if (!user) throw new Error('KNOWLEDGE_PRIVATE_QA_SUPER_ADMIN_REQUIRED');
  return {
    id: user.id,
    roles: user.roles.map((item) => item.role.name),
    permissions: [...new Set(user.roles.flatMap((item) => item.role.permissions.map((permission) => permission.permission.key)))],
  };
}

async function run() {
  const source = process.argv.slice(2).find((item) => item !== '--') ?? PALIG_PRIVATE_QA_SOURCE;
  if (source !== PALIG_PRIVATE_QA_SOURCE) throw new Error('KNOWLEDGE_PRIVATE_QA_SOURCE_NOT_ALLOWED');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const qa = app.get(KnowledgePrivateQaService), db = app.get(PrismaService), principal = await actor(db);
    const baseline = await qa.baseline();
    const startedAt = Date.now();
    const first = await qa.ingest(source, principal);
    const firstDurationMs = Date.now() - startedAt;
    const expectedByDocument = new Map(first.documents.map((item) => [item.documentId, item.filename]));
    const goldenStartedAt = Date.now();
    const golden = [];
    for (const test of PALIG_PRIVATE_QA_GOLDEN) {
      const result = await qa.search(test.query, first.collection.id, principal, 5);
      const filenames = result.results.map((item) => expectedByDocument.get(item.citation.documentId) ?? null);
      const expectedRank = test.expectedFilename ? filenames.indexOf(test.expectedFilename) + 1 : 0;
      const tableMatched = !test.expectedStructuralType || result.results.some((item) =>
        expectedByDocument.get(item.citation.documentId) === test.expectedFilename &&
        test.expectedStructuralType === 'TABLE' && item.content.includes('|'));
      const passed = test.abstain ? result.answerStatus === 'INSUFFICIENT' : expectedRank > 0 && tableMatched;
      golden.push({ ...test, passed, answerStatus: result.answerStatus, expectedRank, top5: filenames, scores: result.results.map((item) => item.score) });
    }
    const goldenDurationMs = Date.now() - goldenStartedAt;
    const second = await qa.ingest(source, principal);
    const isolation = await qa.assertHenryIsolation(principal, first.manifest.map((item) => item.sha256));
    const after = await qa.baseline();
    const chunks = first.documents.reduce((sum, item) => sum + item.chunks, 0);
    if (chunks !== 586) throw new Error(`KNOWLEDGE_PRIVATE_QA_CHUNK_DRIFT:${chunks}:586`);
    if (second.documents.some((item) => !item.reused)) throw new Error('KNOWLEDGE_PRIVATE_QA_IDEMPOTENCY_FAILED');
    const must = golden.filter((item) => item.mustPass), present = must.filter((item) => !item.abstain);
    const top = (rank: number) => present.filter((item) => item.expectedRank > 0 && item.expectedRank <= rank).length / present.length;
    const metrics = { total: golden.length, mustPass: must.length, passed: must.filter((item) => item.passed).length,
      top1: top(1), top3: top(3), top5: top(5), abstention: must.filter((item) => item.abstain && item.passed).length };
    if (metrics.passed !== metrics.mustPass || metrics.top5 < 0.95 || metrics.top3 < 0.9)
      throw new Error(`KNOWLEDGE_PRIVATE_QA_GOLDEN_FAILED:${JSON.stringify(metrics)}`);
    const report = {
      mode: 'PRIVATE_QA', source, baseline, after, collection: { id: first.collection.id, key: first.collection.key,
        isActive: first.collection.isActive, henryEnabled: first.collection.henryEnabled },
      embedding: { model: process.env.EMBEDDING_MODEL, dimension: Number(process.env.EMBEDDING_DIMENSION) },
      firstDurationMs, goldenDurationMs, chunks, documents: first.documents, manifest: first.manifest,
      golden, metrics, idempotency: { newDocumentsSecondRun: second.documents.filter((item) => !item.reused).length,
        reusedDocumentsSecondRun: second.documents.filter((item) => item.reused).length }, isolation,
      publicationsCreated: after.published - baseline.published,
      publicAllowedCreated: after.publicAllowed - baseline.publicAllowed,
      henryExposureCreated: after.henryVisible - baseline.henryVisible,
    };
    if (report.publicationsCreated || report.publicAllowedCreated || report.henryExposureCreated)
      throw new Error('KNOWLEDGE_PRIVATE_QA_GOVERNANCE_FAILED');
    await writeFile('/tmp/havona-palig-private-qa-report.json', `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await app.close();
  }
}

void run();
