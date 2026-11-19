import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canAccessEvidencePatient } from "@/lib/patient-evidence";
import { isWodReadiness, usesWodReadiness, type WodReadiness } from "@/lib/wod-readiness";

export class WodRequestError extends Error {
  constructor(public status:number,message:string){super(message);}
}
/** Verify ownership/clinical scope before reading adaptations or calling the parser. */
export async function requireWodPatient(patientId:unknown){
  const actor=await getSessionUser();
  if(!actor)throw new WodRequestError(401,"Inicia sesión para adaptar tu WOD.");
  if(typeof patientId!=="string"||!patientId||patientId.length>100)
    throw new WodRequestError(400,"Paciente no válido.");
  if(actor.kind==="patient"?actor.patient.id!==patientId:!await canAccessEvidencePatient(patientId,actor.pro))
    throw new WodRequestError(404,"Paciente no disponible.");
  const patient=await prisma.patient.findUnique({where:{id:patientId},select:{id:true,programType:true}});
  if(!patient)throw new WodRequestError(404,"Paciente no disponible.");
  return patient;
}
export function requestedWodReadiness(programType:string|null,value:unknown):WodReadiness|null{
  if(!usesWodReadiness(programType))return null;
  if(!isWodReadiness(value))throw new WodRequestError(400,"Elige cómo estás hoy antes de adaptar o guardar el WOD.");
  return value;
}
