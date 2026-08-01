import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import Redis from 'ioredis';
import request from 'supertest';
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
    await request(app.getHttpServer()).get('/health/ready').expect(200).expect({
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
});
