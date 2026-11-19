// Browser/server contract. Analysis sends sampled images, never audio or the blob URL.
export const HOLD_PVC = "5594f37b-b392-4fab-bf49-8dace28ad43c";
export const HOLD_BUMPER = "6ff22736-3450-42d9-8558-019a16e2fc51";
export type ShoulderVideoKind = "hold" | "movement" | "measurement" | "load";
const scapGuidance = "Valora las tres primeras repeticiones completas. Evalúa por separado en cada repetición: fluidez de subida y bajada, simetría de ritmo y recorrido y ausencia de encogimiento compensatorio. Cada criterio vale 1 si se observa que se cumple, 0 si se observa un fallo y null solo si ese criterio no es valorable. Un fallo visible se registra como 0, no como dato ausente. Una limitación de encuadre de un criterio no invalida los demás criterios visibles. Si falta una repetición, sus criterios quedan sin medir. No deduzcas causas musculares.";
export const SHOULDER_VIDEO_TESTS: Record<string, {kind:ShoulderVideoKind; task:string}> = {
  "19ce1cc3-bcee-40cb-89d8-3329290f9780": {kind:"measurement", task:"Flexión de hombro en pared. Estima leftProgress y rightProgress de 0 a 100 por brazo, redondeando a 5 puntos: 0 = barbilla o menos; 50 = orejas; 100 = brazo completo en contacto. Interpola solo entre referencias visibles y evalúa cada brazo por separado. La medida corresponde al recorrido sin despegar la lumbar ni extender la muñeca: si no puedes comprobar las condiciones necesarias para ese recorrido, déjalo pendiente. No exijas ver la referencia de 100 para estimar un recorrido inferior con referencias y condiciones observables; no asignes 100 si no ves el contacto completo. Usa izquierda y derecha anatómicas únicamente si el plano permite identificarlas; no adivines el lado. No confundas elevación lateral con flexión al frente."},
  "362b23b5-516c-4a2f-9d2c-d09548b7026b": {kind:"measurement", task:"Bumper pull over sobre wallball. Estima angle: ángulo cadera–hombro–codo redondeado a 5 grados, con los tres puntos y el plano visibles, tronco controlado y posición mantenida al menos 1 s; 180° es línea recta. Una aproximación visual respaldada por esas referencias es válida: no necesitas precisión instrumental. Deja angle sin medir si faltan referencias o la perspectiva impide estimarlo. No infieras dolor ni que una postura es indolora a partir del vídeo."},
  "5ab05c1c-5874-4c6e-ae18-16f981357338": {kind:"measurement", task:"Wall press. externalDeficit es la rotación externa que falta para apoyar ambos brazos completos sin compensar. CERO es un criterio de contacto comprobado, no un ángulo aproximado: exige ver directamente el apoyo completo de ambos brazos, incluidos antebrazos y manos, con espalda apoyada y muñecas neutras. Una mano o codo que toca, un antebrazo aparentemente vertical, la longitud aparente del antebrazo, las sombras o la proximidad a la pared NO demuestran ese apoyo. No infieras contacto oculto desde una vista frontal u oblicua. Si existe separación visible, externalDeficit NO puede ser 0; estima un déficit positivo solo si el plano y las referencias permiten medirlo. Redondea los ángulos observables a 5 grados salvo si ese redondeo convertiría un déficit positivo en 0: conserva una estimación positiva sustentada o deja null si no puedes estimarla, nunca inventes 5 grados. No descartes un déficit medible porque la elevación posterior no sea valorable. Con déficit o apoyo inicial sin confirmar, abduction es null. Solo con externalDeficit 0 confirmado, estima abduction conservando durante todo el recorrido el apoyo completo de ambos brazos y espalda y las muñecas neutras: 0 si solo logra la posición inicial, o de 90° a 180° si eleva desde ella. No midas ángulos fuera del plano visible."},
  [HOLD_PVC]: {kind:"hold", task:"PVC lift off en prono. Mide el tramo continuo de sostén realmente visible y la pérdida visible de posición o recolocación. Un tramo observado que alcanza el objetivo configurado puede bastar aunque no se vea el ascenso o la bajada; no inventes duración fuera del vídeo. Valora el tiempo y la estabilidad por separado. No midas la altura respecto a las orejas."},
  [HOLD_BUMPER]: {kind:"hold", task:"Sostén de disco en prono. Mide el tramo continuo de sostén realmente visible y la pérdida visible de posición o recolocación. Un tramo observado que alcanza el objetivo configurado puede bastar aunque no se vea el ascenso o la bajada; no inventes duración fuera del vídeo. Valora el tiempo y la estabilidad por separado. No midas la altura respecto a las orejas ni adivines el peso."},
  "a489ef3a-0922-4319-8bb6-94f97d879bb1": {kind:"measurement", task:"Elevación de bumper en buenos días. Para cada carga de 5, 10 o 15 kg, cuenta las repeticiones completas (reps5/reps10/reps15) y cuántas alcanzan al menos las orejas con pausa de 1 s (range5/range10/range15), máximo 8 por carga. Asigna una serie a una carga solo si los kg son legibles e inequívocos; no deduzcas el peso por el tamaño o color del disco. Las cargas no grabadas o no identificables quedan sin medir, nunca como 0. La cuenta en rango no puede superar las repeticiones completas."},
  "86d6177e-a02e-4ef9-a62c-677323e9f8b9": {kind:"load", task:"8RM face pull unilateral. Describe la ejecución, las repeticiones completas visibles y compensaciones observables con referencias temporales. No conviertas el intento en un 8RM si no se ven ocho repeticiones válidas. No propongas kg ni asignes brazo afectado o de referencia; esas cargas se contrastan con los datos declarados y las confirma el fisio."},
  "701ef4c7-6de1-4428-b55e-fefa01ae2336": {kind:"load", task:"8RM press estricto unilateral. Describe la ejecución, las repeticiones completas visibles, el recorrido y compensaciones observables con referencias temporales. No conviertas el intento en un 8RM si no se ven ocho repeticiones válidas. No propongas kg ni asignes brazo afectado o de referencia; esas cargas se contrastan con los datos declarados y las confirma el fisio."},
  "a85b7ca1-3ef5-4c05-a865-947d402caf37": {kind:"measurement", task:"Biomecánica escapular en elevaciones laterales. " + scapGuidance},
  "394449d6-fb15-4751-aa2c-41f5aaa4d545": {kind:"measurement", task:"Biomecánica escapular en flexión de hombro. " + scapGuidance},
  "484f0580-8b23-4340-a889-b42ddc1d80dd": {kind:"measurement", task:"Biomecánica escapular en press con barra. " + scapGuidance},
  "08f41761-3bfd-4172-8be8-0b860a0df414": {kind:"movement", task:"Overhead squat. Profundidad, vertical de barra/mediopié, estabilidad de hombros, simetría de hombros y nivel/desplazamiento lateral de la barra en la pausa inferior; distinguir planos."},
  "8d2338ef-dda2-42cf-b055-dc181c4c7c8d": {kind:"movement", task:"Front squat. Profundidad, barra respecto al mediopié, simetría y caída de codos en el front rack al llegar al fondo y durante la pausa; distinguir planos."},
  "17985fdb-49a7-4373-904f-8c5a6f8616dc": {kind:"movement", task:"Push jerk. Trayectoria de la barra en el impulso, vertical del mediopié, bloqueo simultáneo de codos y estabilización nivelada en la recepción."},
  "79462a8e-83b8-46af-89c3-f9a9eb786c4d": {kind:"movement", task:"Dominadas escapulares. Coordinación y simetría, sostén de 4–5 s, flexión de codos y balanceo. Sin nota."},
};
export const canAnalyzeShoulderTest = (testId:string) => Object.prototype.hasOwnProperty.call(SHOULDER_VIDEO_TESTS,testId);
export type VideoInput = {sessionId:string;testId:string;videoId:string;uploadedAt:string};
export type FrameSheet = {times:number[]; jpeg:string};
export type TimeSpan = {start:number;end:number};
export type WallPressContactStatus = "visible_contact" | "visible_gap" | "not_visible";
// Image sides avoid guessing anatomical laterality. Contact means the complete
// arm, including forearm and hand, is directly seen against the wall.
export type WallPressPositionEvidence = {
  leftImageArm:WallPressContactStatus; rightImageArm:WallPressContactStatus;
  backContact:boolean|null; wristsNeutral:boolean|null;
  start:number|null; end:number|null; reason:string;
};
export type WallPressEvidence = {
  initial:WallPressPositionEvidence & {deficitAngleVisible:boolean};
  elevation:WallPressPositionEvidence;
};
export type ShoulderAIDraft = {
  kind:ShoulderVideoKind;testId:string;videoId:string;uploadedAt:string;
  model?:string;
  wallPressEvidence?:WallPressEvidence;
  observationFields:Record<string,number>; notes:string;
  findings:Array<TimeSpan & {text:string}>; limitations:string[];
  method:string; hold:TimeSpan|null;
  intervals:{lossOfPosition:TimeSpan[]|null};
};
export const MAX_CLIP_SECONDS = 60;
export const MAX_FRAME_REQUEST_BYTES = 3_800_000;
