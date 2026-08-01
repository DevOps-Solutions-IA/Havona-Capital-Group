import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@havona/database';
import { PrismaService } from '../common/prisma.service';
export type AuditContext={actorUserId?:string;ipAddress?:string;userAgent?:string};
@Injectable() export class AuditService { constructor(private readonly db:PrismaService){} record(action:string,resource:string,resourceId:string|undefined,context:AuditContext,metadata?:Prisma.InputJsonValue,client:PrismaClient|Prisma.TransactionClient=this.db){ return client.auditLog.create({data:{action,resource,resourceId,actorUserId:context.actorUserId,ipAddress:context.ipAddress,userAgent:context.userAgent,metadata}}); } }
