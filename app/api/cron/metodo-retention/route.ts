import {NextRequest} from "next/server";
import {cleanupMetodo,failure,json} from "@/lib/metodo/server";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
  if(!process.env.CRON_SECRET||req.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)return json({error:"No autorizado"},401);
  try{await cleanupMetodo();return json({ok:true});}catch(e){return failure(e);}
}
