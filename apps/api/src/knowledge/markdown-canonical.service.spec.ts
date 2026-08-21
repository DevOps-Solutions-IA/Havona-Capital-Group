import { parseCanonicalMarkdown, retrieveCanonicalMarkdown } from './markdown-canonical.service';

const canonical = (filename: string, title: string, note: string, body: string) =>
  parseCanonicalMarkdown(filename, Buffer.from(`---\nsource_file: "${filename.replace('.md', '.pdf')}"\ndocument_title: "${title}"\nsource_authority_note: "${note}"\n---\n${body}`));

describe('Markdown canonical ingestion', () => {
  it('preserva H1/H2/H3, listas y tablas completas', () => {
    const document = canonical('tarifario.md', 'Tarifario AP', 'Material técnico oficial.', `
# Accidentes Personales
## Producto Básico
### Planes
- Plan A
- Plan B

| Cobertura | Plan A | Plan B |
|---|---:|---:|
| Muerte accidental | 100 | 200 |
| Prima | 10 | 20 |
`);
    const table = document.chunks.find((chunk) => chunk.structuralType === 'TABLE');
    const list = document.chunks.find((chunk) => chunk.content.includes('- Plan A'));
    expect(table).toMatchObject({
      section: 'Accidentes Personales',
      subsection: 'Producto Básico > Planes',
      headingPath: ['Accidentes Personales', 'Producto Básico', 'Planes'],
    });
    expect(table?.content).toContain('| Prima | 10 | 20 |');
    expect(list?.content).toContain('- Plan B');
  });

  it.each([
    ['H1 seguido directamente por H3', '# Producto\n### Condición\nContenido', ['Producto', 'Condición']],
    ['documento que comienza en H2', '## Condición\nContenido', ['Condición']],
  ])('normaliza headingPath JSON-safe para %s', (_name, body, expected) => {
    const document = canonical('heading-gap.md', 'Heading gap', 'Material de capacitación.', body);
    const headingPath = document.chunks[0]?.headingPath;
    expect(headingPath).toEqual(expected);
    expect(Object.keys(headingPath ?? {})).toHaveLength(headingPath?.length ?? 0);
    expect(headingPath?.every((heading) => typeof heading === 'string')).toBe(true);
    expect(JSON.stringify(headingPath)).not.toContain('null');
  });

  it('es determinista, usa hash server-side y conserva UNKNOWN', () => {
    const buffer = Buffer.from('---\ndocument_title: "Vida Flex MAX"\n---\n# Vida Flex MAX\nContenido');
    const first = parseCanonicalMarkdown('vida.md', buffer);
    const second = parseCanonicalMarkdown('vida.md', buffer);
    expect(first).toEqual(second);
    expect(first.manifest.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.manifest.currentStatus).toBe('UNKNOWN');
    expect(first.manifest.effectiveFrom).toBeNull();
    expect(first.manifest.warnings).toContain('VALIDITY_NOT_CONFIRMED');
  });

  it('prioriza autoridad contractual cuando la relevancia es equivalente', () => {
    const contractual = canonical('cancer-contractual.md', 'Póliza Cáncer', 'Condicionado contractual de póliza.', '# Cáncer\n## Amparo\nPeriodo noventa días cáncer.');
    const commercial = canonical('cancer-comercial.md', 'Postal Cáncer', 'Material comercial resumido.', '# Cáncer\n## Amparo\nPeriodo noventa días cáncer.');
    const result = retrieveCanonicalMarkdown('periodo noventa días cáncer', [commercial, contractual]);
    expect(result[0]?.document.manifest.filename).toBe('cancer-contractual.md');
    expect(result[0]?.document.manifest.authorityRank).toBeLessThan(result[1]!.document.manifest.authorityRank);
  });

  it('evita contaminación entre productos mediante evidencia léxica y fuente', () => {
    const accidents = canonical('ap.md', 'Accidentes Personales', 'Material de capacitación.', '# Accidentes Personales\n## Motocicleta\nExclusiones concretas de motocicleta.');
    const pension = canonical('pension.md', 'Brecha Pensional', 'Material de capacitación.', '# Pensión\n## Brecha\nIngreso base de liquidación.');
    const result = retrieveCanonicalMarkdown('motocicleta accidentes exclusiones', [pension, accidents]);
    expect(result[0]?.document.manifest.filename).toBe('ap.md');
    expect(result[0]?.chunk.section).toBe('Accidentes Personales');
    expect(result.some((item) => item.document.manifest.filename === 'pension.md')).toBe(false);
  });

  it('no eleva una presentación ni confunde un FactSheet de cáncer', () => {
    const presentation = canonical(
      'PRESENTACION_ENF_GRAVES_2023_CANONICAL.md',
      'Póliza de Seguro Individual de Enfermedades Graves',
      'Material de presentación/capacitación. Debe interpretarse junto con el condicionado contractual de mayor autoridad.',
      '# Enfermedades Graves\nContenido',
    );
    const cancer = canonical(
      'COL_Enfermedades_Graves_FactSheet_CANCER_2022_CANONICAL.md',
      'Seguro Individual de Cáncer',
      'Material comercial resumido.',
      '# Cáncer\nContenido',
    );
    const productTraining = canonical(
      'VIDA_FLEX_MAX_2026_CANONICAL.md',
      'Vida Flex MAX 2026',
      'Material de producto/capacitación. No sustituye condiciones contractuales.',
      '# Vida Flex MAX\nContenido',
    );
    expect(presentation.manifest).toMatchObject({ sourceType: 'CAPACITACION', authorityLevel: 'TRAINING' });
    expect(cancer.manifest).toMatchObject({ productOrTopic: 'CANCER', sourceType: 'COMERCIAL' });
    expect(productTraining.manifest).toMatchObject({ sourceType: 'CAPACITACION', authorityLevel: 'TRAINING' });
  });
});
