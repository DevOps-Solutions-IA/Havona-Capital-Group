import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AIConfig } from './ai/ai-config';
import { AI_PROVIDER } from './ai/ai-provider';
import { OpenRouterProvider } from './ai/openrouter.provider';
import { AuditController } from './audit/audit.controller';
import { AuditService } from './audit/audit.service';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { DashboardController } from './common/dashboard.controller';
import { PrismaService } from './common/prisma.service';
import { CrmController } from './crm/crm.controller';
import { CrmService } from './crm/crm.service';
import { HealthController } from './health/health.controller';
import { HenryController } from './henry/henry.controller';
import { HenryService } from './henry/henry.service';
import { HenryToolsService } from './henry/henry-tools.service';
import { HenryContextService } from './henry/henry-context.service';
import { HenryExpertCopilotService } from './henry/henry-expert-copilot.service';
import { HenryPolicyComposer } from './henry/policies/henry-policy-composer.service';
import { HenryPolicyEngine } from './henry/policies/henry-policy-engine.service';
import { HENRY_POLICY_PROVIDERS } from './henry/policies/henry-policies';
import { ProspectsController } from './prospects/prospects.controller';
import { ProspectsService } from './prospects/prospects.service';
import { SettingsController } from './settings/settings.controller';
import { RolesController, UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';
import { ElevenLabsProvider } from './voice/elevenlabs.provider';
import { HenryVoiceFormatter } from './voice/henry-voice-formatter';
import { HenryVoiceGateway } from './voice/henry-voice-gateway.service';
import { VoiceConfig } from './voice/voice-config';
import { VoiceController } from './voice/voice.controller';
import { VoiceSessionService } from './voice/voice-session.service';
import { VOICE_STT_PROVIDER, VOICE_TTS_PROVIDER } from './voice/voice-provider';
import { ElevenLabsCustomLlmController } from './voice/elevenlabs-custom-llm.controller';
import { ElevenLabsCustomLlmService } from './voice/elevenlabs-custom-llm.service';
import { CalendarController } from './calendar/calendar.controller';
import { CalendarConfig } from './calendar/calendar-config';
import { CalendarService } from './calendar/calendar.service';
import { CalendarAccessService } from './calendar/calendar-access.service';
import { GoogleCalendarProvider } from './calendar/google-calendar.provider';
import { CALENDAR_PROVIDER } from './calendar/calendar.types';
import { CalendarTokenVault } from './calendar/token-vault.service';
import { MeetingController } from './meetings/meeting.controller';
import { MeetingService } from './meetings/meeting.service';
import { MeetingConfig } from './meetings/meeting-config';
import { JitsiMeetingProvider } from './meetings/jitsi-meeting.provider';
import { MEETING_PROVIDER } from './meetings/meeting.types';
import { CommunicationsController } from './communications/communications.controller';
import { CommunicationsConfig } from './communications/communications-config';
import { CommunicationsQueueService } from './communications/communications-queue.service';
import { CommunicationsService } from './communications/communications.service';
import { MetaWhatsAppProvider } from './communications/meta-whatsapp.provider';
import { ResendEmailProvider } from './communications/resend-email.provider';
import { EMAIL_PROVIDER, MESSAGING_PROVIDER } from './communications/communications.types';
import { AutomationController } from './automations/automation.controller';
import { AutomationQueueService } from './automations/automation-queue.service';
import { AutomationService } from './automations/automation.service';
import { AutomationProcessorService } from './automations/automation-processor.service';
import { AutomationEventBus } from './automations/automation-event-bus.service';
import { AnalyticsController } from './analytics/analytics.controller';
import { AnalyticsService } from './analytics/analytics.service';
import { KnowledgeController } from './knowledge/knowledge.controller';
import { HenryMemoryController } from './knowledge/memory.controller';
import { KnowledgeService } from './knowledge/knowledge.service';
import { ConfiguredOcrProvider, DocumentExtractor } from './knowledge/document-extraction.service';
import { RagOrchestratorService } from './knowledge/rag-orchestrator.service';
import { KnowledgeQueueService } from './knowledge/knowledge-queue.service';
import { KnowledgeProcessorService } from './knowledge/knowledge-processor.service';
import {
  ConfiguredEmbeddingProvider,
  ConfiguredMalwareScanner,
  EMBEDDING_PROVIDER,
  KnowledgeStorageConfig,
  MALWARE_SCANNER,
  PersistentFilesystemStorageProvider,
  STORAGE_PROVIDER,
} from './knowledge/knowledge.providers';
import { MemoryPolicy } from './knowledge/memory-policy.service';
import { HenryMemoryService } from './knowledge/memory.service';
import { TrainingController } from './training/training.controller';
import { TrainingService } from './training/training.service';
import { HenryContextAssembler } from './henry/henry-context-assembler.service';
import { EmailTemplateController } from './email-templates/email-template.controller';
import { EmailTemplateService } from './email-templates/email-template.service';
import { EmailTemplateRenderer } from './email-templates/email-template.renderer';
import { HenryMessagingOperatorService } from './henry/henry-messaging-operator.service';
import { CadenceController } from './cadences/cadence.controller';
import { CadenceService } from './cadences/cadence.service';
import { HenryPaligConsultativeService } from './henry/henry-palig-consultative.service';
import { HenryCommercialBehaviorService } from './henry/henry-commercial-behavior.service';
import { KnowledgeStagingService } from './knowledge/knowledge-staging.service';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { ttl: 60_000, limit: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 100) },
    ]),
  ],
  controllers: [
    AuthController,
    UsersController,
    RolesController,
    SettingsController,
    AuditController,
    HealthController,
    DashboardController,
    ProspectsController,
    CrmController,
    HenryController,
    VoiceController,
    ElevenLabsCustomLlmController,
    CalendarController,
    MeetingController,
    CommunicationsController,
    AutomationController,
    AnalyticsController,
    KnowledgeController,
    HenryMemoryController,
    TrainingController,
    EmailTemplateController,
    CadenceController,
  ],
  providers: [
    PrismaService,
    AuthService,
    AuditService,
    UsersService,
    ProspectsService,
    CrmService,
    AIConfig,
    OpenRouterProvider,
    { provide: AI_PROVIDER, useExisting: OpenRouterProvider },
    HenryContextService,
    HenryExpertCopilotService,
    HenryPaligConsultativeService,
    HenryCommercialBehaviorService,
    ...HENRY_POLICY_PROVIDERS,
    HenryPolicyComposer,
    HenryPolicyEngine,
    HenryService,
    VoiceConfig,
    ElevenLabsProvider,
    { provide: VOICE_STT_PROVIDER, useExisting: ElevenLabsProvider },
    { provide: VOICE_TTS_PROVIDER, useExisting: ElevenLabsProvider },
    HenryVoiceFormatter,
    VoiceSessionService,
    HenryVoiceGateway,
    ElevenLabsCustomLlmService,
    CalendarConfig,
    CalendarAccessService,
    CalendarTokenVault,
    GoogleCalendarProvider,
    { provide: CALENDAR_PROVIDER, useExisting: GoogleCalendarProvider },
    CalendarService,
    MeetingConfig,
    JitsiMeetingProvider,
    { provide: MEETING_PROVIDER, useExisting: JitsiMeetingProvider },
    MeetingService,
    CommunicationsConfig,
    CommunicationsQueueService,
    MetaWhatsAppProvider,
    ResendEmailProvider,
    { provide: MESSAGING_PROVIDER, useExisting: MetaWhatsAppProvider },
    { provide: EMAIL_PROVIDER, useExisting: ResendEmailProvider },
    CommunicationsService,
    AutomationQueueService,
    AutomationEventBus,
    AutomationService,
    AutomationProcessorService,
    AnalyticsService,
    { provide: KnowledgeStorageConfig, useFactory: () => new KnowledgeStorageConfig(process.env) },
    PersistentFilesystemStorageProvider,
    {
      provide: ConfiguredMalwareScanner,
      useFactory: () => new ConfiguredMalwareScanner(process.env),
    },
    { provide: ConfiguredOcrProvider, useFactory: () => new ConfiguredOcrProvider(process.env) },
    DocumentExtractor,
    ConfiguredEmbeddingProvider,
    { provide: STORAGE_PROVIDER, useExisting: PersistentFilesystemStorageProvider },
    { provide: MALWARE_SCANNER, useExisting: ConfiguredMalwareScanner },
    { provide: EMBEDDING_PROVIDER, useExisting: ConfiguredEmbeddingProvider },
    MemoryPolicy,
    HenryMemoryService,
    KnowledgeService,
    KnowledgeStagingService,
    KnowledgeQueueService,
    KnowledgeProcessorService,
    RagOrchestratorService,
    TrainingService,
    HenryContextAssembler,
    EmailTemplateRenderer,
    EmailTemplateService,
    HenryMessagingOperatorService,
    CadenceService,
    HenryToolsService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
