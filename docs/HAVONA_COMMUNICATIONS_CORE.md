# HAVONA Communications Core

La documentación operacional completa permanece en `docs/HAVONA_COMMUNICATIONS.md`. Este contrato
resume el cierre Fase G:

- todo dispatch nace en Communications Core;
- BullMQ es su brazo persistente de ejecución;
- Resend es transporte, no autoridad comercial;
- `SENT` significa aceptación y `DELIVERED` requiere webhook;
- BOUNCED y COMPLAINED son estados explícitos con suppression;
- consentimiento, recipient, template y PALIG se revalidan antes del I/O;
- Henry, CRM, Web, Automations y Cadences no importan providers;
- inbound Resend permanece deshabilitado hasta configurar receiving real.

Consultar `docs/HAVONA_RESEND_PRODUCTION_INTEGRATION.md` para pre-flight, mapping, seguridad,
configuración y validación externa.
