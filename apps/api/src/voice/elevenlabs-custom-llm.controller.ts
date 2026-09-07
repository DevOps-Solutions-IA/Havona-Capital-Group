import { Body, Controller, Headers, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { Public } from '../common/decorators';
import { ElevenLabsChatRequest, ElevenLabsCustomLlmService } from './elevenlabs-custom-llm.service';

@Controller('integrations/elevenlabs')
export class ElevenLabsCustomLlmController {
  constructor(private readonly gateway: ElevenLabsCustomLlmService) {}

  @Post('chat/completions')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async chat(@Headers('authorization') authorization: string | undefined, @Body() body: ElevenLabsChatRequest, @Req() request: any, @Res() response: Response) {
    this.gateway.authenticate(authorization);
    const result = await this.gateway.complete(body, { ipAddress: request.ip, userAgent: request.headers['user-agent'] });
    const id = `chatcmpl-${result.conversationId}`;
    const chunk = { id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: typeof body.model === 'string' ? body.model : 'henry-core', choices: [{ index: 0, delta: { role: 'assistant', content: result.content }, finish_reason: 'stop' }] };
    response.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'X-Havona-Stream-Mode': 'policy-buffered' });
    response.write(`data: ${JSON.stringify(chunk)}\n\n`);
    response.end('data: [DONE]\n\n');
  }
}
