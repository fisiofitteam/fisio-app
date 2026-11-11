"use client";
import { useState } from "react";
import { DEFAULT_PILOT_CONFIG, validatePilotConfig, type PilotConfig } from "@/lib/shoulder-pilot";

type Field = [keyof PilotConfig,string,string?];
const groups: {title:string;fields:Field[]}[]=[
 {title:"Movilidad · reparto entre los tres tests",fields:[["mobilityFlexionPct","Flexión en pared (%)"],["mobilityPulloverPct","Pull over sobre wallball (%)"]]},
 {title:"Fuerza, resistencia y estabilidad",fields:[["endRangeRaisesPct","Fuerza al final del rango: elevación de bumper (%)","El resto corresponde al bumper hold en prono."],["endurancePvcPct","Resistencia: PVC lift off (%)","El resto corresponde al bumper hold en prono."],["stabilityPvcPct","Estabilidad: PVC lift off (%)","El resto corresponde al bumper hold en prono."],["holdTargetSeconds","Objetivo de sostén isométrico (s)"],["pulloverStepDegrees","Grados de recorrido por punto en el pull over"]]},
 {title:"Coordinación y temblor",fields:[["coordinationFluencyPct","Coordinación: fluidez (%)","El resto corresponde a la simetría escapular."],["tremorWindowSeconds","Intervalo de observación de ráfagas (s)"],["tremorMinBursts","Mínimo de ráfagas en el intervalo"],["tremorContinuousSeconds","Temblor continuo mínimo (s)"]]},
 {title:"Tolerancia inmediata a la carga",fields:[["painFinalPenalty","Descuento por punto de dolor al terminar"],["painRisePenalty","Descuento por punto de aumento del dolor"],["painTestPenalty","Descuento por test doloroso"]]}
];
const decimal=(n:number)=>Number(n.toFixed(4));
function formOf(c:PilotConfig){return Object.fromEntries(Object.entries(c).map(([k,v])=>[k,String(decimal(v))])) as Record<keyof PilotConfig,string>;}
export function ShoulderRubricEditor({initial,revision,editable}:{initial:PilotConfig;revision:number;editable:boolean}){
 const [saved,setSaved]=useState(initial),[rev,setRev]=useState(revision),[vals,setVals]=useState(()=>formOf(initial)),[msg,setMsg]=useState(""),[busy,setBusy]=useState(false);
 const initialVals=formOf(saved);
 const dirty=Object.keys(vals).some(k=>vals[k as keyof PilotConfig]!==initialVals[k as keyof PilotConfig]);
 const rest=100-Number(vals.mobilityFlexionPct)-Number(vals.mobilityPulloverPct);
 async function submit(e:React.FormEvent){e.preventDefault();if(!editable||busy||!dirty)return;setBusy(true);setMsg("");
 try{const proposed={...saved}; for(const k of Object.keys(proposed) as (keyof PilotConfig)[]){if(vals[k]!==initialVals[k]){if(!vals[k].trim()||!Number.isFinite(Number(vals[k])))throw Error("Revisa los valores vacíos.");proposed[k]=Number(vals[k]);}}
 const config=validatePilotConfig(proposed);const r=await fetch("/api/shoulder-pilot/settings",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({revision:rev,config})});const d=await r.json();if(!r.ok)throw Error(d.error||"No se ha guardado.");setSaved(d.config);setVals(formOf(d.config));setRev(d.revision);setMsg("Baremo guardado para nuevas evaluaciones.");
 }catch(err){setMsg(err instanceof Error?err.message:"No se ha guardado el baremo.");}finally{setBusy(false);}}
 return <form onSubmit={submit} className="space-y-4"><p className="text-xs text-neutral-500">Versión {rev+1}{editable?" · Editable por CEO":" · Solo lectura"}</p>
 {groups.map((g,idx)=><fieldset key={g.title} disabled={!editable||busy} className="rounded-2xl border bg-white p-4"><legend className="px-2 font-semibold">{g.title}</legend><div className="grid gap-4 sm:grid-cols-2">{g.fields.map(([k,label,help])=><label key={k} className="block text-sm">{label}<input type="number" step="any" required value={vals[k]} onChange={e=>{setVals({...vals,[k]:e.target.value});setMsg("");}} className="mt-1 block w-full rounded-lg border px-3 py-2 tabular-nums"/>{help&&<span className="mt-1 block text-xs text-neutral-500">{help}</span>}</label>)}</div>{idx===0&&<p className="mt-3 text-sm">Wall press: <strong>{decimal(rest)} %</strong> restante.</p>}</fieldset>)}
 {editable&&<div className="flex flex-wrap items-center gap-3"><button className="rounded-lg bg-neutral-900 px-4 py-2 text-white disabled:opacity-40" disabled={busy||!dirty}>Guardar baremo</button><button type="button" disabled={busy} onClick={()=>{setVals(formOf(DEFAULT_PILOT_CONFIG));setMsg("Valores iniciales cargados. Pulsa guardar para aplicarlos.");}} className="text-sm underline">Recuperar valores iniciales</button></div>}
 {msg&&<p role="status" className="text-sm font-medium">{msg}</p>}</form>;
}
