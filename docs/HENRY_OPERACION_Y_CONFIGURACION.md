# Henry Web — operación y configuración

## Alcance vigente

Henry es el asistente virtual de HAVONA CAPITAL GROUP. En Fase 3 opera únicamente por el canal
`WEB`, persiste conversaciones y mensajes, utiliza herramientas controladas para interactuar con
el CRM y solicita escalamiento humano cuando una política o el usuario lo requiere.

WhatsApp, email conversacional, voz, agenda real y Havona Meet no están activos. Los contratos de
canal existen para integraciones futuras, pero la API rechaza que el público inicie un canal distinto
de `WEB`.

El comportamiento se rige por [`HENRY_MANUAL_MAESTRO.md`](./HENRY_MANUAL_MAESTRO.md), versión
`1.0.0`. Nueve políticas independientes se componen según el estado actual y el servidor aplica
reglas deterministas de escalamiento, salida segura y autorización de herramientas. El prompt del
sistema es un artefacto compuesto y versionado, no una fuente monolítica informal.

## Configuración de IA

Variables obligatorias para conversación real:

```text
AI_PROVIDER=openrouter
AI_MODEL=<slug de modelo autorizado con soporte de tools>
OPENROUTER_API_KEY=<secreto autorizado>
```

Variables de control:

```text
AI_BASE_URL=https://openrouter.ai/api/v1
AI_TIMEOUT_MS=30000
AI_MAX_RETRIES=2
AI_MAX_INPUT_TOKENS=8000
AI_MAX_OUTPUT_TOKENS=1200
AI_MAX_TOOL_CALLS=4
AI_TEMPERATURE=0.2
```

`AI_MODEL` nunca se decide en código. La clave solo existe en el entorno del API, no se envía al
navegador, no se registra y no se guarda en PostgreSQL. Si falta clave o modelo, Henry persiste el
turno y devuelve `CONFIGURATION_REQUIRED` con un mensaje explícito; no genera una respuesta falsa.

## Flujo público

```text
POST /api/v1/henry/conversations
GET  /api/v1/henry/conversations/:publicId
POST /api/v1/henry/conversations/:publicId/messages
POST /api/v1/henry/conversations/:publicId/escalations
```

Al crear una conversación, la API entrega una sola vez un token opaco. El cliente lo conserva en
almacenamiento local y lo presenta mediante `X-Henry-Token`. En base de datos solo se guarda su
hash SHA-256. Un `messageId` UUID suministrado por el cliente hace idempotente el reintento de un
mensaje tras un fallo de red.

El launcher global comparte esta misma sesión con `/henry`. Cada turno puede incluir un
`pageContext` mínimo validado (`pageType`, `section`, `intentHint` y, solo autenticado, referencia de
entidad). Una pista de intención adapta la apertura pero nunca se trata como necesidad confirmada.

La experiencia informa y registra consentimiento antes de crear la conversación. Si una
herramienta crea o consolida un prospecto, reutiliza la versión de privacidad de la conversación y
el dominio de captación existente.

## Operación interna

```text
GET /api/v1/henry/admin/dashboard
GET /api/v1/henry/admin/conversations
GET /api/v1/henry/admin/conversations/:id
POST /api/v1/henry/internal/conversations
GET  /api/v1/henry/internal/conversations/:id
POST /api/v1/henry/internal/conversations/:id/messages
```

La interfaz se encuentra en `/administracion-henry`. `SUPER_ADMIN`, `ADMIN` y `GERENTE` disponen
del ámbito global autorizado. `CONSULTOR` solo puede consultar conversaciones cuyo prospecto tenga
una asignación activa a ese usuario. El dashboard requiere permiso específico y muestra únicamente
conteos y uso persistidos.

El copiloto global del portal usa siempre los endpoints `internal`. El rol procede de la sesión y
no del body. Si `PageContext` referencia un prospecto, empresa u oportunidad, el API resuelve el
scope mediante asignaciones y permisos antes de construir contexto. Los datos de entidad nunca se
aceptan directamente desde el navegador. La sesión del copiloto se separa por usuario local para
evitar continuidad accidental entre identidades que utilicen el mismo navegador.

## Herramientas y seguridad

El modelo propone llamadas, pero la aplicación las ejecuta. La allowlist vigente es:

- `get_prospect_context`
- `create_or_update_prospect`
- `register_interaction`
- `create_crm_activity`
- `create_task`
- `qualify_prospect`
- `request_human_escalation`
- `get_available_consultants`
- `request_appointment_intent`

Cada entrada se valida con Zod. Una herramienta desconocida se registra como `REJECTED` con
`UNAUTHORIZED_TOOL`; nunca se resuelve dinámicamente ni ejecuta SQL. Los límites de input, output,
timeout, reintentos, iteraciones y tools se aplican desde servidor.

La allowlist efectiva se reduce por `HenryRoleContext` antes de llegar al modelo. El API vuelve a
comprobarla al ejecutar. `create_task` requiere `confirmedByUser=true`, que solo debe enviarse tras
una confirmación expresa en la conversación.

## Observabilidad y costos

Cada ejecución registra identificadores de conversación y ejecución, proveedor, modelo, latencia,
iteraciones, estado y errores redacted. `AIUsage` conserva tokens reportados por el proveedor. El
costo se persiste únicamente cuando el proveedor lo devuelve; el sistema no estima ni inventa
precios.

Los logs estructurados excluyen contenido de mensajes, claves y datos personales completos.

Cada ejecución conserva versión del manual, etapa y políticas aplicadas. Herramientas y
escalamientos conservan `policyId` y `ruleId`; las transiciones registran origen, destino y regla en
`ConversationState` y `AuditLog`.

## Pruebas sin consumo externo

`FakeAIProvider` permite probar respuestas, composición de políticas, tools, rechazo, uso,
escalamiento e integración CRM sin gastar créditos. Las pruebas automatizadas nunca dependen de
OpenRouter. La validación real queda diferida a una actividad posterior con una clave y un modelo
autorizados; no forma parte de la construcción del manual maestro.

```bash
pnpm --filter @havona/api test
pnpm --filter @havona/api test:integration
```

## Verificación manual autorizada

1. Definir `OPENROUTER_API_KEY` y `AI_MODEL` en el entorno local no versionado.
2. Reiniciar exclusivamente el API.
3. Abrir `http://localhost:3000/henry` y aceptar el tratamiento de datos.
4. Iniciar una conversación con datos marcados como desarrollo.
5. Confirmar mensajes, `AIExecution`, `AIUsage` y `ToolCall` en
   `http://localhost:3000/administracion-henry`.
6. Confirmar actividad/prospecto en la ficha CRM.
7. Solicitar una persona y validar `Escalation` y la tarea resultante.

No publicar la clave, el contenido completo de la conversación ni información personal usada en
esta verificación.
