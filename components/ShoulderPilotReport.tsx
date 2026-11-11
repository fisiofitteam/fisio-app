"use client";

import { PILOT_TESTS, scorePilot, legacyPositionLossNeedsReview, type PilotObservations, type PilotPain } from "@/lib/shoulder-pilot";

export type PilotReportSnapshot = {
  weekNumber: number;
  publishedAt: string;
  rubricVersion: string;
  pain: PilotPain;
  observations: PilotObservations;
  notAssessable?: Record<string, string>;
  scores: ReturnType<typeof scorePilot>;
};

export function pilotNumber(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "Sin valorar" : value.toLocaleString("es-ES", {maximumFractionDigits: 1});
}

const CAPACITIES: Record<string, {lines: [string, string?]; description: string; tests: string[]}> = {
  mobility: {lines:["Movilidad"], description:"El recorrido que puedes alcanzar manteniendo la posición solicitada en los tres tests.",tests:["wallFlexion","pullover","wallPress"]},
  endRange: {lines:["Fuerza al final","del rango"],description:"Hasta qué punto mantienes los brazos en la altura solicitada cuando trabajas con el disco.",tests:["bumperRaises","bumperHold"]},
  endurance: {lines:["Resistencia"], description:"Cuánto tiempo sostienes la posición con la pica y con el disco. La altura se valora por separado.",tests:["pvcHold","bumperHold"]},
  stability: {lines:["Estabilidad"],description:"Qué parte del tiempo mantienes la posición sin perder la postura ni tener que recolocar los hombros.",tests:["pvcHold","bumperHold"]},
  coordination: {lines:["Coordinación"],description:"Cómo se coordinan ambas escápulas: se valoran la fluidez y la simetría en tres movimientos.",tests:["scapLateral","scapFlexion","scapPress"]},
  tolerance: {lines:["Tolerancia","a la carga"],description:"Tu respuesta inmediata a la batería: se consideran el dolor al terminar, el cambio respecto al inicio y los tests que te han dolido.",tests:[]},
};

type Axis = {key:string; label:string; score:number|null};
function Radar({axes, before}: {axes:Axis[];before:Axis[]|null}) {
  const point = (i:number,score:number) => {
    const theta=Math.PI*2*i/axes.length - Math.PI/2, r=score*9.45;
    return [210+r*Math.cos(theta),135+r*Math.sin(theta)];
  };
  const grid = (v:number) => axes.map((_,i)=>point(i,v).join(",")).join(" ");
  function series(values: (number|null)[], baseline:boolean) {
    const col=baseline?"#64748b":"#0f766e", complete=values.every(v=>v!==null);
    const shape=complete?<polygon points={values.map((v,i)=>point(i,v!).join(",")).join(" ")} stroke={col} strokeWidth={baseline?2:3} strokeDasharray={baseline?"5 4":undefined} fill={col} fillOpacity={baseline ? 0.025 : 0.12}/> :
      values.map((v,i)=>{const j=(i+1)%values.length;if(v===null||values[j]===null)return null;const [x1,y1]=point(i,v),[x2,y2]=point(j,values[j]!);return <line key={i} {...{x1,y1,x2,y2}} stroke={col} strokeWidth="2" strokeDasharray={baseline?"5 4":undefined}/>;});
    return <g>{shape}{values.map((v,i)=>{if(v===null)return null;const [cx,cy]=point(i,v);return <circle key={i} {...{cx,cy}} r={baseline?2.7:3.5} fill={col}/>;})}</g>;
  }
  return <svg viewBox="0 0 420 273" className="w-full max-w-lg mx-auto" role="img" aria-label="Radar de seis capacidades, puntuadas de cero a diez. Las puntuaciones y su detalle se muestran debajo.">
    {[2.5,5,7.5,10].map(v=><polygon key={v} points={grid(v)} fill="none" stroke="currentColor" opacity=".18"/>)}
    {axes.map((a,i)=>{const [x,y]=point(i,10);return <line key={a.key} x1="210" y1="135" x2={x} y2={y} stroke="currentColor" opacity=".18"/>;})}
    {[5,10].map(v=><text key={v} x={214} y={point(0,v)[1]+3} fill="currentColor" opacity=".65" fontSize="10">{v}</text>)}
    {before&&series(axes.map(a=>before.find(b=>b.key===a.key)?.score??null),true)}
    {series(axes.map(a=>a.score),false)}
    {axes.map((a,i)=>{const [x,y]=point(i,10),side=i===0||i===3?0:i<3?1:-1, labels=CAPACITIES[a.key]?.lines??[a.label];
      const dx=side*10, yy=y+(i===0?-13:i===3?22:3)-(labels.length-1)*6;
      return <text key={a.key} x={x+dx} y={yy} textAnchor={side===1?"start":side===-1?"end":"middle"} fill="currentColor" fontWeight="600" fontSize="13">{labels.map((s,n)=><tspan key={n} x={x+dx} dy={n?15:0}>{s}</tspan>)}</text>;})}
  </svg>;
}

function TestFacts({id, report,axis}: {id:string;report:PilotReportSnapshot;axis:string}) {
  const test=PILOT_TESTS.find(t=>t.id===id);
  if(!test)return null;
  const obs=report.observations[id]??{};
  if(report.notAssessable?.[id])return <p className="text-xs">Sin valorar: {report.notAssessable[id]}</p>;
  const hold=obs.holdSeconds, above=obs.inRangeSeconds, unstable=obs.positionLossSeconds;
  if(test.key==="pvcHold"||test.key==="bumperHold"){
    if(typeof hold!=="number")return <p className="text-xs">Sin tiempo de sostén registrado.</p>;
    if(axis==="endurance")return <p className="text-xs">Sostuviste la posición durante {pilotNumber(hold)} segundos.</p>;
    if(axis==="stability" && legacyPositionLossNeedsReview(id,obs))return <p className="text-xs">Estabilidad registrada con el criterio anterior.</p>;
    if(axis==="stability")return <p className="text-xs">{typeof unstable==="number"?pilotNumber(hold-unstable)+" segundos estables de "+pilotNumber(hold)+" de sostén.":"Estabilidad sin valorar."}</p>;
    return <p className="text-xs">{typeof above==="number"?pilotNumber(above)+" segundos por encima de las orejas de "+pilotNumber(hold)+" de sostén.":"Altura sin valorar."}</p>;
  }
  if(test.key==="bumperRaises")return <dl className="mt-1 text-xs">{[5,10,15].map(kg=><div key={kg}><dt className="inline">{kg} kg: </dt><dd className="inline">{typeof obs["reps"+kg]!=="number"?"Sin registrar":String(obs["reps"+kg])+" repeticiones completadas · "+String(obs["range"+kg]??(obs["reps"+kg]===0?0:"?"))+" en rango"}</dd></div>)}</dl>;
  const fields=test.fields.filter(f=>obs[f.key]!==undefined&&obs[f.key]!==null&&obs[f.key]!=="");
  if(!fields.length)return <p className="text-xs">Sin mediciones registradas.</p>;
  const binary=fields.filter(f=>/^r[123](Smooth|Symmetric|NoShrug)$/.test(f.key));
  if(binary.length) {
    const count=(part:string)=>{const checks=[1,2,3].map(i=>obs["r"+i+part]);return checks.every(v=>v===0||v===1)?checks.filter(v=>v===1).length+"/3":"Sin valorar";};
    return <p className="text-xs text-neutral-600">Fluidez: {count("Smooth")} · Simetría: {count("Symmetric")}.</p>;
  }
  return <dl className="mt-1 space-y-0.5 text-xs text-neutral-600">{fields.map(f=><div key={f.key}><dt className="inline">{f.label}: </dt><dd className="inline font-medium whitespace-pre-wrap">{typeof obs[f.key]==="number"?pilotNumber(Number(obs[f.key])):obs[f.key]}</dd></div>)}</dl>;
}

export function ShoulderPilotReport({report,previous}: {report:PilotReportSnapshot;previous?:PilotReportSnapshot|null}) {
  const compare=report.weekNumber===14&&previous?.weekNumber===1&&(!report.rubricVersion||report.rubricVersion===previous.rubricVersion)?previous:null;
  const {axes,symmetry,tests}=report.scores;
  const usesPreviousStability=(r:PilotReportSnapshot)=>Object.entries(r.observations).some(([id,obs])=>legacyPositionLossNeedsReview(id,obs));
  const legacy=usesPreviousStability(report);
  const differentStability=!!compare && usesPreviousStability(compare)!==legacy;
  const comparableAxes=compare?.scores.axes.map(a=>differentStability&&a.key==="stability"?{...a,score:null}:a)??null;
  return <section className="card space-y-3 text-neutral-900 sm:p-6" aria-label="Informe del perfil de hombro">
    <div><p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Valoración de hombro · Semana {report.weekNumber}</p><h2 className="font-bold text-xl">Tu perfil de hombro</h2></div>
    <div className="flex flex-wrap gap-4 text-xs items-center">{compare&&<span><span aria-hidden="true" className="inline-block w-6 mr-1 border-t-2 border-dashed border-slate-500 align-middle"/>Inicial · semana 1</span>}<span><span className="inline-block w-6 mr-1 align-middle border-t-[3px] border-teal-700"/>{report.weekNumber===14?"Revaloración · semana 14":"Valoración inicial · semana 1"}</span><span className="text-neutral-500">Escala 0–10</span></div>
    <Radar axes={axes} before={comparableAxes}/>
    {differentStability&&<p className="text-xs text-neutral-500">La estabilidad no se compara porque cambió el criterio de valoración. Las demás capacidades sí son comparables.</p>}
    {axes.some(a=>a.score===null)&&<p className="text-xs text-neutral-500">Los ejes sin datos suficientes quedan sin valorar.</p>}
    <h3 className="font-semibold">Capacidad por capacidad</h3>
    <div className="divide-y divide-neutral-200">{axes.map(a=>{
      const initial=comparableAxes?.find(x=>x.key===a.key)?.score;
      const capacity=CAPACITIES[a.key];
      return <details key={a.key} className="py-2"><summary className="cursor-pointer text-sm font-semibold">{a.label}<span className="ml-3 font-normal tabular-nums">{compare&&!(differentStability&&a.key==="stability")&&pilotNumber(initial)+" → "}{pilotNumber(a.score)}{a.score!==null?" / 10":""}</span></summary><p className="mt-2 text-sm text-neutral-600">{legacy&&a.key==="stability"?"Esta puntuación corresponde al criterio de estabilidad vigente al publicar el informe.":capacity?.description}</p>
      {a.key==="tolerance"?<div className="mt-2 text-sm">
        <p>Dolor antes: {pilotNumber(report.pain.before)} · Dolor después: {pilotNumber(report.pain.after)}</p><p>Tests dolorosos: {report.pain.painfulTestIds==null?"Sin registrar":report.pain.painfulTestIds.length===0?"Ninguno":report.pain.painfulTestIds.map(id=>PILOT_TESTS.find(t=>t.id===id)?.name??"Test").join(", ")}.</p>
      </div>:<div className="mt-2 space-y-2">{(capacity?.tests??[]).map(k=>{const t=PILOT_TESTS.find(test=>test.key===k);return t?<div key={t.id}><h4 className="text-sm font-semibold">{t.name}</h4><TestFacts id={t.id} report={report} axis={a.key}/></div>:null;})}</div>}</details>;
    })}</div>
    <div><h3 className="font-semibold">Simetría de fuerza · 8RM</h3><p className="text-xs text-neutral-500">Comparamos el brazo afectado con el de referencia para ocho repeticiones válidas.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">{symmetry.map(s=><div key={s.key} className="rounded-xl border border-neutral-200 p-3"><div className="font-medium text-sm">{s.label}</div><p className="text-sm">{s.affectedKg==null||s.referenceKg==null?"Sin valorar":pilotNumber(s.affectedKg)+" kg / "+pilotNumber(s.referenceKg)+" kg · "+pilotNumber(s.score)+"/10"}</p>{compare&&<p className="text-xs text-neutral-500">Inicial: {pilotNumber(compare.scores.symmetry.find(b=>b.key===s.key)?.score)} / 10</p>}</div>)}</div></div>
    <div><h3 className="font-semibold">Cómo te mueves</h3><p className="text-xs text-neutral-500">Observaciones revisadas por tu fisio.</p>
      <div className="mt-2 space-y-2">{PILOT_TESTS.filter(t=>t.kind==="qualitative").map(t=><details key={t.id} className="border-b border-neutral-200 pb-2"><summary className="cursor-pointer text-sm">{t.name}</summary>
      {compare&&<p className="mt-2 whitespace-pre-wrap text-sm"><b>Inicial: </b>{String(compare.observations[t.id]?.comment||compare.notAssessable?.[t.id]||"Sin valorar")}</p>}
      <p className="mt-2 whitespace-pre-wrap text-sm">{compare&&<b>Revaloración: </b>}{String(report.observations[t.id]?.comment||report.notAssessable?.[t.id]||"Sin valorar")}</p></details>)}</div></div>
    <details className="border-t border-neutral-200 pt-3"><summary className="text-sm font-semibold cursor-pointer">Ver todas las puntuaciones por test</summary><ul className="mt-2 space-y-1 text-sm">{PILOT_TESTS.filter(t=>t.kind==="numeric").map(t=><li key={t.id}>{t.name}: <strong>{compare&&pilotNumber(compare.scores.tests[t.id]?.score)+" → "}{pilotNumber(tests[t.id]?.score)}</strong></li>)}</ul></details>
  </section>;
}
