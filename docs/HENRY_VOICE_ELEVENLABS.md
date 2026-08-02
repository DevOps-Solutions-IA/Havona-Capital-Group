# Henry Voice — ElevenLabs

Estado: implementación de Fase 3 en validación. No constituye release.

## Propósito y arquitectura

Henry Voice incorpora voz al único Henry Core de HAVONA CAPITAL GROUP. ElevenLabs realiza STT,
TTS y transporte; no decide políticas, no consulta CRM, no ejecuta herramientas y no conserva una
memoria paralela.

```text
Micrófono / ElevenLabs Agent
  → API HAVONA → ElevenLabs STT → HenryVoiceGateway
  → HenryService / Policy Engine / contexto autorizado / Tool Engine
  → AIProvider / OpenRouter → respuesta autorizada
  → HenryVoiceFormatter → ElevenLabs TTS → audio efímero
```

Texto y voz comparten `Conversation`, `ConversationState`, participantes, mensajes, memoria, RBAC,
Policy Engine, Tool Engine y auditoría. `VoiceSession` solo representa transporte (`STARTING`,
`ACTIVE`, `INTERRUPTED`, `COMPLETED`, `FAILED`) y referencia la conversación principal.
`VoiceUsage` registra operación, latencia, duración o caracteres y fallo. Si el proveedor no
reporta costo exacto se usa `COST_PENDING_PROVIDER_RECONCILIATION`; no se inventan precios.

## Variables

```dotenv
VOICE_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
ELEVENLABS_TTS_MODEL=eleven_multilingual_v2
ELEVENLABS_STT_MODEL=scribe_v1
ELEVENLABS_BASE_URL=https://api.elevenlabs.io/v1
ELEVENLABS_HENRY_GATEWAY_SECRET=
VOICE_MAX_AUDIO_SIZE=10485760
VOICE_MAX_DURATION_SECONDS=120
VOICE_REQUEST_TIMEOUT_MS=30000
VOICE_STREAMING_ENABLED=true
VOICE_AUDIO_RETENTION_ENABLED=false
```

Las claves son secretos distintos, server-side y rotables. Nunca se exponen como `NEXT_PUBLIC_*`.
La retención de audio permanece desactivada salvo política posterior expresamente aprobada.

## API multimodal

- `POST /api/v1/henry/conversations/:id/voice/turns`
- `POST /api/v1/henry/internal/conversations/:id/voice/turns`
- `POST /api/v1/henry/conversations/:id/voice/speech`
- `POST /api/v1/henry/internal/conversations/:id/voice/speech`

Los turnos reciben `multipart/form-data` con `audio`, `durationMs` y `pageContext` mínimo. El
backend valida conversación, sesión, alcance de entidad, MIME, firma, tamaño y duración; persiste
la transcripción como mensaje `VOICE` y la procesa por Henry Core. Speech acepta únicamente un
mensaje de asistente autorizado y perteneciente a esa conversación. Si TTS falla, el texto sigue
disponible. El navegador detiene las pistas, revoca audio temporal y conserva fallback de texto.

## Custom LLM

```text
POST /api/v1/integrations/elevenlabs/chat/completions
Authorization: Bearer <ELEVENLABS_HENRY_GATEWAY_SECRET>
```

Acepta Chat Completions compatible y responde SSE OpenAI-compatible terminado en
`data: [DONE]`. `elevenlabs_extra_body` debe incluir:

```json
{
  "externalConversationId": "identificador estable",
  "consentAccepted": true,
  "privacyVersion": "voice-privacy-v1"
}
```

El prompt externo debe ser mínimo: “Eres la interfaz de voz de Henry de HAVONA CAPITAL GROUP. El
razonamiento, políticas, memoria, autorización y herramientas son controlados por el Henry Core
corporativo.” El gateway usa el último turno del usuario y recupera la conversación real; el prompt
externo nunca sustituye autoridad corporativa.

La salida SSE opera en modo `policy-buffered`: Henry finaliza Tool Engine y validación antes de
liberar contenido. Así TTS no pronuncia contenido posteriormente rechazado. Es transporte SSE
real, pero no expone tokens preliminares. Streaming incremental solo podrá habilitarse con
guardrails incrementales equivalentes.

## Seguridad, privacidad y resiliencia

- autenticación M2M mediante hash y comparación constante;
- rate limit específico;
- RBAC y entity scope resueltos en servidor;
- allowlist y firma básica de audio, límites y timeout;
- cancelación de TTS al cerrar el cliente;
- sin audio bruto, prompts, claves ni cabeceras privadas en logs;
- una sola conversación multimodal e idempotencia de mensajes;
- herramientas mutables siguen sujetas a confirmación;
- STT/TTS no derriban el canal textual.

Errores tipados: `VOICE_CONFIGURATION_REQUIRED`, `VOICE_PROVIDER_UNAVAILABLE`,
`VOICE_STT_FAILED`, `VOICE_TTS_FAILED`, `VOICE_STREAM_FAILED`, `VOICE_AUDIO_INVALID`,
`VOICE_AUDIO_TOO_LARGE`, `VOICE_AUDIO_TOO_LONG`, `VOICE_AUTH_FAILED`, `VOICE_RATE_LIMITED` y
`VOICE_TIMEOUT`.

## Cloudflare Tunnel

Con autorización operativa, desarrollo puede publicar:

```text
https://dev-henry.havonacapitalgroup.com → http://localhost:3001
```

No se incluyen credenciales ni se modifica DNS automáticamente. Producción podrá usar
`https://henry.havonacapitalgroup.com` sin cambiar Henry Core.

## Validación

1. Verificar presencia de variables sin imprimir valores.
2. Aplicar migraciones y doble seed.
3. Verificar health/readiness.
4. Probar audio corto en español: STT → Henry → TTS.
5. Confirmar `Message.channel=VOICE`, `VoiceSession` y `VoiceUsage`.
6. Probar texto → voz → texto con el mismo ID.
7. Probar CONSULTOR y entidad fuera de alcance.
8. Confirmar fallback textual al bloquear ElevenLabs.

Los tests usan proveedores falsos o `fetch` interceptado y no consumen servicios externos. La
prueba real mínima solo se ejecuta con credenciales locales autorizadas.
