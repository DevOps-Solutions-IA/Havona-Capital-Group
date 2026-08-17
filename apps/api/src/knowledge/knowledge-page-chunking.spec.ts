import { KnowledgeService } from './knowledge.service';

describe('Knowledge page-aware chunking', () => {
  const service = new KnowledgeService(
    {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
  );

  it('no cruza páginas y conserva método, warning y pageStart/pageEnd', () => {
    const chunks = (service as any).chunks({
      pageCount: 2, documentText: null, documentWarnings: [],
      pages: [1, 2].map((pageNumber) => ({
        pageNumber, finalText: `Contenido completo de página ${pageNumber}`,
        extractionMethod: pageNumber === 1 ? 'NATIVE' : 'OCR', warnings: pageNumber === 2 ? ['OCR_USED'] : [],
        section: null, tables: [],
      })),
    });
    expect(chunks).toHaveLength(2);
    expect(chunks.map((chunk: any) => [chunk.pageStart, chunk.pageEnd])).toEqual([[1, 1], [2, 2]]);
    expect(chunks[1]).toMatchObject({ extractionMethods: ['OCR'], warnings: ['OCR_USED'] });
  });

  it('mantiene tabla como chunk semántico completo', () => {
    const rawText = 'Plan | Cobertura | Prima\nA | 100 millones | 115.000';
    const chunks = (service as any).chunks({
      pageCount: 1, documentText: null, documentWarnings: [],
      pages: [{
        pageNumber: 1, finalText: 'Tarifario', extractionMethod: 'NATIVE', warnings: [], section: 'PLANES',
        tables: [{ rawText, warnings: ['TABLE_STRUCTURE_HEURISTIC_REVIEW_REQUIRED'] }],
      }],
    });
    expect(chunks).toContainEqual(expect.objectContaining({
      content: rawText, structuralType: 'TABLE', pageStart: 1, pageEnd: 1, section: 'PLANES',
    }));
  });

  it('DOCX no recibe páginas artificiales', () => {
    const chunks = (service as any).chunks({
      pageCount: null, pages: [], documentText: 'Contenido DOCX completo', documentWarnings: [],
    });
    expect(chunks[0]).toMatchObject({ pageStart: null, pageEnd: null, structuralType: 'TEXT' });
  });
});
