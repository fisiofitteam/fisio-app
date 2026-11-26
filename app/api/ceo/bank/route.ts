import { NextRequest, NextResponse } from "next/server";
import { founderSession } from "@/lib/grok-ceo-exchange";
import { bankAction } from "@/lib/bank-finance-contract";
import { bankOverview, bankErrors, syncPonto, classifyBankMovement, discoverBankAccounts, reviewBankDuplicate } from "@/lib/bank-finance";
import { PontoError } from "@/lib/ponto-client";
import { prisma } from "@/lib/prisma";
export const dynamic="force-dynamic";
export const maxDuration=300;
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET() {
  if(!await founderSession())return json({error:"Forbidden"},403);
  try{return json(await bankOverview());}catch{return json({error:"Información bancaria temporalmente no disponible."},503);}
}
export async function POST(req:NextRequest) {
  const user=await founderSession();if(!user)return json({error:"Forbidden"},403);
  if(req.headers.get("origin")&&req.headers.get("origin")!==req.nextUrl.origin)return json({error:"Forbidden"},403);
  if(!req.headers.get("content-type")?.startsWith("application/json"))return json({error:"JSON required"},415);
  const raw=await req.text();if(Buffer.byteLength(raw)>2000)return json({error:"Petición inválida."},400);
  let body:unknown;try{body=JSON.parse(raw);}catch{return json({error:"Petición inválida."},400);}
  const parsed=bankAction.safeParse(body);if(!parsed.success)return json({error:"Petición inválida."},400);
  const d=parsed.data;
  try{
    if(d.action==="discover")return json({accounts:await discoverBankAccounts()});
    if(d.action==="selectAccount"){
      const accounts=await discoverBankAccounts();
      if(!accounts.some(a=>a.id===d.id&&a.currency.toUpperCase()==="EUR"))return json({error:"Selecciona una cuenta en euros autorizada en Ponto."},400);
      const data={selectedAccountIds:JSON.stringify([d.id])};
      await prisma.bankSyncState.upsert({where:{id:"ponto-ais"},create:{id:"ponto-ais",...data},update:data});
    }
    if(d.action==="sync")return json(await syncPonto());
    if(d.action==="pause")await prisma.bankSyncState.upsert({where:{id:"ponto-ais"},create:{id:"ponto-ais",paused:d.paused},update:{paused:d.paused}});
    if(d.action==="deleteRule")await prisma.bankClassificationRule.updateMany({where:{id:d.id},data:{enabled:false}});
    if(d.action==="classify")await classifyBankMovement(d,user.id);
    if(d.action==="duplicate")await reviewBankDuplicate(d.id,d.duplicateOfId,user.id);
    return json({ok:true});
  }catch(e){
    if(e instanceof PontoError)return json({error:bankErrors[e.code]||bankErrors.import_failed},503);
    if(d.action==="classify"||d.action==="duplicate")return json({error:"No se puede cambiar: puede estar contabilizado, tener un conflicto o haber cambiado en otra revisión. Actualiza la pantalla."},409);
    return json({error:"No se pudo completar la operación."},503);
  }
}
