import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { VoiceProviderError } from '../voice/voice-provider';

const voiceStatus = (code: string) => code === 'VOICE_AUTH_FAILED' ? 401
  : code === 'VOICE_RATE_LIMITED' ? 429
    : ['VOICE_AUDIO_INVALID', 'VOICE_AUDIO_TOO_LARGE', 'VOICE_AUDIO_TOO_LONG'].includes(code) ? 400
      : code === 'VOICE_CONFIGURATION_REQUIRED' ? 503
        : code === 'VOICE_TIMEOUT' ? 504 : 502;

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const request = host.switchToHttp().getRequest();
    const status = error instanceof VoiceProviderError ? voiceStatus(error.code) : error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const detail = error instanceof VoiceProviderError ? { code: error.code, message: error.message } : error instanceof HttpException ? error.getResponse() : 'Error interno';
    if (status >= 500) console.error(JSON.stringify({ level: 'error', event: 'request_failed', method: request.method, path: request.url, errorCode: error instanceof VoiceProviderError ? error.code : 'INTERNAL_ERROR' }));
    response.status(status).json({ statusCode: status, path: request.url, timestamp: new Date().toISOString(), error: detail });
  }
}
