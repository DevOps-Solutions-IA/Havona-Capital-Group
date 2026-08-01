import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import Redis from 'ioredis';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '@havona/auth';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

describe('Fase 0 (PostgreSQL + Redis)', () => {
  let app: INestApplication;
  let db: PrismaService;
  let redis: Redis;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    app.use(cookieParser());
    await app.init();
    db = app.get(PrismaService);
    redis = new Redis(process.env.REDIS_URL!, { lazyConnect: true, maxRetriesPerRequest: 1 });
    await redis.connect();
  });

  afterAll(async () => {
    await redis.quit();
    await app.close();
  });

  it('comprueba conexiones y readiness', async () => {
    await expect(db.$queryRaw`SELECT 1`).resolves.toBeDefined();
    await expect(redis.ping()).resolves.toBe('PONG');
    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect({
        status: 'ok',
        checks: { postgresql: 'up', redis: 'up' },
      });
  });

  it('autentica al SUPER_ADMIN, aplica CSRF/RBAC, crea CONSULTOR y audita', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent.post('/api/v1/auth/login').send({
      email: process.env.INITIAL_SUPER_ADMIN_EMAIL,
      password: process.env.INITIAL_SUPER_ADMIN_PASSWORD,
    });
    expect(login.status).toBe(201);
    expect(login.body.user.roles).toContain('SUPER_ADMIN');

    const cookies = login.headers['set-cookie'] as unknown as string[];
    const csrfCookie = cookies.find((cookie) => cookie.startsWith('havona_csrf='));
    expect(csrfCookie).toBeDefined();
    const csrf = decodeURIComponent(csrfCookie!.split(';')[0]!.split('=')[1]!);

    await agent
      .post('/api/v1/users')
      .send({
        email: `consultor-${Date.now()}@example.com`,
        name: 'Consultor Integración',
        password: 'Temporary-Password-2026!',
        roleIds: [(await db.role.findUniqueOrThrow({ where: { name: 'CONSULTOR' } })).id],
      })
      .expect(403);

    const created = await agent
      .post('/api/v1/users')
      .set('X-CSRF-Token', csrf)
      .send({
        email: `consultor-${Date.now()}@example.com`,
        name: 'Consultor Integración',
        password: 'Temporary-Password-2026!',
        roleIds: [(await db.role.findUniqueOrThrow({ where: { name: 'CONSULTOR' } })).id],
      })
      .expect(201);
    expect(created.body.roles).toEqual([expect.objectContaining({ name: 'CONSULTOR' })]);

    const audit = await agent.get('/api/v1/audit?action=USER_CREATED').expect(200);
    expect(audit.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resource: 'User', resourceId: created.body.id }),
      ]),
    );
  });

  it('captura un prospecto de forma idempotente y permite consulta administrativa', async () => {
    const submissionId = randomUUID();
    const email = `prospecto-${Date.now()}@example.com`;
    const payload = {
      submissionId,
      name: 'Prospecto Integración',
      phone: '+57 300 555 1212',
      email,
      city: 'Bogotá',
      source: 'organic',
      landing: 'pension',
      interest: 'pension',
      consent: { accepted: true, privacyVersion: 'v1' },
      website: '',
    };
    const first = await request(app.getHttpServer())
      .post('/api/v1/prospects/public')
      .send(payload)
      .expect(201);
    const repeated = await request(app.getHttpServer())
      .post('/api/v1/prospects/public')
      .send(payload)
      .expect(201);
    expect(repeated.body.data.id).toBe(first.body.data.id);
    expect(await db.prospect.count({ where: { normalizedEmail: email } })).toBe(1);
    expect(await db.consent.count({ where: { prospectId: first.body.data.id } })).toBe(1);
    expect(await db.leadEvent.count({ where: { submissionId } })).toBe(1);

    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/api/v1/auth/login')
      .send({
        email: process.env.INITIAL_SUPER_ADMIN_EMAIL,
        password: process.env.INITIAL_SUPER_ADMIN_PASSWORD,
      })
      .expect(201);
    const cookies = login.headers['set-cookie'] as unknown as string[];
    const csrfCookie = cookies.find((cookie) => cookie.startsWith('havona_csrf='));
    expect(csrfCookie).toBeDefined();
    await agent
      .get(`/api/v1/prospects?search=${encodeURIComponent(email)}`)
      .expect(200)
      .expect((response) =>
        expect(response.body.data).toEqual(
          expect.arrayContaining([expect.objectContaining({ id: first.body.data.id })]),
        ),
      );
    await agent
      .get(`/api/v1/prospects/${first.body.data.id}`)
      .expect(200)
      .expect((response) =>
        expect(response.body.consents[0]).toEqual(
          expect.objectContaining({ accepted: true, privacyVersion: 'v1' }),
        ),
      );
  });

  it('aplica la matriz RBAC de prospectos a ADMIN, GERENTE y CONSULTOR', async () => {
    await request(app.getHttpServer()).get('/api/v1/prospects').expect(401);
    const password = 'Role-Test-Password-2026!';
    for (const [roleName, expected] of [
      ['ADMIN', 200],
      ['GERENTE', 200],
      ['CONSULTOR', 403],
    ] as const) {
      const role = await db.role.findUniqueOrThrow({ where: { name: roleName } });
      const user = await db.user.create({
        data: {
          email: `${roleName.toLowerCase()}-${randomUUID()}@example.com`,
          name: `${roleName} Integración`,
          passwordHash: await hashPassword(password),
          roles: { create: { roleId: role.id } },
        },
      });
      const agent = request.agent(app.getHttpServer());
      await agent.post('/api/v1/auth/login').send({ email: user.email, password }).expect(201);
      await agent.get('/api/v1/prospects').expect(expected);
    }
  });

  it('opera el ciclo CRM con asignación, pipeline, RBAC, actividad y conversión', async () => {
    const password = 'Crm-Integration-Password-2026!';
    const consultantRole = await db.role.findUniqueOrThrow({ where: { name: 'CONSULTOR' } });
    const consultant = await db.user.create({
      data: {
        email: `crm-consultant-${randomUUID()}@example.com`,
        name: 'Consultor CRM',
        passwordHash: await hashPassword(password),
        roles: { create: { roleId: consultantRole.id } },
      },
    });
    const capture = async (name: string) => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/prospects/public')
        .send({
          submissionId: randomUUID(),
          name,
          phone: `+57 31${Math.floor(10000000 + Math.random() * 89999999)}`,
          city: 'Bogotá',
          source: 'organic',
          landing: 'patrimonio',
          interest: 'patrimonio',
          consent: { accepted: true, privacyVersion: 'v1' },
          website: '',
        })
        .expect(201);
      return response.body.data.id as string;
    };
    const prospectId = await capture('Relación CRM Integración');
    const secondProspectId = await capture('Relación CRM Aislada');
    const admin = request.agent(app.getHttpServer());
    const login = await admin
      .post('/api/v1/auth/login')
      .send({
        email: process.env.INITIAL_SUPER_ADMIN_EMAIL,
        password: process.env.INITIAL_SUPER_ADMIN_PASSWORD,
      })
      .expect(201);
    const csrf = decodeURIComponent(
      (login.headers['set-cookie'] as unknown as string[])
        .find((cookie) => cookie.startsWith('havona_csrf='))!
        .split(';')[0]!
        .split('=')[1]!,
    );
    await admin
      .put(`/api/v1/crm/prospects/${prospectId}/assignment`)
      .set('X-CSRF-Token', csrf)
      .send({ assigneeId: consultant.id })
      .expect(200);
    const opportunity = await admin
      .post('/api/v1/crm/opportunities')
      .set('X-CSRF-Token', csrf)
      .send({ prospectId, title: 'Estrategia patrimonial', priority: 'HIGH' })
      .expect(201);
    const otherOpportunity = await admin
      .post('/api/v1/crm/opportunities')
      .set('X-CSRF-Token', csrf)
      .send({ prospectId: secondProspectId, title: 'Oportunidad aislada', priority: 'LOW' })
      .expect(201);
    await admin
      .post('/api/v1/crm/notes')
      .set('X-CSRF-Token', csrf)
      .send({ prospectId, opportunityId: otherOpportunity.body.id, body: 'Cruce inválido' })
      .expect(422);
    await admin
      .post('/api/v1/crm/notes')
      .set('X-CSRF-Token', csrf)
      .send({ prospectId, opportunityId: opportunity.body.id, body: 'Contexto verificable' })
      .expect(201);
    await admin
      .post('/api/v1/crm/tasks')
      .set('X-CSRF-Token', csrf)
      .send({
        prospectId,
        opportunityId: opportunity.body.id,
        assigneeId: consultant.id,
        title: 'Contactar relación',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        priority: 'HIGH',
      })
      .expect(201);
    const stages = await admin.get('/api/v1/crm/stages').expect(200);
    const contacted = stages.body.find((stage: { key: string }) => stage.key === 'contacted');
    const client = stages.body.find((stage: { key: string }) => stage.key === 'client');
    await admin
      .put(`/api/v1/crm/opportunities/${opportunity.body.id}/stage`)
      .set('X-CSRF-Token', csrf)
      .send({ stageId: contacted.id })
      .expect(200);
    await admin
      .put(`/api/v1/crm/opportunities/${opportunity.body.id}/stage`)
      .set('X-CSRF-Token', csrf)
      .send({ stageId: client.id })
      .expect(200);
    expect(
      await db.opportunityStageHistory.count({ where: { opportunityId: opportunity.body.id } }),
    ).toBe(3);
    expect(await db.clientProfile.findUnique({ where: { prospectId } })).toEqual(
      expect.objectContaining({ status: 'ACTIVE' }),
    );
    expect(await db.auditLog.count({ where: { resourceId: opportunity.body.id } })).toBeGreaterThan(
      0,
    );
    await admin.get('/api/v1/crm/dashboard').expect(200);

    const own = request.agent(app.getHttpServer());
    await own.post('/api/v1/auth/login').send({ email: consultant.email, password }).expect(201);
    await own.get('/api/v1/crm/dashboard').expect(403);
    const scoped = await own.get('/api/v1/crm/prospects?page=1&pageSize=25').expect(200);
    expect(scoped.body.data.map((item: { id: string }) => item.id)).toContain(prospectId);
    expect(scoped.body.data.map((item: { id: string }) => item.id)).not.toContain(secondProspectId);
  });
});
