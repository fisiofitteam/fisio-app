import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWodPatient, requestedWodReadiness, WodRequestError } from "@/lib/patient-wod-access";

const headers = { "Cache-Control": "private, no-store" };
function score(value:unknown):number|null {
  if(value===null||value===undefined)return null;
  if(typeof value!=="number"||!Number.isInteger(value)||value<0||value>10)
    throw new WodRequestError(400,"Las sensaciones deben estar entre 0 y 10.");
  return value;
}
export async function POST(req: NextRequest) {
  try {
    const body=await req.json().catch(()=>null);
    if(!body||typeof body!=="object"||Array.isArray(body))throw new WodRequestError(400,"Registro no válido.");
    const patient=await requireWodPatient(body.patientId);
    const readiness=requestedWodReadiness(patient.programType,body.readiness);
    const rawText=typeof body.rawText==="string"?body.rawText.trim():"";
    const adaptedText=typeof body.adaptedText==="string"?body.adaptedText.trim():"";
    if(!rawText||rawText.length>20000||!adaptedText||adaptedText.length>40000)
      throw new WodRequestError(400,"Adapta el WOD antes de registrarlo.");
    if(body.notes!=null&&(typeof body.notes!=="string"||body.notes.length>5000))
      throw new WodRequestError(400,"El comentario no puede superar los 5.000 caracteres.");
    const log=await prisma.wodLog.create({data:{
      patientId:patient.id,rawText,adaptedText,readiness,
      rpe:score(body.rpe),painScore:score(body.painScore),notes:body.notes?.trim()||null,
      completedAt:new Date(),
    }});
    return NextResponse.json(log,{headers});
  } catch(error) {
    return NextResponse.json(
      {error:error instanceof WodRequestError?error.message:"No se ha podido guardar el WOD. Inténtalo de nuevo."},
      {status:error instanceof WodRequestError?error.status:500,headers},
    );
  }
}
