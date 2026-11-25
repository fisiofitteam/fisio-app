import {NextRequest,NextResponse} from "next/server";
import {prisma} from "@/lib/prisma";
import {effectiveWhatsapp,getMetodoConfig,NO_STORE,rateLimit,visitor,randomBytes} from "@/lib/metodo/server";
import {whatsappUrl} from "@/lib/metodo/content";
export const dynamic="force-dynamic";
async function contact(req:NextRequest,track:boolean){
  const {config}=await getMetodoConfig();if(!config.published)return new NextResponse("Página no disponible.",{status:404,headers:NO_STORE});
  const wa=await effectiveWhatsapp(config);let reference="";
  if(track&&req.cookies.get("ff-metodo-consent")?.value==="v1.accepted"&&req.headers.get("sec-fetch-site")==="same-origin"){
    try{await rateLimit(req,"contact",15);const v=await visitor(req);if(v){
      const raw=req.nextUrl.searchParams.get("placement");const placement=["header","hero","final","sticky"].includes(raw||"")?raw!:"other";
      // Repeated navigation within 30 seconds reuses the reference (double-tap / browser retry).
      const previous=await prisma.metodoContact.findFirst({where:{visitorId:v.id,createdAt:{gte:new Date(Date.now()-30000)}},orderBy:{createdAt:"desc"}});
      if(previous)reference=previous.reference;
      else{reference="MF-"+randomBytes(6).toString("hex").toUpperCase();await prisma.metodoContact.create({data:{reference,visitorId:v.id,sourceJson:v.sourceJson,placement}});}
    }}catch{reference="";/* Analytics must never prevent contacting the team. */}
  }
  const url=whatsappUrl(wa.number,wa.message,reference);
  return url?NextResponse.redirect(url,{status:302,headers:NO_STORE}):new NextResponse("El contacto no está disponible en este momento. Vuelve a intentarlo más tarde.",{status:503,headers:NO_STORE});
}
export const GET=(req:NextRequest)=>contact(req,true);
export const HEAD=(req:NextRequest)=>contact(req,false);
