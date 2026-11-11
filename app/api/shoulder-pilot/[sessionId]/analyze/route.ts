import { pilotSameOrigin } from "@/lib/shoulder-request-origin";
import { NextRequest,NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PilotHttpError, requirePilotAccess } from "@/lib/shoulder-pilot-server";
import { canAnalyzeShoulderTest } from "@/lib/shoulder-analysis-types";
import { configuredProvider,VideoError,readLimitedBody,validateFrames,analyzeFrames } from "@/lib/shoulder-video-analysis";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=120;
type RouteCtx={params:{sessionId:string}};
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
function failure(e:unknown){
  if(e instanceof PilotHttpError||e instanceof VideoError)return json({error:e.message},e.status);
  return json({error:"Análisis no disponible. La revisión manual sigue disponible."},500);
}
async function checked(a:Awaited<ReturnType<typeof requirePilotAccess>>,v:{videoId:string;testId:string;uploadedAt:string}){
  if(!a.row?.aiConsent||!a.row?.aiConsentAt)throw new VideoError(409,"El atleta no ha autorizado el análisis de vídeo con IA para esta valoración.");
  if(!canAnalyzeShoulderTest(v.testId)||!a.refs.has(v.testId)||v.videoId.length>100)throw new VideoError(404,"Esta entrega no admite análisis automático.");
  const item=await prisma.assessmentVideo.findUnique({where:{id:v.videoId},select:{
    patientId:true,sessionId:true,taskId:true,testId:true,uploadedAt:true,url:true,
  }});
  if(!item||item.patientId!==a.session.assignment.patientId||item.sessionId!==a.session.id||
      item.testId!==v.testId||item.taskId!==a.refs.get(v.testId)||!item.url)throw new VideoError(404,"Entrega no disponible.");
  if(!item.uploadedAt||item.uploadedAt.toISOString()!==v.uploadedAt)throw new VideoError(409,"El vídeo ha cambiado. Recarga la revisión.");
  if(!configuredProvider())throw new VideoError(503,"Proveedor IA no configurado. La revisión manual sigue disponible.");
  return a.row.aiConsentAt.toISOString();
}
export async function GET(req:NextRequest,{params}:RouteCtx){
  try{const a=await requirePilotAccess(params.sessionId,true);
    const q=req.nextUrl.searchParams,consentVersion=await checked(a,{videoId:q.get("videoId")||"",testId:q.get("testId")||"",uploadedAt:q.get("uploadedAt")||""});
    return json({consentVersion});}catch(e){return failure(e);}
}
// Stop duplicate work on a single worker. Output is transient; no image or result logging/storage.
const inFlight=new Set<string>();
export async function POST(req:NextRequest,{params}:RouteCtx){
  let activeKey:string|undefined;
  try{
    const a=await requirePilotAccess(params.sessionId,true);
    if(!a.row?.aiConsent)throw new VideoError(409,"El atleta no ha autorizado el análisis con IA.");
    if(!pilotSameOrigin(req))throw new VideoError(403,"Origen no permitido.");
    const input=validateFrames(await readLimitedBody(req));
    // Re-check source revision and revocable consent immediately before sending any sampled images.
    const fresh=await requirePilotAccess(params.sessionId,true);
    const version=await checked(fresh,input);
    if(version!==input.consentVersion)throw new VideoError(409,"El consentimiento ha cambiado. Recarga la revisión.");
    const key=params.sessionId+"/"+input.videoId;
    if(inFlight.has(key))throw new VideoError(409,"Este vídeo ya se está analizando.");
    inFlight.add(key);activeKey=key;
    const draft=await analyzeFrames(input,fresh.config);
    const after=await requirePilotAccess(params.sessionId,true);
    if(await checked(after,input)!==version)throw new VideoError(409,"La autorización cambió durante el análisis. El borrador se ha descartado.");
    return json({draft});
  }catch(e){return failure(e);}finally{if(activeKey)inFlight.delete(activeKey);}
}
