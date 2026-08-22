export type PaligGoldenCase = {
  id: string;
  query: string;
  expectedFilename: string | null;
  expectedStructuralType?: 'TEXT' | 'TABLE';
  mustPass: boolean;
  abstain?: boolean;
};

const cases = (
  filename: string,
  prefix: string,
  queries: Array<string | [string, 'TABLE']>,
): PaligGoldenCase[] => queries.map((item, index) => ({
  id: `${prefix}${String(index + 1).padStart(2, '0')}`,
  query: typeof item === 'string' ? item : item[0],
  expectedFilename: filename,
  expectedStructuralType: typeof item === 'string' ? undefined : item[1],
  mustPass: true,
}));

export const PALIG_PRIVATE_QA_GOLDEN: PaligGoldenCase[] = [
  ...cases('Accidentes_Personales_2024_CANONICAL.md', 'AP', [
    '¿Cuáles son las coberturas principales de Accidentes Personales?',
    '¿Qué dice Accidentes Personales sobre muerte accidental?',
    '¿Qué asistencias presenta Accidentes Personales 2024?',
    '¿Qué condiciones menciona la fuente de Accidentes Personales para motocicleta?',
    '¿Qué planes o productos de Accidentes Personales aparecen en la presentación 2024?',
  ]),
  ...cases('COL-Tarifario_AP_Colombia_2026_CANONICAL.md', 'TA', [
    ['¿Cuál es la prima mensual del Plan A del Producto Básico AP 2026?', 'TABLE'],
    ['¿Qué valores asegurados muestra el tarifario AP para Producto Individual?', 'TABLE'],
    ['¿Qué tarifas presenta el Producto Pareja?', 'TABLE'],
    ['¿Qué planes contiene el Producto Familiar en el tarifario?', 'TABLE'],
    '¿Qué advertencia de vigencia incluye el tarifario AP Colombia 2026?',
  ]),
  ...cases('Edades_Ingreso_Permanencia_2021_CANONICAL.md', 'ED', [
    ['¿Cuál es la edad de ingreso del Amparo Básico Vida Flex MAX?', 'TABLE'],
    ['¿Cuál es la edad de permanencia para Gastos Exequiales?', 'TABLE'],
    ['¿Qué edades aplican a ITP por Enfermedad?', 'TABLE'],
    ['¿Qué valores asegurados figuran para Seguro Cónyuge?', 'TABLE'],
  ]),
  ...cases('POLIZA_INDIVIDUAL_ENFERMEDADES_GRAVES_CANONICAL.md', 'EGC', [
    '¿Qué establece el amparo básico contractual de Enfermedades Graves?',
    '¿Qué exclusiones contractuales tiene Enfermedades Graves?',
    '¿Cómo define cáncer la póliza de Enfermedades Graves?',
    '¿Qué período de carencia establece la póliza de Enfermedades Graves?',
  ]),
  ...cases('PRESENTACION_ENF_GRAVES_2023_CANONICAL.md', 'EGT', [
    '¿Qué explica la presentación 2023 sobre estadios clínicos del cáncer?',
    '¿Qué material de capacitación describe el amparo básico de Enfermedades Graves?',
    '¿Qué temas cubre la presentación de Enfermedades Graves 2023?',
  ]),
  ...cases('Postal_Enfermedades_Graves_2022_CANONICAL.md', 'EGM', [
    ['¿Qué primas mensuales para mujeres muestra el postal de Enfermedades Graves 2022?', 'TABLE'],
    '¿Qué 22 enfermedades graves enumera la pieza comercial?',
    ['¿Qué sumas aseguradas por plan muestra el postal de Enfermedades Graves?', 'TABLE'],
  ]),
  ...cases('POLIZA_INDIVIDUAL_CANCER_CANONICAL.md', 'CAC', [
    '¿Qué establece el amparo básico contractual del Seguro Individual de Cáncer?',
    '¿Qué exclusiones contiene la póliza individual de cáncer?',
    '¿Cómo define cáncer el condicionado contractual?',
    '¿Cuál es el período de carencia en la póliza de cáncer?',
  ]),
  ...cases('COL_Enfermedades_Graves_FactSheet_CANCER_2022_CANONICAL.md', 'CAT', [
    ['¿Qué prima mensual por edad muestra el FactSheet de Cáncer para mujeres?', 'TABLE'],
    ['¿Qué sumas aseguradas por plan presenta el FactSheet Cáncer 2022?', 'TABLE'],
    '¿Qué características generales describe el FactSheet de Seguro Individual de Cáncer?',
  ]),
  ...cases('Brecha_pensional_capacitacion_CANONICAL.md', 'BP', [
    '¿Qué es la brecha pensional según la capacitación?',
    '¿Cómo propone abordar al cliente la capacitación de brecha pensional?',
    '¿Qué mercado describe el material de brecha pensional?',
  ]),
  ...cases('CAPACITACION_MAESTRA_PENSION_CANONICAL.md', 'PM', [
    '¿Por qué pensión no es lo mismo que retiro según la capacitación maestra?',
    '¿Cómo funciona el régimen de prima media Colpensiones?',
    '¿Qué explica la capacitación sobre el régimen de ahorro individual AFP?',
    '¿Cuáles son los cuatro mercados principales de planificación del retiro?',
  ]),
  ...cases('Vida_Flex_MAX_CANONICAL.md', 'VF', [
    '¿Qué cobertura describe Vida Flex MAX para muerte por cualquier causa?',
    '¿Qué exclusiones enumera la fuente Vida Flex MAX?',
    '¿Cómo relaciona Vida Flex MAX educación y acumulación de capital?',
    '¿Qué anexos o amparos adicionales muestra Vida Flex MAX?',
  ]),
  ...cases('VIDA_FLEX_MAX_2026_CANONICAL.md', 'VF26', [
    '¿Qué tipos de seguros de vida individual presenta Vida Flex MAX 2026?',
    '¿A cuáles mercados se dirige Vida Flex MAX 2026?',
    '¿Qué características enumera Vida Flex MAX 2026?',
    '¿Qué dice Vida Flex MAX 2026 sobre el amparo básico?',
    '¿Qué versión documental menciona siete anexos o amparos adicionales?',
  ]),
  ...[
    '¿Cuál es el precio vigente hoy garantizado de Vida Flex MAX?',
    '¿PALIG garantiza la aceptación automática de cualquier solicitante?',
    '¿Cuál será la rentabilidad exacta garantizada en 2040?',
    '¿Qué producto de otra aseguradora recomienda HAVONA?',
    '¿Está garantizado que cualquier siniestro en motocicleta será pagado?',
  ].map((query, index) => ({ id: `AB${index + 1}`, query, expectedFilename: null, mustPass: true, abstain: true })),
];
