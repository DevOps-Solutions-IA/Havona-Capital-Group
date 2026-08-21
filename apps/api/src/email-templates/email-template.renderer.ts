import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { EMAIL_VARIABLES } from './email-template.catalog';

export type EmailBlock = {
  id: string;
  type: string;
  mode: 'EDITABLE' | 'STRUCTURED_EDITABLE' | 'FREE_EDITABLE' | 'LOCKED' | 'REQUIRED';
  content: string;
};
const allowed = new Set<string>(EMAIL_VARIABLES.map(([key]) => key));
const placeholder = /\{\{\s*([a-zA-Z][a-zA-Z0-9.]+)\s*\}\}/g;
const forbiddenHtml =
  /<\s*(script|iframe|object|embed|form|input|button|style|link|meta)\b|\son\w+\s*=|javascript\s*:|data\s*:\s*text\/html/i;
const headerInjection = /[\r\n]/;
const unsafeUrl = /href\s*=\s*["']\s*(?:javascript:|data:|https?:\/\/(?!\{\{))/i;
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
      if (
        !block.id ||
        ids.has(block.id) ||
        forbiddenHtml.test(block.content) ||
        unsafeUrl.test(block.content)
      )
        throw new BadRequestException('EMAIL_TEMPLATE_CONTENT_UNSAFE');
      ids.add(block.id);
    }
    if (corporate && !blocks.some((block) => block.type === 'FOOTER' && block.mode !== 'EDITABLE'))
      throw new BadRequestException('EMAIL_TEMPLATE_PROTECTED_FOOTER_REQUIRED');
  }

  lint(input: {
    subject: string;
    blocks: EmailBlock[];
    requiredVariables: string[];
    classification: string;
    ctaRequired?: boolean;
  }) {
    const errors: string[] = [],
      warnings: string[] = [];
    if (!input.subject.trim()) errors.push('EMAIL_SUBJECT_REQUIRED');
    if (input.subject.length > 120) warnings.push('EMAIL_SUBJECT_LONG');
    if (/[!¡?¿]{3,}/.test(input.subject)) warnings.push('EMAIL_SUBJECT_EXCESSIVE_PUNCTUATION');
    if (input.subject.length > 8 && input.subject === input.subject.toUpperCase())
      warnings.push('EMAIL_SUBJECT_EXCESSIVE_UPPERCASE');
    if (/última oportunidad|no se lo pierda|gran oportunidad|increíble/i.test(input.subject))
      warnings.push('EMAIL_SUBJECT_MISLEADING_URGENCY');
    if (input.blocks.reduce((total, block) => total + block.content.length, 0) > 40_000)
      errors.push('EMAIL_BODY_TOO_LONG');
    if (input.ctaRequired && !input.blocks.some((block) => block.type === 'CTA'))
      errors.push('EMAIL_CTA_REQUIRED');
    if (
      ['COMMERCIAL', 'MARKETING'].includes(input.classification) &&
      !input.blocks.some((block) => block.type === 'UNSUBSCRIBE' && !this.isEditable(block))
    )
      errors.push('EMAIL_TEMPLATE_UNSUBSCRIBE_REQUIRED');
    const registered = new Set(EMAIL_VARIABLES.map(([key]) => key));
    for (const key of input.requiredVariables)
      if (!registered.has(key as (typeof EMAIL_VARIABLES)[number][0]))
        errors.push(`EMAIL_VARIABLE_NOT_ALLOWED:${key}`);
    try {
      this.validateBlocks(input.blocks, true);
      this.variables(input.subject, '', input.blocks);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'EMAIL_TEMPLATE_INVALID');
    }
    return { valid: errors.length === 0, errors: [...new Set(errors)], warnings };
  }

  isEditable(block: EmailBlock) {
    return ['EDITABLE', 'STRUCTURED_EDITABLE', 'FREE_EDITABLE'].includes(block.mode);
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
