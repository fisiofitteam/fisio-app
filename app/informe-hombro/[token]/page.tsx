import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSharedShoulderReports } from "@/lib/shoulder-share-server";
import { StandaloneShoulderReport } from "@/components/StandaloneShoulderReport";

export const dynamic="force-dynamic";
export const revalidate=0;
export const runtime="nodejs";
export const metadata:Metadata={title:"Informe de hombro · FisioFit",description:"Informe de valoración de hombro.",referrer:"no-referrer",robots:{index:false,follow:false,nocache:true}};
export default async function SharedReport({params}:{params:{token:string}}){
 const result=await getSharedShoulderReports(params.token);
 if(!result)notFound();
 return <StandaloneShoulderReport report={result.report} previous={result.previous}/>;
}
