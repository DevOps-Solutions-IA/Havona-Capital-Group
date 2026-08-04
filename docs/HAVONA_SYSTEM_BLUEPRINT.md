# HAVONA CAPITAL GROUP — Enterprise System Blueprint

## 1. Propósito
HAVONA es una plataforma empresarial de consultoría patrimonial, operación comercial, CRM, comunicaciones, automatización, agenda, reuniones, analítica e inteligencia asistida por IA. Henry es el copiloto transversal del sistema, pero no reemplaza los dominios autoritativos: consume CRM, Calendar, Meet, Communications, Automations, Analytics y Knowledge a través de herramientas server-side autorizadas.

## 2. Principios no negociables
- Ninguna funcionalidad visible debe ser cosmética o simulada.
- No se permiten métricas, estados, citas, mensajes, oportunidades o documentos ficticios en producción.
- Todo acceso respeta RBAC y scope server-side.
- Los secretos permanecen fuera del repositorio.
- Henry no accede directamente a proveedores cuando existe un Core transversal.
- Las decisiones de alto impacto y envíos sensibles pueden requerir confirmación humana según política.
- Todo dato autoritativo debe ser trazable a su fuente.
- La IA nunca debe inventar conocimiento corporativo, cifras, estados CRM o hechos de agenda.

## 3. Arquitectura funcional actual

### 3.1 CRM Core
Gestiona prospectos, empresas, oportunidades, pipeline, asignaciones, historial, notas, tareas, interacciones, auditoría, tags, clientes y aislamiento por rol.

### 3.2 Henry Core
Un único cerebro orquestador. Modos principales: PUBLIC_ADVISOR, EXPERT_COPILOT, SALES_COACH, CRM_INTELLIGENCE, DECISION_SUPPORT, KNOWLEDGE_ASSISTANT, TEACH_MODE y CORPORATE_ASSISTANT. Henry usa herramientas permitidas y mantiene separación entre hechos, memoria, recomendaciones y conocimiento.

### 3.3 Voice Core
Arquitectura STT → Henry Core → TTS mediante ElevenLabs. La voz no crea un segundo cerebro. La validación externa definitiva queda para preproducción/VPS.

### 3.4 Calendar Core
Capa corporativa para Google Calendar y futuras agendas. Soporta disponibilidad, eventos propios/equipo, ownership, relaciones CRM y scopes de CONSULTOR, GERENTE, ADMIN y SUPER_ADMIN.

### 3.5 HAVONA Meet Core
Capa de reuniones con abstraction de MeetingProvider y Jitsi como proveedor previsto. Soporta salas seguras, invitaciones, participantes, join tokens, roles, eventos y vínculo con Calendar/CRM/Henry.

### 3.6 Communications Core
Capa omnicanal transversal para WhatsApp y Email. Gestiona hilos, participantes, mensajes, adjuntos, conexiones, delivery events, asignaciones, consentimientos, templates de WhatsApp, webhooks y modos HENRY/HUMAN/PAUSED/CLOSED. Meta y Resend permanecen sujetos a validación externa final.

### 3.7 Automations Core
Motor determinístico de workflows con triggers, acciones, ejecuciones, schedules, enrollments, outbox, supresiones, aprobaciones, retries, timeouts, idempotencia y BullMQ/Redis. Integra CRM, Calendar, Communications y Henry sin bypass de dominios.

### 3.8 Analytics & Commercial Intelligence Core
Capa semántica de métricas, funnel, pipeline intelligence, risk scoring explicable, prioridades, metas, cohortes, comparaciones, anomalías, calidad de datos, Communications Analytics, Automations Analytics y Henry Analytics. Henry consulta Analytics; no calcula KPIs autoritativos por su cuenta.

### 3.9 Knowledge/RAG/Training/Memory — Fase 8 en ejecución
Objetivo: conocimiento corporativo versionado, ingestion, chunking, embeddings, búsqueda híbrida, RAG, citas, training, role play, evaluaciones, memoria gobernada y portal interno. Esta documentación no declara la fase cerrada hasta recibir validación final.

## 4. Modelo de orquestación

Usuario/Consultor/Gerente/Admin
→ UI o Henry
→ Policy + RBAC
→ Core de dominio correspondiente
→ Provider externo cuando aplique
→ Persistencia + auditoría
→ Analytics/Automations como consumidores de hechos

Henry puede coordinar acciones múltiples, pero nunca debe saltarse Communications Core, Calendar Core, Meet Core, Analytics Core, Knowledge Core o CRM para hablar directamente con proveedores externos.

## 5. RBAC global
- CONSULTOR: alcance propio autorizado.
- GERENTE: alcance propio + equipo explícitamente autorizado.
- ADMIN: alcance administrativo según permisos.
- SUPER_ADMIN: alcance global.

Todo filtro enviado por navegador se valida nuevamente en servidor. No se confía en consultantId, managerId, teamId, ownerId ni similares provenientes del cliente.

## 6. Observabilidad y auditoría
El sistema debe registrar eventos suficientes para reconstruir acciones críticas: cambios CRM, envíos, fallos, asignaciones, calendar events, meetings, automation executions, aprobaciones, analytics goals, knowledge publication, memory writes/deletes y uso de herramientas de Henry.

## 7. Proveedores externos previstos
- OpenRouter: inferencia de Henry.
- ElevenLabs: STT/TTS.
- Google Calendar: agenda y Google Meet cuando aplique.
- Jitsi: HAVONA Meet.
- Meta WhatsApp Cloud API: mensajería WhatsApp.
- Resend: email transaccional/comercial.

La arquitectura debe permitir abstraer proveedor sin reescribir dominio.

## 8. Regla de cierre enterprise
Ninguna fase se considera cerrada únicamente porque compile. El cierre exige: migraciones, seed idempotente, lint, typecheck, unit tests, web tests, integración, build productivo, Compose, imágenes Docker, salida natural de procesos y CI verde. Las integraciones externas deben distinguir claramente entre implementación técnica y validación E2E real.

## 9. Pendientes antes del cierre integral
1. Finalizar Fase 8 y validar Knowledge/RAG/Training/Memory.
2. Implementar Messaging & Template Intelligence Layer para email y futura composición multicanal.
3. Crear biblioteca corporativa de plantillas y políticas de personalización.
4. Completar Resend externo, Meta WhatsApp, Google OAuth/Calendar y Jitsi en preproducción.
5. Incorporar valor monetario y expected close date en Opportunity para habilitar pipeline monetario/forecast real.
6. Revisar PR #4 completa, documentación y contrato de configuración.
7. Preparar preproducción/VPS, DNS, HTTPS, secretos, observabilidad y E2E final.
