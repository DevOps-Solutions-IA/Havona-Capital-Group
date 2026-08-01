import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
const db = new PrismaClient();
const permissions = [
  ['users.read','Consultar usuarios'],['users.create','Crear usuarios'],['users.update','Editar usuarios'],['users.status','Activar o desactivar usuarios'],['users.roles','Asignar roles'],['users.reset_password','Restablecer contraseñas'],
  ['roles.read','Consultar roles y permisos'],['settings.read','Consultar configuración'],['settings.update','Modificar configuración'],['audit.read','Consultar auditoría'],
  ['prospects.read','Consultar prospectos captados']
] as const;
const grants: Record<string,string[]> = {
  SUPER_ADMIN: permissions.map(([key]) => key),
  ADMIN: permissions.map(([key]) => key).filter(key => !['settings.update'].includes(key)),
  GERENTE: ['users.read','roles.read','settings.read','prospects.read'],
  CONSULTOR: ['settings.read'],
};
async function main() {
  for (const [key, description] of permissions) await db.permission.upsert({ where:{key}, update:{description}, create:{key,description} });
  for (const name of Object.keys(grants)) {
    const role = await db.role.upsert({ where:{name}, update:{description:`Rol ${name}`}, create:{name,description:`Rol ${name}`} });
    const granted = await db.permission.findMany({ where:{key:{in:grants[name]}} });
    await db.rolePermission.deleteMany({ where:{roleId:role.id,permissionId:{notIn:granted.map(p=>p.id)}} });
    for (const permission of granted) await db.rolePermission.upsert({where:{roleId_permissionId:{roleId:role.id,permissionId:permission.id}},update:{},create:{roleId:role.id,permissionId:permission.id}});
  }
  await db.systemSetting.upsert({where:{key:'security.session_ttl_hours'},update:{},create:{key:'security.session_ttl_hours',value:12,description:'Duración de sesiones en horas'}});
  for (const [key, name] of [['direct','Directo'],['organic','Orgánico'],['campaign','Campaña'],['referral','Referido'],['henry-entry','Entrada Henry']] as const) {
    await db.leadSource.upsert({where:{key},update:{name,isActive:true},create:{key,name}});
  }
  const email = process.env.INITIAL_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_SUPER_ADMIN_PASSWORD;
  const name = process.env.INITIAL_SUPER_ADMIN_NAME?.trim() || 'Super Administrador';
  if (!email || !password) throw new Error('INITIAL_SUPER_ADMIN_EMAIL y INITIAL_SUPER_ADMIN_PASSWORD son obligatorias');
  if (password.length < 12) throw new Error('INITIAL_SUPER_ADMIN_PASSWORD debe tener al menos 12 caracteres');
  const role = await db.role.findUniqueOrThrow({where:{name:'SUPER_ADMIN'}});
  const existing = await db.user.findUnique({where:{email}});
  const user = existing ?? await db.user.create({data:{email,name,passwordHash:await argon2.hash(password,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1})}});
  await db.userRole.upsert({where:{userId_roleId:{userId:user.id,roleId:role.id}},update:{},create:{userId:user.id,roleId:role.id}});
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
