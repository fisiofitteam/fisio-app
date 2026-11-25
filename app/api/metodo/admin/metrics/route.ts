import {NextRequest} from "next/server";
import {failure,json,staff,MetodoError} from "@/lib/metodo/server";
import {metodoMetrics} from "@/lib/metodo/metrics";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){try{const user=await staff();if(!["ceo","setter"].includes(user.role))throw new MetodoError(403,"No autorizado.");const report=await metodoMetrics(req.nextUrl.searchParams.get("from"),req.nextUrl.searchParams.get("to"));if(req.nextUrl.searchParams.get("format")==="aggregate"){const {contacts,...aggregate}=report;return json(aggregate);}return json(report);}catch(e){return failure(e);}}
