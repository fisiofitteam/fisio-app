import { NextRequest, NextResponse } from "next/server";
import { PilotHttpError } from "@/lib/shoulder-pilot-server";
import { getShoulderShareStatus,issueShoulderShare,revokeShoulderShare } from "@/lib/shoulder-share-server";
import { pilotSameOrigin } from "@/lib/shoulder-request-origin";

export const dynamic="force-dynamic";
export const runtime="nodejs";
type Ctx={params:{sessionId:string}};
const headers={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex, nofollow, noarchive"};
const reply=(v:unknown,status=200)=>NextResponse.json(v,{headers,status});
function failure(e:unknown){
 return e instanceof PilotHttpError?reply({error:e.message},e.status):reply({error:"No se ha podido gestionar el enlace."},500);
}
export async function GET(_:NextRequest,{params}:Ctx){
 try{return reply(await getShoulderShareStatus(params.sessionId));}catch(e){return failure(e);}
}
export async function POST(req:NextRequest,{params}:Ctx){
 try{
  if(!pilotSameOrigin(req))throw new PilotHttpError(403,"Origen no permitido.");
  if(!req.headers.get("content-type")?.includes("application/json"))throw new PilotHttpError(415,"Se requiere JSON.");
  // Tiny fixed request. Do not buffer arbitrary input even when Content-Length is absent.
  if(Number(req.headers.get("content-length")??0)>512)throw new PilotHttpError(413,"Solicitud demasiado grande.");
  const reader=req.body?.getReader();if(!reader)throw new PilotHttpError(400,"Solicitud no válida.");
  let bytes=0;const chunks:Uint8Array[]=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;
    bytes+=value.byteLength;if(bytes>512){await reader.cancel();throw new PilotHttpError(413,"Solicitud demasiado grande.");}chunks.push(value);}
  }finally{reader.releaseLock();}
  let input;try{input=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new PilotHttpError(400,"Solicitud no válida.");}
  if(!input||typeof input.publishedAt!=="string"||input.publishedAt.length>40||Object.keys(input).length!==1)throw new PilotHttpError(400,"Indica la publicación que quieres compartir.");
  return reply(await issueShoulderShare(params.sessionId,input.publishedAt),201);
 }catch(e){return failure(e);}
}
export async function DELETE(req:NextRequest,{params}:Ctx){
 try{if(!pilotSameOrigin(req))throw new PilotHttpError(403,"Origen no permitido.");return reply(await revokeShoulderShare(params.sessionId));}catch(e){return failure(e);}
}
