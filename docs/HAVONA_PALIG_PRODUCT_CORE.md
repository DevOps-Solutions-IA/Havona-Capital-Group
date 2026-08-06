# HAVONA PALIG Product & Need Core

## Regla corporativa

HAVONA CAPITAL GROUP comercializa exclusivamente el portafolio de Pan-American Life Colombia que se encuentre autorizado dentro de HAVONA. El sistema no es un marketplace, no admite un catálogo abierto de carriers y no convierte texto libre en producto comercial.

`PAN_AMERICAN_LIFE_COLOMBIA` es el único carrier comercializable. Que un registro exista no basta: producto, solución y mapping deben estar `ACTIVE` para asociarse operativamente a una oportunidad.

## Need, solution y product

- **CustomerNeed** expresa el problema confirmado durante discovery. Puede existir sin producto.
- **AuthorizedSolution** expresa una aplicación consultiva gobernada y debe estar autorizada para la necesidad mediante `NeedSolutionMapping`.
- **AuthorizedProduct** expresa qué producto PALIG puede comercializarse. No contiene por sí mismo coberturas ni condiciones contractuales.
- **Knowledge Core** conserva la evidencia documental `PUBLISHED` que permite afirmar características. Autorización de catálogo y evidencia documental son controles distintos y ambos son necesarios.

La relación nullable de `Opportunity` permite `EDUCATION → null → null` durante discovery y, posteriormente, una solución/producto autorizado. No existe mapeo automático desde `Prospect.interest`.

## Taxonomía estructural

Las necesidades iniciales son FAMILY_PROTECTION, INCOME_PROTECTION, EDUCATION, RETIREMENT_PENSION_GAP, CAPITAL_ACCUMULATION, ACCIDENT_PROTECTION, CRITICAL_ILLNESS, CANCER_PROTECTION, BUSINESS_PARTNER_PROTECTION, KEY_PERSON y BUSINESS_CONTINUITY.

El bootstrap registra como `DRAFT`, nunca como contenido listo para comercialización:

- Vida Flex MAX;
- Accidentes Personales;
- Enfermedades Graves;
- Seguro Individual de Cáncer;
- aplicaciones consultivas de educación, retiro, socios, persona clave y continuidad empresarial.

No se cargan coberturas, tasas, beneficios, requisitos, exclusiones ni mappings inferidos. Activación y contenido requieren revisión humana y posterior evidencia Knowledge.

## Pre-flight y decisiones

| Hallazgo previo                                             | Ubicación                         | Clasificación            | Decisión                                                 |
| ----------------------------------------------------------- | --------------------------------- | ------------------------ | -------------------------------------------------------- |
| `Prospect.interest` acepta cualquier slug                   | Prisma, captura, CRM, Henry y Web | Semántica genérica       | MIGRATE; se conserva como legacy sin automapping         |
| `LeadEvent.interest` guarda snapshot de captura             | Prisma                            | Histórico genérico       | KEEP/DEPRECATE; no reescribir                            |
| Opportunity no tenía need/product/solution                  | Prisma/CRM                        | Ausencia de gate         | EXTEND con referencias nullable                          |
| Landings mezclan necesidades, segmentos y talento           | Web pública                       | Parcialmente genérico    | KEEP temporal; auditoría integral en Fase K              |
| Knowledge resolvía `product.name` desde documento publicado | Email/Knowledge                   | Evidencia, no catálogo   | KEEP; ahora debe converger con autorización Product Core |
| No existían carrier, Product ni catálogo abierto            | Repositorio completo              | Evidencia negativa       | No se eliminó infraestructura inexistente                |
| CRM, Analytics, Henry, Communications y Automations         | módulos                           | Infraestructura reusable | KEEP                                                     |
| Seeds no contenían productos comerciales ficticios          | seed                              | Estructural              | KEEP; nuevas filas quedan DRAFT                          |

Los datos legacy se clasifican así: slugs conocidos son **MIGRATABLE con revisión**; texto no inequívoco es **AMBIGUOUS**; `interest` es **DEPRECATED como autoridad comercial**, pero no `REMOVE_SAFE` porque conserva procedencia histórica.

## CRM, seguridad y auditoría

`POST /crm/opportunities` y `PATCH /crm/opportunities/:id/commercial-context` resuelven el contexto server-side. Se rechazan IDs desconocidos, registros no activos, carriers no PALIG, soluciones sin mapping activo, productos inconsistentes y combinaciones no autorizadas. Se preserva el scope CRM del actor y se audita el cambio. El browser nunca establece ownership ni crea productos arbitrarios.

Los campos financieros de F son independientes. `Opportunity.amount` continúa significando valor comercial estimado y nunca prima, prima anualizada, suma asegurada, capital objetivo, cash value o comisión.

## Analytics y Henry

Analytics admite filtros nullable `customerNeedKey`, `authorizedSolutionId` y `authorizedProductId`; los registros legacy null siguen siendo unknown. Pipeline devuelve el contexto gobernado sin inventarlo ni excluir legacy de forma silenciosa.

Henry usa la herramienta allowlisted `list_authorized_products`, que solo devuelve catálogo `ACTIVE` del carrier PALIG. Esta herramienta declara explícitamente que los hechos de producto requieren Knowledge Core; no existe un catálogo hardcoded paralelo en prompts.

## Web y fases posteriores

La vista de pipeline muestra necesidad gobernada cuando existe, marca `interest` como legacy y declara “Discovery sin producto asociado” cuando corresponde. No se rehizo la web pública.

Pendientes deliberados:

- Fase G: validación externa sin alterar este dominio.
- Fase K: auditoría y migración completa de landings/copy público hacia CustomerNeed.
- Fase L: ingesta gobernada del corpus PALIG, revisión de productos/mappings, asociación con Knowledge y activación humana.
- Fases M–N: evolución autorizada de entrenamiento, reporting y experiencia sin abrir carriers ni catálogo arbitrario.

No se implementaron premium, annualizedPremium, insuredAmount, targetCapital, cashValue ni commission. Si se incorporan posteriormente deberán ser tipos financieros distintos, con fuente y semántica propias.
