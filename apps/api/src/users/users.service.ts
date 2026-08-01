import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashPassword } from '@havona/auth';
import { Prisma } from '@havona/database';
import { AuditContext } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';

const userView = {
  id: true,
  email: true,
  name: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  roles: { select: { role: { select: { id: true, name: true } } } },
} as const;

function presentUser<T extends { roles: Array<{ role: unknown }> }>(user: T) {
  return { ...user, roles: user.roles.map(({ role }) => role) };
}

@Injectable()
export class UsersService {
  constructor(private readonly db: PrismaService) {}

  async list(page: number, pageSize: number) {
    const [rows, total] = await this.db.$transaction([
      this.db.user.findMany({
        select: userView,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.db.user.count(),
    ]);
    return { data: rows.map(presentUser), meta: { page, pageSize, total } };
  }

  async get(id: string) {
    const user = await this.db.user.findUnique({ where: { id }, select: userView });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return presentUser(user);
  }

  async create(input: any, ctx: AuditContext) {
    const passwordHash = await hashPassword(input.password);
    try {
      const user = await this.db.$transaction(async (tx) => {
        const roles = await tx.role.findMany({ where: { id: { in: input.roleIds } } });
        if (roles.length !== new Set(input.roleIds).size) {
          throw new BadRequestException('Uno o más roles no existen');
        }
        const created = await tx.user.create({
          data: {
            email: input.email,
            name: input.name,
            passwordHash,
            roles: { create: roles.map((role) => ({ roleId: role.id })) },
          },
          select: userView,
        });
        await tx.auditLog.create({
          data: {
            action: 'USER_CREATED',
            resource: 'User',
            resourceId: created.id,
            actorUserId: ctx.actorUserId,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
            metadata: { roles: roles.map((role) => role.name) },
          },
        });
        return created;
      });
      return presentUser(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('El correo ya está registrado');
      }
      throw error;
    }
  }

  async update(id: string, input: any, ctx: AuditContext) {
    await this.get(id);
    try {
      const user = await this.db.$transaction(async (tx) => {
        const updated = await tx.user.update({ where: { id }, data: input, select: userView });
        await tx.auditLog.create({
          data: {
            action: 'USER_UPDATED',
            resource: 'User',
            resourceId: id,
            actorUserId: ctx.actorUserId,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
            metadata: { fields: Object.keys(input) },
          },
        });
        return updated;
      });
      return presentUser(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('El correo ya está registrado');
      }
      throw error;
    }
  }

  async status(id: string, isActive: boolean, ctx: AuditContext) {
    if (id === ctx.actorUserId && !isActive) {
      throw new BadRequestException('No puede desactivar su propia cuenta');
    }
    await this.get(id);
    const user = await this.db.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id }, data: { isActive }, select: userView });
      if (!isActive) {
        await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await tx.auditLog.create({
        data: {
          action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
          resource: 'User',
          resourceId: id,
          actorUserId: ctx.actorUserId,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        },
      });
      return updated;
    });
    return presentUser(user);
  }

  async roles(id: string, roleIds: string[], ctx: AuditContext) {
    if (id === ctx.actorUserId) {
      const names = await this.db.role.findMany({ where: { id: { in: roleIds } }, select: { name: true } });
      if (!names.some((role) => role.name === 'SUPER_ADMIN')) {
        throw new BadRequestException('No puede retirar su propio rol SUPER_ADMIN');
      }
    }
    await this.get(id);
    const user = await this.db.$transaction(async (tx) => {
      const roles = await tx.role.findMany({ where: { id: { in: roleIds } } });
      if (roles.length !== new Set(roleIds).size) {
        throw new BadRequestException('Uno o más roles no existen');
      }
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({ data: roles.map((role) => ({ userId: id, roleId: role.id })) });
      await tx.auditLog.create({
        data: {
          action: 'USER_ROLES_CHANGED',
          resource: 'User',
          resourceId: id,
          actorUserId: ctx.actorUserId,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          metadata: { roles: roles.map((role) => role.name) },
        },
      });
      return tx.user.findUniqueOrThrow({ where: { id }, select: userView });
    });
    return presentUser(user);
  }

  async resetPassword(id: string, password: string, ctx: AuditContext) {
    await this.get(id);
    const passwordHash = await hashPassword(password);
    await this.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      });
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          action: 'USER_PASSWORD_RESET_BY_ADMIN',
          resource: 'User',
          resourceId: id,
          actorUserId: ctx.actorUserId,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        },
      });
    });
  }

  async rolesCatalog() {
    const roles = await this.db.role.findMany({
      orderBy: { name: 'asc' },
      include: { permissions: { select: { permission: true } } },
    });
    return roles.map((role) => ({
      ...role,
      permissions: role.permissions.map(({ permission }) => permission),
    }));
  }
}
