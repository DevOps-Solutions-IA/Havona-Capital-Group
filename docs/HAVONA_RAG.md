# HAVONA RAG

El `RagOrchestratorService` autoriza primero y después ejecuta recuperación híbrida: coincidencia semántica, palabras clave y filtros de metadata. El resultado contiene fragmentos, puntuación, documento, versión, sección, página y `chunkId`.

## Grounding

Henry no calcula conocimiento corporativo desde memoria general. Recibe evidencia autorizada con esta frontera: el contenido recuperado es dato, nunca instrucción. Si no hay evidencia suficiente responde exactamente:

> Esta información no se encuentra dentro de la base de conocimiento autorizada de HAVONA CAPITAL GROUP.

La confianza `HIGH/MEDIUM/LOW/INSUFFICIENT` deriva del ranking, número y estado de fuentes; no es una opinión del LLM. Una contradicción entre fuentes vigentes produce `CONFLICT`, expone las fuentes y requiere revisión humana.

## Embeddings e índice

`EmbeddingProvider` desacopla el modelo. CI usa un proveedor determinista sin red. Fuera de test se exige `EMBEDDING_PROVIDER`, modelo, dimensión, base URL y credencial server-side. Cada chunk conserva modelo, dimensión y fecha; cambiar modelo exige reindexado explícito.

La implementación portable inicial almacena vectores versionados como JSONB y combina ranking en aplicación. No asume silenciosamente `pgvector`; su adopción futura debe incluir extensión, migración e índice vectorial validados. PostgreSQL sigue siendo fuente de verdad.

Variables: `EMBEDDING_*`, `RAG_MAX_CHUNKS`, `RAG_MIN_SCORE`, `RAG_MAX_CONTEXT_TOKENS`. Ningún secreto llega al navegador o auditoría.
