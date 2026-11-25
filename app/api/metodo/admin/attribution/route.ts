import {NextRequest} from "next/server";
import {prisma} from "@/lib/prisma";
import {body,ensureMetodoSchema,failure,json,MetodoError,randomUUID,requireOrigin,staff} from "@/lib/metodo/server";
import {REFERENCE_PATTERN} from "@/lib/metodo/events";
export const dynamic="force-dynamic";
async function scopedLead(id:string,user:Awaited<ReturnType<typeof staff>>){const lead=await prisma.lead.findUnique({where:{id},select:{id:true,closerId:true}});if(!lead||(!["ceo","setter"].includes(user.role)&&lead.closerId!==user.id))throw new MetodoError(404,"Llamada no disponible.");return lead;}
export async function GET(req:NextRequest){try{const user=await staff(),leadId=req.nextUrl.searchParams.get("leadId")||"";await scopedLead(leadId,user);await ensureMetodoSchema();return json({attribution:await prisma.metodoContact.findUnique({where:{leadId},select:{reference:true,confirmedAt:true}})});}catch(e){return failure(e);}}
export async function POST(req:NextRequest){try{
  requireOrigin(req);const user=await staff(),b=await body(req,2000),reference=String(b.reference||"").trim().toUpperCase(),leadId=typeof b.leadId==="string"&&b.leadId?b.leadId:null;
  if(!REFERENCE_PATTERN.test(reference)||b.messageReceived!==true)throw new MetodoError(400,"Introduce la referencia del mensaje recibido y confirma su recepción.");
  if(leadId)await scopedLead(leadId,user);else if(!["ceo","setter"].includes(user.role))throw new MetodoError(403,"Vincula la referencia a una de tus llamadas.");
  const evidence=typeof b.evidence==="string"?b.evidence.trim().slice(0,250):"";if(!evidence)throw new MetodoError(400,"Indica cómo has comprobado la recepción del mensaje.");
  await ensureMetodoSchema();
  const updated=await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(149331,20261127)`;
    const c=await tx.metodoContact.findUnique({where:{reference}});if(!c)throw new MetodoError(404,"Referencia no encontrada o caducada.");
    if(c.leadId&&c.leadId!==leadId)throw new MetodoError(409,"La referencia ya está vinculada a otra llamada.");
    if(leadId){const assigned=await tx.metodoContact.findUnique({where:{leadId}});if(assigned&&assigned.reference!==reference)throw new MetodoError(409,"Esta llamada ya tiene otra referencia. Corrígela antes de sustituirla.");}
    const row=await tx.metodoContact.update({where:{reference},data:{confirmedAt:c.confirmedAt||new Date(),confirmedById:user.id,evidence,...(leadId?{leadId}:{})}});
    await tx.metodoAudit.create({data:{id:randomUUID(),actorId:user.id,action:"conversation_confirmed",reference,detail:JSON.stringify({leadId})}});return row;
  });return json({attribution:{reference:updated.reference,confirmedAt:updated.confirmedAt}});
}catch(e){return failure(e);}}
export async function DELETE(req:NextRequest){try{
  requireOrigin(req);const user=await staff(),b=await body(req,1500);if(typeof b.leadId!=="string")throw new MetodoError(400,"Falta la llamada.");await scopedLead(b.leadId,user);await ensureMetodoSchema();
  const reason=typeof b.reason==="string"?b.reason.trim().slice(0,200):"";if(!reason)throw new MetodoError(400,"Indica el motivo de la corrección.");
  await prisma.$transaction(async tx=>{const row=await tx.metodoContact.findUnique({where:{leadId:b.leadId}});if(!row)return;await tx.metodoContact.update({where:{reference:row.reference},data:{leadId:null,confirmedAt:null,confirmedById:null,evidence:null}});await tx.metodoAudit.create({data:{id:randomUUID(),actorId:user.id,action:"attribution_revoked",reference:row.reference,detail:reason}});});return json({ok:true});
}catch(e){return failure(e);}}
