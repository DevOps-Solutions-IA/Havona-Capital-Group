import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { JsonLogger } from './json-logger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: new JsonLogger(),
  });
  app.enableShutdownHooks();
}

void bootstrap().catch((error: unknown) => {
  new JsonLogger().error(error, undefined, 'Bootstrap');
  process.exitCode = 1;
});
