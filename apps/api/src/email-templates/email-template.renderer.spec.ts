import { BadRequestException } from '@nestjs/common';
import { EMAIL_TEMPLATE_CATALOG } from './email-template.catalog';
import { EmailTemplateRenderer } from './email-template.renderer';

describe('EmailTemplateRenderer', () => {
  const renderer = new EmailTemplateRenderer();
  const blocks = [
    {
      id: 'body',
      type: 'BODY',
      mode: 'EDITABLE' as const,
      content: '<p>Hola {{client.firstName}}</p>',
    },
    { id: 'legal', type: 'LEGAL', mode: 'REQUIRED' as const, content: '<p>Aviso requerido</p>' },
    {
      id: 'footer',
      type: 'FOOTER',
      mode: 'LOCKED' as const,
      content: '<p>HAVONA CAPITAL GROUP</p>',
    },
  ];
  it('mantiene el catálogo corporativo final de 35 keys únicas', () => {
    expect(EMAIL_TEMPLATE_CATALOG).toHaveLength(35);
    expect(new Set(EMAIL_TEMPLATE_CATALOG.map(([key]) => key)).size).toBe(35);
  });
  it('renderiza de forma determinista, escapa variables y conserva bloques protegidos', () => {
    renderer.validateBlocks(blocks, true);
    const input = {
      subject: 'Hola {{client.firstName}}',
      blocks,
      variables: { 'client.firstName': '<Laura>' },
      required: ['client.firstName'],
    };
    const first = renderer.render(input),
      second = renderer.render(input);
    expect(first).toEqual(second);
    expect(first.html).toContain('&lt;Laura&gt;');
    expect(first.html).toContain('Aviso requerido');
    expect(first.missingVariables).toEqual([]);
  });
  it('diferencia variable requerida faltante de advertencia opcional', () => {
    const result = renderer.render({
      subject: 'Hola {{client.firstName}}',
      blocks: [{ ...blocks[0]!, content: '{{company.name}}' }, blocks[2]!],
      variables: {},
      required: ['client.firstName'],
    });
    expect(result.missingVariables).toEqual(['client.firstName']);
    expect(result.warnings).toContain('company.name');
  });
  it.each([
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<a href="javascript:alert(1)">x</a>',
  ])('rechaza HTML inseguro: %s', (content) => {
    expect(() => renderer.validateBlocks([{ ...blocks[0]!, content }, blocks[2]!], true)).toThrow(
      BadRequestException,
    );
  });
  it('rechaza inyección de encabezados y variables arbitrarias', () => {
    expect(() =>
      renderer.render({ subject: 'Asunto\nBcc: x@test.co', blocks, variables: {}, required: [] }),
    ).toThrow('EMAIL_HEADER_INJECTION');
    expect(() => renderer.variables('{{secrets.apiKey}}', '', blocks)).toThrow(
      'EMAIL_VARIABLE_NOT_ALLOWED',
    );
  });
  it('exige footer corporativo protegido', () => {
    expect(() => renderer.validateBlocks([blocks[0]!], true)).toThrow(
      'EMAIL_TEMPLATE_PROTECTED_FOOTER_REQUIRED',
    );
  });
});
