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
import { HenryPolicyComposer } from './henry/policies/henry-policy-composer.service';
import { HenryPolicyEngine } from './henry/policies/henry-policy-engine.service';
import { HENRY_POLICY_PROVIDERS } from './henry/policies/henry-policies';
import { ProspectsController } from './prospects/prospects.controller';
import { ProspectsService } from './prospects/prospects.service';
import { SettingsController } from './settings/settings.controller';
import { RolesController, UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';

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
    HenryToolsService,
    HenryContextService,
    ...HENRY_POLICY_PROVIDERS,
    HenryPolicyComposer,
    HenryPolicyEngine,
    HenryService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
