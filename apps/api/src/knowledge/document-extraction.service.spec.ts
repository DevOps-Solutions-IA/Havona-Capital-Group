import pdfParse from 'pdf-parse';
import {
  ConfiguredOcrProvider,
  detectSection,
  detectTables,
  DocumentExtractor,
  positionedLines,
  TesseractOcrProvider,
} from './document-extraction.service';

jest.mock('pdf-parse', () => ({ __esModule: true, default: jest.fn() }));

const parser = pdfParse as jest.MockedFunction<typeof pdfParse>;
const item = (text: string, x: number, y: number, height = 10, width = text.length * 5) => ({
  str: text, width, height, transform: [1, 0, 0, height, x, y],
});
function pdfPages(pages: any[][]) {
  parser.mockImplementation(async (_buffer: any, options: any) => {
    for (const items of pages) await options.pagerender({ getTextContent: async () => ({ items }) });
    return { numpages: pages.length } as any;
  });
}

describe('Knowledge Document Integrity Engine', () => {
  beforeEach(() => parser.mockReset());

  it('extrae PDF multipágina con numeración y texto nativo sin cruzar páginas', async () => {
    pdfPages([
      [item('Página uno con contenido suficiente para extracción nativa.', 20, 700)],
      [item('Página dos con contenido suficiente para extracción nativa.', 20, 700)],
    ]);
    const ocr = { name: 'test', version: '1', recognizePdfPage: jest.fn() } as any;
    const result = await new DocumentExtractor(ocr).extract(Buffer.from('pdf'), 'application/pdf');
    expect(result.pageCount).toBe(2);
    expect(result.pages.map((page) => [page.pageNumber, page.extractionStatus])).toEqual([
      [1, 'EXTRACTED_NATIVE'], [2, 'EXTRACTED_NATIVE'],
    ]);
    expect(ocr.recognizePdfPage).not.toHaveBeenCalled();
  });

  it('usa OCR selectivo para página image-only y conserva mezcla nativa + OCR', async () => {
    pdfPages([[], [item('corto', 20, 700)]]);
    const ocr = {
      name: 'test', version: '1',
      recognizePdfPage: jest.fn().mockResolvedValueOnce('Texto recuperado de imagen').mockResolvedValueOnce('Texto OCR adicional'),
    } as any;
    const result = await new DocumentExtractor(ocr).extract(Buffer.from('pdf'), 'application/pdf');
    expect(result.pages[0]).toMatchObject({ extractionStatus: 'EXTRACTED_OCR', extractionMethod: 'OCR' });
    expect(result.pages[1]).toMatchObject({ extractionStatus: 'EXTRACTED_MIXED', extractionMethod: 'NATIVE_PLUS_OCR' });
    expect(ocr.recognizePdfPage).toHaveBeenCalledTimes(2);
  });

  it.each(['KNOWLEDGE_OCR_FAILED', 'KNOWLEDGE_OCR_TIMEOUT'])('falla cerrado ante %s', async (code) => {
    pdfPages([[]]);
    const ocr = { name: 'test', version: '1', recognizePdfPage: jest.fn().mockRejectedValue(new Error(code)) } as any;
    const result = await new DocumentExtractor(ocr).extract(Buffer.from('pdf'), 'application/pdf');
    expect(result.pages[0]).toMatchObject({ extractionStatus: 'FAILED', warnings: [code] });
  });

  it('no confirma vacío automáticamente cuando OCR tampoco recupera texto', async () => {
    pdfPages([[]]);
    const ocr = { name: 'test', version: '1', recognizePdfPage: jest.fn().mockResolvedValue('') } as any;
    const result = await new DocumentExtractor(ocr).extract(Buffer.from('pdf'), 'application/pdf');
    expect(result.pages[0]).toMatchObject({
      extractionStatus: 'FAILED', warnings: ['KNOWLEDGE_OCR_NO_TEXT_REVIEW_REQUIRED'],
    });
  });

  it('preserva una tabla con encabezados, filas y celdas', () => {
    const lines = positionedLines([
      item('Plan', 20, 700), item('Cobertura', 160, 700), item('Prima', 360, 700),
      item('A', 20, 680), item('100 millones', 160, 680), item('115.000', 360, 680),
      item('B', 20, 660), item('200 millones', 160, 660), item('125.000', 360, 660),
    ]);
    const tables = detectTables(lines, 4);
    expect(tables).toHaveLength(1);
    expect(tables[0]).toMatchObject({ pageNumber: 4, headers: ['Plan', 'Cobertura', 'Prima'] });
    expect(tables[0]?.rows).toEqual([['A', '100 millones', '115.000'], ['B', '200 millones', '125.000']]);
  });

  it('detecta tablas de páginas distintas sin fusionarlas', () => {
    const rows = [item('Plan', 10, 50), item('Valor', 150, 50), item('Prima', 300, 50), item('A', 10, 30), item('100', 150, 30), item('10', 300, 30)];
    expect(detectTables(positionedLines(rows), 1)[0]?.pageNumber).toBe(1);
    expect(detectTables(positionedLines(rows), 2)[0]?.pageNumber).toBe(2);
  });

  it('detecta sección solo con evidencia visual y permite ausencia', () => {
    expect(detectSection(positionedLines([item('COBERTURAS PRINCIPALES', 20, 700, 20), item('texto', 20, 680, 10)]))).toBe('COBERTURAS PRINCIPALES');
    expect(detectSection(positionedLines([item('una línea ordinaria extensa que no representa un título documental y continúa normalmente', 20, 700, 10)]))).toBeNull();
  });

  it('rechaza PDF malformado y no inventa páginas', async () => {
    parser.mockRejectedValueOnce(new Error('Invalid PDF'));
    const extractor = new DocumentExtractor({ name: 'test', version: '1' } as any);
    await expect(extractor.extract(Buffer.from('bad'), 'application/pdf')).rejects.toThrow('Invalid PDF');
  });

  it('valida configuración OCR y mantiene unavailable fail-closed', async () => {
    expect(() => new ConfiguredOcrProvider({ KNOWLEDGE_OCR_PROVIDER: 'otro' } as any)).toThrow('KNOWLEDGE_OCR_PROVIDER_INVALID');
    await expect(new ConfiguredOcrProvider({ KNOWLEDGE_OCR_PROVIDER: 'unavailable' } as any).recognizePdfPage(Buffer.from('x'), 1))
      .rejects.toThrow('KNOWLEDGE_OCR_UNAVAILABLE');
    expect(() => new TesseractOcrProvider({ KNOWLEDGE_OCR_TIMEOUT_MS: '1' } as any)).toThrow('KNOWLEDGE_OCR_TIMEOUT_INVALID');
  });
});
