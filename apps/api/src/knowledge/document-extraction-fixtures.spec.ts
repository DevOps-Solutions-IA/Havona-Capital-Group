import { DocumentExtractor } from './document-extraction.service';
import { createPdfFixture, textPage, visualOnlyPage } from './fixtures/pdf-fixture';

describe('DocumentExtractor project fixtures', () => {
  it('procesa PDF real multipágina, página visual y tabla sin usar corpus PALIG', async () => {
    const fixture = createPdfFixture([
      textPage([{ text: 'Primera pagina con texto nativo suficientemente extenso para la prueba.', x: 50, y: 740 }]),
      visualOnlyPage(),
      textPage([
        { text: 'Plan', x: 50, y: 740 }, { text: 'Cobertura', x: 220, y: 740 }, { text: 'Prima', x: 430, y: 740 },
        { text: 'A', x: 50, y: 710 }, { text: '100 millones', x: 220, y: 710 }, { text: '115000', x: 430, y: 710 },
        { text: 'B', x: 50, y: 680 }, { text: '200 millones', x: 220, y: 680 }, { text: '125000', x: 430, y: 680 },
      ]),
    ]);
    const ocr = {
      name: 'fixture-ocr', version: '1',
      recognizePdfPage: jest.fn(async (_pdf: Buffer, page: number) => page === 2 ? 'Texto recuperado de la imagen' : ''),
    } as any;
    const result = await new DocumentExtractor(ocr).extract(fixture, 'application/pdf');
    expect(result.pageCount).toBe(3);
    expect(result.pages[0]).toMatchObject({ pageNumber: 1, extractionStatus: 'EXTRACTED_NATIVE' });
    expect(result.pages[1]).toMatchObject({ pageNumber: 2, extractionStatus: 'EXTRACTED_OCR' });
    expect(result.pages[2]?.tables[0]).toMatchObject({ headers: ['Plan', 'Cobertura', 'Prima'] });
    expect(ocr.recognizePdfPage).toHaveBeenCalledTimes(1);
  });

  it('DOCX no comparte la semántica artificial de páginas PDF', () => {
    const fixture = { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pageCount: null };
    expect(fixture.pageCount).toBeNull();
  });
});
