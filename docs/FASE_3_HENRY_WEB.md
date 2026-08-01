# FASE 3 — HENRY WEB

## Estado y objetivo

**Estado: EN CONSTRUCCIÓN**

Rama: `feature/fase-03-henry-web`  
Versión objetivo: `v0.4.0`

Henry es el asistente virtual de HAVONA CAPITAL GROUP. Esta fase construye un canal web real,
persistente, auditable e integrado con el CRM. Henry siempre se identifica como asistente virtual,
no reemplaza al consultor y no promete resultados, coberturas ni decisiones contractuales.

## Límites de fase

Incluye conversación web, clasificación asistida por modelo y reglas, captación autorizada,
herramientas controladas, contexto CRM, escalamiento humano, memoria controlada, observabilidad,
costos y administración. No incluye WhatsApp, correo conversacional, voz, agenda completa, Havona
Meet, automatización omnicanal ni IA predictiva.

Los canales `WHATSAPP`, `EMAIL` y `VOICE` existen únicamente como contratos futuros. En Fase 3 solo
`WEB` puede iniciar intercambios.

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

El modelo nunca accede directamente a Prisma, PostgreSQL ni Redis. Toda mutación atraviesa una
herramienta registrada, validada, autorizada y auditada. El orquestador aplica un máximo
configurable de iteraciones y llamadas a herramientas por turno.

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
provider fake. La prueba manual con OpenRouter real requiere que el entorno autorizado suministre
`OPENROUTER_API_KEY` y `AI_MODEL`; su ausencia mantiene la fase en construcción y no provoca
respuestas simuladas.
