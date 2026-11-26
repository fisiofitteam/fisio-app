import { NextRequest, NextResponse } from "next/server";
import { founderSession } from "@/lib/grok-ceo-exchange";
import { stripe } from "@/lib/stripe";
import { completeWindow } from "@/lib/grok-ceo-contract";
import { groupStripeChargeFees } from "@/lib/stripe-expense-candidates-contract";
import { storeExpenseCandidate } from "@/lib/business-expense-candidate";
import { expenseCandidate } from "@/lib/business-expense-candidate-contract";

export const dynamic="force-dynamic";
export const maxDuration=60;
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req:NextRequest){
  if(!await founderSession())return json({error:"Forbidden"},403);
  if(!stripe)return json({error:"Stripe no está configurado."},503);
  if(!req.headers.get("content-type")?.startsWith("application/json"))return json({error:"JSON required"},415);
  const raw=await req.text();
  if(Buffer.byteLength(raw)>200)return json({error:"Petición inválida."},400);
  let data:unknown;
  try{data=JSON.parse(raw);}catch{return json({error:"Petición inválida."},400);}
  if(typeof data!=="object"||data===null||!("days" in data)||data.days!==7||Object.keys(data).length!==1)return json({error:"Ventana inválida."},400);
  try{
    const {start,end}=completeWindow(7);
    // Only balance transaction fees; never expand charge/customer/source or persist identifiers of customers.
    // Exclude standalone fee debits, refunds and payouts until accounting treatment is reconciled.
    const rows:{id:string;type:string;currency:string;fee:number;created:number}[]=[];
    let cursor:string|undefined;
    do{
      const page=await stripe.balanceTransactions.list({type:"charge",currency:"eur",created:{gte:Math.floor(start.getTime()/1000),lt:Math.floor(end.getTime()/1000)+1},limit:100,...(cursor?{starting_after:cursor}:{})});
      for(const row of page.data)rows.push({id:row.id,type:row.type,currency:row.currency,fee:row.fee,created:row.created});
      if(rows.length>=2000&&page.has_more)return json({error:"Volumen demasiado alto: no se han guardado importes parciales."},422);
      cursor=page.has_more?page.data.at(-1)?.id:undefined;
      if(page.has_more&&!cursor)return json({error:"Página incompleta: no se han guardado importes parciales."},502);
    }while(cursor);
    const groups=groupStripeChargeFees(rows,start,end).map(candidate=>expenseCandidate.parse(candidate));
    let available=0,conflicts=0;
    for(const candidate of groups){
      if(await storeExpenseCandidate(candidate))available++;else conflicts++;
    }
    return json({ok:true,days:7,available,conflicts});
  }catch{return json({error:"No se pudo completar la detección de Stripe. Los candidatos ya guardados no se contabilizan."},503);}
}
