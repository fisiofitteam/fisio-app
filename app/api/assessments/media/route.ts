import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { evidencePatientScope } from "@/lib/patient-evidence";
import { mediaFailure, serveAssessmentMedia } from "@/lib/assessment-media";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

async function deliver(req:NextRequest,headOnly:boolean) {
  const id=req.nextUrl.searchParams.get("id");
  if(!id)return mediaFailure(403);
  const actor=await getSessionUser();
  const scope=actor?.kind==="patient"?{id:actor.patient.id}:actor?.kind==="professional"?evidencePatientScope(actor.pro):null;
  if(!scope)return mediaFailure(403);
  // Each seek checks the current assignment/derivation in the same query as the file lookup.
  const row=await prisma.assessmentVideo.findUnique({where:{id,patient:{is:scope}},select:{url:true,uploadedAt:true}});
  if(!row?.url)return mediaFailure(403);
  const version=row.uploadedAt?.getTime(),requested=req.nextUrl.searchParams.get("v");
  if(requested!==null&&requested!==String(version))return mediaFailure(409);
  const token=process.env.ASSESSMENT_BLOB_READ_WRITE_TOKEN;
  if(!token)return mediaFailure(503);
  let url:URL;try{url=new URL(row.url);}catch{return mediaFailure(404);}
  if(url.protocol!=="https:"||url.port||url.username||url.password||!url.hostname.endsWith(".private.blob.vercel-storage.com")||!url.pathname.startsWith("/assessments/"))
    return mediaFailure(404);
  return serveAssessmentMedia(req,url,token,headOnly,req.nextUrl.searchParams.get("download")==="1",version===undefined?undefined:'"'+version+'"');
}
export function GET(req:NextRequest){return deliver(req,false);}
export function HEAD(req:NextRequest){return deliver(req,true);}
