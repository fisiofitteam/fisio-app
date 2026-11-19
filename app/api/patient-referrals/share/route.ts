import { NextRequest, NextResponse } from "next/server";
import { getReferralPath, ReferralError } from "@/lib/patient-referrals-server";
import { buildReferralMessage } from "@/lib/patient-referrals";

export const dynamic="force-dynamic";
export async function GET(req:NextRequest) {
  try {
    const patientId=req.nextUrl.searchParams.get("patientId");
    if(!patientId || patientId.length>100)throw new ReferralError(400,"Paciente no válido.");
    const path=await getReferralPath(patientId);
    // Use the app's configured public origin, never a user-provided redirect or host.
    const origin=process.env.NEXT_PUBLIC_APP_URL || "https://app.fisiofitteam.com";
    const target=new URL("https://wa.me/");
    target.searchParams.set("text",buildReferralMessage(new URL(path,origin).toString()));
    return NextResponse.redirect(target,{status:303,headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
  } catch(error) {
    return NextResponse.json({error:error instanceof ReferralError?error.message:"No se ha podido preparar el enlace."},
      {status:error instanceof ReferralError?error.status:500,headers:{"Cache-Control":"private, no-store"}});
  }
}
