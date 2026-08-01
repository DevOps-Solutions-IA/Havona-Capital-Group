# Alcance aprobado — Fase 1

## Estado

**Fase 1 — EN DESARROLLO**

Rama oficial: `feature/fase-01-web-captacion`

## Objetivo

Construir el sitio público premium de HAVONA CAPITAL y el sistema real de captación de prospectos.
No se construye una landing aislada: esta fase crea la entrada funcional al ecosistema y conecta
cada captura con backend, persistencia, consentimiento, trazabilidad y administración inicial.

## Entregables

- Home corporativa premium, responsive y accesible.
- Navegación pública funcional para personas, empresas, recursos, consultores y contacto.
- Landings `/pension`, `/educacion`, `/patrimonio`, `/proteccion`, `/accidentes`, `/empresarios`,
  `/socios`, `/socio-unico` y `/consultores`.
- Dominio de captación con `Prospect`, `LeadSource`, `Consent` y `LeadEvent`.
- Formularios reales con validación, persistencia, trazabilidad, control razonable de duplicados y
  recuperación ante fallos de red.
- API pública con sanitización, rate limiting, protección antiabuso, logs y respuestas estándar.
- Bandeja administrativa inicial para `SUPER_ADMIN`, `ADMIN` y `GERENTE`, sin adelantar el CRM.
- Política de privacidad y registro explícito del tratamiento de datos.
- Metadata, OpenGraph, Twitter cards, canonical, sitemap, robots y JSON-LD corporativo.
- Pruebas unitarias, de integración y E2E aplicables.

## Directriz visual

Se aplica `docs/DIRECTRIZ_VISUAL_FUNCIONAL.md`: Inter, Outfit, Tailwind CSS, motion/react, paleta
oficial, composición editorial, espacios amplios, glassmorphism moderado y animaciones discretas
que respetan `prefers-reduced-motion`.

No se copian marcas, textos ni recursos de terceros. No se publican cifras financieras,
rentabilidades, coberturas o afirmaciones no aprobadas.

## Reglas funcionales

- Nada es únicamente cosmético.
- Cada CTA navega a un destino real o inicia una captura persistente.
- Cada formulario valida, registra consentimiento, fuente, landing y fecha, crea un evento y
  presenta el resultado real del backend.
- No se usan datos ficticios en producción.
- Los endpoints administrativos requieren sesión y permisos.
- No se automatiza marketing ni contacto en esta fase.

## Fuera de alcance

- Henry AI completo.
- WhatsApp y correo masivo.
- CRM y pipeline comercial completos.
- Jitsi y Havona Meet.
- Automatización de seguimiento.
- Telefonía.
- Analítica comercial avanzada.

## Cierre

La fase se mantiene en Draft hasta completar sitio público, landings, captación, administración
inicial, responsive, accesibilidad, SEO, seguridad, pruebas, builds, CI y documentación. No se crea
commit release, etiqueta ni merge sin aprobación expresa de HAVONA CAPITAL.
