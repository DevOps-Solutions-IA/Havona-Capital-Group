export type HenryObjection = {
  id: string;
  label: string;
  signals: readonly RegExp[];
  possibleCause: string;
  diagnosticQuestions: readonly string[];
  consultativeResponse: string;
  deepenWhen: string;
  advanceWhen: string;
  stopWhen: string;
  escalateWhen: string;
};

export const HENRY_OBJECTION_CATALOG: readonly HenryObjection[] = [
  ['price', 'Está caro', [/est[aá] caro/i, /muy costoso/i], 'Valor no demostrado, restricción real o comparación incompleta.', ['¿Lo que le frena es el monto, el momento o que todavía no ve suficiente valor?'], 'Aclare primero el criterio de valor; no conceda ni presione.', 'La persona desea evaluar impacto o alternativas.', 'Reconoce valor y quiere revisar viabilidad.', 'Indica que no dispone de capacidad o pide terminar.', 'Solicita una excepción, negociación o cifra no autorizada.'],
  ['thinking', 'Lo voy a pensar', [/lo (voy a|quiero) pensar/i], 'Falta información, riesgo percibido u objeción no expresada.', ['¿Qué aspecto necesita quedar más claro para poder evaluarlo con tranquilidad?'], 'Dé espacio y aísle la duda real con permiso.', 'Acepta explorar qué le impide decidir.', 'Define información o próximo paso concreto.', 'Reitera que no desea continuar.', 'La decisión requiere revisión contractual o especialista.'],
  ['partner', 'Tengo que hablar con mi pareja', [/hablar con mi (pareja|espos[ao])/i], 'Hay otro participante legítimo en la decisión.', ['¿Qué necesitaría tener claro para conversar esa decisión juntos?'], 'Respete el proceso compartido y ofrezca incluir a la otra persona.', 'Quiere preparar o coordinar la conversación.', 'Autoriza una cita con participantes.', 'No autoriza contacto o participación adicional.', 'Existe conflicto, sensibilidad o representación dudosa.'],
  ['already-covered', 'Ya tengo seguro', [/ya tengo (un )?seguro/i], 'Percibe que la necesidad ya está cubierta.', ['¿Qué le gustaría confirmar que su solución actual sí esté resolviendo?'], 'No desacredite la solución existente; explore brechas solo con permiso.', 'Desea revisar objetivos o vigencia.', 'Acepta una revisión profesional.', 'Está satisfecho y no desea revisar.', 'Pide interpretar coberturas o exclusiones específicas.'],
  ['trust', 'No confío en aseguradoras', [/no conf[ií]o en (las )?aseguradoras/i], 'Experiencia previa negativa o temor a incumplimiento.', ['¿Qué experiencia o preocupación ha influido más en esa percepción?'], 'Reconozca la preocupación sin defender instituciones ni minimizarla.', 'La persona quiere explicar el antecedente.', 'Autoriza atención humana o revisión documental.', 'Está alterada o no desea continuar.', 'Hay queja formal, siniestro o disputa.'],
  ['investment', 'Prefiero invertir', [/prefiero invertir/i], 'Ve protección y acumulación como alternativas excluyentes.', ['¿Qué resultado busca priorizar con esa inversión y qué riesgo necesita conservar bajo control?'], 'Ayude a separar objetivos sin afirmar superioridad ni rendimiento.', 'Quiere contrastar objetivos.', 'Acepta diagnóstico patrimonial.', 'Solicita recomendaciones financieras definitivas.', 'Pide tasas, rentabilidades o asignación regulada.'],
  ['no-budget', 'No tengo dinero ahora', [/no tengo dinero/i, /no puedo pagarlo/i], 'Restricción financiera actual.', ['¿Prefiere que dejemos registrado el tema para retomarlo en un momento más conveniente?'], 'Respete la restricción; no induzca endeudamiento ni presión.', 'La persona propone momento o alcance.', 'Autoriza seguimiento posterior.', 'Expresa dificultad o rechazo claro.', 'Existe vulnerabilidad financiera o solicita consejo regulado.'],
  ['later', 'Luego lo vemos', [/luego lo vemos/i, /m[aá]s adelante/i], 'Prioridad baja o evitación.', ['¿Hay una fecha o cambio concreto que haría oportuno retomarlo?'], 'Busque un criterio de seguimiento, no urgencia artificial.', 'Puede definir condición futura.', 'Autoriza seguimiento específico.', 'No quiere contacto posterior.', 'Requiere excepción o compromiso no autorizado.'],
  ['young', 'Soy muy joven', [/soy muy joven/i], 'Percibe el horizonte largo como ausencia de necesidad.', ['¿Qué meta futura le gustaría que fuera más fácil por haber empezado a planearla antes?'], 'Explore objetivos, sin usar miedo ni cifras inventadas.', 'Expresa una meta real.', 'Acepta orientación inicial.', 'No identifica prioridad y no desea seguir.', 'Solicita proyecciones o garantías.'],
  ['not-needed', 'No necesito eso', [/no necesito (eso|esto)/i], 'No percibe problema o la propuesta llegó demasiado pronto.', ['Puede que me haya adelantado. ¿Qué sí sería útil resolver hoy?'], 'Retroceda a descubrimiento y reconozca la premura.', 'Acepta redefinir la necesidad.', 'Aparece un objetivo relevante.', 'Confirma ausencia de interés.', 'La inconformidad requiere atención humana.'],
  ['send-info', 'Mándame información', [/m[aá]ndame informaci[oó]n/i, /env[ií]ame informaci[oó]n/i], 'Busca autonomía, pospone o necesita material puntual.', ['Claro. ¿Sobre qué decisión concreta debería ayudarle esa información?'], 'Delimite la necesidad y obtenga autorización de contacto antes de registrar datos.', 'Identifica tema y canal.', 'Autoriza datos y seguimiento.', 'Solo desea información pública disponible.', 'Solicita documentos contractuales no verificados.'],
  ['comparing', 'Estoy comparando', [/estoy comparando/i], 'Evalúa alternativas con criterios aún no explícitos.', ['¿Qué criterios son más importantes para usted al comparar?'], 'Ayude a ordenar criterios sin desacreditar competidores.', 'Comparte criterios y contexto.', 'Solicita revisión consultiva.', 'Solo busca una cifra no autorizada.', 'Requiere comparación contractual o recomendación regulada.'],
].map(([id, label, signals, possibleCause, diagnosticQuestions, consultativeResponse, deepenWhen, advanceWhen, stopWhen, escalateWhen]) => ({
  id: id as string, label: label as string, signals: signals as readonly RegExp[], possibleCause: possibleCause as string,
  diagnosticQuestions: diagnosticQuestions as readonly string[], consultativeResponse: consultativeResponse as string,
  deepenWhen: deepenWhen as string, advanceWhen: advanceWhen as string, stopWhen: stopWhen as string, escalateWhen: escalateWhen as string,
}));

