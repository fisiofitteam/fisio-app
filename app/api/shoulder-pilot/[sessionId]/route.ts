import { pilotSameOrigin } from "@/lib/shoulder-request-origin";
import { NextRequest, NextResponse } from "next/server";
import { getPilotView, updatePilot, PilotHttpError } from "@/lib/shoulder-pilot-server";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
type Ctx={params:{sessionId:string}};
function failure(e:unknown){
  if(e instanceof PilotHttpError)return NextResponse.json({error:e.message},{status:e.status,headers});
  return NextResponse.json({error:"No se pudo cargar o guardar la valoración."},{status:500,headers});
}
export async function GET(_req:NextRequest,{params}:Ctx){
  try{return NextResponse.json(await getPilotView(params.sessionId),{headers});}catch(e){return failure(e);}
}
export async function PATCH(req:NextRequest,{params}:Ctx){
  try{
    if(!pilotSameOrigin(req))throw new PilotHttpError(403,"Origen no permitido.");
    if(!req.headers.get("content-type")?.includes("application/json"))throw new PilotHttpError(415,"Se requiere JSON.");
    if(Number(req.headers.get("content-length")||0)>180000)throw new PilotHttpError(413,"Formulario demasiado grande.");
    const stream=req.body?.getReader();
    if(!stream)throw new PilotHttpError(400,"Falta el formulario.");
    const chunks:Uint8Array[]=[];let size=0;
    try{while(true){const item=await stream.read();if(item.done)break;size+=item.value.byteLength;if(size>180000){await stream.cancel();throw new PilotHttpError(413,"Formulario demasiado grande.");}chunks.push(item.value);}}finally{stream.releaseLock();}
    let input;try{input=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new PilotHttpError(400,"JSON no válido.");}
    return NextResponse.json(await updatePilot(params.sessionId,input),{headers});
  }catch(e){return failure(e);}
}
