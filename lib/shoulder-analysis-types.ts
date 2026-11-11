// Browser/server contract. The pilot sends only sampled images, never audio or the blob URL.
export const HOLD_PVC = "5594f37b-b392-4fab-bf49-8dace28ad43c";
export const HOLD_BUMPER = "6ff22736-3450-42d9-8558-019a16e2fc51";
export const SHOULDER_VIDEO_TESTS: Record<string, {kind:"hold"|"movement"; task:string}> = {
  [HOLD_PVC]: {kind:"hold", task:"PVC lift off en prono"},
  [HOLD_BUMPER]: {kind:"hold", task:"Sostén de disco en prono; no adivines el peso"},
  "08f41761-3bfd-4172-8be8-0b860a0df414": {kind:"movement", task:"Overhead squat. Profundidad, vertical de barra/mediopié, estabilidad de hombros, simetría de hombros y nivel/desplazamiento lateral de la barra en la pausa inferior; distinguir planos."},
  "8d2338ef-dda2-42cf-b055-dc181c4c7c8d": {kind:"movement", task:"Front squat. Profundidad, barra respecto al mediopié, simetría y caída de codos en el front rack al llegar al fondo y durante la pausa; distinguir planos."},
  "17985fdb-49a7-4373-904f-8c5a6f8616dc": {kind:"movement", task:"Push jerk. Trayectoria de la barra en el impulso, vertical del mediopié, bloqueo simultáneo de codos y estabilización nivelada en la recepción."},
  "79462a8e-83b8-46af-89c3-f9a9eb786c4d": {kind:"movement", task:"Dominadas escapulares. Coordinación y simetría, sostén de 4–5 s, flexión de codos y balanceo. Sin nota."},
};
export const canAnalyzeShoulderTest = (testId:string) => Object.prototype.hasOwnProperty.call(SHOULDER_VIDEO_TESTS,testId);
export type VideoInput = {sessionId:string;testId:string;videoId:string;uploadedAt:string};
export type FrameSheet = {times:number[]; jpeg:string};
export type TimeSpan = {start:number;end:number};
export type ShoulderAIDraft = {
  kind:"hold"|"movement";testId:string;videoId:string;uploadedAt:string;
  observationFields:Record<string,number>; notes:string;
  findings:Array<TimeSpan & {text:string}>; limitations:string[];
  method:string; hold:TimeSpan|null;
  intervals:{aboveEars:TimeSpan[]|null;lossOfPosition:TimeSpan[]|null;tremor:TimeSpan[]|null};
};
export const MAX_CLIP_SECONDS = 60;
export const MAX_FRAME_REQUEST_BYTES = 3_800_000;
