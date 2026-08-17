# Knowledge persistent storage and PALIG ingestion staging

## Hallazgo y arquitectura

El provider anterior resolvía `KNOWLEDGE_STORAGE_PATH ?? /tmp/havona-knowledge`. No interpretaba `KNOWLEDGE_STORAGE_PROVIDER`, no validaba producción y Compose no propagaba configuración ni montaba almacenamiento. Por ello, un reinicio/recreación del contenedor podía perder originales aunque PostgreSQL conservara metadata.

Knowledge Core continúa dependiendo solo de `StorageProvider`. `PersistentFilesystemStorageProvider` implementa `put`, `get`, `exists`, `stat` y `delete` con keys opacas, validación anti-traversal, modo `0600`, directorios `0700`, escritura temporal + rename y verificación SHA-256/tamaño. Henry, RAG, Product Core y Web nunca reciben el root ni `storageKey`.

Configuración:

- `KNOWLEDGE_STORAGE_PROVIDER=filesystem`
- `KNOWLEDGE_STORAGE_PATH=/var/lib/havona/knowledge`
- `KNOWLEDGE_STORAGE_HOST_PATH=/opt/havona/data/knowledge` (solo Compose/host)
- `KNOWLEDGE_MALWARE_SCANNER=clamav` para escaneo real, o `unavailable` para bloqueo explícito.
- `CLAMAV_HOST=clamav`, `CLAMAV_PORT=3310` y `CLAMAV_TIMEOUT_MS=15000` (valores operativos configurables).

Producción rechaza cualquier provider distinto de `filesystem`, path ausente/relativo o root `/`. Test/desarrollo pueden seleccionar `temp`; nunca existe fallback productivo a `/tmp`.

Solo API monta el bind, porque `KnowledgeProcessorService` y la cola de ingesta viven actualmente en API. Worker no lee originales. El mount no tiene puerto ni ruta Nginx.

## Staging y deduplicación

`KnowledgeStagedAsset` registra cada recepción con hash calculado server-side, nombre original, MIME, tamaño, storage key interno, scan/review/lifecycle, duplicado canónico y metadata propuesta. Defaults: `UNKNOWN`, `publicAllowed=false`, review pendiente.

El objeto físico usa contenido direccionado:

- limpio: `originals/<sha256>`;
- no limpio/no escaneado: `quarantine/<sha256>`.

Mismo hash reutiliza el objeto y conserva otra fila `DUPLICATE`; mismo filename con hash diferente es una versión/candidato diferente. El filename nunca forma el path. Promoción exige `CLEAN + APPROVED`, verifica nuevamente hash/tamaño y alimenta `KnowledgeService.createDocument`; queda `PROCESSING` y aún requiere extracción, review, approval y publish existentes. No hay publicación automática.

## Malware contract

`MalwareScanner` retorna `PENDING_SCAN`, `CLEAN`, `QUARANTINED` o `SCAN_FAILED`. `ConfiguredMalwareScanner` valida el modo al iniciar; `noop-test` solo puede producir `CLEAN` en `NODE_ENV=test`. En producción, scanner ausente retorna explícitamente `PENDING_SCAN`; direct upload queda bloqueado y staging permanece en quarantine. Nunca se afirma una inspección inexistente.

`ClamAvMalwareScanner` usa el protocolo TCP `zINSTREAM` de `clamd`: envía chunks con longitud big-endian, no ejecuta shell, no utiliza filename y no comparte el filesystem. Solo `stream: OK` produce `CLEAN`; `FOUND` produce `QUARANTINED`. Timeout, conexión, respuesta incompleta/malformada, archivo vacío o sobre el límite producen `SCAN_FAILED`. El servicio `clamav/clamav-debian:1.5.3` atiende a API por la red interna `backend`, usa `clamav_updates` únicamente para FreshClam, no publica 3310, conserva firmas en `clamav_signatures` y expone un healthcheck de clamd. API es el único consumidor.

Compose reserva de forma configurable 1 GiB y limita ClamAV a 2 GiB por defecto. Estos valores son guardrails, no prueba de capacidad: antes de habilitarlo en el VPS deben medirse memoria, swap y load antes/después. Si desestabiliza API, Worker o PostgreSQL, se mantiene la ingesta bloqueada y ClamAV requiere capacidad separada.

## Retención y errores

Deprecar es lógico y no borra evidencia. Los objetos content-addressed pueden compartirse entre receipts/versiones; un delete físico futuro debe comprobar todas las referencias. Si falla la creación de staging después de un objeto nuevo, se intenta cleanup y se registra fallo seguro sin contenido/path. Los retries de extracción usan el mismo objeto inmutable.

## Knowledge Document Integrity Engine

`DocumentExtractor` reemplaza la extracción plana. PDF se procesa página por página conservando número, líneas posicionadas, texto nativo, método de extracción, warnings, sección sustentada y tablas heurísticas. DOCX conserva estructura documental sin inventar páginas. `KnowledgeChunk` nunca cruza páginas PDF y registra `pageStart/pageEnd`, tipo `TEXT|TABLE|MIXED`, métodos y warnings.

El OCR está detrás de `OcrProvider`. Producción puede seleccionar `tesseract`; Poppler rasteriza exclusivamente la página solicitada y Tesseract usa español/inglés. Se activa solo bajo `KNOWLEDGE_OCR_MIN_NATIVE_CHARS`. Los procesos usan argumentos fijos, directorio temporal restringido, DPI/timeout limitados y cleanup obligatorio. Provider ausente, timeout, error o una página sin texto recuperado producen `FAILED`; nunca fail-open ni `EMPTY_CONFIRMED` automático.

`KnowledgeExtractionReport` y `KnowledgePageExtraction` registran cobertura, páginas nativas/OCR/mixtas/fallidas, caracteres, tablas, warnings, versiones de extractor/OCR/chunker y timestamps. Un retry reutiliza el reporte, reemplaza páginas/chunks dentro del mismo ciclo transaccional y no marca `COMPLETED` antes de verificar todas las páginas.

Publication exige reporte `COMPLETED`, cero páginas fallidas y consistencia entre checksums de staging y versión. `UNKNOWN` no impide extracción/publicación interna, pero continúa generando warning de vigencia y `publicAllowed=false` mantiene bloqueado al actor PUBLIC.

Una referencia `DUPLICATE` aprobada se enlaza al `KnowledgeDocument` del staging canónico ya promovido. Conserva su fila y auditoría, pero no relee el binario ni crea chunks/embeddings duplicados.

Configuración OCR:

- `KNOWLEDGE_OCR_PROVIDER=tesseract|unavailable`
- `KNOWLEDGE_OCR_TIMEOUT_MS=45000`
- `KNOWLEDGE_OCR_DPI=200`
- `KNOWLEDGE_OCR_MIN_NATIVE_CHARS=40`
- `KNOWLEDGE_OCR_VERSION=tesseract-cli`

Tesseract/Poppler son on-demand y no agregan un daemon residente. La detección de tablas preserva filas/celdas y siempre adjunta `TABLE_STRUCTURE_HEURISTIC_REVIEW_REQUIRED`: es una ayuda de recuperación, no certificación automática de estructura contractual.

## Backup y restore

Respaldar en una misma ventana lógica:

1. PostgreSQL (documentos, versiones, staging, hashes, permisos, auditoría).
2. El árbol binario con `infrastructure/backups/knowledge-backup.sh`.
3. Conservar archive y `.sha256` fuera del VPS según la política de backups.

Restore:

1. Mantener API/ingesta detenida.
2. Restaurar PostgreSQL y storage del mismo punto temporal.
3. Ejecutar `knowledge-restore.sh` solo sobre directorio vacío y con flag explícito.
4. Verificar checksum del archive, ownership/mode y hashes de objetos contra PostgreSQL.
5. Mantener documentos sin publicar; restaurar no cambia governance.

Los scripts rechazan paths relativos/root, restore no sobrescribe un destino no vacío y valida traversal/checksum.

## Despliegue VPS posterior (no ejecutado)

1. Confirmar commit y CI 3/3.
2. Obtener UID/GID real con la imagen exacta (`docker compose run --rm --no-deps api id`).
3. Crear `/opt/havona/data/knowledge` como operador autorizado, dueño del UID/GID runtime y modo `0700`; nunca `777`.
4. Configurar las cuatro variables anteriores en el env productivo sin imprimirlo.
5. Configurar scanner real y probar que un fixture permitido resulta `CLEAN`; mantener `unavailable` bloquea ingesta.
6. Validar `docker compose config`, reconstruir solo API y ejecutar healthcheck.
7. Verificar escritura/lectura con un staging controlado, recrear API y comprobar persistencia.
8. Probar backup/restore en entorno aislado antes de ingerir PALIG.

## Ingesta productiva posterior (no ejecutada)

1. Ejecutar dry-run local y aprobar manifest.
2. Copiar por canal autorizado a staging, nunca a Nginx/public.
3. Scanner real → `CLEAN`; cualquier otro estado bloquea.
4. Revisar duplicate, source type, authority, vigencia, fecha, versión, PALIG product/solution/needs y audiencias.
5. Aprobar staging; promover a KnowledgeDocument/Version.
6. Ejecutar extracción/chunking y revisar facts/conflicts/gaps.
7. Aprobar Knowledge Version.
8. Publicar únicamente mediante permiso y decisión humana separada.
9. Ejecutar retrieval/citations por rol y backup posterior.

## Markdown canonical dry-run

`knowledge:markdown-dry-run` inspecciona exclusivamente el directorio local autorizado
`/mnt/d/Herry/archivos.md`. No recorre el directorio padre, no escribe en PostgreSQL, no usa
staging y no registra el parser en Henry. El resultado se guarda con modo `0600` en
`/tmp/havona-markdown-canonical-manifest.json`.

El parser conserva encabezados H1/H2/H3 como ruta jerárquica, mantiene listas dentro de su
sección y convierte cada tabla Markdown en un chunk atómico. Los bloques de texto extensos se
dividen sin perder `section`, `subsection` ni `headingPath`; una tabla nunca se corta por longitud.
SHA-256 e identificadores de chunks se calculan localmente de forma determinista.

El manifest aplica governance existente: autoridad contractual general, técnica oficial,
capacitación o comercial según evidencia explícita del frontmatter. Toda versión permanece
`UNKNOWN`, con fechas de efectividad nulas y `publicAllowed=false` implícito. Una fecha documental
o un año en el nombre no demuestra vigencia.

El Golden Retrieval Gate es una validación local sobre los chunks efímeros: comprueba fuente,
sección, tipo estructural, prioridad de autoridad, aislamiento de productos y conflicto entre
versiones. Aprobar el gate no promueve, publica, indexa ni expone contenido a Henry.

## PALIG Private QA

La validación semántica real usa la colección reservada `palig-private-qa`. Esta colección queda
`isActive=false`, `henryEnabled=false`, limitada a `SUPER_ADMIN`; sus versiones permanecen en
`REVIEW`, con `currentStatus=UNKNOWN`, `publicAllowed=false` y sin fechas de efectividad inferidas.
El retrieval ordinario de Knowledge/Henry exige simultáneamente una versión `PUBLISHED` y una
colección `henryEnabled=true`. El comando administrativo QA reutiliza el mismo proveedor de
embeddings, búsqueda híbrida, ranking y filtros de governance, pero solo admite una colección
privada inactiva.

`knowledge:private-qa -- /mnt/d/Herry/archivos.md` aplica el flujo oficial staging → scan → review
→ promoción privada → extracción → chunking → embedding. La promoción en este contexto significa
persistencia interna para QA, nunca publicación. El checksum evita recrear documentos, versiones,
chunks o embeddings en una segunda ejecución. Los embeddings externos se envían por lotes
configurables mediante `EMBEDDING_BATCH_SIZE`; el proveedor determinista continúa restringido a
tests. El reporte técnico queda fuera de Git en `/tmp/havona-palig-private-qa-report.json`.
