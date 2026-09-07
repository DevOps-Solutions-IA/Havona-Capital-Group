# HAVONA Enterprise Cadences

## Arquitectura

Cadences es una capa de orquestación comercial de HAVONA CAPITAL GROUP. Conserva definiciones, versiones, inscripciones y trazabilidad, pero reutiliza el scheduler, la cola, la recuperación y la ejecución persistente de Automations Core. Los mensajes se renderizan con Email Template Core y se despachan exclusivamente mediante Communications Core.

No existe `CadenceWorker`, cron, cola, proveedor ni instancia de Henry paralela. El job `automation.cadence-step` vive en la cola BullMQ existente.

## Dominio y versionado

- `CommunicationCadence`: identidad y lifecycle `DRAFT → REVIEW → APPROVED → ACTIVE`; también `INACTIVE` y `ARCHIVED`.
- `CadenceVersion`: contrato inmutable de roles, canales, inscripción, stops, approvals, frecuencia, ventana y lifetime.
- `CadenceStep`: orden, tipo, delay, template, evidence y approval mode.
- `CadenceEnrollment`: versión exacta, contexto CRM/thread, estado, próximo paso, expiración y stop reason.
- `CadenceStepExecution`: claim, job, idempotencia y efecto observable.

Una versión activa no se modifica. Toda edición crea otra versión y cada enrollment conserva la original.

## Pasos

Allowlist: `SEND_EMAIL`, `PREPARE_EMAIL`, `SEND_WHATSAPP_FUTURE`, `CREATE_TASK`, `WAIT`, `CHECK_CONDITION`, `ESCALATE`, `SUGGEST_MEETING`, `END`. WhatsApp futuro se rechaza mientras el provider no esté operativo. Los pasos de envío automático requieren policy explícita y template gobernada.

## Enrollment y plan

Antes de inscribir se valida scope CRM, rol, versión activa, email, thread, consentimiento, estado humano, evidencia y duplicado determinístico. Henry solo elige cadencias aprobadas y parametriza campos permitidos; la confirmación es explícita y el plan muestra pasos, tiempos, templates, stops y approval policy.

## Scheduling, ventanas y recuperación

Los delays se convierten en jobs persistentes BullMQ. La ventana por defecto es lunes a viernes, 08:00–18:00, `America/Bogota`, configurable por versión. Tras pausa, resume recalcula desde el momento actual y nunca libera de golpe pasos vencidos. Los jobs delayed persisten en Redis y los registros `SCHEDULED` conservan la trazabilidad tras reinicio.

## Stop conditions

Stops soportados: `CUSTOMER_REPLIED`, `MEETING_SCHEDULED`, `OPPORTUNITY_CLOSED`, `PROSPECT_DISQUALIFIED`, `OPT_OUT`, `SUPPRESSED`, `HUMAN_TAKEOVER`, `THREAD_PAUSED`, `THREAD_CLOSED`, `DOCUMENT_RECEIVED`, `MANUAL_STOP`, `CADENCE_COMPLETED`, `ERROR_POLICY`.

Solo eventos persistidos con evidencia provocan stops. `COMMUNICATION_INBOUND` detiene por respuesta real sin depender de clasificación Henry. Opt-out actualiza consentimiento en Communications y el evento cancela pasos. Las citas solo afectan versiones que declaran `MEETING_SCHEDULED`. Documento recibido exige evento autoritativo; no se infiere por subject.

## Carreras e idempotencia

Cada step realiza claim condicional `SCHEDULED → CLAIMED` solamente con enrollment activo y no expirado. Después recarga, revalida y reclama la frontera final `CLAIMED → DISPATCHING`. Si el stop ya está persistido, este claim falla y no envía. Cada enrollment, step y mensaje usa claves determinísticas; la semántica at-least-once de BullMQ produce un efecto comercial efectivo una sola vez.

## Revalidación

Antes de cada efecto se revisan enrollment/lifetime, prospect/opportunity, thread, takeover, consentimiento/supresión, email, template ACTIVE y `LEGAL_APPROVED`, evidencia y frequency caps globales por contacto. Los estados de fallo distinguen bloqueos de policy de errores temporales retryables.

## Frecuencia y consentimiento

La versión define máximo diario, máximo siete días e intervalo mínimo. El conteo atraviesa cadencias del mismo prospecto para impedir evasión inscribiendo dos secuencias. Ninguna capa puede saltarse Communications Core.

## RBAC

CONSULTOR gestiona inscripciones propias; GERENTE amplía únicamente a miembros explícitos de su equipo; ADMIN/SUPER_ADMIN gobiernan definiciones y ámbito global. Todos los IDs se vuelven a resolver server-side.

## Henry, CRM, Analytics y auditoría

Tools allowlisted: `list_eligible_cadences`, `start_cadence`, `get_cadence_status`, `pause_cadence`, `resume_cadence`, `stop_cadence`, `explain_cadence`. CRM ofrece elegibilidad por prospecto/oportunidad. Analytics expone enrollments, completadas, fallidas y detenidas por respuesta sin atribuir ventas. Se auditan creación, versión, lifecycle, inscripción, scheduling, ejecución, fallo, pausa, resume y stop; no se almacena chain-of-thought.

## Configuración

- `CADENCE_DEFAULT_TIMEZONE=America/Bogota`
- `CADENCE_MAX_LIFETIME_DAYS=30`
- `CADENCE_MAX_CONTACT_SENDS_PER_DAY=1`
- `CADENCE_MIN_SEND_INTERVAL_MINUTES=1440`

Los valores son límites conservadores de configuración, no campañas activas. La biblioteca inicial se siembra en `DRAFT` con un paso estructural `END`; no envía nada hasta aprobación humana, templates operativas y activación.

## Limitaciones

Meta WhatsApp y Resend productivos continúan pendientes de validación externa. Payment y document-received requieren fuentes autoritativas. Clasificación semántica de replies puede enriquecer decisiones futuras, pero nunca sustituye el hecho inbound ni gobierna consentimiento.
