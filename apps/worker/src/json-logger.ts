import { LoggerService } from '@nestjs/common';
import { redactSensitiveValues } from '@havona/shared';

type Level = 'error' | 'warn' | 'info' | 'debug' | 'trace';

export class JsonLogger implements LoggerService {
  private write(level: Level, message: unknown, context?: string, extra?: unknown): void {
    const record = redactSensitiveValues({
      timestamp: new Date().toISOString(),
      level,
      service: 'worker',
      context,
      message: typeof message === 'string' ? message : undefined,
      data: typeof message === 'string' ? extra : message,
    });
    const output = JSON.stringify(record);
    if (level === 'error') process.stderr.write(`${output}\n`);
    else process.stdout.write(`${output}\n`);
  }
  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }
  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', message, context, trace);
  }
  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }
  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }
  verbose(message: unknown, context?: string): void {
    this.write('trace', message, context);
  }
}
