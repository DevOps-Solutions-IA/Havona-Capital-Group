import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { EMAIL_VARIABLES } from './email-template.catalog';

export type EmailBlock = {
  id: string;
  type: string;
  mode: 'EDITABLE' | 'LOCKED' | 'REQUIRED';
  content: string;
};
const allowed = new Set<string>(EMAIL_VARIABLES.map(([key]) => key));
const placeholder = /\{\{\s*([a-zA-Z][a-zA-Z0-9.]+)\s*\}\}/g;
const forbiddenHtml =
  /<\s*(script|iframe|object|embed|form|input|button|style|link|meta)\b|\son\w+\s*=|javascript\s*:|data\s*:\s*text\/html/i;
const headerInjection = /[\r\n]/;
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
const stripHtml = (value: string) =>
  value
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

@Injectable()
export class EmailTemplateRenderer {
  validateBlocks(blocks: EmailBlock[], corporate: boolean) {
    if (!blocks.length || blocks.length > 30)
      throw new BadRequestException('EMAIL_TEMPLATE_BLOCKS_INVALID');
    const ids = new Set<string>();
    for (const block of blocks) {
      if (!block.id || ids.has(block.id) || forbiddenHtml.test(block.content))
        throw new BadRequestException('EMAIL_TEMPLATE_CONTENT_UNSAFE');
      ids.add(block.id);
    }
    if (corporate && !blocks.some((block) => block.type === 'FOOTER' && block.mode !== 'EDITABLE'))
      throw new BadRequestException('EMAIL_TEMPLATE_PROTECTED_FOOTER_REQUIRED');
  }

  variables(subject: string, preheader: string | null | undefined, blocks: EmailBlock[]) {
    const found = new Set<string>();
    for (const text of [subject, preheader ?? '', ...blocks.map((block) => block.content)])
      for (const match of text.matchAll(placeholder)) {
        if (!allowed.has(match[1]!))
          throw new BadRequestException(`EMAIL_VARIABLE_NOT_ALLOWED:${match[1]}`);
        found.add(match[1]!);
      }
    return [...found].sort();
  }

  render(input: {
    subject: string;
    preheader?: string | null;
    blocks: EmailBlock[];
    variables: Record<string, string | null | undefined>;
    required: string[];
  }) {
    if (headerInjection.test(input.subject))
      throw new BadRequestException('EMAIL_HEADER_INJECTION');
    const missingVariables = input.required.filter((key) => !input.variables[key]?.trim());
    const warnings = [
      ...new Set(
        this.variables(input.subject, input.preheader, input.blocks).filter(
          (key) => !input.variables[key]?.trim(),
        ),
      ),
    ];
    const replace = (text: string, header = false) =>
      text.replace(placeholder, (_, key: string) => {
        const value = input.variables[key];
        if (!value) return '';
        if (header && headerInjection.test(value))
          throw new BadRequestException('EMAIL_HEADER_INJECTION');
        return header ? value : escapeHtml(value);
      });
    const subject = replace(input.subject, true).trim();
    const preheader = replace(input.preheader ?? '', true).trim();
    const renderedBlocks = input.blocks.map((block) => ({
      ...block,
      content: replace(block.content),
    }));
    const body = renderedBlocks
      .map((block) => `<section data-block="${escapeHtml(block.type)}">${block.content}</section>`)
      .join('');
    const html = `<!doctype html><html><body style="margin:0;background:#f3f6fa;color:#1d2939;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div><main style="max-width:640px;margin:auto;background:#fff;padding:32px;border-top:5px solid #071a33">${body}</main></body></html>`;
    return {
      subject,
      preheader,
      html,
      text: stripHtml(body),
      missingVariables,
      warnings,
      renderedBlocks,
      checksum: createHash('sha256').update(`${subject}\n${html}`).digest('hex'),
    };
  }
}
