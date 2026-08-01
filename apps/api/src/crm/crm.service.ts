import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ActivityType, OpportunityStatus, Prisma, TaskStatus } from '@havona/database';
import { AuditContext, AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma.service';

type Actor = { id: string; permissions: string[] };
type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class CrmService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}
  private global(actor: Actor) {
    return actor.permissions.includes('crm.read_all');
  }
  private prospectScope(actor: Actor): Prisma.ProspectWhereInput {
    return this.global(actor)
      ? {}
      : { assignments: { some: { assigneeId: actor.id, endedAt: null } } };
  }
  private async prospect(id: string, actor: Actor) {
    const row = await this.db.prospect.findFirst({
      where: { id, ...this.prospectScope(actor) },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Prospecto no encontrado o no asignado');
    return row;
  }
  private async opportunity(id: string, actor: Actor) {
    const row = await this.db.opportunity.findFirst({
      where: { id, prospect: this.prospectScope(actor) },
      include: { stage: true },
    });
    if (!row) throw new NotFoundException('Oportunidad no encontrada o no asignada');
    return row;
  }
  private async eligibleUser(id: string, db: DbClient = this.db) {
    const user = await db.user.findFirst({
      where: {
        id,
        isActive: true,
        roles: {
          some: { role: { name: { in: ['SUPER_ADMIN', 'ADMIN', 'GERENTE', 'CONSULTOR'] } } },
        },
      },
      select: { id: true, name: true },
    });
    if (!user)
      throw new UnprocessableEntityException('Responsable inválido, inactivo o sin rol comercial');
    return user;
  }
  private async validateOpportunityLink(
    prospectId: string,
    opportunityId: string | undefined,
    db: DbClient,
  ) {
    if (!opportunityId) return;
    const linked = await db.opportunity.findFirst({
      where: { id: opportunityId, prospectId },
      select: { id: true },
    });
    if (!linked)
      throw new UnprocessableEntityException('La oportunidad no pertenece al prospecto indicado');
  }
  private context(request: any): AuditContext {
    return {
      actorUserId: request.auth.user.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    };
  }

  async prospects(query: any, actor: Actor) {
    const where: Prisma.ProspectWhereInput = {
      ...this.prospectScope(actor),
      interest: query.interest,
      source: query.source ? { key: query.source } : undefined,
      lastCapturedAt: {
        gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
        lte: query.dateTo ? new Date(query.dateTo) : undefined,
      },
      assignments: query.ownerId
        ? { some: { assigneeId: query.ownerId, endedAt: null } }
        : this.global(actor)
          ? undefined
          : { some: { assigneeId: actor.id, endedAt: null } },
      opportunities:
        query.stage || query.priority
          ? { some: { stage: { key: query.stage }, priority: query.priority, status: 'OPEN' } }
          : undefined,
      tags: query.tagId ? { some: { tagId: query.tagId } } : undefined,
      OR: query.search
        ? [
            { name: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
            { phone: { contains: query.search } },
            { city: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const orderBy = { [query.sortBy]: query.sortOrder } as Prisma.ProspectOrderByWithRelationInput;
    const [data, total] = await this.db.$transaction([
      this.db.prospect.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          source: { select: { key: true, name: true } },
          assignments: {
            where: { endedAt: null },
            select: { assignee: { select: { id: true, name: true, email: true } } },
          },
          tags: { include: { tag: true } },
          opportunities: {
            where: { status: 'OPEN' },
            include: { stage: true, owner: { select: { id: true, name: true } } },
            orderBy: { updatedAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.db.prospect.count({ where }),
    ]);
    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async prospect360(id: string, actor: Actor, request: any) {
    await this.prospect(id, actor);
    const row = await this.db.prospect.findUnique({
      where: { id },
      include: {
        source: true,
        consents: { orderBy: { acceptedAt: 'desc' }, take: 50 },
        events: { orderBy: { createdAt: 'desc' }, take: 50 },
        assignments: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            assignee: { select: { id: true, name: true, email: true } },
            assignedBy: { select: { id: true, name: true } },
          },
        },
        tags: { include: { tag: true } },
        opportunities: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { stage: true, owner: { select: { id: true, name: true } } },
        },
        tasks: {
          orderBy: { dueAt: 'asc' },
          take: 50,
          include: { assignee: { select: { id: true, name: true } } },
        },
        notes: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { author: { select: { id: true, name: true } } },
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: { actor: { select: { id: true, name: true } } },
        },
        interactions: {
          orderBy: { occurredAt: 'desc' },
          take: 50,
          include: { actor: { select: { id: true, name: true } } },
        },
        client: true,
        companyContacts: { include: { company: true } },
      },
    });
    await this.audit.record('CRM_PROSPECT_VIEWED', 'Prospect', id, this.context(request));
    return row;
  }

  async updateProspect(id: string, input: any, actor: Actor, request: any) {
    await this.prospect(id, actor);
    return this.db.$transaction(async (tx) => {
      const row = await tx.prospect.update({ where: { id }, data: input });
      await tx.activity.create({
        data: {
          prospectId: id,
          actorId: actor.id,
          type: ActivityType.PROSPECT_UPDATED,
          summary: 'Información comercial actualizada',
        },
      });
      await this.audit.record(
        'CRM_PROSPECT_UPDATED',
        'Prospect',
        id,
        this.context(request),
        { fields: Object.keys(input) },
        tx,
      );
      return row;
    });
  }

  async assignments(prospectId: string, actor: Actor) {
    await this.prospect(prospectId, actor);
    return this.db.assignment.findMany({
      where: { prospectId },
      orderBy: { createdAt: 'desc' },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        assignedBy: { select: { id: true, name: true } },
      },
    });
  }

  async assign(prospectId: string, assigneeId: string, actor: Actor, request: any) {
    if (!actor.permissions.includes('crm.assign'))
      throw new ForbiddenException('No puede asignar prospectos');
    await this.prospect(prospectId, actor);
    await this.eligibleUser(assigneeId);
    return this.db.$transaction(async (tx) => {
      const current = await tx.assignment.findFirst({ where: { prospectId, endedAt: null } });
      if (current?.assigneeId === assigneeId) return current;
      if (current)
        await tx.assignment.update({ where: { id: current.id }, data: { endedAt: new Date() } });
      const assignment = await tx.assignment.create({
        data: { prospectId, assigneeId, assignedById: actor.id },
      });
      await tx.opportunity.updateMany({
        where: { prospectId, status: 'OPEN' },
        data: { ownerId: assigneeId },
      });
      await tx.activity.create({
        data: {
          prospectId,
          actorId: actor.id,
          type: current ? ActivityType.REASSIGNED : ActivityType.ASSIGNED,
          summary: current ? 'Responsable comercial reasignado' : 'Responsable comercial asignado',
          metadata: { assigneeId },
        },
      });
      await this.audit.record(
        current ? 'CRM_REASSIGNED' : 'CRM_ASSIGNED',
        'Prospect',
        prospectId,
        this.context(request),
        { previousAssigneeId: current?.assigneeId, assigneeId },
        tx,
      );
      return assignment;
    });
  }

  async opportunities(query: any, actor: Actor) {
    const where: Prisma.OpportunityWhereInput = {
      prospect: this.prospectScope(actor),
      stage: query.stage ? { key: query.stage } : undefined,
      ownerId: query.ownerId,
      status: query.status,
      priority: query.priority,
    };
    const [data, total] = await this.db.$transaction([
      this.db.opportunity.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { updatedAt: 'desc' },
        include: {
          stage: true,
          prospect: { select: { id: true, name: true, interest: true, city: true } },
          owner: { select: { id: true, name: true } },
        },
      }),
      this.db.opportunity.count({ where }),
    ]);
    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }
  async stages() {
    return this.db.pipelineStage.findMany({
      where: { isActive: true },
      orderBy: { position: 'asc' },
    });
  }
  async createOpportunity(input: any, actor: Actor, request: any) {
    await this.prospect(input.prospectId, actor);
    return this.db.$transaction(async (tx) => {
      const stage = await tx.pipelineStage.findFirstOrThrow({
        where: { isActive: true },
        orderBy: { position: 'asc' },
      });
      const assignment = await tx.assignment.findFirst({
        where: { prospectId: input.prospectId, endedAt: null },
      });
      const row = await tx.opportunity.create({
        data: {
          prospectId: input.prospectId,
          stageId: stage.id,
          ownerId: assignment?.assigneeId,
          title: input.title,
          priority: input.priority,
        },
      });
      await tx.opportunityStageHistory.create({
        data: { opportunityId: row.id, newStageId: stage.id, changedById: actor.id },
      });
      await tx.activity.create({
        data: {
          prospectId: input.prospectId,
          opportunityId: row.id,
          actorId: actor.id,
          type: ActivityType.OPPORTUNITY_CREATED,
          summary: 'Oportunidad comercial creada',
        },
      });
      await this.audit.record(
        'CRM_OPPORTUNITY_CREATED',
        'Opportunity',
        row.id,
        this.context(request),
        { prospectId: input.prospectId, stageId: stage.id },
        tx,
      );
      return row;
    });
  }

  async opportunityDetail(id: string, actor: Actor) {
    await this.opportunity(id, actor);
    return this.db.opportunity.findUnique({
      where: { id },
      include: {
        stage: true,
        prospect: true,
        owner: { select: { id: true, name: true } },
        stageHistory: {
          orderBy: { createdAt: 'desc' },
          include: {
            previousStage: true,
            newStage: true,
            changedBy: { select: { id: true, name: true } },
          },
        },
      },
    });
  }
  async moveOpportunity(id: string, input: any, actor: Actor, request: any) {
    const current = await this.opportunity(id, actor);
    const target = await this.db.pipelineStage.findFirst({
      where: { id: input.stageId, isActive: true },
    });
    if (!target) throw new UnprocessableEntityException('Etapa inválida');
    let status: OpportunityStatus = OpportunityStatus.OPEN,
      closedAt: null | Date = null;
    if (target.key === 'client') {
      status = OpportunityStatus.WON;
      closedAt = new Date();
    } else if (target.key === 'closed') {
      if (!input.outcome)
        throw new UnprocessableEntityException('Debe indicar el resultado del cierre');
      status = input.outcome;
      closedAt = new Date();
    } else if (input.outcome)
      throw new UnprocessableEntityException('El resultado solo aplica al cierre');
    if (closedAt && !actor.permissions.includes('crm.close'))
      throw new ForbiddenException('No puede cerrar oportunidades');
    if (current.status !== OpportunityStatus.OPEN)
      throw new UnprocessableEntityException('Una oportunidad cerrada no puede reabrirse');
    if (current.stageId === target.id && current.status === status) return current;
    return this.db.$transaction(async (tx) => {
      const row = await tx.opportunity.update({
        where: { id },
        data: { stageId: target.id, status, closedAt },
      });
      await tx.opportunityStageHistory.create({
        data: {
          opportunityId: id,
          previousStageId: current.stageId,
          newStageId: target.id,
          changedById: actor.id,
        },
      });
      await tx.activity.create({
        data: {
          prospectId: current.prospectId,
          opportunityId: id,
          actorId: actor.id,
          type: closedAt ? ActivityType.OPPORTUNITY_CLOSED : ActivityType.STAGE_CHANGED,
          summary: closedAt
            ? `Oportunidad cerrada: ${status}`
            : `Etapa actualizada a ${target.name}`,
          metadata: { previousStageId: current.stageId, newStageId: target.id },
        },
      });
      await this.audit.record(
        closedAt ? 'CRM_OPPORTUNITY_CLOSED' : 'CRM_STAGE_CHANGED',
        'Opportunity',
        id,
        this.context(request),
        { previousStageId: current.stageId, newStageId: target.id, status },
        tx,
      );
      if (target.key === 'client') {
        await tx.clientProfile.upsert({
          where: { prospectId: current.prospectId },
          update: { status: 'ACTIVE' },
          create: { prospectId: current.prospectId, convertedById: actor.id },
        });
        await tx.activity.create({
          data: {
            prospectId: current.prospectId,
            opportunityId: id,
            actorId: actor.id,
            type: ActivityType.CLIENT_CONVERTED,
            summary: 'Prospecto convertido en cliente',
          },
        });
      }
      return row;
    });
  }

  async tasks(query: any, actor: Actor) {
    const own = !actor.permissions.includes('crm.tasks.manage');
    const where: Prisma.TaskWhereInput = {
      assigneeId: own ? actor.id : query.assigneeId,
      prospectId: query.prospectId,
      status: query.status,
      dueAt: query.overdue ? { lt: new Date() } : undefined,
      prospect: this.prospectScope(actor),
    };
    const [data, total] = await this.db.$transaction([
      this.db.task.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { dueAt: 'asc' },
        include: {
          prospect: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true } },
          opportunity: { select: { id: true, title: true } },
        },
      }),
      this.db.task.count({ where }),
    ]);
    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }
  async createTask(input: any, actor: Actor, request: any) {
    await this.prospect(input.prospectId, actor);
    if (input.assigneeId !== actor.id && !actor.permissions.includes('crm.tasks.manage'))
      throw new ForbiddenException('No puede crear tareas para otro usuario');
    return this.db.$transaction(async (tx) => {
      await this.eligibleUser(input.assigneeId, tx);
      await this.validateOpportunityLink(input.prospectId, input.opportunityId, tx);
      const row = await tx.task.create({
        data: { ...input, dueAt: new Date(input.dueAt), createdById: actor.id },
      });
      await tx.activity.create({
        data: {
          prospectId: input.prospectId,
          opportunityId: input.opportunityId,
          actorId: actor.id,
          type: ActivityType.TASK_CREATED,
          summary: `Tarea creada: ${input.title}`,
          metadata: { taskId: row.id },
        },
      });
      await this.audit.record(
        'CRM_TASK_CREATED',
        'Task',
        row.id,
        this.context(request),
        { prospectId: input.prospectId, assigneeId: input.assigneeId },
        tx,
      );
      return row;
    });
  }
  async taskStatus(id: string, status: TaskStatus, actor: Actor, request: any) {
    const task = await this.db.task.findFirst({
      where: {
        id,
        ...(actor.permissions.includes('crm.tasks.manage') ? {} : { assigneeId: actor.id }),
        prospect: this.prospectScope(actor),
      },
    });
    if (!task) throw new NotFoundException('Tarea no encontrada');
    return this.db.$transaction(async (tx) => {
      const row = await tx.task.update({
        where: { id },
        data: { status, completedAt: status === TaskStatus.COMPLETED ? new Date() : null },
      });
      await tx.activity.create({
        data: {
          prospectId: task.prospectId,
          opportunityId: task.opportunityId,
          actorId: actor.id,
          type: ActivityType.TASK_STATUS_CHANGED,
          summary: `Estado de tarea actualizado: ${status}`,
          metadata: { taskId: id },
        },
      });
      await this.audit.record(
        'CRM_TASK_STATUS_CHANGED',
        'Task',
        id,
        this.context(request),
        { status },
        tx,
      );
      return row;
    });
  }

  async createNote(input: any, actor: Actor, request: any) {
    await this.prospect(input.prospectId, actor);
    return this.db.$transaction(async (tx) => {
      await this.validateOpportunityLink(input.prospectId, input.opportunityId, tx);
      const row = await tx.note.create({ data: { ...input, authorId: actor.id } });
      await tx.activity.create({
        data: {
          prospectId: input.prospectId,
          opportunityId: input.opportunityId,
          actorId: actor.id,
          type: ActivityType.NOTE_CREATED,
          summary: 'Nota interna creada',
          metadata: { noteId: row.id },
        },
      });
      await this.audit.record(
        'CRM_NOTE_CREATED',
        'Note',
        row.id,
        this.context(request),
        { prospectId: input.prospectId },
        tx,
      );
      return row;
    });
  }
  async updateNote(id: string, body: string, actor: Actor, request: any) {
    const note = await this.db.note.findFirst({
      where: { id, prospect: this.prospectScope(actor) },
    });
    if (!note) throw new NotFoundException('Nota no encontrada');
    if (note.authorId !== actor.id && !this.global(actor))
      throw new ForbiddenException('Solo el autor puede editar esta nota');
    return this.db.$transaction(async (tx) => {
      const row = await tx.note.update({ where: { id }, data: { body, editedAt: new Date() } });
      await tx.activity.create({
        data: {
          prospectId: note.prospectId,
          opportunityId: note.opportunityId,
          actorId: actor.id,
          type: ActivityType.NOTE_UPDATED,
          summary: 'Nota interna actualizada',
          metadata: { noteId: id },
        },
      });
      await this.audit.record('CRM_NOTE_UPDATED', 'Note', id, this.context(request), undefined, tx);
      return row;
    });
  }
  async interaction(input: any, actor: Actor, request: any) {
    await this.prospect(input.prospectId, actor);
    return this.db.$transaction(async (tx) => {
      await this.validateOpportunityLink(input.prospectId, input.opportunityId, tx);
      const row = await tx.interaction.create({
        data: { ...input, occurredAt: new Date(input.occurredAt), actorId: actor.id },
      });
      await tx.activity.create({
        data: {
          prospectId: input.prospectId,
          opportunityId: input.opportunityId,
          actorId: actor.id,
          type: ActivityType.INTERACTION_RECORDED,
          summary: `Interacción registrada: ${input.method}`,
          metadata: { interactionId: row.id },
        },
      });
      await this.audit.record(
        'CRM_INTERACTION_RECORDED',
        'Interaction',
        row.id,
        this.context(request),
        { prospectId: input.prospectId, method: input.method },
        tx,
      );
      return row;
    });
  }

  async tags() {
    return this.db.tag.findMany({ orderBy: { name: 'asc' } });
  }
  async untagProspect(prospectId: string, tagId: string, actor: Actor, request: any) {
    await this.prospect(prospectId, actor);
    return this.db.$transaction(async (tx) => {
      const existing = await tx.prospectTag.findUnique({
        where: { prospectId_tagId: { prospectId, tagId } },
      });
      if (!existing) return { removed: false };
      await tx.prospectTag.delete({ where: { prospectId_tagId: { prospectId, tagId } } });
      await tx.activity.create({
        data: {
          prospectId,
          actorId: actor.id,
          type: ActivityType.TAG_DETACHED,
          summary: 'Etiqueta retirada',
          metadata: { tagId },
        },
      });
      await this.audit.record(
        'CRM_TAG_DETACHED',
        'Prospect',
        prospectId,
        this.context(request),
        { tagId },
        tx,
      );
      return { removed: true };
    });
  }
  async activities(query: any, actor: Actor) {
    const where: Prisma.ActivityWhereInput = {
      prospect: this.prospectScope(actor),
      prospectId: query.prospectId,
      opportunityId: query.opportunityId,
    };
    const [data, total] = await this.db.$transaction([
      this.db.activity.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: { select: { id: true, name: true } },
          prospect: { select: { id: true, name: true } },
          opportunity: { select: { id: true, title: true } },
        },
      }),
      this.db.activity.count({ where }),
    ]);
    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }
  async clients(query: any, actor: Actor) {
    const where: Prisma.ClientProfileWhereInput = {
      prospect: {
        ...this.prospectScope(actor),
        OR: query.search
          ? [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
    };
    const [data, total] = await this.db.$transaction([
      this.db.clientProfile.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { convertedAt: 'desc' },
        include: {
          prospect: {
            include: {
              assignments: {
                where: { endedAt: null },
                include: { assignee: { select: { id: true, name: true } } },
              },
            },
          },
          convertedBy: { select: { id: true, name: true } },
        },
      }),
      this.db.clientProfile.count({ where }),
    ]);
    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }
  async companies(query: any, actor: Actor) {
    if (!this.global(actor)) throw new ForbiddenException('No puede consultar empresas');
    const where: Prisma.CompanyWhereInput = {
      OR: query.search
        ? [
            { name: { contains: query.search, mode: 'insensitive' } },
            { legalName: { contains: query.search, mode: 'insensitive' } },
            { taxIdentifier: { contains: query.search } },
          ]
        : undefined,
    };
    const [data, total] = await this.db.$transaction([
      this.db.company.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { name: 'asc' },
        include: {
          contacts: {
            include: { prospect: { select: { id: true, name: true, email: true, phone: true } } },
          },
        },
      }),
      this.db.company.count({ where }),
    ]);
    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }
  async createCompany(input: any, actor: Actor, request: any) {
    if (!this.global(actor)) throw new ForbiddenException('No puede crear empresas');
    return this.db.$transaction(async (tx) => {
      if (input.prospectId) await this.validateProspectExists(input.prospectId, tx);
      const { prospectId, position, ...data } = input;
      const row = await tx.company.create({
        data: {
          ...data,
          email: data.email || null,
          contacts: prospectId ? { create: { prospectId, position, isPrimary: true } } : undefined,
        },
      });
      await this.audit.record(
        'CRM_COMPANY_CREATED',
        'Company',
        row.id,
        this.context(request),
        undefined,
        tx,
      );
      return row;
    });
  }
  private async validateProspectExists(id: string, db: DbClient) {
    const row = await db.prospect.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new UnprocessableEntityException('Prospecto de contacto inválido');
  }
  async consultants() {
    return this.db.user.findMany({
      where: { isActive: true, roles: { some: { role: { name: 'CONSULTOR' } } } },
      select: {
        id: true,
        name: true,
        email: true,
        _count: {
          select: {
            assignedProspects: { where: { endedAt: null } },
            crmTasks: { where: { status: { in: ['PENDING', 'IN_PROGRESS'] } } },
            opportunities: { where: { status: 'OPEN' } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }
  async createTag(input: any, request: any) {
    return this.db.$transaction(async (tx) => {
      const row = await tx.tag.upsert({
        where: { name: input.name },
        update: { color: input.color },
        create: input,
      });
      await this.audit.record(
        'CRM_TAG_UPSERTED',
        'Tag',
        row.id,
        this.context(request),
        undefined,
        tx,
      );
      return row;
    });
  }
  async tagProspect(prospectId: string, tagId: string, actor: Actor, request: any) {
    await this.prospect(prospectId, actor);
    return this.db.$transaction(async (tx) => {
      const tag = await tx.tag.findUnique({ where: { id: tagId }, select: { id: true } });
      if (!tag) throw new UnprocessableEntityException('Etiqueta inválida');
      const row = await tx.prospectTag.upsert({
        where: { prospectId_tagId: { prospectId, tagId } },
        update: {},
        create: { prospectId, tagId },
      });
      await tx.activity.create({
        data: {
          prospectId,
          actorId: actor.id,
          type: ActivityType.TAG_ATTACHED,
          summary: 'Etiqueta asociada',
          metadata: { tagId },
        },
      });
      await this.audit.record(
        'CRM_TAG_ATTACHED',
        'Prospect',
        prospectId,
        this.context(request),
        { tagId },
        tx,
      );
      return row;
    });
  }
  async dashboard(actor: Actor) {
    const scope = this.prospectScope(actor),
      now = new Date();
    const [newProspects, activeOpportunities, pendingTasks, overdueTasks, stages] =
      await this.db.$transaction([
        this.db.prospect.count({ where: { ...scope, status: 'NEW' } }),
        this.db.opportunity.count({ where: { prospect: scope, status: 'OPEN' } }),
        this.db.task.count({
          where: { prospect: scope, status: { in: ['PENDING', 'IN_PROGRESS'] } },
        }),
        this.db.task.count({
          where: {
            prospect: scope,
            status: { in: ['PENDING', 'IN_PROGRESS'] },
            dueAt: { lt: now },
          },
        }),
        this.db.pipelineStage.findMany({
          where: { isActive: true },
          orderBy: { position: 'asc' },
          include: {
            _count: { select: { opportunities: { where: { prospect: scope, status: 'OPEN' } } } },
          },
        }),
      ]);
    return {
      newProspects,
      activeOpportunities,
      pendingTasks,
      overdueTasks,
      pipeline: stages.map((stage) => ({
        id: stage.id,
        key: stage.key,
        name: stage.name,
        position: stage.position,
        total: stage._count.opportunities,
      })),
      generatedAt: now.toISOString(),
    };
  }
}
