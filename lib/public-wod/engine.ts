import { ALTERNATIVES, PUBLIC_WOD_VERSION, type AdaptInput, type AlternativeId, type Group, type ResultLine, type SelfTest, type ShoulderProfile, type WodResult } from "./contracts";

import { learnMovement, type LearningRecord } from "./learning";

type Movement = { id: string; re: RegExp; groups: Group[]; alternatives: AlternativeId[] };
// Identification only. No language model chooses clinical restrictions or doses.
const MOVEMENTS: Movement[] = [
  { id: "ohs", re: /\b(overhead squat|ohs)\b/g, groups: ["overhead"], alternatives: ["air-squat"] },
  { id: "wallball", re: /\b(wall[ -]?balls?|wb)\b/g, groups: ["overhead", "push"], alternatives: ["air-squat"] },
  { id: "thruster", re: /\b(thrusters?)\b/g, groups: ["overhead", "push"], alternatives: ["air-squat"] },
  { id: "hspu", re: /\b(handstand push[ -]?ups?|hspu|pike push[ -]?ups?)\b/g, groups: ["overhead", "push", "support"], alternatives: ["incline-pushup", "bike", "walk"] },
  { id: "handstand", re: /\b(handstand(?: walk| hold)?|hsw|wall walks?|pino)\b/g, groups: ["overhead", "support"], alternatives: ["bike", "walk"] },
  { id: "muscleup", re: /\b((?:bar |ring )?muscle[ -]?ups?|bmu|rmu)\b/g, groups: ["pull", "push", "support"], alternatives: ["ring-row", "bike", "walk"] },
  { id: "pullup", re: /\b((?:chest[ -]to[ -]bar |strict |kipping )?pull[ -]?ups?|chest[ -]to[ -]bar|c2b|dominadas?)\b/g, groups: ["pull"], alternatives: ["ring-row", "bike", "walk"] },
  { id: "t2b", re: /\b(toes?[ -]to[ -]bar|t2b|ttb|knees?[ -]to[ -]elbows?|k2e|hanging knee raises?)\b/g, groups: ["pull", "support"], alternatives: ["bike", "walk"] },
  { id: "snatch", re: /\b((?:(?:hang|power|squat|db|dumbbell|kb|kettlebell) )*snatch(?:es)?)\b/g, groups: ["overhead", "pull"], alternatives: ["bike", "walk"] },
  { id: "benchpress", re: /\b(bench press|press banca)\b/g, groups: ["push", "support"], alternatives: ["incline-pushup", "bike", "walk"] },
  { id: "jerk", re: /\b((?:push |split )?jerks?)\b/g, groups: ["overhead", "push"], alternatives: ["incline-pushup", "bike", "walk"] },
  { id: "pushpress", re: /\b(push press)\b/g, groups: ["overhead", "push"], alternatives: ["incline-pushup", "bike", "walk"] },
  { id: "press", re: /\b((?:push |strict |shoulder |db |dumbbell |bench )?press|jerks?|push jerk)\b/g, groups: ["overhead", "push"], alternatives: ["incline-pushup", "bike", "walk"] },
  { id: "ringrow", re: /\b(ring rows?|remo en anillas)\b/g, groups: ["pull"], alternatives: ["bike", "walk"] },
  { id: "row", re: /\b(rows?|rowing|remo|ski[ -]?erg|ski)\b/g, groups: ["pull"], alternatives: ["bike", "walk"] },
  { id: "burpee", re: /\b(burpees?)\b/g, groups: ["push", "support"], alternatives: ["incline-pushup", "bike", "walk"] },
  { id: "dip", re: /\b((?:ring |bench )?dips?|fondos?)\b/g, groups: ["push", "support"], alternatives: ["incline-pushup", "bike", "walk"] },
  { id: "pushup", re: /\b(push[ -]?ups?|flexiones?)\b/g, groups: ["push", "support"], alternatives: ["incline-pushup", "bike", "walk"] },
  { id: "plank", re: /\b(planks?|planchas?|bear crawl|plancha lateral)\b/g, groups: ["support"], alternatives: ["bike", "walk"] },
  { id: "clean", re: /\b((?:(?:hang|power|squat|db|dumbbell) )*cleans?)\b/g, groups: ["pull"], alternatives: ["bike", "walk"] },
  { id: "swing", re: /\b((?:american |russian |kettlebell |kb )?swings?|kbs)\b/g, groups: ["pull", "overhead"], alternatives: ["bike", "walk"] },
  { id: "loadedlegs", re: /\b((?:back |front |goblet |zercher )squats?|deadlifts?|peso muerto|farmer.?s? (?:carry|walk)|lunges?|zancadas?)\b/g, groups: ["pull", "support"], alternatives: ["air-squat", "walk"] },
  { id: "rope", re: /\b(rope climbs?|double[ -]?unders?|single[ -]?unders?|du|su|comba|jump rope)\b/g, groups: ["pull"], alternatives: ["bike", "walk"] },
  { id: "legs", re: /\b((?:air )?squats?|sentadillas?|box (?:jumps?|step[ -]?ups?)|step[ -]?ups?)\b/g, groups: [], alternatives: ["walk"] },
  { id: "cardio", re: /\b(run|running|carrera|correr|walk|caminar|bike|bici|assault bike|echo bike|bikeerg)\b/g, groups: [], alternatives: ["walk"] },
  { id: "core", re: /\b(sit[ -]?ups?|ghd|abmat|hollow(?: hold)?|v[ -]?ups?)\b/g, groups: [], alternatives: ["walk"] },
];
const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function identify(line: string): Movement[] {
  const hits: { start: number; end: number; movement: Movement }[] = [];
  for (const movement of MOVEMENTS) {
    for (const match of normalize(line).matchAll(movement.re)) {
      const start = match.index!, end = start + match[0].length;
      if (!hits.some(h => start < h.end && end > h.start)) hits.push({ start, end, movement });
    }
  }
  return hits.map(h => h.movement);
}
export function clinicalGate(profile: ShoulderProfile, safetyToday: string): Pick<WodResult, "gate" | "message"> {
  if (profile.safetyFlags.includes("chest")) return { gate: "emergency", message: "Con dolor acompañado de presión en el pecho, falta de aire o sudor frío, deja el entrenamiento y llama al 112. No esperes una respuesta por WhatsApp." };
  if (profile.safetyFlags.length || safetyToday === "new") return { gate: "urgent", message: "Las señales que has indicado necesitan valoración médica antes de entrenar. Busca atención sanitaria urgente; si hay presión en el pecho o dificultad para respirar, llama al 112. El chat de FisioFit no es un servicio de urgencias." };
  if (profile.restrictions !== "none") return { gate: "review", message: "Antes de proponerte cambios necesitamos aclarar las indicaciones de tu profesional. Mantén sus pautas y consúltale, o cuéntanos tu caso. La herramienta no puede sustituir ni modificar esas indicaciones." };
  return { gate: "none", message: "Propuesta orientativa basada en lo que nos has contado. Comprueba cómo respondes y coméntala con tu coach. No es un diagnóstico ni garantiza que un ejercicio sea adecuado para ti." };
}
function effectiveTolerance(group: Group, profile: ShoulderProfile, selfTest: SelfTest | null) {
  // A comfortable self-test never upgrades tolerance or overrides pain/restrictions.
  if ((group === "overhead" && (selfTest?.wallSlide === "pain" || selfTest?.overheadSquat === "pain")) ||
    ((group === "push" || group === "support") && selfTest?.inclineHold === "pain")) return "pain";
  return profile.groups[group];
}
export function adaptPublicWod(profile: ShoulderProfile, selfTest: SelfTest | null, input: AdaptInput, history: LearningRecord[] = []): WodResult {
  const gate = clinicalGate(profile, input.safetyToday);
  const dailyAdvice = input.readiness === "RED"
    ? "Hoy estás peor que habitualmente: evita buscar marcas, reduce la exigencia y elige solo opciones que ya toleras. Si empeoras, detén ese ejercicio y consulta."
    : input.readiness === "GREEN"
    ? "Un buen día no cambia tus limitaciones: mantén las opciones y dosis que ya toleras. El color verde no implica subir de nivel ni aumentar peso."
    : "Parte de las opciones y dosis que ya toleras. Observa la respuesta durante la sesión y al día siguiente.";
  if (gate.gate !== "none") return { version: PUBLIC_WOD_VERSION, ...gate, dailyAdvice: "No se genera una adaptación automática con estas respuestas.", lines: [] };
  const lines = input.rawText.split(/\n/).map(s => s.trim()).filter(Boolean).map((original, index): ResultLine => {
    const key = `line-${index}`;
    const detected = identify(original);
    if (!detected.length) {
      if (/^\d+\s*(?:rounds?|rondas?)(?:\s+for time)?$/i.test(original) || /^(?:(?:\d+\s*)?(?:rounds?|rondas?|rft|amrap|emom|for time|time cap|cap|rest|descanso|every|cada|intervalos?|tabata|buy[ -]?in|cash[ -]?out)\b[\d\s:.'’"x\-minutoseg/]*|[\d\s:.'’"x\-/]+)$/i.test(original)) {
        return { key, original, status: "context", instruction: original, reason: "Formato del WOD original." };
      }
      return { key, original, status: "review", instruction: "Revisa esta línea con tu coach o con nosotros.", reason: "No hemos identificado el movimiento con suficiente claridad. No lo damos por adecuado ni lo eliminamos del WOD." };
    }
    if (detected.length > 1 || /\[\?\]|\?/.test(original)) return { key, original, status: "review", instruction: "Escribe cada movimiento en una línea y confirma los datos.", reason: "Esta línea contiene varios movimientos o información dudosa. Necesitamos aclararla antes de adaptarla." };
    const movement = detected[0];
    const tolerances = movement.groups.map(group => effectiveTolerance(group, profile, selfTest));
    const baseline = tolerances.includes("unknown") || tolerances.includes("pain") ? 0 : tolerances.includes("dose") ? 1 : 2;
    const learned = learnMovement(movement.id, baseline, history);
    const identity = { movementId: movement.id, proposedMovementId: movement.id, level: learned.level };
    const unknown = tolerances.includes("unknown");
    const painful = tolerances.includes("pain") || learned.level === 0;
    const dose = tolerances.includes("dose") || learned.level === 1;
    if (painful || unknown) {
      const choices = movement.alternatives.filter(id => {
        const alternative = ALTERNATIVES.find(a => a.id === id)!;
        if (alternative.equipment && !profile.equipment.includes(alternative.equipment)) return false;
        if (learnMovement(`alternative:${id}`, 2, history).hadWorsening) return false;
        // Never propose an upper-body alternative in another known-painful/unknown pattern.
        if (id === "ring-row" && ["pain", "unknown"].includes(effectiveTolerance("pull", profile, selfTest))) return false;
        if (id === "incline-pushup" && ["push", "support"].some(group => ["pain", "unknown"].includes(effectiveTolerance(group as Group, profile, selfTest)))) return false;
        return true;
      });
      const chosen = choices.find(id => input.confirmedAlternatives.includes(id));
      if (chosen) {
        const alternative = ALTERNATIVES.find(a => a.id === chosen)!;
        return { key, original, ...identity, proposedMovementId: `alternative:${chosen}`, status: "replace", instruction: alternative.name + ". Usa la duración o las series que ya toleras y acuerda con tu coach cómo encajarlo en este bloque.", reason: alternative.purpose + " No se trasladan automáticamente las repeticiones ni los kilos del ejercicio original." };
      }
      return { key, original, ...identity, proposedMovementId: undefined, status: choices.length ? "confirm" : "review", instruction: "No repitas este gesto por inercia. Confirma una alternativa que ya toleras o consulta el bloque.", reason: learned.reason || (painful ? "Has indicado molestias incluso con poca exigencia en este grupo de movimientos." : "Nos falta saber cómo toleras este grupo. No vamos a asignarle un nivel por defecto."), alternatives: choices };
    }
    if (dose || input.painBefore >= 5 || input.readiness === "RED" || profile.timing.includes("nextday")) {
      return { key, original, ...identity, status: "adjust", instruction: movement.groups.length
        ? "Empieza con la variante y carga ligera que ya toleras; divide las repeticiones en series más cortas y añade pausas. No persigas el tiempo del WOD. Si también molesta suave, detén ese gesto y actualiza tu perfil."
        : "Mantén solo la versión que ya toleras, recorta el bloque antes de fatigarte y añade pausas. Si molesta, detén el gesto y consúltalo.",
        reason: learned.reason || (input.painBefore >= 5 ? "Has registrado dolor previo elevado. Mantén una propuesta más conservadora y consulta si no mejora." : dose ? "Nos has indicado que la carga o las repeticiones cambian tu respuesta." : input.readiness === "RED" ? "Hoy estás peor que habitualmente." : "Has indicado molestias al día siguiente; comprueba también esa respuesta antes de aumentar la exigencia.") };
    }
    return { key, original, ...identity, status: "keep", instruction: "Mantén únicamente la variante, carga y volumen que ya toleras; no tomes los kilos escritos como una recomendación personal.", reason: learned.reason || (movement.groups.length ? "Has indicado que toleras este grupo. Si este ejercicio concreto molesta, para y actualiza el perfil." : "No detectamos un ajuste específico de hombro en esta línea. Eso no evalúa otras molestias ni garantiza tolerancia.") };
  });
  return { version: PUBLIC_WOD_VERSION, ...gate, dailyAdvice, lines };
}
