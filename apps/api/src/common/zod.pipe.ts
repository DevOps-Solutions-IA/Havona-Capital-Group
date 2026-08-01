import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';
@Injectable()
export class ZodPipe implements PipeTransform { constructor(private readonly schema: ZodType) {} transform(value: unknown) { const result=this.schema.safeParse(value); if(!result.success) throw new BadRequestException({code:'VALIDATION_ERROR',errors:result.error.flatten()}); return result.data; } }
