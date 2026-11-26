import {NextRequest,NextResponse} from "next/server";
import {contactReference,effectiveWhatsapp,getMetodoConfig,NO_STORE} from "@/lib/metodo/server";
import {whatsappUrl} from "@/lib/metodo/content";
import {originMessage} from "@/lib/metodo/origins";
export const dynamic="force-dynamic";
async function contact(req:NextRequest,track:boolean){
  const {config}=await getMetodoConfig();if(!config.published)return new NextResponse("Página no disponible.",{status:404,headers:NO_STORE});
  const wa=await effectiveWhatsapp(config);
  const reference=track?await contactReference(req,req.nextUrl.searchParams.get("placement")):"";
  // `origen` (ad landing) adds one editable line naming the zone; nothing about it is stored.
  const url=whatsappUrl(wa.number,originMessage(wa.message,req.nextUrl.searchParams.get("origen")),reference);
  return url?NextResponse.redirect(url,{status:302,headers:NO_STORE}):new NextResponse("El contacto no está disponible en este momento. Vuelve a intentarlo más tarde.",{status:503,headers:NO_STORE});
}
export const GET=(req:NextRequest)=>contact(req,true);
export const HEAD=(req:NextRequest)=>contact(req,false);
