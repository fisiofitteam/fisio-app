import {NextRequest} from "next/server";
import {prisma} from "@/lib/prisma";
import {body,ensureMetodoSchema,failure,json,MetodoError,randomUUID,requireOrigin,staff} from "@/lib/metodo/server";
import {metricRange} from "@/lib/metodo/metrics";
export const dynamic="force-dynamic";
/** Valoración requests contain health information: CEO and setter only, never in exports. */
async function team(){const user=await staff();if(!["ceo","setter"].includes(user.role))throw new MetodoError(403,"No autorizado.");return user;}
export async function GET(req:NextRequest){try{
  await team();const range=metricRange(req.nextUrl.searchParams.get("from"),req.nextUrl.searchParams.get("to"));await ensureMetodoSchema();
  const rows=await prisma.metodoRequest.findMany({where:{createdAt:{gte:range.start,lt:range.end}},orderBy:{createdAt:"desc"},take:200});
  return json({requests:rows.map(r=>({id:r.id,createdAt:r.createdAt.toISOString(),name:r.name,phone:r.phone,zone:r.zone,duration:r.duration,impact:r.impact,sport:r.sport,tried:r.tried,detail:r.detail,origin:r.origin,reference:r.reference,handledAt:r.handledAt?.toISOString()||null})),truncated:rows.length===200});
}catch(e){return failure(e);}}
export async function PATCH(req:NextRequest){try{
  requireOrigin(req);const user=await team(),b=await body(req,500);
  if(typeof b.id!=="string"||!/^[a-f0-9-]{36}$/i.test(b.id)||typeof b.handled!=="boolean")throw new MetodoError(400,"Datos no válidos.");
  await ensureMetodoSchema();
  const row=await prisma.metodoRequest.update({where:{id:b.id},data:b.handled?{handledAt:new Date(),handledById:user.id}:{handledAt:null,handledById:null}}).catch(()=>null);
  if(!row)throw new MetodoError(404,"Solicitud no encontrada o caducada.");
  await prisma.metodoAudit.create({data:{id:randomUUID(),actorId:user.id,action:b.handled?"request_handled":"request_reopened",reference:row.id,detail:"{}"}});
  return json({handledAt:row.handledAt?.toISOString()||null});
}catch(e){return failure(e);}}
