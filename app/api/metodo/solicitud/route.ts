import {NextRequest} from "next/server";
import {prisma} from "@/lib/prisma";
import {body,contactReference,effectiveWhatsapp,ensureMetodoSchema,failure,getMetodoConfig,json,MetodoError,randomUUID,rateLimit,requireOrigin} from "@/lib/metodo/server";
import {whatsappUrl} from "@/lib/metodo/content";
import {REQUEST_CONSENT_VERSION,requestMessage,validateRequest} from "@/lib/metodo/request";
export const dynamic="force-dynamic";
/**
 * Valoración form: stores the request (explicit health-data consent) and returns a
 * wa.me link with the case already written. The athlete decides whether to send it.
 * Storage problems never block contacting the team: the message carries the case.
 */
export async function POST(req:NextRequest){try{
  requireOrigin(req);const input=await body(req,4000);
  const {config}=await getMetodoConfig();if(!config.published||!config.sections.request.visible)throw new MetodoError(404,"Página no disponible.");
  const check=validateRequest(input);if(!check.ok)return json({error:check.error,step:check.step},400);
  let storage=true;
  try{await rateLimit(req,"request",6);}catch(e){if(e instanceof MetodoError)throw e;storage=false;}
  const wa=await effectiveWhatsapp(config),reference=storage?await contactReference(req,"form"):"";
  const url=whatsappUrl(wa.number,requestMessage(wa.message,check.data),reference);
  if(!url)throw new MetodoError(503,"El contacto no está disponible en este momento. Vuelve a intentarlo más tarde.");
  const d=check.data;let saved=false;
  if(storage)try{
    await ensureMetodoSchema();
    await prisma.metodoRequest.create({data:{id:randomUUID(),name:d.name,phone:d.phone,zone:d.zone,duration:d.duration,impact:d.impact,sport:d.sport,tried:d.tried.join(", "),detail:d.detail||null,origin:d.origin,reference:reference||null,consentAt:new Date(),consentVersion:REQUEST_CONSENT_VERSION}});
    saved=true;
  }catch{saved=false;}
  return json({url,saved});
}catch(e){return failure(e);}}
