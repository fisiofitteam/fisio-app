import {NextRequest,NextResponse} from "next/server";
import {getActiveProfessional} from "@/lib/session";
import {FirstSaleError, firstSaleInput, firstSaleLink} from "@/lib/reserved-first-sale";
export const dynamic="force-dynamic";
type Ctx={params:{id:string}};
async function run(req:NextRequest,ctx:Ctx,write:boolean){
 const user=await getActiveProfessional();
 if(!user)return NextResponse.json({error:"Inicia sesión."},{status:401});
 try{
  let input;
  if(write){
   const origin=req.headers.get("origin");
   if(origin && new URL(origin).host!==req.headers.get("host") && origin!==new URL(req.url).origin)return NextResponse.json({error:"Origen no permitido."},{status:403});
   input=firstSaleInput(await req.json().catch(()=>null));
  }
  return NextResponse.json(await firstSaleLink(ctx.params.id,user,input),{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){return NextResponse.json({error:e instanceof FirstSaleError?e.message:"No se pudo preparar la primera venta."},{status:e instanceof FirstSaleError?e.status:500});}
}
export const GET=(req:NextRequest,ctx:Ctx)=>run(req,ctx,false);
export const POST=(req:NextRequest,ctx:Ctx)=>run(req,ctx,true);
