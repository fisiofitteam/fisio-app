import { NextRequest, NextResponse } from "next/server";
import { ReferralRewardError, updateReferralReward } from "@/lib/patient-referral-rewards";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
export async function PATCH(req:NextRequest,{params}:{params:{leadId:string}}){
  try{
    const origin=req.headers.get("origin"),destination=new URL(req.url);
    let sameOrigin=false;
    if(origin)try{const parsed=new URL(origin);sameOrigin=origin===parsed.origin&&parsed.protocol===destination.protocol&&(parsed.origin===destination.origin||parsed.host===req.headers.get("host")?.toLowerCase());}catch{}
    if(!sameOrigin)return NextResponse.json({error:"Origen no permitido."},{status:403,headers});
    let body:unknown;
    try{body=await req.json();}catch{return NextResponse.json({error:"Registro no válido."},{status:400,headers});}
    if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({error:"Registro no válido."},{status:400,headers});
    const b=body as Record<string,unknown>;
    if(Object.keys(b).some(key=>!["action","expectedPaidAt"].includes(key))||!["mark_delivered","undo"].includes(String(b.action))||
       !(b.expectedPaidAt===null||typeof b.expectedPaidAt==="string"))return NextResponse.json({error:"Registro no válido."},{status:400,headers});
    const result=await updateReferralReward(params.leadId,b.action as "mark_delivered"|"undo",b.expectedPaidAt as string|null);
    return NextResponse.json(result,{headers});
  }catch(error){
    return NextResponse.json({error:error instanceof ReferralRewardError?error.message:"No se ha podido actualizar el registro."},
      {status:error instanceof ReferralRewardError?error.status:500,headers});
  }
}
