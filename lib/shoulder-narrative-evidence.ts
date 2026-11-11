import { AXIS_TEST_KEYS, PILOT_TESTS, RUBRIC_VERSION, legacyPositionLossNeedsReview, scorePilot, type PilotConfig, type PilotObservations, type PilotPain } from "./shoulder-pilot";
import { SHOULDER_AXES, type ShoulderAxis } from "./shoulder-narrative";
import type { ShoulderTestFeedbackMap } from "./shoulder-test-feedback";

type ScoreAxes=ReturnType<typeof scorePilot>["axes"];
type Prior={weekNumber:number;rubricVersion:string;observations:PilotObservations;testFeedback?:ShoulderTestFeedbackMap;scores:{axes:ScoreAxes}};
type Saved={weekNumber:number;config:PilotConfig;observations:PilotObservations;pain:PilotPain;testFeedback:ShoulderTestFeedbackMap};
const fields:Record<ShoulderAxis,readonly string[]>={
  mobility:["leftProgress","rightProgress","angle","externalDeficit","abduction"],
  stability:["holdSeconds","positionLossSeconds"],endRange:["inRangeSeconds","holdSeconds","reps5","reps10","reps15","range5","range10","range15"],
  coordination:[],endurance:["holdSeconds"],tolerance:[],
};
const definition:Record<ShoulderAxis,string>={
  mobility:"Recorrido medido en los tres tests de movilidad; solo dentro de sus criterios de ejecución.",
  stability:"Parte del sostén en la que se mantiene la postura sin perderla ni recolocarse.",
  endRange:"Capacidad de mantener o alcanzar altura con los brazos en los tests con disco.",
  coordination:"Fluidez y simetría de ambas escápulas durante las repeticiones observadas.",
  endurance:"Duración del sostén respecto al objetivo en los tests con PVC y disco.",
  tolerance:"Respuesta del dolor al conjunto de pruebas; dolor final, cambio y número de pruebas dolorosas.",
};
const finite=(v:unknown):v is number=>typeof v==="number" && Number.isFinite(v);

// Only fixed test/field labels and explicitly allowlisted numeric observations are sent.
// Never pass entire data objects (they can contain videos, free text, names and internal IDs).
export function makeNarrativeEvidence(data:Saved,prior:Prior|null){
  const scores=scorePilot(data.observations,data.pain,data.config);
  const previous=data.weekNumber===14 && prior?.weekNumber===1 && prior.rubricVersion===RUBRIC_VERSION?prior:null;
  const oldStability=!!previous && Object.entries(previous.observations).some(([id,o])=>legacyPositionLossNeedsReview(id,o));
  const axes=SHOULDER_AXES.map(key=>{
    const {label,score}=scores.axes.find(a=>a.key===key)!;
    const priorScore=previous && !(key==="stability"&&oldStability)?previous.scores.axes.find(a=>a.key===key)?.score:null;
    const compare=finite(priorScore)&&finite(score)?{inicial:priorScore,cambio:Math.round((score-priorScore)*100)/100}:null;
    const tests=score===null?[]:PILOT_TESTS.filter(t=>AXIS_TEST_KEYS[key].includes(t.key)).map(t=>{
      const facts:Record<string,number>={},row=data.observations[t.id]??{};
      for(const f of t.fields){const n=row[f.key];if(fields[key].includes(f.key)&&finite(n))facts[f.label]=n;}
      if(key==="coordination")for(const [suffix,label] of [["Smooth","Repeticiones fluidas de tres"],["Symmetric","Repeticiones simétricas de tres"]]){
        const reps=[1,2,3].map(i=>row["r"+i+suffix]);if(reps.every(v=>v===0||v===1))facts[label]=reps.filter(v=>v===1).length;
      }
      return {test:t.name,medidas:facts};
    }).filter(t=>Object.keys(t.medidas).length);
    return {key,nombre:label,significado:definition[key],nota:score,comparacion:compare,tests,
      ...(key==="endurance"&&score!==null?{objetivoSegundos:data.config.holdTargetSeconds}:{}),
      ...(key==="tolerance"&&score!==null?{dolorAntes:data.pain.before,dolorDespues:data.pain.after,numeroDePruebasDolorosas:data.pain.painfulTestIds?.length}:{}),
    };
  });
  const attempt=(f:ShoulderTestFeedbackMap[string]|undefined,allowSet:boolean)=>{
    if(!f)return null;
    const item:Record<string,number>={};
    if(finite(f.pain))item.dolorDurante=f.pain;
    if(allowSet&&finite(f.reps))item.repeticionesRealizadas=f.reps;
    if(allowSet&&finite(f.loadKg))item.cargaIntentadaKg=f.loadKg;
    return Object.keys(item).length?item:null;
  };
  const intentosDeclarados=PILOT_TESTS.flatMap(t=>{
    const strength=t.key==="facePull8rm"||t.key==="press8rm";
    const actual=attempt(data.testFeedback[t.id],strength);
    if(!actual)return [];
    const inicial=attempt(previous?.testFeedback?.[t.id],strength);
    return [{prueba:t.name,actual,inicial}];
  });
  return {fase:data.weekNumber===14?"retest":"inicial",escala:"0 a 10",capacidades:axes,intentosDeclarados};
}
export type NarrativeEvidence=ReturnType<typeof makeNarrativeEvidence>;
