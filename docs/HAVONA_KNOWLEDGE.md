# HAVONA Knowledge Core

Knowledge Core es el dominio corporativo de fuentes autorizadas de **HAVONA CAPITAL GROUP**. Es independiente de Henry: administra colecciones, documentos, versiones, vigencia, clasificación, permisos, ingestas, fragmentos, brechas y auditoría. Henry es uno de sus consumidores.

## Ciclo de vida

`UPLOAD → VALIDATION → EXTRACTION → NORMALIZATION → CHUNKING → EMBEDDING → INDEXING → REVIEW → APPROVED → PUBLISHED`.

La aprobación humana exige `knowledge.review` y la publicación posterior exige `knowledge.publish`; son transiciones distintas y auditadas. Una nueva versión nunca sobrescribe la publicada y depreca la anterior. La búsqueda normal excluye versiones deprecadas y respeta `effectiveFrom`/`effectiveUntil`. Las consultas históricas son explícitas.

PDF, DOCX, TXT, Markdown y HTML pasan por límites de tamaño, MIME permitido, nombre saneado, checksum e idempotencia. Los archivos viven detrás de `StorageProvider`; desarrollo usa almacenamiento local privado y producción debe suministrar almacenamiento persistente S3-compatible. No se guardan blobs en PostgreSQL.

## Seguridad

El alcance resulta server-side de rol, clasificación, colección y permisos explícitos. El contenido recuperado se considera datos no confiables: no puede cambiar políticas, activar tools ni revelar secretos. Las citas solo se entregan cuando el actor puede consultar el documento. No hay hard-delete de fuentes publicadas por defecto.

La instalación no siembra documentos corporativos falsos. Las fuentes pasan por revisión humana antes de publicación.

## Retención

Fuentes, texto extraído, versiones y embeddings permanecen mientras la versión sea auditable. Deprecación conserva historia. Una eliminación definitiva futura deberá comprobar referencias, auditoría y política de retención.
