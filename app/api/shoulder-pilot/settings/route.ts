import { pilotSameOrigin } from "@/lib/shoulder-request-origin";
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getPilotConfigRecord } from "@/lib/shoulder-pilot-config-server";
import { validatePilotConfig } from "@/lib/shoulder-pilot";

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo" || user.impersonating) return NextResponse.json({error:"Solo el CEO puede cambiar este baremo."},{status:403});
  if(!pilotSameOrigin(req)) return NextResponse.json({error:"Origen no permitido."},{status:403});
  if(!req.headers.get("content-type")?.includes("application/json")) return NextResponse.json({error:"Se requiere JSON."},{status:415});
  const input = await req.json().catch(()=>null);
  let config;
  try { config=validatePilotConfig(input?.config); }
  catch { return NextResponse.json({error:"Revisa los porcentajes, penalizaciones y umbrales."},{status:400}); }
  const current = await getPilotConfigRecord();
  const conflict = () => NextResponse.json({error:"El baremo cambió en otra pestaña. Recarga antes de guardar."},{status:409});
  if (input.revision !== current.revision) return conflict();
  if(JSON.stringify(config)===JSON.stringify(current.config)) return NextResponse.json(current);
  try{
    const revision=current.revision+1;
    await prisma.shoulderPilotRubricRevision.create({data:{revision,config:JSON.stringify(config),createdById:user.id}});
    return NextResponse.json({revision,config});
  } catch(e) {
    if ((e as {code?:string})?.code === "P2002") return conflict();
    throw e;
  }
}
