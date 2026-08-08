# HAVONA Resend Production Integration

## Estado

`CODE_READY / EXTERNAL VALIDATION PENDING`.

La integración productiva no se considera validada mientras no exista evidencia del dashboard/API
de Resend, DNS verificado, webhook HTTPS registrado y una entrega real controlada. En el entorno de
construcción todas las variables Resend están ausentes y la consulta DNS pública del subdominio no
devolvió registros. No se realizó envío externo.

## Pre-flight y decisiones

| Elemento         | Antes de Fase G                                             | Decisión                                     |
| ---------------- | ----------------------------------------------------------- | -------------------------------------------- |
| Provider API     | `ResendEmailProvider` con fetch, timeout e idempotencia     | KEEP; usa transporte compartido              |
| Worker           | Segundo fetch Resend independiente                          | REPLACE; consume el mismo transporte tipado  |
| Estados          | QUEUED, SENT, DELIVERED, FAILED                             | MIGRATE; añade SENDING, BOUNCED y COMPLAINED |
| Webhook          | Raw body y Svix manual con ventana de cinco minutos         | KEEP y probar                                |
| Deduplicación    | find previo seguido de create                               | REPLACE por create atómico + P2002           |
| Eventos tardíos  | Sobrescribían el estado sin precedencia                     | REPLACE por transición monotónica            |
| Bounce/complaint | Ambos se colapsaban en FAILED                               | REPLACE y crear suppression                  |
| Retry            | Toda excepción llegaba a BullMQ                             | MIGRATE; solo errores transitorios           |
| Attachments      | Draft guardaba referencias, sin blob autorizado en dispatch | BLOCK SAFE; no fingir envío                  |
| PALIG            | Opportunity gobernada, sin revalidación al enviar           | MIGRATE; revalidación autoritativa final     |
| Genericidad      | Sin carriers/productos alternos; `interest` sigue legacy    | KEEP/DEFER_TO_K                              |

## Boundary

```text
CRM / Henry / Automations / Cadences
  → Email Template Core
  → Communications Core (persistencia, policy, claim y cola)
  → Resend transport
  → webhook firmado
  → MessageDeliveryEvent / estado / suppression / audit / analytics
```

No existe import de Resend en CRM, Henry, Cadences, Automations o Web. El worker es el ejecutor de
Communications Core y consume el mismo transporte que `ResendEmailProvider`; no contiene una segunda
implementación HTTP.

## Configuración real

- `EMAIL_PROVIDER`
- `RESEND_ENABLED`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_FROM_NAME`
- `RESEND_REPLY_TO`
- `RESEND_WEBHOOK_SECRET`
- `RESEND_WEBHOOK_URL`
- `RESEND_REQUEST_TIMEOUT_MS`

`RESEND_ENABLED=true` no basta: API key y From son obligatorios. El From debe pertenecer a
`mail.havonacapitalgroup.com`. CI/test/dev no habilitan Resend por defecto. Los valores secretos no
se imprimen ni se devuelven en config-status.

## Envío y retries

El payload transporta From corporativo, recipient autorizado, subject, HTML/text, reply-to
configurado y `Idempotency-Key`. Resend retiene su idempotencia durante 24 horas; HAVONA conserva
además clave única persistente y job ID estable. HTTP exitoso significa `SENT` (aceptado), nunca
`DELIVERED`.

El timeout es configurable. HTTP 408/429/5xx y conflicto concurrente idempotente son transitorios.
Errores de validación, sender, policy, recipient, consentimiento, suppression, template, PALIG o
adjuntos no materializados son permanentes y no se reintentan.

## Revalidación inmediatamente anterior al I/O

El worker reclama atómicamente `QUEUED → SENDING` y revalida thread, email normalizado, Prospect
actual, consentimiento por clasificación, suppression, versión/template ACTIVE y `LEGAL_APPROVED`,
adjuntos y CustomerNeed/Solution/Product actuales. Producto requiere estado ACTIVE, carrier
`PAN_AMERICAN_LIFE_COLOMBIA` y mapping vigente. Discovery con necesidad y sin producto continúa
permitido. `Prospect.interest` nunca se traduce a producto.

## Webhook y estados

Ruta: `POST /api/v1/integrations/resend/webhook`.

Requiere raw body y headers `svix-id`, `svix-timestamp`, `svix-signature`. La firma usa
`id.timestamp.payload`, comparación constante y ventana de cinco minutos. `svix-id` es la identidad
idempotente; una carrera se resuelve mediante constraint y P2002.

| Evento Resend      | Estado HAVONA | Efecto                                                |
| ------------------ | ------------- | ----------------------------------------------------- |
| `email.sent`       | SENT          | aceptación del provider                               |
| `email.delivered`  | DELIVERED     | timestamp real de entrega                             |
| `email.bounced`    | BOUNCED       | suppression y thread bloqueado/pausado                |
| `email.complained` | COMPLAINED    | suppression de alto riesgo y thread bloqueado/pausado |
| `email.failed`     | FAILED        | fallo sin fingir bounce                               |

Eventos desconocidos se registran y ACK sin mutar el mensaje. Un `email.sent` tardío no degrada
DELIVERED/READ; FAILED no degrada una entrega; complaint puede avanzar desde delivered.

## Adjuntos, reply-to y privacidad

El transporte soporta contenido base64 tipado, pero el flujo productivo bloquea referencias de
Draft hasta que Storage Core entregue bytes escaneados y autorizados. No se usan paths locales ni
URLs arbitrarias. Reply-to actual es corporativo por configuración; reply-to dinámico de consultor
queda pendiente y no acepta valores del browser.

Logs estructurados solo incluyen message ID, estado y códigos seguros. Los webhooks auditan estados.
No se registran API keys, Authorization, bodies completos ni adjuntos. Analytics separa sent,
delivered, bounced, complained y failed; asociación no implica causalidad.

## Validación externa pendiente

Estado observado el 7 de agosto de 2026:

- configuración Resend local: missing;
- estado del dominio Resend: no consultable sin cuenta/configuración autorizada;
- SPF y DKIM: no demostrados;
- webhook real y sender: no demostrados;
- E2E: no ejecutado;
- provider message ID y webhook delivered reales: no obtenidos.

Único siguiente paso externo: un administrador autorizado debe agregar
`mail.havonacapitalgroup.com` en Resend y entregar por el canal seguro de infraestructura el estado
y los registros DNS exactos que Resend genere. No se deben copiar secretos en tickets o chat. DNS no
se modifica automáticamente.
