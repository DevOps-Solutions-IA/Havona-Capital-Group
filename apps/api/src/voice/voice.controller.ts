import { BadRequestException, Body, Controller, Headers, Param, ParseUUIDPipe, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { Public } from '../common/decorators';
import { HenryVoiceGateway } from './henry-voice-gateway.service';
import { VoiceConfig, voiceMaxAudioSizeFromEnv } from './voice-config';

const auditContext = (request: any) => ({ actorUserId: request.auth?.user?.id, ipAddress: request.ip, userAgent: request.headers['user-agent'] });
const parseContext = (raw: unknown) => {
  if (!raw) return undefined;
  try { return JSON.parse(String(raw)); } catch { throw new BadRequestException('PageContext inválido'); }
};
const voiceUploadLimits = { files: 1, fileSize: voiceMaxAudioSizeFromEnv() };

@Controller('henry')
export class VoiceController {
  constructor(private readonly voice: HenryVoiceGateway, private readonly config: VoiceConfig) {}

  @Post('conversations/:id/voice/turns')
  @Public()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('audio', { limits: voiceUploadLimits }))
  async publicTurn(@Param('id', ParseUUIDPipe) id: string, @Headers('x-henry-token') token: string | undefined, @UploadedFile() audio: any, @Body() body: any, @Req() request: any) {
    if (!audio?.buffer) throw new BadRequestException('Audio requerido');
    return this.voice.turn({ publicId: id, token, audio, durationMs: body.durationMs ? Number(body.durationMs) : undefined, pageContext: parseContext(body.pageContext), audit: auditContext(request) });
  }

  @Post('internal/conversations/:id/voice/turns')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('audio', { limits: voiceUploadLimits }))
  async internalTurn(@Param('id', ParseUUIDPipe) id: string, @Headers('x-henry-token') token: string | undefined, @UploadedFile() audio: any, @Body() body: any, @Req() request: any) {
    if (!audio?.buffer) throw new BadRequestException('Audio requerido');
    return this.voice.turn({ publicId: id, token, audio, durationMs: body.durationMs ? Number(body.durationMs) : undefined, pageContext: parseContext(body.pageContext), actor: request.auth.user, audit: auditContext(request) });
  }

  @Post('conversations/:id/voice/speech')
  @Public()
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  publicSpeech(@Param('id', ParseUUIDPipe) id: string, @Headers('x-henry-token') token: string | undefined, @Body() body: any, @Req() request: any, @Res() response: Response) {
    return this.streamSpeech({ id, token, body, request, response });
  }

  @Post('internal/conversations/:id/voice/speech')
  @Throttle({ default: { limit: 24, ttl: 60_000 } })
  internalSpeech(@Param('id', ParseUUIDPipe) id: string, @Headers('x-henry-token') token: string | undefined, @Body() body: any, @Req() request: any, @Res() response: Response) {
    return this.streamSpeech({ id, token, body, request, response, actor: request.auth.user });
  }

  private async streamSpeech(input: { id: string; token?: string; body: any; request: any; response: Response; actor?: any }) {
    if (!input.body?.messageId || !input.body?.voiceSessionId) throw new BadRequestException('messageId y voiceSessionId son obligatorios');
    const controller = new AbortController();
    input.request.on('close', () => controller.abort());
    const synthesis = await this.voice.speech({ publicId: input.id, token: input.token, messageId: input.body.messageId, voiceSessionId: input.body.voiceSessionId, actor: input.actor, detail: input.body.detail, signal: controller.signal });
    input.response.status(200).set({ 'Content-Type': synthesis.contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    const reader = synthesis.audio.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!input.response.write(Buffer.from(value))) await new Promise<void>((resolve) => input.response.once('drain', resolve));
      }
    } finally { reader.releaseLock(); input.response.end(); }
  }
}
