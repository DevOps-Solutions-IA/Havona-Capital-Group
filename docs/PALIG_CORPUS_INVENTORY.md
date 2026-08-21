# Inventario local del corpus PALIG

Fecha de inspección: 2026-08-16. Origen read-only: `/mnt/d/Herry`. Este inventario no constituye ingesta, aprobación, publicación ni prueba de vigencia. Los originales no fueron modificados, movidos ni copiados al repositorio.

| Archivo | Tamaño | SHA-256 | Clasificación preliminar | Estado |
|---|---:|---|---|---|
| Accidentes Personales 2024.pdf | 1,958,983 | `cde664c731073d9306412db78506c98d878a86fcf898c3e1dafae431c306ab9e` | Capacitación/comercial AP | REVIEW / UNKNOWN |
| Brecha_pensional_capacitacion.pdf | 59,672 | `4178262cca58b1882d740dc6287cbb6fefef4f040265dbd4a73839b6d1f13f68` | Capacitación pensional | REVIEW / UNKNOWN |
| CAPACITACIÓN MAESTRA pension.docx | 32,313 | `486bd46f3b45ce4ba12c252738edba1fb4b5778cf2c6298f684136cfe8324739` | Capacitación pensional | REVIEW / UNKNOWN |
| COL-Tarifario AP Colombia 2026.pdf | 6,863,259 | `699073644a1145533bddd84d2a87dd0a19e2d026f00a52f2852cdaf7a4925c24` | Posible tarifario oficial AP | REVIEW / UNKNOWN |
| COL_Enfermedades Graves-FactSheet_CANCER_2022.pdf | 1,153,515 | `6e4dbaf3db9de0ea43bb552fade71637150b6fca2b30595e11d0a43e1d037772` | Comercial cáncer 2022 | HISTORICAL / REVIEW |
| Edades de ingreso y Permanencia 2021.pdf | 346,027 | `a767b6352458dc94d355f6fc510f69023ec052e3a6f1a41e78e345c1b8d18187` | Referencia técnica 2021 | HISTORICAL / REVIEW |
| POLIZA INDIVIDUAL DE CANCER (Final ).pdf | 134,154 | `bb4df9fd93ebbd24ca8a88049aa38e5280ca4d16d918d4115367719735fd5ae6` | Contractual, documento 2015 | REVIEW / UNKNOWN |
| POLIZA INDIVIDUAL DE ENFERMEDADES GRAVES (1).pdf | 171,835 | `e23b0c806f59d7ecdc96282c4f4602c32d4d20174a349e8144f2bf505202bb35` | Contractual, documento 2015 | DUPLICATE / REVIEW |
| POLIZA INDIVIDUAL DE ENFERMEDADES GRAVES.pdf | 171,835 | `e23b0c806f59d7ecdc96282c4f4602c32d4d20174a349e8144f2bf505202bb35` | Contractual, documento 2015 | DUPLICATE / REVIEW |
| PRESENTACION ENF. GRAVES 2023.pdf | 362,952 | `76f0c25e9d4960cce374f8e9d40003e44c9a5d2b1b02ff7727fd85905b77a5c0` | Capacitación/comercial | REVIEW / UNKNOWN |
| Postal - Enfermedades Graves (1).pdf | 1,331,297 | `7af6951daa7437e05a5da94d1fae8b51b496f010c1e81a8ba46b5ee26066d187` | Comercial 2022 | HISTORICAL / REVIEW |
| VIDA FLEX MAX 2026.pdf | 1,473,873 | `72281970002d61d595936d9934f568e6ade34ef9016db7ed459fd9fbf3045200` | Capacitación/comercial | REVIEW / UNKNOWN |
| Vida Flex MAX.pdf | 1,497,090 | `45455297f6191730e4f30a6cd81ca17736d9483e6bef96feacb066461c83e547` | Capacitación/comercial 2023 | VERSION CANDIDATE / UNKNOWN |

Total: 13 archivos, 12 PDF, 1 DOCX, 15,556,805 bytes. No se encontraron PPT/PPTX, XLS/XLSX, imágenes independientes, TXT/Markdown, simuladores ejecutables ni cotizaciones individuales.

## Hallazgos y gaps

- El par de pólizas de Enfermedades Graves es duplicado binario exacto. La ingesta futura debe deduplicarlo por hash.
- “Familia” y “Familiar” aparecen en fuentes del contexto AP; no se homologan. Se requiere revisión de nomenclatura/versiones.
- La presentación AP contiene exclusiones relacionadas con motociclismo/moto-taxis en coberturas concretas. No sustenta una afirmación universal de cobertura por muerte en moto.
- El tarifario titulado 2026 corrobora referencias de planes y valores de capacitación, pero su nombre, metadata o fecha de filesystem no prueban vigencia ni aprobación.
- Bodytech, RDH/UCI, asistencia médica, exequial, telemedicina y servicio médico internacional tienen referencias documentales, con condiciones y ámbitos que impiden repetir “sin límites” o universalizar beneficios.
- La diferencia entre “Familia/Familiar”, vigencia contractual, tarifarios aplicables, territorialidad, límites y versión actual deben registrarse como `KnowledgeGap`/conflicto durante revisión.

Clasificación aplicada: KEEP significa conservar como fuente candidata; REVIEW exige revisión humana y metadata; HISTORICAL impide presentarlo como actual; DUPLICATE evita doble ingesta; UNKNOWN impide afirmar vigencia. Ningún archivo se clasifica REMOVE ni se modifica físicamente.
