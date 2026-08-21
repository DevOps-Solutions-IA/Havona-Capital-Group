import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CalendarConfig } from './calendar/calendar-config';
import { CommunicationsConfig } from './communications/communications-config';
import { MeetingConfig } from './meetings/meeting-config';
import { VoiceConfig } from './voice/voice-config';

describe('provider production configuration', () => {
  const originalEnvironment = { ...process.env };

  beforeEach(() => {
    process.env = { NODE_ENV: 'test' };
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it('Google Calendar falla cerrado sin credenciales y acepta configuración completa', () => {
    process.env.GOOGLE_CALENDAR_ENABLED = 'true';
    expect(() => new CalendarConfig().assertConfigured()).toThrow(
      'CALENDAR_CONFIGURATION_REQUIRED',
    );

    Object.assign(process.env, {
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY: 'test-encryption-key',
    });
    const configured = new CalendarConfig();
    expect(() => configured.assertConfigured()).not.toThrow();
    expect(configured.allowMeet).toBe(false);
  });

  it('Jitsi falla cerrado sin endpoint y exige secreto cuando JWT está habilitado', () => {
    process.env.JITSI_ENABLED = 'true';
    expect(() => new MeetingConfig().assertConfigured()).toThrow(
      expect.objectContaining({ code: 'MEETING_CONFIGURATION_REQUIRED' }),
    );

    Object.assign(process.env, {
      MEETING_PROVIDER: 'jitsi',
      JITSI_BASE_URL: 'https://meet.test.invalid',
      JITSI_DOMAIN: 'meet.test.invalid',
      JITSI_APP_ID: 'test-app-id',
      JITSI_JWT_ENABLED: 'true',
    });
    expect(() => new MeetingConfig().assertConfigured()).toThrow(
      expect.objectContaining({ code: 'MEETING_CONFIGURATION_REQUIRED' }),
    );

    process.env.JITSI_APP_SECRET = 'test-app-secret';
    expect(() => new MeetingConfig().assertConfigured()).not.toThrow();
  });

  it('Meta no se declara configurado sin token y secretos de webhook', () => {
    Object.assign(process.env, {
      META_WHATSAPP_ENABLED: 'true',
      META_WHATSAPP_PHONE_NUMBER_ID: 'test-phone-id',
    });
    expect(new CommunicationsConfig().status().whatsapp.configured).toBe(false);
  });

  it('Resend no se declara configurado con remitente no autorizado', () => {
    Object.assign(process.env, {
      EMAIL_PROVIDER: 'resend',
      RESEND_ENABLED: 'true',
      RESEND_API_KEY: 'test-api-key',
      RESEND_FROM_EMAIL: 'sender@unauthorized.test',
    });
    expect(new CommunicationsConfig().status().email.configured).toBe(false);
  });

  it('ElevenLabs separa configuración STT y TTS', () => {
    Object.assign(process.env, {
      VOICE_PROVIDER: 'elevenlabs',
      ELEVENLABS_API_KEY: 'test-api-key',
      ELEVENLABS_STT_MODEL: 'test-stt-model',
      ELEVENLABS_TTS_MODEL: 'test-tts-model',
    });
    const sttOnly = new VoiceConfig();
    expect(sttOnly.sttConfigured()).toBe(true);
    expect(sttOnly.ttsConfigured()).toBe(false);

    process.env.ELEVENLABS_VOICE_ID = 'test-voice-id';
    const sttAndTts = new VoiceConfig();
    expect(sttAndTts.sttConfigured()).toBe(true);
    expect(sttAndTts.ttsConfigured()).toBe(true);
  });

  it('Compose propaga nombres esperados con privilegio mínimo', () => {
    const compose = readFileSync(resolve(__dirname, '../../..', 'docker-compose.yml'), 'utf8');
    const api = compose.slice(compose.indexOf('\n  api:'), compose.indexOf('\n  worker:'));
    const worker = compose.slice(compose.indexOf('\n  worker:'), compose.indexOf('\n  web:'));
    const web = compose.slice(compose.indexOf('\n  web:'), compose.indexOf('\n  api-dev:'));

    const apiVariables = [
      'GOOGLE_CALENDAR_ENABLED',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GOOGLE_CALENDAR_REDIRECT_URI',
      'GOOGLE_CALENDAR_SCOPES',
      'GOOGLE_CALENDAR_DEFAULT_TIMEZONE',
      'GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY',
      'GOOGLE_CALENDAR_WEBHOOK_SECRET',
      'GOOGLE_CALENDAR_WEBHOOK_URL',
      'GOOGLE_CALENDAR_BASE_URL',
      'GOOGLE_CALENDAR_ALLOW_GOOGLE_MEET',
      'GOOGLE_CALENDAR_REQUEST_TIMEOUT_MS',
      'MEETING_PROVIDER',
      'JITSI_ENABLED',
      'JITSI_BASE_URL',
      'JITSI_DOMAIN',
      'JITSI_APP_ID',
      'JITSI_APP_SECRET',
      'JITSI_JWT_ENABLED',
      'JITSI_TOKEN_TTL_SECONDS',
      'JITSI_GUEST_TOKEN_TTL_SECONDS',
      'JITSI_MEETING_PREFIX',
      'JITSI_REQUEST_TIMEOUT_MS',
      'JITSI_WEBHOOK_SECRET',
      'WHATSAPP_PROVIDER',
      'META_WHATSAPP_ENABLED',
      'META_WHATSAPP_API_VERSION',
      'META_WHATSAPP_PHONE_NUMBER_ID',
      'META_WHATSAPP_BUSINESS_ACCOUNT_ID',
      'META_WHATSAPP_ACCESS_TOKEN',
      'META_WHATSAPP_APP_SECRET',
      'META_WHATSAPP_VERIFY_TOKEN',
      'META_WHATSAPP_BASE_URL',
      'META_WHATSAPP_WEBHOOK_URL',
      'META_WHATSAPP_REQUEST_TIMEOUT_MS',
      'EMAIL_PROVIDER',
      'RESEND_ENABLED',
      'RESEND_API_KEY',
      'RESEND_FROM_EMAIL',
      'RESEND_FROM_NAME',
      'RESEND_REPLY_TO',
      'RESEND_WEBHOOK_SECRET',
      'RESEND_WEBHOOK_URL',
      'RESEND_REQUEST_TIMEOUT_MS',
      'VOICE_PROVIDER',
      'ELEVENLABS_API_KEY',
      'ELEVENLABS_VOICE_ID',
      'ELEVENLABS_TTS_MODEL',
      'ELEVENLABS_STT_MODEL',
      'ELEVENLABS_BASE_URL',
      'ELEVENLABS_HENRY_GATEWAY_SECRET',
      'VOICE_MAX_AUDIO_SIZE',
      'VOICE_MAX_DURATION_SECONDS',
      'VOICE_REQUEST_TIMEOUT_MS',
      'VOICE_STREAMING_ENABLED',
      'VOICE_AUDIO_RETENTION_ENABLED',
    ];
    for (const variable of apiVariables) expect(api).toContain(`${variable}: \${${variable}`);

    const workerVariables = [
      'META_WHATSAPP_ENABLED',
      'META_WHATSAPP_API_VERSION',
      'META_WHATSAPP_PHONE_NUMBER_ID',
      'META_WHATSAPP_ACCESS_TOKEN',
      'META_WHATSAPP_BASE_URL',
      'META_WHATSAPP_REQUEST_TIMEOUT_MS',
      'RESEND_ENABLED',
      'RESEND_API_KEY',
      'RESEND_FROM_EMAIL',
      'RESEND_FROM_NAME',
      'RESEND_REPLY_TO',
      'RESEND_REQUEST_TIMEOUT_MS',
    ];
    for (const variable of workerVariables) expect(worker).toContain(`${variable}: \${${variable}`);

    for (const secret of [
      'GOOGLE_CLIENT_SECRET',
      'JITSI_APP_SECRET',
      'META_WHATSAPP_APP_SECRET',
      'META_WHATSAPP_VERIFY_TOKEN',
      'RESEND_WEBHOOK_SECRET',
      'ELEVENLABS_API_KEY',
      'ELEVENLABS_HENRY_GATEWAY_SECRET',
    ]) {
      expect(worker).not.toContain(`${secret}:`);
      expect(web).not.toContain(`${secret}:`);
    }
    expect(api).toContain(
      'GOOGLE_CALENDAR_ALLOW_GOOGLE_MEET: ${GOOGLE_CALENDAR_ALLOW_GOOGLE_MEET:-false}',
    );
  });
});
