# Henry PALIG Knowledge Governance y Consultative Intelligence

## Límites de dominio

HAVONA CAPITAL GROUP comercializa únicamente el portafolio PALIG autorizado. Product Core determina **qué puede venderse**; Knowledge Core determina **qué puede afirmarse**; Henry Core usa ambos para orientar una conversación need-first. Un producto activo no prueba un beneficio y un documento publicado no autoriza por sí solo comercializar un producto.

No se creó otro Henry, RAG o catálogo. Se extendieron `KnowledgeVersion`, el retrieval existente y las políticas/herramientas allowlisted de Henry.

## Gobierno de fuentes

Cada versión conserva tipo, autoridad derivada server-side, etiqueta, fecha documental, vigencia (`CURRENT`, `HISTORICAL`, `UNKNOWN`), permisos de audiencia, hash, ubicación abstracta y contexto PALIG/need/product/solution. Los registros heredados quedan `UNKNOWN`, no públicos y sin backfill ficticio.

La precedencia es: contractual específico del cliente (1), contractual general (2), cotización específica (3), técnico oficial (4), capacitación (5), comercial (6), interpretación (7). El cliente no suministra libremente el número: el servidor lo deriva de una combinación válida de tipo y autoridad. `CAPACITACION` no puede publicarse; `publicAllowed` requiere `CURRENT`.

`KnowledgeFact` conserva hechos estructurados sin duplicar Product Core: sujeto, predicado, valor, variante, plan, condiciones y carácter específico del cliente. `KnowledgeConflict` conserva `VERSION_CONFLICT`, `AUTHORITY_CONFLICT`, `VALIDITY_UNKNOWN` y `CUSTOMER_SPECIFIC`; una fuente inferior nunca reemplaza silenciosamente una superior.

## Retrieval, evidencia y RBAC

Search continúa limitado a versiones publicadas y colecciones/clasificaciones autorizadas. Además aplica audiencia por versión. Público solo recupera `publicAllowed + CURRENT`; CONSULTOR/GERENTE respetan sus flags y material de capacitación; administración conserva gobierno según permisos existentes.

Cada cita entrega documento y versión, sección/página/chunk, tipo, ranking, etiqueta, vigencia/fechas, need, producto/solución, conflictos y advertencia. No expone `storageKey`, ruta local ni secretos. `UNKNOWN` e `HISTORICAL` pueden ayudar en revisión interna con advertencia, pero no se presentan como vigentes. Cuando no existe evidencia se registra `KnowledgeGap` y se usa exactamente:

> Esta información no se encuentra dentro de la base de conocimiento autorizada de HAVONA CAPITAL GROUP.

## Henry consultivo

El componente `HenryPaligConsultativeService` vive dentro del Henry único. Resuelve necesidad, distingue discovery/pregunta puntual/recomendación/instrucción insegura y dirige únicamente a `list_authorized_products`, `search_knowledge` o escalamiento. La secuencia es necesidad → contexto → riesgo → impacto económico → protección actual → brecha → capacidad/preferencias → solución PALIG → evidencia → limitaciones → siguiente paso.

Para Accident Protection selecciona una pregunta contextual útil (impacto económico, dependientes, viajes o variables tarifarias) y evita un cuestionario fijo. Una pregunta puntual de precio no fuerza discovery completo. Nunca garantiza aceptación, underwriting o siniestro; no fabrica tarifas, extrapola históricos, oculta exclusiones/carencias ni convierte capacitación en contrato.

## Ingesta y storage futuros

El pipeline existente ya separa upload, extracción, chunking, review, approval y publish; upload no publica. Esta fase no ingiere `/mnt/d/Herry`. El storage está abstraído por `StorageProvider`, pero el default local `/tmp/havona-knowledge` es efímero y Compose no tiene todavía un volumen productivo dedicado. Antes de ingesta productiva debe configurarse almacenamiento persistente (destino previsto `/opt/havona/data/knowledge/`) detrás del provider, backup/restore, permisos, malware scanning, revisión de metadata, catálogo PALIG vinculado y aprobación humana. Henry jamás conoce la ruta.

## Pendientes

- Revisión humana de vigencia, aplicabilidad y audiencia de cada fuente del inventario.
- Resolver Familia/Familiar, versiones Vida Flex y documentación contractual/tarifaria actual.
- Registrar facts/conflicts/gaps durante staging, no mediante seeds comerciales.
- Validar backups, restauración y capacidad del almacenamiento antes de ingesta.
- Ingerir posteriormente por hash con review/approval explícitos; nunca copiar el corpus a producción automáticamente.
