# FASE 3 — HENRY WEB

## Estado y objetivo

**Estado: EN CONSTRUCCIÓN**

Rama: `feature/fase-03-henry-web`  
Versión objetivo: `v0.4.0`

## Ampliación operativa de voz

La Fase 3 incorpora voz web desacoplada con ElevenLabs sin crear otro Henry ni otra conversación.
`VOICE` es un canal de `Conversation`, con sesiones de transporte y consumo auditables. Incluye
STT, TTS, micrófono accesible en la experiencia existente, continuidad multimodal, fallback
textual y gateway Custom LLM protegido. Razonamiento y acciones permanecen en Henry Core. La
validación externa depende de credenciales locales autorizadas y no se simula en CI.

## Ampliación operativa de agenda

Henry integra Agenda Inteligente mediante `CalendarProvider` y `GoogleCalendarProvider`, sin crear
otro cerebro ni Conversation Engine. Incluye OAuth server-side, tokens cifrados, FreeBusy, reglas
por usuario, tools confirmables, eventos vinculados con CRM, idempotencia, sync tokens,
`events.watch` y UI `/agenda`. Google Meet es una opción nativa de Calendar; no inicia Havona Meet.
La operación se detalla en `HENRY_AGENDA_GOOGLE_CALENDAR.md`.

Henry es el asistente virtual de HAVONA CAPITAL GROUP. Esta fase construye un canal web real,
persistente, auditable e integrado con el CRM. Henry siempre se identifica como asistente virtual,
no reemplaza al consultor y no promete resultados, coberturas ni decisiones contractuales.

## Límites de fase

Incluye conversación web, clasificación asistida por modelo y reglas, captación autorizada,
herramientas controladas, contexto CRM, escalamiento humano, memoria controlada, observabilidad,
costos y administración. Las ampliaciones autorizadas añaden voz web y Agenda Google. No incluye
WhatsApp, correo conversacional, Havona Meet, automatización omnicanal ni IA predictiva.

Los canales `WHATSAPP` y `EMAIL` permanecen como contratos futuros. `WEB` y `VOICE` comparten el
único dominio conversacional; Calendar funciona como integración/tool, no como canal.

## Arquitectura

```text
Web /henry
→ API versionada
→ consentimiento y políticas
→ HenryOrchestrator
   ├── ConversationContext
   ├── Guardrails
   ├── AIProvider
   │   └── OpenRouterProvider
   ├── ToolRegistry allowlist
   │   └── servicios CRM existentes
   └── Persistence / Audit / Usage
→ respuesta persistida
→ actividad CRM autorizada
```

### Capa transversal web

Henry no es únicamente la ruta `/henry`. Existe un solo cerebro y dos presentaciones de la misma
capa conversacional: el modo completo `/henry` y `HenryGlobalAssistant`, disponible en el sitio
público y dentro del portal autenticado. La sesión y el borrador sobreviven a la navegación; el
cambio de página actualiza el contexto autorizado sin crear otro asistente ni otra conversación.

La composición efectiva es:

```text
Henry Core + Manual Maestro + Policy Engine + Role Context + Page Context
+ CRM Context autorizado + Channel Context + Tool Permissions
```

`PageContext` contiene exclusivamente tipo de página, pistas editoriales e identificadores mínimos.
El navegador nunca envía expedientes completos ni decide permisos. `HenryContextService` deriva
`HenryRoleContext` desde la sesión (`PUBLIC`, `CLIENT`, `CONSULTANT`, `MANAGER`, `ADMIN` o
`SUPER_ADMIN`), vuelve a consultar la entidad con el scope CRM aplicable y entrega al modelo solo
datos permitidos. Un contexto manipulado se rechaza antes de invocar al proveedor.

En contexto CRM Henry distingue `CONOCIDO`, `FALTANTE`, `INFERIDO` y `NO AUTORIZADO`. Un consultor
solo puede acceder a prospectos asignados. Las herramientas se filtran por rol antes de enviarse al
proveedor y vuelven a autorizarse antes de ejecutarse. Las acciones persistentes sensibles, como
crear una tarea, requieren confirmación explícita.

El modelo nunca accede directamente a Prisma, PostgreSQL ni Redis. Toda mutación atraviesa una
herramienta registrada, validada, autorizada y auditada. El orquestador aplica un máximo
configurable de iteraciones y llamadas a herramientas por turno.

### Cerebro modular

El comportamiento deriva de `HENRY_MANUAL_MAESTRO.md`. `HenryPolicyComposer` compone identidad,
tono, venta consultiva, cierre, atención, escalamiento, conocimiento, guardrails y tools según el
estado. `HenryPolicyEngine` aplica reglas deterministas antes y después del modelo. Las políticas
tienen identificador y versión; no existe un único prompt gigante como fuente de conducta.

Estados: saludo, descubrimiento, diagnóstico, calificación, educación, objeción, cierre, agenda,
escalamiento, seguimiento y soporte. Cada transición sensible registra política y regla causal.

### Ampliación 3.1 — Expert Copilot

La ampliación mantiene un único Henry, una conversación, un provider, un composer y un motor de
tools. `HenryExpertCopilotService` deriva el modo desde objetivo, rol server-side, página, entidad y
evidencia autorizada. Cubre asistencia pública, copiloto experto, entrenamiento comercial,
inteligencia CRM, soporte de decisiones, enseñanza y conocimiento corporativo.

La inteligencia CRM calcula hechos verificables —campos faltantes, tareas vencidas, última
interacción, etapa y prioridad registrada— dentro del scope RBAC. No presenta agenda futura,
probabilidades, ventas cruzadas ni indicadores sin evidencia. Una recomendación incluye motivo,
beneficios, riesgos, alternativas, confianza y fuentes, y no ejecuta mutaciones sin permiso.

`ConversationState` conserva memoria corporativa mínima mediante referencias autorizadas.
`AIExecution.policyContext` y metadata de mensajes registran política, regla, rol, página,
confianza, tipo de razonamiento, fuentes y decisión de tool sin almacenar prompts, secretos ni
cadenas de pensamiento.

## Proveedores de IA

`AIProvider` desacopla la orquestación del proveedor. La primera implementación operativa usa la
API compatible de OpenRouter; DeepSeek directo y otros proveedores podrán añadirse sin cambiar el
dominio de conversación.

Configuración prevista:

```text
AI_PROVIDER=openrouter
AI_MODEL=<modelo autorizado>
OPENROUTER_API_KEY=<secreto local o del entorno>
AI_BASE_URL=https://openrouter.ai/api/v1
AI_TIMEOUT_MS=30000
AI_MAX_RETRIES=2
AI_MAX_INPUT_TOKENS=8000
AI_MAX_OUTPUT_TOKENS=1200
AI_MAX_TOOL_CALLS=4
AI_TEMPERATURE=0.2
```

Proveedor y modelo son obligatoriamente configurables. Si falta clave o modelo, la API devuelve un
estado explícito de configuración no disponible y no fabrica respuestas. Secretos, prompts con
datos personales y claves nunca se escriben en logs.

## Dominio persistente

- `Conversation`: canal, estado, intención, prospecto relacionado y consentimiento.
- `ConversationParticipant`: actor humano, prospecto, usuario interno o asistente.
- `Message`: actor, rol, contenido saneado, origen, estado y metadata segura.
- `ConversationState`: estado estructurado y memoria reciente controlada.
- `AIExecution`: proveedor, modelo, latencia, resultado, límites y error redacted.
- `ToolCall` / `ToolResult`: solicitud validada, ejecución y resultado estructurado.
- `Escalation`: motivo, estado, responsable y resolución humana.
- `AIUsage`: tokens reportados y costo solo cuando el proveedor lo informa.

Los mensajes e historiales de ejecución no se editan arbitrariamente. Las inferencias del modelo no
se convierten en datos comerciales verdaderos hasta que una herramienta las valida y persiste.

## Herramientas iniciales

- `get_prospect_context`
- `create_or_update_prospect`
- `register_interaction`
- `create_crm_activity`
- `create_task`
- `qualify_prospect`
- `request_human_escalation`
- `get_available_consultants`
- `request_appointment_intent`

Cada herramienta utiliza esquemas estrictos, una allowlist, contexto de autorización y servicios
de dominio. Una herramienta desconocida o no autorizada se rechaza, registra y no se ejecuta.

## Intenciones y escalamiento

Intenciones iniciales: pensión, educación, patrimonio, protección familiar, accidentes,
empresarios, socios, socio único, consultores, hablar con asesor, agendar y otra consulta. La
clasificación combina salida estructurada del modelo con reglas de negocio; no depende solo de
palabras clave.

Henry escala cuando el usuario lo solicita, hay baja confianza, información sensible, intención no
soportada, error repetido, límite operativo o una política lo exige. El escalamiento crea
`Escalation`, actividad CRM y tarea interna cuando corresponde.

## Privacidad y seguridad

- Información y consentimiento antes de persistir datos personales.
- Llamadas al modelo exclusivamente desde servidor.
- Rate limiting, límites de payload, sanitización y validación de entrada/salida.
- CSRF y sesión en acciones internas autenticadas.
- Protección contra prompt injection mediante separación de instrucciones, herramientas allowlist
  y autorización independiente del modelo.
- Redacción de secretos y minimización de información personal en logs.
- Límite de iteraciones, timeout, reintentos acotados y escalamiento ante fallo seguro.

Henry no inventa cifras, rentabilidades, garantías, coberturas ni aprobaciones; no brinda asesoría
legal o tributaria definitiva y no ejecuta operaciones críticas sin autorización humana.

## Autorización administrativa

`SUPER_ADMIN` y `ADMIN` pueden consultar todas las conversaciones y ejecuciones. `GERENTE` consulta
el ámbito comercial autorizado. `CONSULTOR` consulta únicamente conversaciones asociadas a
prospectos u oportunidades dentro de su asignación. Los mensajes históricos son de solo lectura.

El panel interno expone conversaciones, estado, prospecto, intención, canal, escalamiento,
mensajes, ejecuciones, llamadas a herramientas, errores redacted y métricas calculadas únicamente
desde datos reales.

## UX y accesibilidad

`/henry` interpreta el lenguaje visual maestro de la Home como una experiencia conversacional
propia, luminosa y editorial, no como un widget SaaS genérico. Debe soportar teclado, foco visible,
lectores de pantalla, contraste, estados de carga/error/reintento y `prefers-reduced-motion`.

`HenryGlobalAssistant` utiliza launcher no invasivo, panel flotante en escritorio y experiencia de
pantalla completa en móvil. Expone estados online, pensando, ejecutando y escalando. `/henry` y el
launcher reutilizan `HenryConversation`; no duplican red, persistencia ni reglas de sesión. Las
respuestas se renderizan sin HTML mediante un formato editorial seguro que admite párrafos,
énfasis, listas y enlaces internos o corporativos autorizados.

## Pruebas requeridas

- Creación de conversación y consentimiento.
- Persistencia ordenada de mensajes.
- Asociación y aislamiento CRM.
- Herramientas permitidas, inválidas y no autorizadas.
- Límite de loops y tool calls.
- Timeout, error de proveedor y escalamiento.
- Registro exacto de uso, latencia y costo informado.
- Guardrails y acciones prohibidas.
- RBAC administrativo.
- Persistencia de conversación durante navegación y actualización de `PageContext`.
- Aislamiento de contexto entre consultores y rechazo de identificadores manipulados.
- Permisos de herramientas por rol y confirmación de acciones sensibles.
- Renderer estructurado seguro, launcher global y experiencia móvil.
- Expert Copilot, Sales Coach, Teach Mode, conocimiento corporativo y soporte de decisiones.
- Inteligencia CRM con evidencia real, memoria corporativa y recomendaciones confirmables.
- Auditoría de confianza, tipo de razonamiento, fuentes y decisión de herramientas.

La suite automatizada utiliza un `FakeAIProvider` determinista sin consumo externo. La prueba real
de OpenRouter solo se ejecuta localmente con credenciales autorizadas fuera de Git.

## Criterio de revisión

La fase se presentará para aprobación cuando exista conversación real con proveedor configurable,
persistencia, tools CRM, escalamiento, observabilidad, administración, UX premium y CI verde. El PR
permanece Draft; no se crea `release(fase-03)`, `v0.4.0` ni merge hasta aprobación expresa.

## Avance implementado

A la fecha, la rama contiene dominio Prisma y migración, provider OpenRouter intercambiable,
orquestador, memoria controlada, tools CRM allowlisted, escalamiento, uso/costo reportado, RBAC,
API pública/administrativa, experiencia `/henry`, centro `/administracion-henry` y pruebas con
provider fake. También incorpora el manual maestro, catálogo de objeciones, cierre responsable,
atención y escalamiento, políticas modulares y observabilidad de decisiones. La prueba manual con
OpenRouter real queda expresamente diferida a la siguiente validación y requerirá
`OPENROUTER_API_KEY` y `AI_MODEL`; su ausencia mantiene la fase en construcción y no provoca
respuestas simuladas.
