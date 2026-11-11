import { NextRequest,NextResponse } from "next/server";
import { pilotSameOrigin } from "@/lib/shoulder-request-origin";
import { getShoulderNarrativeEvidence,PilotHttpError } from "@/lib/shoulder-pilot-server";
import { proposeShoulderNarrative,NarrativeProviderError } from "@/lib/shoulder-narrative-provider";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=75;
const active=new Set<string>();
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
async function draftVersion(req:Request):Promise<number>{
  if(!req.headers.get("content-type")?.includes("application/json"))throw new PilotHttpError(415,"Se requiere JSON.");
  if(Number(req.headers.get("content-length"))>512)throw new PilotHttpError(413,"Solicitud demasiado grande.");
  const reader=req.body?.getReader();
  if(!reader)throw new PilotHttpError(400,"Falta la versión del borrador.");
  const chunks:Uint8Array[]=[];let n=0;
  try{
    while(true){const part=await reader.read();if(part.done)break;n+=part.value.length;if(n>512){await reader.cancel();throw new PilotHttpError(413,"Solicitud demasiado grande.");}chunks.push(part.value);}
  }finally{reader.releaseLock();}
  try{
    const b=JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if(!b||Object.keys(b).length!==1||!Number.isSafeInteger(b.version)||b.version<0)throw Error();
    return b.version;
  }catch{throw new PilotHttpError(400,"Se requiere únicamente la versión del borrador guardado.");}
}
export async function POST(req:NextRequest,{params}:{params:{sessionId:string}}){
  const id=params.sessionId;
  let acquired=false;
  try{
    if(!pilotSameOrigin(req))throw new PilotHttpError(403,"Origen no permitido.");
    const version=await draftVersion(req),evidence=await getShoulderNarrativeEvidence(id,version);
    if(active.has(id))throw new PilotHttpError(429,"Ya hay una propuesta en curso para esta valoración.");
    active.add(id);acquired=true;
    const proposal=await proposeShoulderNarrative(evidence);
    // A patient update, replaced source or changed baseline during inference may invalidate the draft.
    const fresh=await getShoulderNarrativeEvidence(id,version);
    if(JSON.stringify(fresh)!==JSON.stringify(evidence))throw new PilotHttpError(409,"Las mediciones han cambiado. Recarga el borrador antes de generar.");
    return json({version,proposal});
  }catch(e){
    if(e instanceof PilotHttpError || e instanceof NarrativeProviderError)return json({error:e.message},e.status);
    return json({error:"No se ha podido generar la propuesta. Puedes editar los comentarios a mano."},500);
  }finally{if(acquired)active.delete(id);}
}
