import {NextRequest} from "next/server";
import {prisma} from "@/lib/prisma";
import {body,failure,getPublicMetodo,hash,json,rateLimit,requireOrigin,visitor,MetodoError} from "@/lib/metodo/server";
import {validEvent} from "@/lib/metodo/events";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){try{
  requireOrigin(req);const event=validEvent(await body(req,1000));if(!event)throw new MetodoError(400,"Evento no válido.");
  if(req.cookies.get("ff-metodo-consent")?.value!=="v1.accepted")return json({ok:false},403);
  await rateLimit(req,"event",160);const v=await visitor(req);if(!v)return json({ok:false},403);
  const config=await getPublicMetodo();if(!config.published)throw new MetodoError(404,"Página no disponible.");
  const {sessionId,...data}=event;
  const targets=["page","hero","introduction",...config.stories.map(s=>s.id),"Hombro","Lumbar","Rodilla","Otros","Todos",...config.tools.map((_,i)=>`tool-${i}`)];
  if(!targets.includes(data.target))throw new MetodoError(400,"Contenido no disponible.");
  const id=hash(`${v.id}:${sessionId}:${data.type}:${data.target}:${data.value}`);
  await prisma.metodoEvent.upsert({where:{id},create:{id,visitorId:v.id,...data},update:{}});return json({ok:true});
}catch(e){return failure(e);}}
