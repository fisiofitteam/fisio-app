// FisioFit's internal shoulder assessment rubric. Observations, not diagnoses.
// Stable protocol IDs are shared by the week 1 and week 14 definitions.
export const PILOT_PROGRAM_ID = "cmqqhvbmr02necl3znzlqbw21";
export const RUBRIC_VERSION = "shoulder-men-v1";

export type PilotField = {
  key: string; label: string; type: "number" | "text";
  min?: number; max?: number; step?: number; help?: string;
};
export type PilotTest = {
  id: string; key: string; name: string; group: string;
  kind: "numeric" | "qualitative"; fields: PilotField[];
};
export type PilotObservation = Record<string, number | string | null>;
export type PilotObservations = Record<string, PilotObservation>;
export type PilotPain = { before?: number | null; after?: number | null; painfulTestIds?: string[] | null };
export type PilotInterval = { start: number; end: number };
export type PilotTestResult = { score: number | null; missing: boolean; detail: Record<string, number | null> };

const num = (key: string, label: string, min: number, max: number, step: number, help?: string): PilotField =>
  ({ key, label, type: "number", min, max, step, ...(help ? { help } : {}) });
const note = (help: string): PilotField => ({ key: "comment", label: "Valoración del movimiento", type: "text", help });
const mobility = "Movilidad";
const strength = "Fuerza-resistencia en flexión";
const scap = "Biomecánica escapular";
const specific = "Movimientos específicos";
const wallHelp = "Recorrido observado sin despegar la lumbar ni extender la muñeca: 0 = barbilla o menos; 50 = orejas; 100 = brazo completo en contacto. Interpola entre referencias.";
const holdFields = [
  num("holdSeconds", "Tiempo de sostén (s)", 0, 60, 0.1, "Solo el intento medido, hasta el objetivo configurado."),
  num("inRangeSeconds", "Tiempo con los brazos por encima de las orejas (s)", 0, 60, 0.1),
  num("unstableSeconds", "Segundos inestables (sin duplicar solapamientos)", 0, 60, 0.1, "Tiempo con pérdida de posición o temblor que cumple el umbral configurado. No penalices por duración ni altura aquí."),
];
const raiseFields = [5, 10, 15].flatMap(kg => [
  num("reps" + kg, "Repeticiones completadas · " + kg + " kg", 0, 8, 1, "Si se confirma que no se hizo esta carga, indica 0. En blanco = pendiente."),
  num("range" + kg, "A la altura de las orejas con pausa de 1 s · " + kg + " kg", 0, 8, 1),
]);
const rmFields = [
  num("affectedKg", "8RM del brazo afectado (kg)", 0, 500, 0.1, "Carga declarada con ocho repeticiones válidas."),
  num("referenceKg", "8RM del brazo de referencia (kg)", 0, 500, 0.1, "Una referencia de 0 kg no permite calcular el cociente."),
];
const scapFields = [1, 2, 3].flatMap(rep => [
  num("r" + rep + "Smooth", "Rep. " + rep + " · fluidez en subida y bajada", 0, 1, 1, "1 = cumple; 0 = no cumple."),
  num("r" + rep + "Symmetric", "Rep. " + rep + " · simetría de ritmo y recorrido", 0, 1, 1, "1 = cumple; 0 = no cumple."),
  num("r" + rep + "NoShrug", "Rep. " + rep + " · sin encogimiento compensatorio", 0, 1, 1, "1 = sin encogimiento; 0 = encogimiento visible."),
]);
export const PILOT_TESTS: PilotTest[] = [
  { id:"19ce1cc3-bcee-40cb-89d8-3329290f9780", key:"wallFlexion", name:"Flexión de hombro en pared", group:mobility, kind:"numeric", fields:[
    num("leftProgress","Recorrido sin compensación · izquierdo (0–100)",0,100,0.1,wallHelp),
    num("rightProgress","Recorrido sin compensación · derecho (0–100)",0,100,0.1,wallHelp),
  ] },
  { id:"362b23b5-516c-4a2f-9d2c-d09548b7026b", key:"pullover", name:"Bumper pull over sobre wallball", group:mobility, kind:"numeric", fields:[
    num("angle","Ángulo cadera–hombro–codo (°)",0,180,0.1,"Posición mantenida 1 s y que el atleta declara sin dolor, con el tronco controlado. 180° = línea recta."),
  ] },
  { id:"5ab05c1c-5874-4c6e-ae18-16f981357338", key:"wallPress", name:"Wall press", group:mobility, kind:"numeric", fields:[
    num("externalDeficit","Rotación externa que falta para el apoyo inicial (°)",0,180,0.1,"0 si consigue apoyar ambos brazos completos sin compensar. Si hay déficit, no hace falta medir la abducción."),
    num("abduction","Abducción sin perder el apoyo (°)",0,180,0.1,"Con ambos brazos apoyados, espalda en contacto y muñecas neutras. Indica 0 si solo consigue la posición inicial; si eleva desde ella, registra el ángulo de 90° a 180°."),
  ] },
  { id:"5594f37b-b392-4fab-bf49-8dace28ad43c", key:"pvcHold", name:"PVC lift off", group:strength, kind:"numeric", fields:holdFields },
  { id:"6ff22736-3450-42d9-8558-019a16e2fc51", key:"bumperHold", name:"Bumper hold en prono · 5 kg", group:strength, kind:"numeric", fields:holdFields },
  { id:"a489ef3a-0922-4319-8bb6-94f97d879bb1", key:"bumperRaises", name:"Elevación de bumper en buenos días", group:strength, kind:"numeric", fields:raiseFields },
  { id:"86d6177e-a02e-4ef9-a62c-677323e9f8b9", key:"facePull8rm", name:"8RM face pull unilateral", group:strength, kind:"numeric", fields:rmFields },
  { id:"701ef4c7-6de1-4428-b55e-fefa01ae2336", key:"press8rm", name:"8RM press estricto unilateral", group:strength, kind:"numeric", fields:rmFields },
  { id:"a85b7ca1-3ef5-4c05-a865-947d402caf37", key:"scapLateral", name:"Elevaciones laterales", group:scap, kind:"numeric", fields:scapFields },
  { id:"394449d6-fb15-4751-aa2c-41f5aaa4d545", key:"scapFlexion", name:"Flexión de hombro", group:scap, kind:"numeric", fields:scapFields },
  { id:"484f0580-8b23-4340-a889-b42ddc1d80dd", key:"scapPress", name:"Press con barra", group:scap, kind:"numeric", fields:scapFields },
  { id:"08f41761-3bfd-4172-8be8-0b860a0df414", key:"overheadSquat", name:"Overhead squat", group:specific, kind:"qualitative", fields:[note("Profundidad, barra respecto al mediopié, estabilidad de hombros y simetría en el fondo y durante la pausa.")] },
  { id:"8d2338ef-dda2-42cf-b055-dc181c4c7c8d", key:"frontSquat", name:"Front squat", group:specific, kind:"qualitative", fields:[note("Profundidad, posición de la barra, simetría y front rack; observa la caída de uno o ambos codos en el fondo.")] },
  { id:"17985fdb-49a7-4373-904f-8c5a6f8616dc", key:"pushJerk", name:"Push jerk", group:specific, kind:"qualitative", fields:[note("Trayectoria en el impulso; en la recepción: barra sobre mediopié, bloqueo simultáneo y estabilización nivelada.")] },
  { id:"79462a8e-83b8-46af-89c3-f9a9eb786c4d", key:"scapPullUps", name:"Dominadas escapulares", group:specific, kind:"qualitative", fields:[note("Simetría y coordinación, sostén de 4–5 s, flexión de codos y balanceo.")] },
];
export const PILOT_TEST_BY_ID: Record<string,PilotTest> = Object.fromEntries(PILOT_TESTS.map(t => [t.id,t]));
export const AXIS_TEST_KEYS: Record<string,string[]> = {
  mobility:["wallFlexion","pullover","wallPress"], endRange:["bumperRaises","bumperHold"],
  endurance:["pvcHold","bumperHold"], stability:["pvcHold","bumperHold"],
  coordination:["scapLateral","scapFlexion","scapPress"], tolerance:[],
};

export const DEFAULT_PILOT_CONFIG = {
  mobilityFlexionPct:100/3, mobilityPulloverPct:100/3,
  endRangeRaisesPct:66, endurancePvcPct:50, stabilityPvcPct:50, coordinationFluencyPct:50,
  painFinalPenalty:0.5, painRisePenalty:0.5, painTestPenalty:0.25,
  holdTargetSeconds:20, tremorWindowSeconds:5, tremorMinBursts:2, tremorContinuousSeconds:2, pulloverStepDegrees:5,
};
export type PilotConfig = typeof DEFAULT_PILOT_CONFIG;
export const PILOT_CONFIG_FIELDS: PilotField[] = [
  num("mobilityFlexionPct","Movilidad · flexión en pared (%)",0,100,0.01),
  num("mobilityPulloverPct","Movilidad · pull over (%)",0,100,0.01,"El wall press recibe el porcentaje restante."),
  num("endRangeRaisesPct","Fuerza al final del rango · elevación en buenos días (%)",0,100,0.1,"El resto corresponde al bumper hold en prono."),
  num("endurancePvcPct","Resistencia · PVC lift off (%)",0,100,0.1,"El resto corresponde al bumper hold en prono."),
  num("stabilityPvcPct","Estabilidad · PVC lift off (%)",0,100,0.1,"El resto corresponde al bumper hold en prono."),
  num("coordinationFluencyPct","Coordinación · fluidez (%)",0,100,0.1,"La simetría recibe el porcentaje restante."),
  num("painFinalPenalty","Descuento por punto de dolor final",0,10,0.05),
  num("painRisePenalty","Descuento por punto de aumento del dolor",0,10,0.05),
  num("painTestPenalty","Descuento por test doloroso",0,10,0.05),
  num("holdTargetSeconds","Duración objetivo del sostén (s)",1,60,1),
  num("tremorWindowSeconds","Ventana para detectar temblor frecuente (s)",0.1,60,0.1),
  num("tremorMinBursts","Ráfagas en esa ventana para penalizar",1,20,1),
  num("tremorContinuousSeconds","Duración mínima de un temblor continuo (s)",0.1,60,0.1),
  num("pulloverStepDegrees","Grados que equivalen a un punto en pull over",0.1,90,0.1),
];
function obj(v: unknown): v is Record<string,unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
}
function n(v: unknown,min: number,max: number,integer=false): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v<min || v>max || (integer&&!Number.isInteger(v))) return null;
  return v;
}
function fieldValue(f:PilotField,v:unknown):number|null { return n(v,f.min??0,f.max??Infinity,f.step===1); }
export function validatePilotConfig(input:unknown):PilotConfig {
  if(!obj(input) || Object.keys(input).some(key=>!Object.hasOwn(DEFAULT_PILOT_CONFIG,key))) throw Error("Configuración de baremo no válida.");
  const c={...DEFAULT_PILOT_CONFIG};
  for(const f of PILOT_CONFIG_FIELDS){
    const v=fieldValue(f,input[f.key]); if(v===null) throw Error("Revisa: "+f.label+".");
    c[f.key as keyof PilotConfig]=v;
  }
  if(c.mobilityFlexionPct+c.mobilityPulloverPct>100+1e-9) throw Error("Los pesos de movilidad no pueden sumar más del 100 %.");
  if(c.tremorContinuousSeconds>c.holdTargetSeconds || c.tremorWindowSeconds>c.holdTargetSeconds) throw Error("Los umbrales de temblor no pueden superar la duración objetivo del sostén.");
  return c;
}
export function validatePilotPain(input:unknown):PilotPain {
  if(!obj(input) || Object.keys(input).some(k=>!["before","after","painfulTestIds"].includes(k))) throw Error("Datos de dolor no válidos.");
  const out:PilotPain={};
  for(const k of ["before","after"] as const) if(k in input){
    const v=input[k]; if(v===null) out[k]=null;
    else { const value=n(v,0,10); if(value===null) throw Error("El dolor debe estar entre 0 y 10."); out[k]=value; }
  }
  if("painfulTestIds" in input){
    const v=input.painfulTestIds;
    if(v===null) out.painfulTestIds=null;
    else {
      if(!Array.isArray(v)||v.length>100||v.some(id=>typeof id!=="string"||!Object.hasOwn(PILOT_TEST_BY_ID,id))) throw Error("Selección de tests dolorosos no válida.");
      out.painfulTestIds=Array.from(new Set(v as string[]));
    }
  }
  return out;
}
export function sanitizePilotObservations(input:unknown,config:PilotConfig=DEFAULT_PILOT_CONFIG):PilotObservations {
  if(!obj(input)) throw Error("Observaciones no válidas.");
  const out:PilotObservations={};
  for(const [id,fields] of Object.entries(input)){
    if(!Object.hasOwn(PILOT_TEST_BY_ID,id)||!obj(fields)) throw Error("Test no válido para esta batería.");
    const test=PILOT_TEST_BY_ID[id], clean:PilotObservation={};
    for(const [key,value] of Object.entries(fields)){
      const field=test.fields.find(f=>f.key===key); if(!field) throw Error("Campo de observación no válido.");
      if(value===null){clean[key]=null;continue;}
      if(field.type==="text"){if(typeof value!=="string"||value.length>4000) throw Error("El comentario no puede superar 4000 caracteres."); clean[key]=value.trim();}
      else {const v=fieldValue(field,value);if(v===null)throw Error(test.name+": revisa "+field.label+".");clean[key]=v;}
    }
    if(test.key==="pvcHold"||test.key==="bumperHold"){
      const hold=clean.holdSeconds;
      if([hold,clean.inRangeSeconds,clean.unstableSeconds].some(v=>typeof v==="number"&&v>config.holdTargetSeconds))
        throw Error("Registra solo el tramo de sostén hasta el objetivo configurado.");
      if(typeof hold==="number"&&[clean.inRangeSeconds,clean.unstableSeconds].some(v=>typeof v==="number"&&v>hold))
        throw Error("El tiempo en rango o inestable no puede superar el sostén.");
    }
    if(test.key==="bumperRaises") for(const kg of [5,10,15]){
      const reps=clean["reps"+kg], range=clean["range"+kg];
      if(typeof reps==="number"&&typeof range==="number"&&range>reps) throw Error("Las repeticiones en rango no pueden superar las completadas.");
    }
    if(test.key==="wallPress"&&clean.externalDeficit===0&&typeof clean.abduction==="number"&&clean.abduction>0&&clean.abduction<90)
      throw Error("Marca 0 si solo alcanza el apoyo inicial o indica una elevación desde 90°.");
    out[id]=clean;
  }
  return out;
}

// Times relative to onset. Overlapping evidence is never counted twice.
function merged(hold:number,intervals:PilotInterval[],config:PilotConfig):PilotInterval[]{
  if(!Number.isFinite(hold)||hold<0||!Array.isArray(intervals)) throw Error("Tramo de vídeo no válido.");
  const end=Math.min(hold,config.holdTargetSeconds);
  const spans=intervals.map(i=>{
    if(!i||!Number.isFinite(i.start)||!Number.isFinite(i.end)||i.end<=i.start)throw Error("Intervalo de vídeo no válido.");
    return {start:Math.max(0,i.start),end:Math.min(end,i.end)};
  }).filter(i=>i.end>i.start).sort((a,b)=>a.start-b.start||a.end-b.end);
  const out:PilotInterval[]=[];
  for(const i of spans){const tail=out[out.length-1];if(tail&&i.start<=tail.end)tail.end=Math.max(tail.end,i.end);else out.push(i);}
  return out;
}
export function intervalDuration(hold:number,intervals:PilotInterval[],config=DEFAULT_PILOT_CONFIG){
  return merged(hold,intervals,config).reduce((a,i)=>a+i.end-i.start,0);
}
export function unstableDuration(hold:number,lossIntervals:PilotInterval[],tremorIntervals:PilotInterval[],config=DEFAULT_PILOT_CONFIG){
  const bursts=merged(hold,tremorIntervals,config);
  const eligible=new Set(bursts.filter(i=>i.end-i.start>=config.tremorContinuousSeconds));
  // Count distinct onsets in an inclusive rolling window; mark all qualifying bursts, not the entire window.
  for(let i=0;i<bursts.length;i++){
    let j=i+1; while(j<bursts.length && bursts[j].start-bursts[i].start<=config.tremorWindowSeconds)j++;
    if(j-i>=config.tremorMinBursts)for(let k=i;k<j;k++)eligible.add(bursts[k]);
  }
  return intervalDuration(hold,[...lossIntervals,...eligible],config);
}
const clamp=(x:number)=>Math.max(0,Math.min(10,x));
const rnd=(x:number)=>Math.round((x+Number.EPSILON)*100)/100;
const present=(v:number|null)=>v===null?null:rnd(clamp(v));
const ratio=(a:number|null,b:number|null)=>a===null||b===null||b<=0||a>b?null:10*a/b;
function sum(xs:(number|null)[]):number|null {return xs.some(x=>x===null)?null:xs.reduce<number>((a,x)=>a+(x??0),0);}
function weighted(values:(number|null)[],weights:number[]):number|null{
  // A criterion disabled explicitly in settings is never an implicit zero.
  let total=0;for(let i=0;i<weights.length;i++){if(weights[i]<=1e-10)continue;const v=values[i];if(v===null||!Number.isFinite(v))return null;total+=weights[i]*v/100;}
  return total;
}
export function scorePilot(observations:PilotObservations={},pain:PilotPain={},config:PilotConfig=DEFAULT_PILOT_CONFIG){
  const tests:Record<string,PilotTestResult>={},raw:Record<string,number|null>={};
  const details:Record<string,Record<string,number|null>>={};
  const symmetry:{key:string;label:string;score:number|null;affectedKg:number|null;referenceKg:number|null}[]=[];
  const missing:string[]=[];
  for(const test of PILOT_TESTS){
    const fields=observations?.[test.id]||{};
    const read=(key:string)=>{const f=test.fields.find(x=>x.key===key);return f?fieldValue(f,fields[key]):null;};
    const d:Record<string,number|null>={};
    let score:number|null=null;
    switch(test.key){
      case "wallFlexion": {
        const l=read("leftProgress"),r=read("rightProgress");d.left=l===null?null:l/10;d.right=r===null?null:r/10;
        score=d.left===null||d.right===null?null:Math.min(d.left,d.right);break;
      }
      case "pullover": {const angle=read("angle");d.angle=angle;score=angle===null?null:clamp(10-(180-angle)/config.pulloverStepDegrees);break;}
      case "wallPress": {
        const deficit=read("externalDeficit"),abd=read("abduction");d.externalDeficit=deficit;d.abduction=abd;
        if(deficit!==null && deficit>0)score=clamp(7-deficit/5);
        else if(deficit===0 && abd!==null)score=abd>=135?10:abd>120?9:abd>=90?8:abd===0?7:null;
        break;
      }
      case "pvcHold":case "bumperHold":{
        const h=read("holdSeconds"),v=read("inRangeSeconds"),u=read("unstableSeconds");
        const hold=h!==null && h<=config.holdTargetSeconds?h:null;
        d.timeScore=hold===null?null:10*hold/config.holdTargetSeconds;
        d.rangeScore=ratio(v,hold);
        d.stabilityScore=(u!==null && hold!==null && u<=hold)?ratio(hold-u,hold):null;
        score=weighted([d.timeScore,d.rangeScore],[50,50]);break;
      }
      case "bumperRaises":{
        const reps=[5,10,15].map(kg=>read("reps"+kg));
        const valid=reps.map((rep,i)=>{const range=read("range"+[5,10,15][i]);return rep===0&&range===null?0:rep!==null&&range!==null&&range<=rep?range:null;});
        const count=sum(reps),inRange=sum(valid);d.completed=count;d.inRange=inRange;
        d.forceScore=ratio(count,24);d.rangeScore=ratio(inRange,count);score=weighted([d.forceScore,d.rangeScore],[50,50]);break;
      }
      case "facePull8rm":case "press8rm":{
        const affected=read("affectedKg"),ref=read("referenceKg");score=affected===null||ref===null||ref===0?null:clamp(10*affected/ref);
        d.deficitPct=affected===null||ref===null||ref===0?null:Math.max(0,100*(ref-affected)/ref);
        symmetry.push({key:test.key,label:test.name,score:present(score),affectedKg:affected,referenceKg:ref});break;
      }
      case "scapLateral":case "scapFlexion":case "scapPress":{
        for(const [key,part] of [["fluency","Smooth"],["symmetry","Symmetric"],["withoutShrug","NoShrug"]]){
          d[key]=ratio(sum([1,2,3].map(i=>read("r"+i+part))),3);
        }
        const s=sum([d.fluency,d.symmetry,d.withoutShrug]);score=s===null?null:s/3;break;
      }
    }
    raw[test.key]=score;details[test.key]=d;
    const isMissing=test.kind==="qualitative" ? typeof fields.comment!=="string"||!fields.comment.trim() : score===null;
    tests[test.id]={score:present(score),missing:isMissing,detail:d};
    if(isMissing)missing.push(test.name);
  }
  // No null coercion, no fabricated values and no normalization over an incomplete subset.
  const m1=config.mobilityFlexionPct,m2=config.mobilityPulloverPct;
  const compare=(a:number|null,b:number|null,wa:number)=>weighted([a,b],[wa,100-wa]);
  const coord=AXIS_TEST_KEYS.coordination.map(key=>compare(details[key].fluency,details[key].symmetry,config.coordinationFluencyPct));
  const coordTotal=sum(coord);
  const b=n(pain?.before,0,10),a=n(pain?.after,0,10);
  const ids=pain?.painfulTestIds;
  const painCount=Array.isArray(ids)&&ids.every(id=>Object.hasOwn(PILOT_TEST_BY_ID,id))?new Set(ids).size:null;
  const tolerance=b!==null&&a!==null&&painCount!==null ? clamp(10-config.painFinalPenalty*a-config.painRisePenalty*Math.max(0,a-b)-config.painTestPenalty*painCount) : null;
  const axes=[
    {key:"mobility",label:"Movilidad",score:weighted([raw.wallFlexion,raw.pullover,raw.wallPress],[m1,m2,100-m1-m2])},
    {key:"stability",label:"Estabilidad",score:compare(details.pvcHold.stabilityScore,details.bumperHold.stabilityScore,config.stabilityPvcPct)},
    {key:"endRange",label:"Fuerza al final del rango",score:compare(details.bumperRaises.rangeScore,details.bumperHold.rangeScore,config.endRangeRaisesPct)},
    {key:"coordination",label:"Coordinación",score:coordTotal===null?null:coordTotal/3},
    {key:"endurance",label:"Resistencia",score:compare(details.pvcHold.timeScore,details.bumperHold.timeScore,config.endurancePvcPct)},
    {key:"tolerance",label:"Tolerancia a la carga",score:tolerance},
  ].map(axis=>({...axis,score:present(axis.score)}));
  for(const axis of axes)if(axis.score===null)missing.push("Eje: "+axis.label);
  const hasResults=Object.values(tests).some(t=>!t.missing)||axes.some(axis=>axis.score!==null);
  return {tests,axes,symmetry,complete:missing.length===0,missing,hasResults};
}
