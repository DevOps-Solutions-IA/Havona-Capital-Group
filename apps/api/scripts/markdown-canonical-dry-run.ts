import { writeFile } from 'node:fs/promises';
import { canonicalMarkdownDryRun, retrieveCanonicalMarkdown } from '../src/knowledge/markdown-canonical.service';

const allowedSource = '/mnt/d/Herry/archivos.md';
const source = process.argv.slice(2).find((argument) => argument !== '--') ?? allowedSource;
if (source !== allowedSource) throw new Error('MARKDOWN_CANONICAL_SOURCE_NOT_ALLOWED');

const golden = [
  ['Accidentes Personales coberturas básicas', 'Accidentes_Personales_2024_CANONICAL.md', 'TEXT'],
  ['Tarifario AP prima mensual Plan A', 'COL-Tarifario_AP_Colombia_2026_CANONICAL.md', 'TABLE'],
  ['edades de ingreso permanencia valor asegurado Vida Flex', 'Edades_Ingreso_Permanencia_2021_CANONICAL.md', 'TABLE'],
  ['condiciones generales Enfermedades Graves periodo noventa días amparo básico', 'POLIZA_INDIVIDUAL_ENFERMEDADES_GRAVES_CANONICAL.md', 'TEXT'],
  ['Seguro Individual de Cáncer periodo noventa días carencia', 'POLIZA_INDIVIDUAL_CANCER_CANONICAL.md', 'TEXT'],
  ['brecha pensional realidad mercado', 'Brecha_pensional_capacitacion_CANONICAL.md', 'TEXT'],
  ['capacitación maestra pensión cálculo mesada', 'CAPACITACION_MAESTRA_PENSION_CANONICAL.md', 'TEXT'],
  ['Vida Flex MAX educación superior hijos', 'Vida_Flex_MAX_CANONICAL.md', 'TEXT'],
  ['Vida Flex MAX 2026 tipos seguros vida individual', 'VIDA_FLEX_MAX_2026_CANONICAL.md', 'TEXT'],
] as const;

async function run() {
  const result = await canonicalMarkdownDryRun(source);
  const gates = golden.map(([question, expectedFilename, expectedType]) => {
    const candidates = retrieveCanonicalMarkdown(question, result.documents, 5);
    const expected = candidates[0];
    return {
      question,
      expectedFilename,
      expectedType,
      passed: expected?.document.manifest.filename === expectedFilename && expected.chunk.structuralType === expectedType,
      source: expected?.document.manifest.filename ?? null,
      section: expected?.chunk.section ?? null,
      subsection: expected?.chunk.subsection ?? null,
      structuralType: expected?.chunk.structuralType ?? null,
      currentStatus: expected?.document.manifest.currentStatus ?? null,
    };
  });
  const vidaConflict = retrieveCanonicalMarkdown('Vida Flex MAX acumulación protección', result.documents, 12)
    .filter((candidate) => candidate.document.manifest.productOrTopic === 'VIDA_FLEX_MAX');
  const conflictGate = {
    passed: new Set(vidaConflict.map((candidate) => candidate.document.manifest.filename)).size >= 2 &&
      vidaConflict.every((candidate) => candidate.document.manifest.currentStatus === 'UNKNOWN'),
    documents: [...new Set(vidaConflict.map((candidate) => candidate.document.manifest.filename))],
    status: 'VERSION_CONFLICT_REQUIRES_REVIEW',
  };
  const failedGates = gates.filter((gate) => !gate.passed || gate.currentStatus !== 'UNKNOWN');
  if (failedGates.length || !conflictGate.passed) {
    process.stderr.write(`${JSON.stringify({ failedGates, conflictGate }, null, 2)}\n`);
    throw new Error('MARKDOWN_GOLDEN_RETRIEVAL_FAILED');
  }
  const manifest = {
    generatedAt: new Date().toISOString(),
    mode: 'DRY_RUN',
    databaseWrites: 0,
    promotions: 0,
    publications: 0,
    henryExposure: 0,
    relation: result.relation,
    documents: result.documents.map((document) => document.manifest),
    goldenRetrieval: gates,
    conflictGate,
  };
  const output = '/tmp/havona-markdown-canonical-manifest.json';
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ output, ...manifest }, null, 2)}\n`);
}

void run();
