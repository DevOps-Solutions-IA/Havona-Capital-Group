# AGENTS.md — HAVONA CAPITAL GROUP

## Propósito

Este archivo contiene las reglas permanentes que todo agente de desarrollo debe seguir al trabajar en HAVONA CAPITAL GROUP.

Antes de modificar el repositorio, el agente debe leer:

1. `AGENTS.md`
2. `docs/PLAN_MAESTRO.md`
3. `docs/ARQUITECTURA_TECNICA.md`
4. `docs/PLAN_DE_FASES.md`
5. `docs/DIRECTRIZ_VISUAL_FUNCIONAL.md`
6. `docs/REGLAS_DE_DESARROLLO.md`

## Objetivo del sistema

HAVONA CAPITAL GROUP es una plataforma empresarial de prospección, CRM, inteligencia artificial, agendamiento, videollamadas y gestión comercial.

## Identidad corporativa permanente

El nombre corporativo oficial del ecosistema es **HAVONA CAPITAL GROUP**. Ningún módulo, nueva
interfaz, documento institucional o contenido visible debe presentar `HAVONA CAPITAL` como
denominación corporativa completa salvo que exista una decisión explícita de abreviación de marca.
La abreviación `HAVONA` puede utilizarse con intención editorial; no modifica el nombre oficial.

Esta regla no obliga a renombrar identificadores técnicos estables como paquetes `@havona/*`,
rutas, servicios, bases de datos, colas, directorios, repositorio ni dominios aprobados. La marca
visible y el naming de infraestructura se revisan de forma separada para evitar cambios riesgosos.

Henry AI será el agente central encargado de conversar, calificar, hacer seguimiento y agendar prospectos autorizados.

La plataforma debe construirse como un sistema real, premium, seguro y escalable.

## Entorno oficial de construcción

El entorno local oficial de desarrollo es:

```text
/mnt/d/havona
```

Todo el sistema se construye y valida allí durante las fases de desarrollo. La ausencia de un VPS,
Ubuntu 24.04 productivo, Docker local productivo, DNS público o SMTP productivo no constituye por
sí sola un bloqueo de desarrollo ni impide aprobar una fase que cumple sus criterios locales y de
integración continua.

La infraestructura VPS se utilizará únicamente al llegar a preproducción o producción. En ese
momento se realizarán las validaciones operativas de Ubuntu 24.04, Docker, DNS, HTTPS, Caddy,
SMTP, firewall, backups, restauración, persistencia, reinicios, monitoreo y hardening.

GitHub es la fuente oficial de control de versiones y respaldo:

```text
https://github.com/DevOps-Solutions-IA/Havona-Capital-Group
```

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

### Flujo obligatorio

```text
Entorno local
→ Desarrollo
→ Pruebas
→ Corrección
→ Validación
→ Commit
→ Push a GitHub
→ GitHub Actions
→ Continuar
```

Cada fase trabaja en su propia rama `feature/fase-XX-*` y mantiene un Pull Request hacia
`develop`. El PR es el registro vivo de avances, decisiones, pruebas, riesgos y pendientes; debe
permanecer Draft mientras la fase esté en construcción.

Cada unidad lógica implementada, probada, estable y documentada debe recibir un commit atómico y
push a la rama activa. No acumular grandes cantidades de trabajo terminado sin versionar. Después
de cada push relevante se deben revisar lint, typecheck, pruebas, builds y demás checks aplicables
en GitHub Actions.

Si CI falla:

```text
Analizar
→ Corregir
→ Probar
→ Commit fix
→ Push
→ Validar CI
```

No avanzar dejando errores críticos conocidos. Nunca publicar secretos, `.env`, archivos
temporales, código deliberadamente roto, experimentos descartables, datos personales reales ni
credenciales.

`main` contiene únicamente versiones estables y aprobadas. `develop` integra fases terminadas o
preparadas para integración. No desarrollar directamente sobre ninguna de estas dos ramas.

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

Durante desarrollo, estos criterios se demuestran mediante el entorno local y GitHub Actions. Las
validaciones exclusivas de VPS y servicios productivos se difieren a preproducción/producción y no
se mezclan con el cierre ordinario de las fases locales, salvo que el plan de la fase las exija de
forma expresa.

Solo después de aprobar todo el alcance se crea el commit `release(fase-XX)` y su etiqueta, y se
marca el Pull Request como Ready for Review. No iniciar una fase nueva sin aprobación.
