# HAVONA — Messaging & Email Template Intelligence Blueprint

## 1. Objetivo
Construir una capa enterprise de composición, personalización, aprobación y automatización de comunicaciones por email, reutilizable por consultores, Henry, CRM, Communications Core y Automations Core.

No es solo un catálogo de plantillas. Debe permitir tres modos operativos sobre una misma infraestructura:

1. **Manual**: el consultor selecciona, personaliza, previsualiza y envía.
2. **Asistido por Henry**: el consultor pide en lenguaje natural que Henry prepare o ejecute un correo usando contexto autorizado.
3. **Automatizado**: Automations Core programa o dispara comunicaciones según eventos y políticas.

Todo envío real pasa por Communications Core. Email Template Core nunca llama directamente a Resend.

## 2. Ejemplo de experiencia objetivo
Consultor: “Henry, envíale a Carlos un correo agradeciendo la reunión de hoy, adjunta la información de Vida Socios y agenda seguimiento para el jueves a las 3.”

Flujo esperado:
- Henry resuelve a Carlos dentro del scope autorizado.
- Consulta CRM y la oportunidad correcta.
- Consulta Calendar para la reunión y el siguiente espacio.
- Consulta Knowledge si debe incorporar hechos de producto.
- Selecciona una plantilla corporativa o genera un borrador ad hoc permitido.
- Resuelve variables y adjuntos autorizados.
- Prepara asunto, preheader, cuerpo, CTA y firma.
- Crea/actualiza la reunión si la instrucción lo requiere.
- Solicita confirmación cuando la política lo exija.
- Envía mediante Communications Core.
- Registra el mensaje final, template/version/variant y auditoría.
- Automations Core programa el siguiente paso si fue solicitado.

## 3. Modelo de plantillas

### 3.1 Corporate Master
Plantilla oficial de HAVONA. Solo ADMIN/SUPER_ADMIN o roles autorizados pueden administrar contenido maestro.

### 3.2 Personal Variant
Variante persistente del consultor basada en una master. Nunca sobrescribe la original. Debe registrar parentTemplateId y parentVersion.

### 3.3 One-off Draft
Edición puntual para un destinatario/envío. No modifica automáticamente la master ni la variante personal.

### 3.4 Ad-hoc Henry Draft
Henry puede componer un correo sin plantilla cuando la política lo permita, pero siempre debe respetar branding, protected blocks, consentimiento, permisos y Knowledge para afirmaciones corporativas.

## 4. Starter Corporate Library
La biblioteca inicial recomendada consta de 32 plantillas maestras; el sistema debe soportar cantidad ilimitada.

### Prospección — 5
- prospecting.introduction
- prospecting.referral
- prospecting.inbound
- prospecting.corporate
- prospecting.reactivation

### Reuniones — 5
- meeting.confirmation
- meeting.reminder
- meeting.reschedule
- meeting.cancellation
- meeting.no_show_followup

### Propuesta/diagnóstico — 6
- proposal.thank_you
- proposal.information_request
- proposal.delivery
- proposal.followup
- proposal.thinking
- proposal.decision_pending

### Vinculación/emisión — 6
- onboarding.documents_request
- onboarding.missing_documents
- onboarding.application_received
- onboarding.status_update
- onboarding.policy_issued
- onboarding.welcome

### Servicio/fidelización — 5
- service.periodic_review
- service.data_update
- service.coverage_review
- service.anniversary
- service.post_sale

### Pago/continuidad — 3
- payment.pending
- payment.failed
- payment.continuity_reminder

### Cancelación/recuperación — 2
- cancellation.retention
- cancellation.confirmation

Los textos definitivos deben pasar por aprobación editorial/comercial. No deben activarse copies ficticios o placeholder en producción.

## 5. Variables dinámicas
Debe existir un registry server-side de variables permitidas, por ejemplo:
- client.firstName
- client.fullName
- client.email
- consultant.firstName
- consultant.fullName
- consultant.email
- consultant.phone
- company.name
- opportunity.name
- product.name
- appointment.date
- appointment.time
- appointment.timezone
- meeting.url
- proposal.url

Una variable obligatoria ausente debe bloquear o advertir explícitamente según política. Nunca se debe enviar `{{variable}}` sin resolver.

## 6. Renderer
El renderer debe recibir template/variant, actor, recipient/context y overrides permitidos, y producir:
- subject
- preheader
- html
- text
- resolvedVariables
- missingVariables
- warnings
- protectedBlocksApplied

El resultado debe ser determinístico y sanitizado.

## 7. Branding y bloques protegidos
Centralizar layout compatible con email: logo HAVONA, fondo claro, navy, ice blue, blanco y champagne/gold controlado. No depender de CSS externo.

Protected blocks posibles:
- identidad legal/corporativa;
- footer;
- unsubscribe/opt-out cuando corresponda;
- disclaimers regulatorios;
- elementos obligatorios por tipo de comunicación.

Un consultor o Henry no puede eliminar ni modificar bloques bloqueados.

## 8. Firma del consultor
Firma generada desde perfil autorizado: nombre, cargo, teléfono, email y links aprobados. No aceptar scripts, HTML arbitrario ni impersonación de otro consultor sin permiso explícito.

## 9. Henry como operador de correo
Herramientas allowlisted sugeridas:
- list_email_templates
- get_email_template
- draft_email_from_template
- draft_ad_hoc_email
- personalize_email_template
- preview_email
- schedule_email
- send_email

`send_email` debe delegar en Communications Core y obedecer confirmaciones/policies existentes.

Henry debe soportar continuidad conversacional sobre un draft: “hazlo más corto”, “cambia el último párrafo”, “agrega la propuesta”, “envíalo mañana a las 8:30”.

## 10. Políticas de confirmación
Configurable por acción/rol/contexto:
- ALWAYS_CONFIRM
- CONFIRM_SENSITIVE
- TRUSTED_AUTOMATION

Un envío manual solicitado explícitamente podría requerir preview/confirmación según política. Automatizaciones preaprobadas pueden ejecutar sin confirmación individual siempre que cumplan consentimiento y límites.

## 11. Adjuntos
Henry/consultor puede adjuntar documentos autorizados. Debe validar propietario, cliente/oportunidad, versión, permisos, tamaño y tipo. Nunca adjuntar “el primer documento coincidente”.

## 12. Calendar/Meet
Una intención de correo puede incluir crear/reprogramar/cancelar una cita y generar Google Meet/HAVONA Meet según configuración. El correo usa el resultado de Calendar/Meet Core; no inventa URLs ni fechas.

## 13. Cadencias
Automations Core debe poder usar templates/variants en secuencias Día 0, Día N, etc. Una respuesta entrante, opt-out, takeover humano, cambio de estado o condición configurada debe poder detener la cadencia.

No enviar un seguimiento automático después de que el cliente ya respondió.

## 14. Threads y respuestas
Cuando el proveedor/arquitectura lo permitan, los seguimientos deben conservar hilo. Communications Core mantiene external IDs y delivery states; Email Template Core solo compone.

## 15. Borradores de respuesta entrante
Cuando llega un email, Henry puede clasificar intención de manera controlada y preparar un borrador. Casos sensibles se escalan a humano. No responder automáticamente a reclamaciones, cancelaciones delicadas o decisiones regulatorias sin política explícita.

## 16. Programación
Debe soportar “send later” y órdenes naturales como “mañana a las 8:30”. La programación debe usar Automations Core/BullMQ, timezone explícito, idempotencia y posibilidad de cancelación previa cuando corresponda.

## 17. Consentimiento y supresión
Ninguna plantilla, Henry ni Automation puede saltarse suppression/consent de Communications Core. Comunicaciones promocionales deben incluir opt-out conforme a política.

## 18. Seguridad
- sanitización HTML;
- escape contextual de variables;
- bloqueo de script/iframe/event handlers/javascript URLs;
- rate limit para test sends;
- anti-impersonation;
- no secretos en templates;
- no variables arbitrarias no registradas;
- idempotencia de envío;
- snapshot inmutable del contenido enviado.

## 19. Versionado y auditoría
Cambiar una master activa crea nueva versión. Cada mensaje enviado debe conservar al menos templateId, templateVersion, variantId si existe y snapshot final. Históricamente debe ser posible saber exactamente qué se envió aunque la plantilla cambie después.

## 20. UI
Ruta recomendada: `/comunicaciones/plantillas`.

Funciones: listar, buscar, filtrar, favoritos, recientes, master/personal, crear variante, duplicar, editar campos permitidos, previsualizar, test send, activar/inactivar, archivar, revisar versiones y UPDATE_AVAILABLE.

Desde CRM/cliente/oportunidad: acciones rápidas Email, WhatsApp, Agendar, Crear tarea, Henry.

## 21. Automatización compuesta
Henry debe poder transformar una intención en varias acciones coordinadas. Ejemplo:
“Envía la propuesta, agenda seguimiento dentro de 5 días y si no responde recuérdame llamarlo.”

Resultado: Email → registro Communications → schedule Automation → task/escalation según condición.

## 22. Operaciones por lote
Caso enterprise:
“Encuentra los clientes con propuesta presentada esta semana y sin próxima cita; prepara los correos.”

CRM/Analytics determina entidades autorizadas; Calendar verifica agenda; Template Core compone; Henry personaliza; UI presenta lote para aprobación; Communications envía; Automations programa seguimiento.

No se permite selección por lote que el actor no pueda consultar individualmente.

## 23. Analytics
Métricas permitidas: uso por template/version, sent/delivered/failed/bounced/complained cuando exista, response time, replies y asociaciones posteriores con funnel. Evitar atribución causal falsa. Puede decirse “oportunidades ganadas que utilizaron plantilla X”, no “X ventas fueron causadas por plantilla X”.

## 24. A/B testing futuro
Preparar extensión para variantes de asunto/CTA solo con volumen y metodología suficientes. No implementar conclusiones estadísticas engañosas.

## 25. Integración Knowledge/RAG
Henry puede usar conocimiento publicado para personalizar contenido factual. Si Knowledge Core no sustenta una afirmación de producto/política, Henry no la inventa. Hechos corporativos y recomendaciones deben distinguirse.

## 26. Multicanal
El dominio debe evolucionar a templates/intents reutilizables para Email y WhatsApp sin duplicar lógica. Fallback de canal solo cuando exista consentimiento y una Automation explícita.

## 27. Criterio de aceptación
El módulo se considera enterprise cuando permite el mismo resultado por UI, Henry o Automation, preservando RBAC, consentimiento, versionado, auditoría, idempotencia, branding y Communications Core como único gateway de envío.
