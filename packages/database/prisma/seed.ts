import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
const db = new PrismaClient();
const permissions = [
  ['users.read', 'Consultar usuarios'],
  ['users.create', 'Crear usuarios'],
  ['users.update', 'Editar usuarios'],
  ['users.status', 'Activar o desactivar usuarios'],
  ['users.roles', 'Asignar roles'],
  ['users.reset_password', 'Restablecer contraseñas'],
  ['roles.read', 'Consultar roles y permisos'],
  ['settings.read', 'Consultar configuración'],
  ['settings.update', 'Modificar configuración'],
  ['audit.read', 'Consultar auditoría'],
  ['prospects.read', 'Consultar prospectos captados'],
  ['crm.read_all', 'Consultar todos los registros comerciales'],
  ['crm.read_assigned', 'Consultar registros comerciales asignados'],
  ['crm.assign', 'Asignar y reasignar responsables'],
  ['crm.update', 'Editar información comercial'],
  ['crm.opportunities', 'Crear y mover oportunidades'],
  ['crm.tasks.manage', 'Gestionar tareas de otros usuarios'],
  ['crm.tasks.own', 'Gestionar tareas propias'],
  ['crm.notes', 'Gestionar notas e interacciones internas'],
  ['crm.close', 'Cerrar oportunidades'],
  ['crm.dashboard', 'Consultar métricas comerciales globales'],
  ['henry.read_all', 'Consultar todas las conversaciones de Henry'],
  ['henry.read_assigned', 'Consultar conversaciones de Henry asignadas'],
  ['henry.dashboard', 'Consultar métricas reales de Henry'],
  ['henry.escalations.manage', 'Gestionar escalamientos de Henry'],
  ['calendar.connect', 'Conectar y seleccionar Google Calendar'],
  ['calendar.read', 'Consultar agenda y disponibilidad propias'],
  ['calendar.manage_own', 'Crear, reprogramar y cancelar citas propias'],
  ['calendar.manage_team', 'Gestionar agenda del equipo autorizado'],
  ['meeting.read', 'Consultar reuniones autorizadas'],
  ['meeting.create', 'Crear reuniones corporativas'],
  ['meeting.manage_own', 'Gestionar reuniones propias'],
  ['meeting.manage_team', 'Gestionar reuniones del equipo autorizado'],
  ['meeting.join', 'Ingresar a reuniones autorizadas'],
  ['meeting.admin', 'Administrar configuración de reuniones'],
] as const;
const grants: Record<string, string[]> = {
  SUPER_ADMIN: permissions.map(([key]) => key),
  ADMIN: permissions.map(([key]) => key).filter((key) => !['settings.update'].includes(key)),
  GERENTE: [
    'users.read',
    'roles.read',
    'settings.read',
    'prospects.read',
    'crm.read_all',
    'crm.read_assigned',
    'crm.assign',
    'crm.update',
    'crm.opportunities',
    'crm.tasks.manage',
    'crm.tasks.own',
    'crm.notes',
    'crm.close',
    'crm.dashboard',
    'henry.read_all',
    'henry.read_assigned',
    'henry.dashboard',
    'henry.escalations.manage',
    'calendar.connect',
    'calendar.read',
    'calendar.manage_own',
    'calendar.manage_team',
    'meeting.read',
    'meeting.create',
    'meeting.manage_own',
    'meeting.manage_team',
    'meeting.join',
  ],
  CONSULTOR: [
    'settings.read',
    'crm.read_assigned',
    'crm.update',
    'crm.opportunities',
    'crm.tasks.own',
    'crm.notes',
    'crm.close',
    'henry.read_assigned',
    'calendar.connect',
    'calendar.read',
    'calendar.manage_own',
    'meeting.read',
    'meeting.create',
    'meeting.manage_own',
    'meeting.join',
  ],
};
async function main() {
  for (const [key, description] of permissions)
    await db.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
  for (const name of Object.keys(grants)) {
    const role = await db.role.upsert({
      where: { name },
      update: { description: `Rol ${name}` },
      create: { name, description: `Rol ${name}` },
    });
    const granted = await db.permission.findMany({ where: { key: { in: grants[name] } } });
    await db.rolePermission.deleteMany({
      where: { roleId: role.id, permissionId: { notIn: granted.map((p) => p.id) } },
    });
    for (const permission of granted)
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
  }
  await db.systemSetting.upsert({
    where: { key: 'security.session_ttl_hours' },
    update: {},
    create: {
      key: 'security.session_ttl_hours',
      value: 12,
      description: 'Duración de sesiones en horas',
    },
  });
  await db.systemSetting.upsert({
    where: { key: 'calendar.availability_defaults' },
    update: {},
    create: {
      key: 'calendar.availability_defaults',
      value: {
        timezone: 'America/Bogota',
        workingDays: [1, 2, 3, 4, 5],
        workStart: '08:00',
        workEnd: '18:00',
        minimumNoticeMinutes: 120,
        defaultMeetingDuration: 45,
        bufferBeforeMinutes: 15,
        bufferAfterMinutes: 15,
        maximumFutureBookingDays: 90,
      },
      description: 'Reglas corporativas predeterminadas de disponibilidad',
    },
  });
  for (const [key, name] of [
    ['direct', 'Directo'],
    ['organic', 'Orgánico'],
    ['campaign', 'Campaña'],
    ['referral', 'Referido'],
    ['henry-entry', 'Entrada Henry'],
  ] as const) {
    await db.leadSource.upsert({
      where: { key },
      update: { name, isActive: true },
      create: { key, name },
    });
  }
  const stages = [
    ['new', 'Nuevo'],
    ['contacted', 'Contactado'],
    ['conversing', 'Conversando'],
    ['qualified', 'Calificado'],
    ['appointment-scheduled', 'Cita agendada'],
    ['appointment-completed', 'Cita realizada'],
    ['proposal', 'Propuesta'],
    ['follow-up', 'Seguimiento'],
    ['closed', 'Cerrado'],
    ['client', 'Cliente'],
  ] as const;
  for (const [index, [key, name]] of stages.entries())
    await db.pipelineStage.upsert({
      where: { key },
      update: { name, position: index + 1, isActive: true },
      create: { key, name, position: index + 1 },
    });
  const email = process.env.INITIAL_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_SUPER_ADMIN_PASSWORD;
  const name = process.env.INITIAL_SUPER_ADMIN_NAME?.trim() || 'Super Administrador';
  if (!email || !password)
    throw new Error('INITIAL_SUPER_ADMIN_EMAIL y INITIAL_SUPER_ADMIN_PASSWORD son obligatorias');
  if (password.length < 12)
    throw new Error('INITIAL_SUPER_ADMIN_PASSWORD debe tener al menos 12 caracteres');
  const role = await db.role.findUniqueOrThrow({ where: { name: 'SUPER_ADMIN' } });
  const existing = await db.user.findUnique({ where: { email } });
  const user =
    existing ??
    (await db.user.create({
      data: {
        email,
        name,
        passwordHash: await argon2.hash(password, {
          type: argon2.argon2id,
          memoryCost: 65536,
          timeCost: 3,
          parallelism: 1,
        }),
      },
    }));
  await db.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
