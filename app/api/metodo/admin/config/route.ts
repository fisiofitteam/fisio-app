import {NextRequest} from "next/server";
import {body,effectiveWhatsapp,failure,getMetodoConfig,json,requireOrigin,saveMetodo,staff} from "@/lib/metodo/server";
export const dynamic="force-dynamic";
export async function GET(){try{await staff(true);const r=await getMetodoConfig();return json({...r,effectiveWhatsapp:await effectiveWhatsapp(r.config)});}catch(e){return failure(e);}}
export async function PUT(req:NextRequest){try{requireOrigin(req);const user=await staff(true);const b=await body(req,180000);return json(await saveMetodo(b.config,b.revision,user.id));}catch(e){return failure(e);}}
