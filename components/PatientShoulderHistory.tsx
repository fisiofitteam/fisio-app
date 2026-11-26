import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { PILOT_PROGRAM_ID } from "@/lib/shoulder-pilot-snapshot";
import { groupShoulderBatteries, shoulderBatteryDayKey } from "@/lib/shoulder-battery";
import { batteryPeersWhere } from "@/lib/shoulder-battery-server";
import { patientShoulderTitle } from "@/lib/patient-shoulder-session";

// Authorize the patient before retrieving their shoulder assessment history.
export async function PatientShoulderHistory({patientId}:{patientId:string}) {
  const actor=await getSessionUser();
  if(actor?.kind !== "patient" || actor.patient.id !== patientId)return null;
  const select={id:true,assignmentId:true,scheduledDate:true,weekNumber:true,tasksSnapshot:true,
    assignment:{select:{programId:true,patientId:true,program:{select:{isStandalone:true}}}},shoulderPilotReview:{select:{publishedAt:true}}} as const;
  const selected=await prisma.programSession.findMany({
    where:{assignment:{patientId,OR:[{programId:PILOT_PROGRAM_ID},{program:{isStandalone:true}}]},tasksSnapshot:{contains:"ASSESSMENT"}},
    select,
    orderBy:[{scheduledDate:"desc"},{id:"asc"}],take:50
  });
  const days=new Map(selected.filter(s=>shoulderBatteryDayKey(s)).map(s=>[shoulderBatteryDayKey(s)!,s]));
  const peers=days.size?await prisma.programSession.findMany({where:{assignment:{patientId},OR:[...days.values()].map(batteryPeersWhere)},select}):[];
  const sessions=[...new Map([...selected,...peers].map(s=>[s.id,s])).values()];
  const matching=groupShoulderBatteries(sessions).map(group=>group.session);
  if(!matching.length)return null;
  return <details className="rounded-2xl p-4 mb-4" style={{background:"var(--p-surface)",border:"1px solid var(--p-border)"}}>
    <summary className="font-semibold text-sm cursor-pointer">Mis valoraciones de hombro</summary>
    <div className="mt-3 space-y-2">{matching.map(s=><Link key={s.id} className="block rounded-lg p-3 text-sm" style={{background:"var(--p-surface-2)"}} href={s.shoulderPilotReview?.publishedAt ? `/valoraciones/hombro/${s.id}/informe` : `/paciente/${patientId}/sesion/${s.id}#valoracion-hombro`}>
      <span className="block font-medium">{patientShoulderTitle(s.weekNumber)} · semana {s.weekNumber}</span>
      <span className="text-xs" style={{color:"var(--p-text-dim)"}}>{s.scheduledDate.toLocaleDateString("es-ES",{timeZone:"UTC",day:"numeric",month:"long",year:"numeric"})} · {s.shoulderPilotReview?.publishedAt?"Ver informe de mi fisio":"Abrir pruebas"}</span>
    </Link>)}</div>
  </details>;
}
