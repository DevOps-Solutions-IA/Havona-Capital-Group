# Henry Global UX — frente paralelo

## Alcance

Este frente mejora la experiencia transversal del único Henry Core sin modificar su conocimiento
PALIG, Knowledge Core, embeddings, recuperación vectorial, Prisma ni migraciones.

## Decisión de montaje

- `AppShell` conserva una sola instancia interna mientras el usuario navega por el portal.
- La sesión local interna usa un alcance por `user.id`; la API continúa resolviendo identidad,
  permisos y entidades en servidor.
- `GlobalHenryLayer` sólo monta la instancia pública en Inicio y las landings públicas autorizadas.
- `/henry` mantiene la experiencia pública de página completa y no recibe un segundo launcher.

## Contextos de página

El contrato y `pageContextFromPath` distinguen Inicio, soluciones públicas, Dashboard, CRM,
Prospectos, detalle de prospecto, Pipeline, Tareas, Agenda, Comunicaciones, Automatizaciones,
Analítica, Conocimiento, Formación, Clientes, Empresas, Consultores, HAVONA Meet, Administración y
Administración Henry.

El cambio de ruta actualiza contexto y sugerencias sin desmontar la conversación. Las sugerencias
son borradores conversacionales: no ejecutan acciones backend, no añaden tools ni amplían RBAC.

## Roles y seguridad

La presentación reconoce `PUBLIC`, `CLIENT`, `CONSULTANT`, `MANAGER`, `ADMIN` y `SUPER_ADMIN`.
El rol visual no concede permisos: `HenryContextService` mantiene la resolución server-side, el
ámbito por actor y el rechazo de entidades públicas o no autorizadas.

Los datos ausentes no se completan en cliente. Las funciones que dependen de Knowledge, embeddings
o retrieval quedan explícitamente fuera de este frente y deben integrarse desde el trabajo
paralelo correspondiente.

## Estados y accesibilidad

El launcher comunica por texto accesible los estados en línea, pensando, ejecutando acción,
escalando a humano y error seguro. El panel conserva diálogo etiquetado, transcript `role="log"`,
errores `role="alert"`, estados `role="status"`, navegación por teclado, foco visible,
`prefers-reduced-motion` y adaptación móvil a `100dvh`.
