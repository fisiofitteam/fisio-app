import {NextRequest} from "next/server";
import {prisma} from "@/lib/prisma";
import {COOKIE,CONSENT_VERSION,body,ensureMetodoSchema,failure,getMetodoConfig,hash,json,randomBytes,randomUUID,rateLimit,requireOrigin,setVisitorCookie,sourceData,visitor,MetodoError} from "@/lib/metodo/server";
import {SESSION_PATTERN} from "@/lib/metodo/events";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){try{
  requireOrigin(req);const b=await body(req,2500);
  if(b.consent!==true||b.version!==CONSENT_VERSION||!SESSION_PATTERN.test(String(b.sessionId)))throw new MetodoError(400,"Hace falta aceptar la medición opcional.");
  if(!(await getMetodoConfig()).config.published)throw new MetodoError(404,"Página no disponible.");
  await rateLimit(req,"visit",25);let v=await visitor(req),token="";
  if(!v){token=randomBytes(24).toString("base64url");v=await prisma.metodoVisitor.create({data:{id:randomUUID(),tokenHash:hash(token),sourceJson:JSON.stringify(sourceData(b.source)),consentVersion:CONSENT_VERSION}});}
  else await prisma.metodoVisitor.update({where:{id:v.id},data:{lastSeenAt:new Date()}});
  const id=hash(`${v.id}:${b.sessionId}:page_view`);
  await prisma.metodoEvent.upsert({where:{id},create:{id,visitorId:v.id,type:"page_view",target:"page",value:0},update:{}});
  const res=json({ok:true});if(token)setVisitorCookie(res,token);return res;
}catch(e){return failure(e);}}
export async function DELETE(req:NextRequest){try{
  requireOrigin(req);await ensureMetodoSchema();const token=req.cookies.get(COOKIE)?.value;
  const v=token&&/^[A-Za-z0-9_-]{32}$/.test(token)?await prisma.metodoVisitor.findUnique({where:{tokenHash:hash(token)}}):null;
  if(v)await prisma.$transaction([prisma.metodoContact.deleteMany({where:{visitorId:v.id}}),prisma.metodoVisitor.delete({where:{id:v.id}})]);
  const res=json({ok:true});res.cookies.set(COOKIE,"",{path:"/",maxAge:0,httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production"});return res;
}catch(e){return failure(e);}}
