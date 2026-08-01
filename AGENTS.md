# AGENTS.md — HAVONA CAPITAL

## Propósito

Este archivo contiene las reglas permanentes que todo agente de desarrollo debe seguir al trabajar en HAVONA CAPITAL.

Antes de modificar el repositorio, el agente debe leer:

1. `AGENTS.md`
2. `docs/PLAN_MAESTRO.md`
3. `docs/ARQUITECTURA_TECNICA.md`
4. `docs/PLAN_DE_FASES.md`
5. `docs/DIRECTRIZ_VISUAL_FUNCIONAL.md`
6. `docs/REGLAS_DE_DESARROLLO.md`

## Objetivo del sistema

HAVONA CAPITAL es una plataforma empresarial de prospección, CRM, inteligencia artificial, agendamiento, videollamadas y gestión comercial.

Henry AI será el agente central encargado de conversar, calificar, hacer seguimiento y agendar prospectos autorizados.

La plataforma debe construirse como un sistema real, premium, seguro y escalable.

## Tecnologías obligatorias

- Lenguaje principal: TypeScript.
- Frontend: Next.js + React.
- Backend: NestJS.
- Estilos: Tailwind CSS.
- Animaciones: motion/react.
- Formularios: React Hook Form.
- Validación: Zod.
- Base de datos: PostgreSQL.
- ORM: Prisma.
- Caché y colas: Redis + BullMQ.
- Inteligencia artificial: OpenAI API.
- Videollamadas: Jitsi autohospedado.
- Infraestructura: Docker + Docker Compose.
- Proxy: Caddy o Nginx.
- Sistema operativo objetivo: Ubuntu 24.04 LTS.
- Repositorio: GitHub.
- CI/CD: GitHub Actions.

No cambiar estas tecnologías sin autorización expresa.

## Arquitectura obligatoria

Usar un monorepo modular:

```text
havona-capital/
├── apps/
│   ├── web/
│   ├── api/
│   └── worker/
├── packages/
│   ├── ui/
│   ├── database/
│   ├── auth/
│   ├── config/
│   ├── contracts/
│   └── shared/
├── infrastructure/
│   ├── docker/
│   ├── proxy/
│   ├── jitsi/
│   ├── monitoring/
│   └── backups/
├── docs/
├── AGENTS.md
├── docker-compose.yml
└── README.md
```

Construir inicialmente como monolito modular. No crear microservicios innecesarios.

## Regla de oro

Nada puede ser únicamente cosmético.

Todo elemento visible debe tener una función real:

- Los botones deben ejecutar acciones reales.
- Los formularios deben validar y guardar datos.
- Las tablas deben leer datos reales.
- Las métricas deben calcularse desde la base de datos.
- La agenda debe validar disponibilidad real.
- Henry debe usar backend real.
- Havona Meet debe crear salas reales.
- Los mensajes deben quedar registrados y auditados.

Si una función aún no existe:

1. No mostrarla.
2. O marcarla claramente como futura.
3. Nunca simularla.

## Reglas de desarrollo

1. Usar TypeScript estricto.
2. No exponer secretos.
3. No subir archivos `.env`.
4. No inventar credenciales.
5. No eliminar datos o migraciones sin autorización.
6. Validar toda entrada externa.
7. Aplicar control de acceso por roles.
8. Registrar acciones críticas en auditoría.
9. Reutilizar componentes antes de crear duplicados.
10. Mantener módulos desacoplados.
11. Evitar dependencias innecesarias.
12. Documentar decisiones relevantes.
13. Crear pruebas para toda funcionalidad crítica.
14. Ejecutar pruebas antes de finalizar.
15. No ocultar errores ni riesgos.
16. No modificar la arquitectura general fuera del alcance aprobado.
17. No avanzar a una fase nueva sin aprobación de la fase anterior.

## Roles del sistema

- SUPER_ADMIN
- ADMIN
- GERENTE
- CONSULTOR

Los permisos deben ser explícitos y verificables.

## Agentes internos

El agente principal puede dividir tareas complejas entre subagentes:

- Arquitectura.
- Backend.
- Frontend.
- Base de datos.
- Henry AI.
- Integraciones.
- Seguridad.
- DevOps.
- Calidad.

Cada subagente debe trabajar con un alcance específico. El agente principal revisa, integra y prueba.

## Loops controlados

Ciclo permitido:

```text
Analizar
→ Diseñar
→ Implementar
→ Probar
→ Revisar errores
→ Corregir
→ Volver a probar
→ Documentar
```

Máximo tres intentos automáticos sobre el mismo error.

Si el error persiste:

- Detener el ciclo.
- Mantener el último estado estable.
- Reportar la causa.
- No improvisar una solución insegura.

## Git y ramas

- `main`: producción estable.
- `develop`: integración.
- `feature/*`: nuevas funcionalidades.
- `fix/*`: correcciones.
- `refactor/*`: refactorizaciones.
- `docs/*`: documentación.

Usar Conventional Commits:

```text
feat(auth): implementa autenticación segura
fix(api): corrige validación de permisos
docs(architecture): actualiza arquitectura técnica
test(crm): agrega pruebas de prospectos
chore(deploy): configura Docker Compose
```

No hacer commits directos a `main`.

## Entrega obligatoria

Al finalizar una tarea, reportar:

- Resumen.
- Archivos modificados.
- Migraciones.
- Endpoints.
- Pruebas ejecutadas.
- Resultados.
- Riesgos.
- Pendientes.
- Commit realizado.
- Instrucciones de verificación.

## Criterio de cierre de fase

Una fase se considera cerrada cuando:

- El alcance está completo.
- Frontend y backend están conectados.
- Los datos persisten.
- Los permisos funcionan.
- La auditoría funciona.
- Las pruebas pasan.
- La documentación está actualizada.
- Existe commit de cierre.
- Existe etiqueta de versión.
- La fase puede desplegarse sin romper lo anterior.
