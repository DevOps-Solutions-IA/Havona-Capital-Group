# Memoria extendida de Henry

HAVONA separa conversación, working memory, preferencias persistentes, CRM, Analytics y Knowledge. Cada hecho conserva origen y no sustituye fuentes corporativas.

`MemoryPolicy` clasifica escrituras como `EPHEMERAL`, `WORKING`, `PERSISTENT_ALLOWED`, `PERSISTENT_REQUIRES_CONFIRMATION` o `PROHIBITED`. Preferencias operativas catalogadas pueden persistirse; categorías desconocidas requieren confirmación y patrones de credenciales/secretos se rechazan.

Cada memoria registra propietario, clave, valor, fuente, si fue explícita, confianza cuando sea inferida y retención. La consulta excluye memoria vencida. `DELETE /api/v1/henry/memory/:id` elimina realmente una entrada propia y registra auditoría; Henry no afirma haber olvidado sin éxito del servicio.

El usuario administra su memoria en `/henry/memoria`. No existe acceso entre usuarios ni uso para vigilancia. El `HenryContextAssembler` prioriza políticas, autorización, contexto de rol/página, working memory, memoria autorizada, CRM, Analytics, RAG y solicitud, aplicando presupuesto de contexto sin separar citas de su procedencia.
