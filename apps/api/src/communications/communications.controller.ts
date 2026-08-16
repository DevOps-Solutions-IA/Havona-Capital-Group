import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  RawBodyRequest,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Throttle } from '@nestjs/throttler';
import { Public, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { CommunicationsConfig } from './communications-config';
import { CommunicationsService } from './communications.service';

const uuid = z.string().uuid();
const listSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(25),
    channel: z.enum(['WHATSAPP', 'EMAIL']).optional(),
    status: z.enum(['OPEN', 'PENDING', 'CLOSED', 'BLOCKED']).optional(),
    mode: z.enum(['HENRY', 'HUMAN', 'PAUSED', 'CLOSED']).optional(),
    assignedUserId: uuid.optional(),
    search: z.string().trim().max(120).optional(),
  })
  .strict();
const sendSchema = z
  .object({
    text: z.string().trim().min(1).max(8000),
    html: z.string().max(30000).optional(),
    templateName: z.string().max(160).optional(),
    templateLanguage: z.string().max(20).optional(),
    templateParameters: z.array(z.string().max(500)).max(20).optional(),
    idempotencyKey: z.string().uuid().optional(),
    generatedByHenry: z.boolean().optional(),
  })
  .strict();
const modeSchema = z.object({ mode: z.enum(['HENRY', 'HUMAN', 'PAUSED']) }).strict();
const assignSchema = z.object({ assigneeId: uuid }).strict();
const linkSchema = z
  .object({
    prospectId: uuid.optional(),
    companyId: uuid.optional(),
    opportunityId: uuid.optional(),
    conversationId: uuid.optional(),
  })
  .strict();
const audit = (req: any) => ({
  actorUserId: req.auth?.user?.id,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
});

@Controller()
export class CommunicationsController {
  constructor(
    private communications: CommunicationsService,
    private config: CommunicationsConfig,
  ) {}
  @Get('communications/config-status') @RequirePermissions('communications.read') configStatus() {
    return this.communications.configStatus();
  }
  @Get('communications') @RequirePermissions('communications.read') list(
    @Query(new ZodPipe(listSchema)) q: any,
    @Req() req: any,
  ) {
    return this.communications.list(req.auth.user, q);
  }
  @Get('communications/:id') @RequirePermissions('communications.read') get(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.communications.get(req.auth.user, uuid.parse(id));
  }
  @Post('communications/:id/messages') @RequirePermissions('communications.send') send(
    @Param('id') id: string,
    @Body(new ZodPipe(sendSchema)) body: any,
    @Req() req: any,
  ) {
    return this.communications.send(req.auth.user, uuid.parse(id), body, audit(req));
  }
  @Patch('communications/:id/mode') @RequirePermissions('communications.takeover') mode(
    @Param('id') id: string,
    @Body(new ZodPipe(modeSchema)) body: any,
    @Req() req: any,
  ) {
    return this.communications.setMode(req.auth.user, uuid.parse(id), body.mode, audit(req));
  }
  @Patch('communications/:id/assignment') @RequirePermissions('communications.assign') assign(
    @Param('id') id: string,
    @Body(new ZodPipe(assignSchema)) body: any,
    @Req() req: any,
  ) {
    return this.communications.assign(req.auth.user, uuid.parse(id), body.assigneeId, audit(req));
  }
  @Patch('communications/:id/crm') @RequirePermissions('communications.link_crm') link(
    @Param('id') id: string,
    @Body(new ZodPipe(linkSchema)) body: any,
    @Req() req: any,
  ) {
    return this.communications.linkCrm(req.auth.user, uuid.parse(id), body, audit(req));
  }
  @Delete('communications/:id') @RequirePermissions('communications.manage_own') close(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.communications.close(req.auth.user, uuid.parse(id), audit(req));
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get('integrations/meta/whatsapp/webhook')
  verifyMeta(@Query() q: Record<string, string>, @Res() res: Response) {
    if (
      q['hub.mode'] !== 'subscribe' ||
      !this.safeEqual(q['hub.verify_token'] ?? '', this.config.metaVerifyToken)
    )
      return res.status(403).json({ message: 'WEBHOOK_INVALID' });
    return res.status(200).send(q['hub.challenge'] ?? '');
  }
  @Public()
  @Throttle({ default: { limit: 240, ttl: 60000 } })
  @Post('integrations/meta/whatsapp/webhook')
  @HttpCode(200)
  async metaWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature = '',
  ) {
    const raw = req.rawBody;
    if (!raw || !this.verifyHmac(raw, signature, this.config.metaAppSecret, 'sha256='))
      throw new BadRequestException('WEBHOOK_INVALID');
    const body = req.body as any;
    for (const entry of body.entry ?? [])
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        for (const message of value.messages ?? [])
          if (message.type === 'text') {
            const eventId = this.communications.providerEventId('META', message);
            if (
              await this.communications.registerWebhook('META', eventId, 'message.inbound', {
                messageId: message.id,
                type: message.type,
              })
            )
              await this.communications.receiveInbound({
                channel: 'WHATSAPP',
                provider: 'META',
                providerMessageId: message.id,
                from: `+${String(message.from).replace(/^\+/, '')}`,
                to: value.metadata?.display_phone_number
                  ? `+${String(value.metadata.display_phone_number).replace(/^\+/, '')}`
                  : 'HAVONA',
                text: message.text?.body ?? '',
                contactName: value.contacts?.find((c: any) => c.wa_id === message.from)?.profile
                  ?.name,
                providerCreatedAt: message.timestamp
                  ? new Date(Number(message.timestamp) * 1000)
                  : undefined,
              });
          }
        for (const status of value.statuses ?? []) {
          const eventId = this.communications.providerEventId('META', status);
          if (
            !(await this.communications.registerWebhook(
              'META',
              eventId,
              `message.${status.status}`,
              { messageId: status.id, status: status.status },
            ))
          )
            continue;
          const normalized = (
            { sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' } as const
          )[status.status as 'sent' | 'delivered' | 'read' | 'failed'];
          if (normalized)
            await this.communications.recordDelivery(
              status.id,
              eventId,
              normalized,
              status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date(),
              status.errors?.[0]?.code ? String(status.errors[0].code) : undefined,
            );
        }
      }
    return { received: true };
  }
  @Public()
  @Throttle({ default: { limit: 240, ttl: 60000 } })
  @Post('integrations/resend/webhook')
  @HttpCode(200)
  async resendWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') id = '',
    @Headers('svix-timestamp') timestamp = '',
    @Headers('svix-signature') signature = '',
  ) {
    const raw = req.rawBody;
    if (!raw || !this.verifySvix(raw, id, timestamp, signature))
      throw new BadRequestException('WEBHOOK_INVALID');
    const event = req.body as any,
      type = String(event.type ?? ''),
      data = event.data ?? {},
      eventId = id || this.communications.providerEventId('RESEND', event);
    if (
      !(await this.communications.claimWebhook('RESEND', eventId, type, {
        messageId: data.email_id ?? null,
        type,
      }))
    )
      return { received: true, duplicate: true };
    try {
      if (type === 'email.received')
        await this.communications.receiveInbound({
          channel: 'EMAIL',
          provider: 'RESEND',
          providerMessageId: data.email_id ?? eventId,
          from: Array.isArray(data.from) ? data.from[0] : data.from,
          to: Array.isArray(data.to) ? data.to[0] : data.to,
          text: data.text ?? '',
          subject: data.subject,
        });
      else {
        const status = (
          {
            'email.sent': 'SENT',
            'email.delivered': 'DELIVERED',
            'email.bounced': 'BOUNCED',
            'email.complained': 'COMPLAINED',
            'email.failed': 'FAILED',
          } as const
        )[
          type as
            'email.sent' | 'email.delivered' | 'email.bounced' | 'email.complained' | 'email.failed'
        ];
        if (status && data.email_id)
          await this.communications.recordDelivery(
            data.email_id,
            eventId,
            status,
            new Date(data.created_at ?? Date.now()),
            type,
            {
              provider: 'RESEND',
              bounceType: typeof data.bounce?.type === 'string' ? data.bounce.type : null,
            },
          );
      }
      await this.communications.completeWebhook('RESEND', eventId);
    } catch (error) {
      await this.communications.failWebhook('RESEND', eventId);
      throw error;
    }
    return { received: true };
  }
  private safeEqual(a: string, b: string) {
    const aa = Buffer.from(a),
      bb = Buffer.from(b);
    return aa.length === bb.length && aa.length > 0 && timingSafeEqual(aa, bb);
  }
  private verifyHmac(raw: Buffer, signature: string, secret: string, prefix = '') {
    if (!secret || !signature.startsWith(prefix)) return false;
    const expected = `${prefix}${createHmac('sha256', secret).update(raw).digest('hex')}`;
    return this.safeEqual(signature, expected);
  }
  private verifySvix(raw: Buffer, id: string, timestamp: string, signature: string) {
    const timestampNumber = Number(timestamp);
    if (
      !this.config.resendWebhookSecret ||
      !id ||
      !timestamp ||
      !Number.isFinite(timestampNumber) ||
      Math.abs(Date.now() / 1000 - timestampNumber) > 300
    )
      return false;
    try {
      const key = Buffer.from(this.config.resendWebhookSecret.replace(/^whsec_/, ''), 'base64');
      const expected = createHmac('sha256', key)
        .update(`${id}.${timestamp}.${raw.toString('utf8')}`)
        .digest('base64');
      return signature
        .split(' ')
        .some((part) => part.startsWith('v1,') && this.safeEqual(part.slice(3), expected));
    } catch {
      return false;
    }
  }
}
