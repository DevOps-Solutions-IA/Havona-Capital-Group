import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { KNOWLEDGE_AUTHORITY_RANK, resolveKnowledgeGovernance } from './knowledge-governance';
import type { KnowledgeAuthorityLevel, KnowledgeCurrentStatus, KnowledgeSourceType } from '@havona/database';

export const PALIG_CANONICAL_RELATION = Object.freeze({
  originalReferences: 13,
  originalUniqueHashes: 12,
  canonicalMarkdownDocuments: 12,
  duplicateSha256: 'e23b0c806f59d7ecdc96282c4f4602c32d4d20174a349e8144f2bf505202bb35',
  duplicateOriginalFilenames: [
    'POLIZA INDIVIDUAL DE ENFERMEDADES GRAVES.pdf',
    'POLIZA INDIVIDUAL DE ENFERMEDADES GRAVES (1).pdf',
  ],
});

export type MarkdownStructuralType = 'TEXT' | 'TABLE';
export type MarkdownCanonicalChunk = {
  id: string;
  documentSha256: string;
  index: number;
  content: string;
  section: string | null;
  subsection: string | null;
  headingPath: string[];
  structuralType: MarkdownStructuralType;
  warnings: string[];
};

export type MarkdownCanonicalManifestEntry = {
  filename: string;
  sourceFilename: string | null;
  sha256: string;
  bytes: number;
  title: string;
  productOrTopic: string;
  sourceType: KnowledgeSourceType;
  authorityLevel: KnowledgeAuthorityLevel;
  authorityRank: number;
  currentStatus: KnowledgeCurrentStatus;
  version: string | null;
  documentDate: string | null;
  effectiveFrom: null;
  effectiveUntil: null;
  customerNeeds: string[];
  chunkCount: number;
  tableCount: number;
  sectionCount: number;
  warnings: string[];
};

export type MarkdownCanonicalDocument = {
  manifest: MarkdownCanonicalManifestEntry;
  chunks: MarkdownCanonicalChunk[];
};

type Block = { type: 'TEXT' | 'TABLE'; lines: string[]; headings: string[] };

function parseFrontmatter(source: string) {
  if (!source.startsWith('---\n')) return { metadata: {} as Record<string, string>, body: source, warnings: ['MARKDOWN_FRONTMATTER_MISSING'] };
  const end = source.indexOf('\n---\n', 4);
  if (end < 0) return { metadata: {} as Record<string, string>, body: source, warnings: ['MARKDOWN_FRONTMATTER_UNCLOSED'] };
  const metadata: Record<string, string> = {};
  for (const line of source.slice(4, end).split('\n')) {
    const match = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!match) continue;
    metadata[match[1]!] = match[2]!.trim().replace(/^['"]|['"]$/g, '');
  }
  return { metadata, body: source.slice(end + 5), warnings: [] as string[] };
}

function isTableDivider(line: string) {
  return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line);
}

function tokenizeMarkdown(body: string): Block[] {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const headings: string[] = [];
  const blocks: Block[] = [];
  let text: string[] = [];
  const flushText = () => {
    const normalized = text.join('\n').trim();
    if (normalized) blocks.push({ type: 'TEXT', lines: normalized.split('\n'), headings: [...headings] });
    text = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const heading = line.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (heading) {
      flushText();
      const level = heading[1]!.length;
      headings.splice(level - 1);
      headings[level - 1] = heading[2]!.trim();
      continue;
    }
    const next = lines[index + 1];
    if (line.trim().startsWith('|') && next && isTableDivider(next)) {
      flushText();
      const table = [line, next];
      index += 2;
      while (index < lines.length && lines[index]!.trim().startsWith('|')) {
        table.push(lines[index]!);
        index += 1;
      }
      index -= 1;
      blocks.push({ type: 'TABLE', lines: table, headings: [...headings] });
      continue;
    }
    if (!line.trim() && text.length && !text[text.length - 1]!.trim()) flushText();
    else text.push(line);
  }
  flushText();
  return blocks;
}

function splitText(lines: string[], maxCharacters: number) {
  const groups: string[] = [];
  let current = '';
  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > maxCharacters && current) {
      groups.push(current.trim());
      current = line;
    } else current = candidate;
  }
  if (current.trim()) groups.push(current.trim());
  return groups;
}

function classify(metadata: Record<string, string>, filename: string) {
  const evidence = `${metadata.source_type ?? ''} ${metadata.source_authority_note ?? ''} ${metadata.document_title ?? ''}`.toLowerCase();
  let sourceType: KnowledgeSourceType;
  if (metadata.source_type && ['CONTRACTUAL', 'CAPACITACION', 'COMERCIAL', 'SIMULADOR', 'HISTORICO_VERSION', 'TRIBUTARIO_USUARIO', 'INFERENCIA_CONSULTIVA', 'CORPORATIVO'].includes(metadata.source_type)) {
    sourceType = metadata.source_type as KnowledgeSourceType;
  } else if (/material de (?:(?:presentación|producto)\/)?capacitación|material de capacitación/.test(evidence)) sourceType = 'CAPACITACION';
  else if (/condicionado contractual de póliza/.test(evidence)) sourceType = 'CONTRACTUAL';
  else if (/material comercial|pieza comercial/.test(evidence)) sourceType = 'COMERCIAL';
  else sourceType = 'CORPORATIVO';
  const governance = resolveKnowledgeGovernance({
    sourceType,
    ...(sourceType === 'CONTRACTUAL' ? { authorityLevel: 'CONTRACTUAL_GENERAL' as const } : {}),
    currentStatus: 'UNKNOWN',
    publicAllowed: false,
  });
  const title = metadata.document_title || basename(filename, '.md').replace(/_/g, ' ');
  const normalized = `${title} ${filename}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const productOrTopic = /accidentes|tarifario ap|\bap colombia\b/.test(normalized) ? 'ACCIDENTES_PERSONALES'
    : /cancer/.test(normalized) ? 'CANCER'
      : /enfermedades graves/.test(normalized) ? 'ENFERMEDADES_GRAVES'
        : /vida.flex/.test(normalized) ? 'VIDA_FLEX_MAX'
          : /pensi[oó]n|pensional/.test(normalized) ? 'PENSION_RETIRO' : 'PALIG_GENERAL';
  const needs = productOrTopic === 'ACCIDENTES_PERSONALES' ? ['ACCIDENT_PROTECTION']
    : productOrTopic === 'ENFERMEDADES_GRAVES' ? ['CRITICAL_ILLNESS']
      : productOrTopic === 'CANCER' ? ['CANCER_PROTECTION']
        : productOrTopic === 'VIDA_FLEX_MAX' ? ['FAMILY_PROTECTION', 'INCOME_PROTECTION', 'EDUCATION', 'RETIREMENT_PENSION_GAP', 'CAPITAL_ACCUMULATION']
          : productOrTopic === 'PENSION_RETIRO' ? ['RETIREMENT_PENSION_GAP', 'CAPITAL_ACCUMULATION'] : [];
  return { ...governance, title, productOrTopic, needs };
}

export function parseCanonicalMarkdown(filename: string, source: Buffer): MarkdownCanonicalDocument {
  const sha256 = createHash('sha256').update(source).digest('hex');
  const parsed = parseFrontmatter(source.toString('utf8'));
  const classification = classify(parsed.metadata, filename);
  const blocks = tokenizeMarkdown(parsed.body);
  const chunks: MarkdownCanonicalChunk[] = [];
  for (const block of blocks) {
    const contents = block.type === 'TABLE' ? [block.lines.join('\n').trim()] : splitText(block.lines, 1800);
    for (const content of contents) {
      const index = chunks.length;
      chunks.push({
        id: createHash('sha256').update(`${sha256}:${index}:${content}`).digest('hex'),
        documentSha256: sha256,
        index,
        content,
        section: block.headings[0] ?? null,
        subsection: block.headings.length > 1 ? block.headings.slice(1).join(' > ') : null,
        headingPath: block.headings,
        structuralType: block.type,
        warnings: [],
      });
    }
  }
  if (!chunks.length) parsed.warnings.push('MARKDOWN_NO_RECOVERABLE_CONTENT');
  const version = parsed.metadata.version_label ?? parsed.metadata.version_label_from_filename ?? null;
  const documentDate = parsed.metadata.document_date ?? parsed.metadata.source_date_from_pdf_metadata ?? null;
  return {
    manifest: {
      filename,
      sourceFilename: parsed.metadata.source_file ?? null,
      sha256,
      bytes: source.byteLength,
      title: classification.title,
      productOrTopic: classification.productOrTopic,
      sourceType: classification.sourceType,
      authorityLevel: classification.authorityLevel,
      authorityRank: KNOWLEDGE_AUTHORITY_RANK[classification.authorityLevel],
      currentStatus: 'UNKNOWN',
      version,
      documentDate,
      effectiveFrom: null,
      effectiveUntil: null,
      customerNeeds: classification.needs,
      chunkCount: chunks.length,
      tableCount: chunks.filter((chunk) => chunk.structuralType === 'TABLE').length,
      sectionCount: new Set(chunks.map((chunk) => chunk.headingPath.join(' > ')).filter(Boolean)).size,
      warnings: [...parsed.warnings, 'VALIDITY_NOT_CONFIRMED'],
    },
    chunks,
  };
}

export async function canonicalMarkdownDryRun(directory: string) {
  const exactDirectory = resolve(directory);
  const info = await stat(exactDirectory);
  if (!info.isDirectory()) throw new Error('MARKDOWN_CANONICAL_SOURCE_NOT_DIRECTORY');
  const entries = await readdir(exactDirectory, { withFileTypes: true });
  if (entries.some((entry) => entry.isDirectory())) throw new Error('MARKDOWN_CANONICAL_NESTED_DIRECTORY_BLOCKED');
  const filenames = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md')).map((entry) => entry.name).sort();
  const documents = await Promise.all(filenames.map(async (filename) => parseCanonicalMarkdown(filename, await readFile(resolve(exactDirectory, filename)))));
  const hashes = new Set(documents.map((document) => document.manifest.sha256));
  if (documents.length !== PALIG_CANONICAL_RELATION.canonicalMarkdownDocuments || hashes.size !== documents.length) {
    throw new Error('MARKDOWN_CANONICAL_CONSISTENCY_FAILED');
  }
  return { relation: PALIG_CANONICAL_RELATION, sourceDirectory: exactDirectory, documents };
}

function words(value: string) {
  return new Set(value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
}

export function retrieveCanonicalMarkdown(query: string, documents: MarkdownCanonicalDocument[], limit = 5) {
  const queryWords = words(query);
  return documents.flatMap((document) => document.chunks.map((chunk) => {
    const searchable = words(`${document.manifest.title} ${document.manifest.productOrTopic} ${chunk.headingPath.join(' ')} ${chunk.content}`);
    const matches = [...queryWords].filter((word) => searchable.has(word)).length;
    return { document, chunk, score: queryWords.size ? matches / queryWords.size : 0 };
  })).filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.document.manifest.authorityRank - right.document.manifest.authorityRank || left.chunk.index - right.chunk.index)
    .slice(0, limit);
}
