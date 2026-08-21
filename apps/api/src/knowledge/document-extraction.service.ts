import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
export const DOCUMENT_EXTRACTOR_VERSION = 'page-aware-v1';
export const CHUNKER_VERSION = 'page-structural-v1';

export type ExtractionMethod = 'NATIVE' | 'OCR' | 'NATIVE_PLUS_OCR';
export type PageExtractionStatus =
  | 'EXTRACTED_NATIVE'
  | 'EXTRACTED_OCR'
  | 'EXTRACTED_MIXED'
  | 'EMPTY_CONFIRMED'
  | 'FAILED';

export type ExtractedTable = {
  pageNumber: number;
  tableIndex: number;
  headers: string[];
  rows: string[][];
  cells: string[][];
  rawText: string;
  warnings: string[];
};

export type ExtractedPage = {
  pageNumber: number;
  nativeText: string;
  finalText: string;
  extractionMethod: ExtractionMethod;
  characterCount: number;
  warnings: string[];
  blocks: Array<{ text: string; x: number; y: number; height: number }>;
  tables: ExtractedTable[];
  section: string | null;
  extractionStatus: PageExtractionStatus;
};

export type ExtractedDocument = {
  mimeType: string;
  pageCount: number | null;
  pages: ExtractedPage[];
  documentText: string | null;
  documentWarnings: string[];
  extractionMetadata: {
    extractorVersion: string;
    ocrProvider: string | null;
    ocrVersion: string | null;
    startedAt: Date;
    completedAt: Date;
  };
};

export interface OcrProvider {
  readonly name: string;
  readonly version: string;
  recognizePdfPage(pdf: Buffer, pageNumber: number): Promise<string>;
}

export class UnavailableOcrProvider implements OcrProvider {
  readonly name = 'unavailable';
  readonly version = 'none';
  async recognizePdfPage(_pdf: Buffer, _pageNumber: number): Promise<string> {
    throw new Error('KNOWLEDGE_OCR_UNAVAILABLE');
  }
}

export class TesseractOcrProvider implements OcrProvider {
  readonly name = 'tesseract';
  readonly version: string;
  private readonly timeoutMs: number;
  private readonly dpi: number;

  constructor(environment: NodeJS.ProcessEnv = process.env) {
    this.timeoutMs = Number(environment.KNOWLEDGE_OCR_TIMEOUT_MS ?? 45_000);
    this.dpi = Number(environment.KNOWLEDGE_OCR_DPI ?? 200);
    this.version = environment.KNOWLEDGE_OCR_VERSION?.trim() || 'tesseract-cli';
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1_000 || this.timeoutMs > 120_000)
      throw new Error('KNOWLEDGE_OCR_TIMEOUT_INVALID');
    if (!Number.isInteger(this.dpi) || this.dpi < 100 || this.dpi > 300)
      throw new Error('KNOWLEDGE_OCR_DPI_INVALID');
  }

  async recognizePdfPage(pdf: Buffer, pageNumber: number) {
    if (!Number.isInteger(pageNumber) || pageNumber < 1) throw new Error('KNOWLEDGE_OCR_PAGE_INVALID');
    const directory = await mkdtemp(join(tmpdir(), 'havona-ocr-'));
    const input = join(directory, 'input.pdf');
    const outputPrefix = join(directory, 'page');
    const image = `${outputPrefix}.png`;
    try {
      await writeFile(input, pdf, { mode: 0o600, flag: 'wx' });
      await execute('pdftoppm', [
        '-f', String(pageNumber), '-l', String(pageNumber), '-singlefile',
        '-r', String(this.dpi), '-png', input, outputPrefix,
      ], { timeout: this.timeoutMs, maxBuffer: 1024 * 1024 });
      await readFile(image);
      const { stdout } = await execute(
        'tesseract', [image, 'stdout', '-l', 'spa+eng', '--psm', '6'],
        { timeout: this.timeoutMs, maxBuffer: 10 * 1024 * 1024 },
      );
      return stdout.normalize('NFKC').replace(/\u0000/g, '').trim();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ETIMEDOUT') throw new Error('KNOWLEDGE_OCR_TIMEOUT');
      throw new Error('KNOWLEDGE_OCR_FAILED');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

@Injectable()
export class ConfiguredOcrProvider implements OcrProvider {
  private readonly delegate: OcrProvider;
  readonly name: string;
  readonly version: string;

  constructor(environment: NodeJS.ProcessEnv = process.env) {
    const provider = environment.KNOWLEDGE_OCR_PROVIDER?.trim() || 'unavailable';
    if (provider === 'tesseract') this.delegate = new TesseractOcrProvider(environment);
    else if (provider === 'unavailable') this.delegate = new UnavailableOcrProvider();
    else throw new Error('KNOWLEDGE_OCR_PROVIDER_INVALID');
    this.name = this.delegate.name;
    this.version = this.delegate.version;
  }

  recognizePdfPage(pdf: Buffer, pageNumber: number) {
    return this.delegate.recognizePdfPage(pdf, pageNumber);
  }
}

type PositionedLine = {
  text: string;
  y: number;
  cells: Array<{ text: string; x: number; width: number; height: number }>;
};

@Injectable()
export class DocumentExtractor {
  private readonly minimumNativeCharacters: number;

  constructor(private readonly ocr: ConfiguredOcrProvider) {
    this.minimumNativeCharacters = Number(process.env.KNOWLEDGE_OCR_MIN_NATIVE_CHARS ?? 40);
  }

  async extract(buffer: Buffer, mimeType: string): Promise<ExtractedDocument> {
    const startedAt = new Date();
    if (mimeType === 'application/pdf') return this.extractPdf(buffer, mimeType, startedAt);
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return {
        mimeType,
        pageCount: null,
        pages: [],
        documentText: result.value.normalize('NFKC').replace(/\u0000/g, '').trim(),
        documentWarnings: result.messages.map((message) => message.message),
        extractionMetadata: {
          extractorVersion: DOCUMENT_EXTRACTOR_VERSION,
          ocrProvider: null,
          ocrVersion: null,
          startedAt,
          completedAt: new Date(),
        },
      };
    }
    const raw = buffer.toString('utf8');
    const documentText = mimeType === 'text/html'
      ? raw.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
      : raw;
    return {
      mimeType,
      pageCount: null,
      pages: [],
      documentText: documentText.normalize('NFKC').replace(/\u0000/g, '').trim(),
      documentWarnings: [],
      extractionMetadata: {
        extractorVersion: DOCUMENT_EXTRACTOR_VERSION,
        ocrProvider: null,
        ocrVersion: null,
        startedAt,
        completedAt: new Date(),
      },
    };
  }

  private async extractPdf(buffer: Buffer, mimeType: string, startedAt: Date) {
    const parser = (await import('pdf-parse')).default;
    const nativePages: Array<{ lines: PositionedLine[]; text: string }> = [];
    const parsed = await parser(buffer, {
      pagerender: async (page: any) => {
        const content = await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
        const lines = positionedLines(content.items ?? []);
        const text = lines.map((line) => line.text).join('\n').trim();
        nativePages.push({ lines, text });
        return text;
      },
    } as any);
    const pages: ExtractedPage[] = [];
    for (let index = 0; index < parsed.numpages; index += 1) {
      const native = nativePages[index] ?? { lines: [], text: '' };
      const warnings: string[] = [];
      let finalText = native.text;
      let extractionMethod: ExtractionMethod = 'NATIVE';
      let extractionStatus: PageExtractionStatus = 'EXTRACTED_NATIVE';
      if (native.text.replace(/\s/g, '').length < this.minimumNativeCharacters) {
        try {
          const ocrText = await this.ocr.recognizePdfPage(buffer, index + 1);
          if (ocrText) {
            finalText = native.text ? `${native.text}\n\n[OCR]\n${ocrText}` : ocrText;
            extractionMethod = native.text ? 'NATIVE_PLUS_OCR' : 'OCR';
            extractionStatus = native.text ? 'EXTRACTED_MIXED' : 'EXTRACTED_OCR';
          } else if (!native.text) {
            extractionMethod = 'OCR';
            extractionStatus = 'FAILED';
            warnings.push('KNOWLEDGE_OCR_NO_TEXT_REVIEW_REQUIRED');
          }
        } catch (error) {
          extractionMethod = native.text ? 'NATIVE_PLUS_OCR' : 'OCR';
          extractionStatus = 'FAILED';
          warnings.push(error instanceof Error ? error.message : 'KNOWLEDGE_OCR_FAILED');
        }
      }
      const tables = detectTables(native.lines, index + 1);
      pages.push({
        pageNumber: index + 1,
        nativeText: native.text,
        finalText,
        extractionMethod,
        characterCount: finalText.length,
        warnings,
        blocks: native.lines.map((line) => ({
          text: line.text,
          x: line.cells[0]?.x ?? 0,
          y: line.y,
          height: Math.max(0, ...line.cells.map((cell) => cell.height)),
        })),
        tables,
        section: detectSection(native.lines),
        extractionStatus,
      });
    }
    return {
      mimeType,
      pageCount: parsed.numpages,
      pages,
      documentText: null,
      documentWarnings: nativePages.length === parsed.numpages ? [] : ['PDF_PAGE_COUNT_MISMATCH'],
      extractionMetadata: {
        extractorVersion: DOCUMENT_EXTRACTOR_VERSION,
        ocrProvider: this.ocr.name,
        ocrVersion: this.ocr.version,
        startedAt,
        completedAt: new Date(),
      },
    } satisfies ExtractedDocument;
  }
}

export function positionedLines(items: any[]): PositionedLine[] {
  const sorted = items.map((item) => ({
    text: String(item.str ?? '').trim(),
    x: Number(item.transform?.[4] ?? 0),
    y: Number(item.transform?.[5] ?? 0),
    width: Number(item.width ?? 0),
    height: Math.abs(Number(item.height ?? item.transform?.[3] ?? 0)),
  })).filter((item) => item.text).sort((a, b) => Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x);
  const lines: PositionedLine[] = [];
  for (const item of sorted) {
    let line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 2);
    if (!line) { line = { text: '', y: item.y, cells: [] }; lines.push(line); }
    line.cells.push(item);
  }
  return lines.sort((a, b) => b.y - a.y).map((line) => {
    line.cells.sort((a, b) => a.x - b.x);
    let text = '';
    for (const cell of line.cells) {
      const previous = line.cells[line.cells.indexOf(cell) - 1];
      const gap = previous ? cell.x - (previous.x + previous.width) : 0;
      text += `${text ? (gap > 18 ? '\t' : ' ') : ''}${cell.text}`;
    }
    return { ...line, text };
  });
}

export function detectTables(lines: PositionedLine[], pageNumber: number): ExtractedTable[] {
  const candidates = lines.filter((line) => line.cells.length >= 3 && line.text.includes('\t'));
  if (candidates.length < 2) return [];
  const cells = candidates.map((line) => line.text.split('\t').map((cell) => cell.trim()));
  const width = Math.max(...cells.map((row) => row.length));
  if (width < 3) return [];
  const normalized = cells.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill('')]);
  return [{
    pageNumber,
    tableIndex: 0,
    headers: normalized[0]!,
    rows: normalized.slice(1),
    cells: normalized,
    rawText: normalized.map((row) => row.join(' | ')).join('\n'),
    warnings: ['TABLE_STRUCTURE_HEURISTIC_REVIEW_REQUIRED'],
  }];
}

export function detectSection(lines: PositionedLine[]): string | null {
  const heights = lines.flatMap((line) => line.cells.map((cell) => cell.height)).filter(Boolean).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)] ?? 0;
  for (const line of lines.slice(0, 12)) {
    const text = line.text.trim();
    const height = Math.max(0, ...line.cells.map((cell) => cell.height));
    if (text.length > 2 && text.length <= 120 && (height > median * 1.25 || /^[A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9 .:()-]+$/.test(text)))
      return text.slice(0, 300);
  }
  return null;
}
