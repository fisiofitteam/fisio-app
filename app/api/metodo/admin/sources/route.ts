import {NextRequest} from "next/server";
import {prisma} from "@/lib/prisma";
import {failure,json,staff} from "@/lib/metodo/server";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){try{
  await staff(true);const q=(req.nextUrl.searchParams.get("q")||"").trim().slice(0,100),page=Math.max(0,Math.min(500,Math.floor(Number(req.nextUrl.searchParams.get("page"))||0)));
  const [evidence,cases]=await Promise.all([
    prisma.patientEvidence.findMany({where:{status:"ready",source:{in:["general","legacy"]},kind:{in:["image","video","whatsapp"]},...(q?{OR:[{name:{contains:q,mode:"insensitive"}},{title:{contains:q,mode:"insensitive"}}]}:{})},select:{id:true,name:true,title:true,kind:true,bodyZone:true,updatedAt:true},orderBy:{createdAt:"desc"},take:30,skip:page*30}),
    prisma.successCase.findMany({where:{active:true,...(q?{name:{contains:q,mode:"insensitive"}}:{})},select:{id:true,name:true,updatedAt:true},orderBy:{name:"asc"},take:30,skip:page*30}),
  ]);
  return json({items:[...evidence.map(e=>({sourceId:e.id,sourceType:"evidence",sourceVersion:e.updatedAt.toISOString(),label:e.title||e.name,kind:e.kind,zone:e.bodyZone})),...cases.map(c=>({sourceId:c.id,sourceType:"success",sourceVersion:c.updatedAt.toISOString(),label:c.name,kind:"video"}))],hasMore:evidence.length===30||cases.length===30});
}catch(e){return failure(e);}}
