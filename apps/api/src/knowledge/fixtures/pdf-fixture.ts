type FixturePage = { commands: string };

const escapePdf = (value: string) => value.replace(/([\\()])/g, '\\$1');

export function textPage(lines: Array<{ text: string; x: number; y: number; size?: number }>): FixturePage {
  return {
    commands: lines.map((line) =>
      `BT /F1 ${line.size ?? 12} Tf 1 0 0 1 ${line.x} ${line.y} Tm (${escapePdf(line.text)}) Tj ET`,
    ).join('\n'),
  };
}

export function visualOnlyPage(): FixturePage {
  return { commands: '0.2 0.4 0.8 rg 50 500 300 180 re f' };
}

export function createPdfFixture(pages: FixturePage[]) {
  const objects: string[] = [];
  const add = (body: string) => { objects.push(body); return objects.length; };
  const catalogId = add('');
  const pagesId = add('');
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds: number[] = [];
  for (const page of pages) {
    const contentId = add(`<< /Length ${Buffer.byteLength(page.commands)} >>\nstream\n${page.commands}\nendstream`);
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'binary');
}
