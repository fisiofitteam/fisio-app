import Link from "next/link";
import { notFound } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { canUseEvidence } from "@/lib/patient-evidence";
import { getCurrentPilotConfig } from "@/lib/shoulder-pilot-config-server";
import { PILOT_PROGRAM_ID, PILOT_TESTS, RUBRIC_VERSION, scorePilot, type PilotConfig, type PilotObservations } from "@/lib/shoulder-pilot";
import { ShoulderPilotReport } from "@/components/ShoulderPilotReport";
export const dynamic="force-dynamic";

function example(retest:boolean,config:PilotConfig){
 const observations:PilotObservations={};
 const byKey=Object.fromEntries(PILOT_TESTS.map(t=>[t.key,t.id]));
 const field=(k:string,values:PilotObservations[string])=>{observations[byKey[k]]=values;};
 const time=config.holdTargetSeconds;
 field("wallFlexion",{leftProgress:retest?90:65,rightProgress:retest?95:80});
 field("pullover",{angle:retest?174:155});field("wallPress",{externalDeficit:0,abduction:retest?130:105});
 field("pvcHold",{holdSeconds:time*(retest?1:.75),inRangeSeconds:time*(retest?.9:.45),positionLossSeconds:time*(retest?.05:.15)});
 field("bumperHold",{holdSeconds:time*(retest?.9:.5),inRangeSeconds:time*(retest?.8:.25),positionLossSeconds:time*(retest?.12:.2)});
 field("bumperRaises",{reps5:8,range5:retest?8:6,reps10:retest?8:6,range10:retest?7:4,reps15:retest?4:0,range15:retest?3:0});
 // The two-rep initial attempt is useful clinical context, but is not a valid 8RM.
 field("facePull8rm",retest?{affectedKg:10,referenceKg:12}:{referenceKg:12});
 field("press8rm",{affectedKg:retest?12:8,referenceKg:12});
 for(const k of ["scapLateral","scapFlexion","scapPress"]){
  const v:PilotObservations[string]={};for(let i=1;i<=3;i++){v["r"+i+"Smooth"]=retest||i===1?1:0;v["r"+i+"Symmetric"]=retest||i<3?1:0;v["r"+i+"NoShrug"]=i<3?1:0;}field(k,v);
 }
 field("overheadSquat",{comment:retest?"La barra se mantiene nivelada en la pausa.":"En dos repeticiones desciende el extremo derecho de la barra."});
 field("frontSquat",{comment:retest?"Los codos mantienen su posición al llegar al fondo.":"El codo derecho baja en la pausa de la tercera repetición."});
 field("pushJerk",{comment:retest?"La barra queda nivelada en la recepción.":"En la recepción, el codo derecho termina de extenderse después del izquierdo."});
 field("scapPullUps",{comment:retest?"Mantiene la pausa sin balanceo en las tres repeticiones.":"Flexiona los codos en la última repetición."});
 const testFeedback={
  [byKey.facePull8rm]:retest
    ? {pain:3,reps:8,loadKg:10,comment:"Completé las ocho. Noté el hombro en las dos últimas."}
    : {pain:6,reps:2,loadKg:8,comment:"Paré después de la segunda repetición porque me dolía el hombro."},
  [byKey.bumperHold]:{pain:retest?1:2},
  [byKey.overheadSquat]:{pain:retest?0:3}
 };
 const pain={before:retest?1:2,after:retest?2:4,painfulTestIds:Object.entries(testFeedback).filter(([,entry])=>entry.pain>0).map(([id])=>id)};
 const notAssessable:Record<string,string>=retest?{}:{[byKey.facePull8rm]:"El intento terminó tras dos repeticiones. No hay un 8RM válido del brazo afectado."};
 return {weekNumber:retest?14:1,publishedAt:"",rubricVersion:RUBRIC_VERSION,pain,observations,testFeedback,notAssessable,scores:scorePilot(observations,pain,config)};
}

export default async function Example({params,searchParams}:{params:{id:string};searchParams:{semana?:string}}){
 if(params.id!==PILOT_PROGRAM_ID||!canUseEvidence(await getActiveProfessional()))notFound();
 const url="/fisio/biblioteca/programas/"+PILOT_PROGRAM_ID+"/baremo",config=await getCurrentPilotConfig();
 const initial=example(false,config),retest=searchParams.semana!=="1";
 return <main className="mx-auto max-w-3xl space-y-4 pb-12"><Link href={url} className="text-sm underline">← Volver al baremo</Link>
 <div className="rounded-xl border border-amber-300 bg-amber-50 p-4"><strong>Vista de prueba · datos ficticios</strong><p className="text-sm">Así verá un atleta su informe después de la revisión del fisio. Este ejemplo no pertenece a ningún paciente ni se guarda en su ficha.</p></div>
 <div className="flex flex-wrap gap-2">{[[false,"Inicial · semana 1"],[true,"Comparar con semana 14"]].map(([value,label])=><Link key={String(label)} href={url+"/ejemplo?semana="+(value?14:1)} className={"rounded-lg border px-3 py-2 text-sm "+(retest===value?"bg-neutral-900 text-white":"bg-white")}>{label}</Link>)}</div>
 <ShoulderPilotReport report={retest?example(true,config):initial} previous={retest?initial:null}/></main>;
}
