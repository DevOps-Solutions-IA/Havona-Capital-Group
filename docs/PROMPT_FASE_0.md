# PROMPT DEFINITIVO — FASE 0

Construye la Fase 0 de HAVONA CAPITAL directamente en este repositorio.

Lee antes de comenzar:

- `AGENTS.md`
- `docs/PLAN_MAESTRO.md`
- `docs/ARQUITECTURA_TECNICA.md`
- `docs/PLAN_DE_FASES.md`
- `docs/DIRECTRIZ_VISUAL_FUNCIONAL.md`
- `docs/REGLAS_DE_DESARROLLO.md`

No construyas una demo. Construye la base real de producción de la plataforma.

## Objetivo

Crear una fundación técnica completa, segura, modular, versionada y desplegable para soportar posteriormente el sitio público, CRM, Henry AI, agenda, WhatsApp, correo y Havona Meet.

## Alcance obligatorio

1. Inicializa un monorepo con pnpm workspaces y Turborepo.
2. Crea:
   - `apps/web` con Next.js, React y TypeScript estricto.
   - `apps/api` con NestJS y TypeScript estricto.
   - `apps/worker` con NestJS standalone, Redis y BullMQ.
   - `packages/ui`.
   - `packages/database`.
   - `packages/auth`.
   - `packages/config`.
   - `packages/contracts`.
   - `packages/shared`.
3. Configura PostgreSQL, Prisma, Redis, Docker y Docker Compose.
4. Implementa autenticación real:
   - login;
   - logout;
   - recuperación de contraseña;
   - restablecimiento seguro;
   - sesiones;
   - bloqueo temporal por intentos fallidos;
   - cookies HTTP-only;
   - contraseñas con Argon2id.
5. Implementa RBAC con:
   - SUPER_ADMIN;
   - ADMIN;
   - GERENTE;
   - CONSULTOR.
6. Implementa administración real de usuarios:
   - crear;
   - editar;
   - activar;
   - desactivar;
   - asignar roles;
   - restablecer contraseña;
   - ver último acceso.
7. Implementa auditoría:
   - login;
   - logout;
   - intento fallido;
   - creación de usuario;
   - edición;
   - cambio de rol;
   - activación;
   - desactivación;
   - configuración.
8. Crea entidades Prisma:
   - User;
   - Role;
   - Permission;
   - UserRole;
   - RolePermission;
   - Session;
   - PasswordResetToken;
   - AuditLog;
   - SystemSetting.
9. Crea migraciones y seed idempotente.
10. Crea un SUPER_ADMIN inicial usando variables de entorno.
11. Implementa:
   - `/health`;
   - `/health/ready`;
   - verificación de PostgreSQL;
   - verificación de Redis;
   - logs estructurados;
   - manejo global de errores;
   - rate limiting;
   - validación global.
12. Crea interfaz premium real:
   - login;
   - recuperación;
   - restablecimiento;
   - dashboard;
   - menú lateral;
   - encabezado;
   - perfil;
   - usuarios;
   - roles;
   - configuración;
   - auditoría;
   - acceso denegado;
   - error.
13. Usa:
   - Inter;
   - Outfit;
   - Tailwind CSS;
   - motion/react;
   - paleta definida en la directriz visual.
14. No muestres métricas falsas. El dashboard inicial debe mostrar únicamente información real del sistema.
15. Configura Caddy como proxy inverso con HTTPS preparado para producción.
16. Crea Dockerfiles separados para web, api y worker.
17. Crea perfiles Docker para desarrollo y producción.
18. Crea backups automatizados de PostgreSQL y documentación de restauración.
19. Configura GitHub Actions para:
   - lint;
   - typecheck;
   - test;
   - build;
   - verificación de migraciones.
20. Crea pruebas:
   - unitarias;
   - integración;
   - autenticación;
   - roles;
   - permisos;
   - usuarios;
   - auditoría;
   - PostgreSQL;
   - Redis;
   - health checks.
21. Crea documentación:
   - instalación;
   - desarrollo;
   - producción;
   - variables de entorno;
   - migraciones;
   - seed;
   - backups;
   - restauración;
   - comandos;
   - estructura;
   - troubleshooting.

## Reglas obligatorias

- No cambiar la arquitectura aprobada.
- No usar mock data en producción.
- No dejar botones sin funcionamiento.
- No exponer secretos.
- No usar SQLite.
- No reemplazar PostgreSQL.
- No construir Henry todavía.
- No construir CRM todavía.
- No instalar Jitsi todavía.
- No construir WhatsApp todavía.
- No crear funcionalidades fuera de esta fase.
- No realizar commits en `main`.
- Trabajar en `feature/fase-00-fundacion`.
- Ejecutar máximo tres loops de corrección por error.
- Si existe un bloqueo crítico, detenerse y reportarlo.

## Criterios de aprobación

La fase queda aprobada únicamente si:

- El monorepo instala correctamente.
- Docker Compose levanta todos los servicios.
- PostgreSQL funciona.
- Redis funciona.
- Las migraciones se aplican.
- El seed funciona más de una vez sin duplicar datos.
- El SUPER_ADMIN puede iniciar sesión.
- El SUPER_ADMIN puede crear un CONSULTOR.
- Los roles restringen correctamente los accesos.
- La auditoría registra las acciones.
- Los health checks responden correctamente.
- La interfaz funciona en móvil y escritorio.
- Lint pasa.
- Typecheck pasa.
- Pruebas pasan.
- Build pasa.
- La documentación permite desplegar sin conocimiento previo del proyecto.
- No existen secretos en Git.
- Se crea el commit final:
  `release(fase-00): completa fundación técnica`
- Se crea la etiqueta:
  `v0.1.0`

## Entrega final

Entrega:

- Resumen ejecutivo.
- Arquitectura implementada.
- Árbol del repositorio.
- Archivos creados.
- Migraciones.
- Endpoints.
- Variables necesarias.
- Pruebas ejecutadas.
- Resultados.
- Riesgos.
- Pendientes no críticos.
- Comandos exactos para levantar desarrollo.
- Comandos exactos para desplegar producción.
- Commit final.
- Etiqueta.
- Checklist de aprobación.

No continúes con la Fase 1.
