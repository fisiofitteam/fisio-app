import { NextRequest, NextResponse } from "next/server";
import { authorizeGrok } from "@/lib/grok-ceo-contract";
import { syncPonto } from "@/lib/bank-finance";
export const dynamic="force-dynamic";
export const maxDuration=300;
export async function GET(req:NextRequest) {
  const headers={"Cache-Control":"private, no-store"};
  if(!authorizeGrok(req.headers.get("authorization"),process.env.CRON_SECRET))return NextResponse.json({error:"Unauthorized"},{status:401,headers});
  if(process.env.VERCEL_ENV!=="production")return NextResponse.json({status:"disabled_outside_production"},{headers});
  try{return NextResponse.json(await syncPonto(),{headers});}catch{return NextResponse.json({error:"Bank import unavailable"},{status:503,headers});}
}
