import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@havona/database';
import { AuditContext, AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';

export type CalendarActor = { id: string; roles?: string[]; permissions: string[] };
export type CalendarRelations = {
  prospectId?: string;
  companyId?: string;
  opportunityId?: string;
  conversationId?: string;
};

@Injectable()
export class CalendarAccessService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async assertUserScope(actor: CalendarActor, userId: string) {
    if (userId === actor.id) return;
    if (!actor.permissions.includes('calendar.manage_team'))
      throw new ForbiddenException('Agenda fuera de su ámbito');
    if (this.isAdministrator(actor)) {
      if (!(await this.eligibleCalendarUser(userId)))
        throw new NotFoundException('Usuario de agenda no encontrado');
      return;
    }
    const membership = await this.db.calendarTeamMembership.findUnique({
      where: { managerId_memberId: { managerId: actor.id, memberId: userId } },
      select: { id: true },
    });
    if (!membership) throw new ForbiddenException('Agenda fuera del equipo autorizado');
  }

  async teamMembers(actor: CalendarActor) {
    if (!actor.permissions.includes('calendar.manage_team'))
      throw new ForbiddenException('Permiso de agenda de equipo requerido');
    const where: Prisma.UserWhereInput = this.isAdministrator(actor)
      ? { isActive: true, roles: { some: { role: { name: 'CONSULTOR' } } } }
      : {
          isActive: true,
          roles: { some: { role: { name: 'CONSULTOR' } } },
          calendarTeamManagers: { some: { managerId: actor.id } },
        };
    return this.db.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        calendarConnections: { where: { status: 'ACTIVE' }, select: { id: true }, take: 1 },
      },
      orderBy: { name: 'asc' },
    });
  }

  async assignTeamMember(
    actor: CalendarActor,
    managerId: string,
    memberId: string,
    ctx: AuditContext,
  ) {
    this.assertCanDefineTeam(actor);
    if (managerId === memberId)
      throw new BadRequestException('Un gerente no puede ser miembro de su propio equipo');
    const [manager, member] = await Promise.all([
      this.db.user.findFirst({
        where: { id: managerId, isActive: true, roles: { some: { role: { name: 'GERENTE' } } } },
        select: { id: true },
      }),
      this.db.user.findFirst({
        where: { id: memberId, isActive: true, roles: { some: { role: { name: 'CONSULTOR' } } } },
        select: { id: true },
      }),
    ]);
    if (!manager || !member) throw new BadRequestException('Gerente o consultor no válido');
    const membership = await this.db.calendarTeamMembership.upsert({
      where: { managerId_memberId: { managerId, memberId } },
      update: {},
      create: { managerId, memberId, createdById: actor.id },
    });
    await this.audit.record(
      'CALENDAR_TEAM_MEMBER_ASSIGNED',
      'CalendarTeamMembership',
      membership.id,
      ctx,
      { managerId, memberId },
    );
    return { id: membership.id, managerId, memberId };
  }

  async removeTeamMember(
    actor: CalendarActor,
    managerId: string,
    memberId: string,
    ctx: AuditContext,
  ) {
    this.assertCanDefineTeam(actor);
    const membership = await this.db.calendarTeamMembership.findUnique({
      where: { managerId_memberId: { managerId, memberId } },
    });
    if (!membership) throw new NotFoundException('Asignación de equipo no encontrada');
    await this.db.calendarTeamMembership.delete({ where: { id: membership.id } });
    await this.audit.record(
      'CALENDAR_TEAM_MEMBER_REMOVED',
      'CalendarTeamMembership',
      membership.id,
      ctx,
      { managerId, memberId },
    );
    return { removed: true };
  }

  async authorizeRelations(actor: CalendarActor, input: CalendarRelations) {
    if (!input.prospectId && !input.companyId && !input.opportunityId && !input.conversationId)
      return;
    const prospectScope: Prisma.ProspectWhereInput = this.crmGlobal(actor)
      ? {}
      : { assignments: { some: { assigneeId: actor.id, endedAt: null } } };
    const [prospect, company, opportunity, conversation] = await Promise.all([
      input.prospectId
        ? this.db.prospect.findFirst({
            where: { id: input.prospectId, ...prospectScope },
            select: { id: true },
          })
        : null,
      input.companyId
        ? this.db.company.findFirst({
            where: this.crmGlobal(actor)
              ? { id: input.companyId }
              : { id: input.companyId, contacts: { some: { prospect: prospectScope } } },
            select: { id: true },
          })
        : null,
      input.opportunityId
        ? this.db.opportunity.findFirst({
            where: { id: input.opportunityId, prospect: prospectScope },
            select: { id: true, prospectId: true },
          })
        : null,
      input.conversationId
        ? this.db.conversation.findFirst({
            where: this.henryGlobal(actor)
              ? { id: input.conversationId }
              : {
                  id: input.conversationId,
                  OR: [
                    { participants: { some: { userId: actor.id } } },
                    { prospect: prospectScope },
                  ],
                },
            select: { id: true, prospectId: true },
          })
        : null,
    ]);
    if (
      (input.prospectId && !prospect) ||
      (input.companyId && !company) ||
      (input.opportunityId && !opportunity) ||
      (input.conversationId && !conversation)
    ) {
      throw new ForbiddenException('La relación CRM está fuera de su ámbito');
    }
    const canonicalProspectId =
      input.prospectId ?? opportunity?.prospectId ?? conversation?.prospectId ?? undefined;
    if (input.prospectId && opportunity && opportunity.prospectId !== input.prospectId)
      throw new BadRequestException('La oportunidad no pertenece al prospecto indicado');
    if (
      canonicalProspectId &&
      conversation?.prospectId &&
      conversation.prospectId !== canonicalProspectId
    )
      throw new BadRequestException('La conversación no pertenece al prospecto indicado');
    if (input.companyId && canonicalProspectId) {
      const contact = await this.db.companyContact.findUnique({
        where: {
          companyId_prospectId: { companyId: input.companyId, prospectId: canonicalProspectId },
        },
        select: { companyId: true },
      });
      if (!contact)
        throw new BadRequestException('La empresa no está relacionada con el prospecto indicado');
    }
  }

  async resolveAssignedConsultant(
    actor: CalendarActor,
    consultantId: string | undefined,
    calendarOwnerId: string,
  ) {
    if (!consultantId) {
      const owner = await this.db.user.findFirst({
        where: {
          id: calendarOwnerId,
          isActive: true,
          roles: { some: { role: { name: 'CONSULTOR' } } },
        },
        select: { id: true },
      });
      return owner?.id;
    }
    await this.assertUserScope(actor, consultantId);
    const consultant = await this.db.user.findFirst({
      where: { id: consultantId, isActive: true, roles: { some: { role: { name: 'CONSULTOR' } } } },
      select: { id: true },
    });
    if (!consultant) throw new BadRequestException('Consultor asignado inválido o inactivo');
    if (calendarOwnerId !== consultantId && !actor.permissions.includes('calendar.manage_team'))
      throw new ForbiddenException('No puede asignar una cita a otro consultor');
    return consultantId;
  }

  private assertCanDefineTeam(actor: CalendarActor) {
    if (
      !this.isAdministrator(actor) ||
      !actor.permissions.includes('calendar.manage_team') ||
      !actor.permissions.includes('users.update')
    ) {
      throw new ForbiddenException('Solo administración puede definir el ámbito de agenda');
    }
  }
  private isAdministrator(actor: CalendarActor) {
    return Boolean(actor.roles?.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN'));
  }
  private crmGlobal(actor: CalendarActor) {
    return actor.permissions.includes('crm.read_all') || this.isAdministrator(actor);
  }
  private henryGlobal(actor: CalendarActor) {
    return actor.permissions.includes('henry.read_all') || this.isAdministrator(actor);
  }
  private eligibleCalendarUser(id: string) {
    return this.db.user.findFirst({
      where: {
        id,
        isActive: true,
        roles: {
          some: { role: { name: { in: ['CONSULTOR', 'GERENTE', 'ADMIN', 'SUPER_ADMIN'] } } },
        },
      },
      select: { id: true },
    });
  }
}
