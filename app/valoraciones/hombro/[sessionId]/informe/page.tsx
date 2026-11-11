import {notFound} from "next/navigation";
import {StandaloneShoulderReport} from "@/components/StandaloneShoulderReport";
import {PilotHttpError} from "@/lib/shoulder-pilot-server";
import {getPublishedShoulderReports} from "@/lib/shoulder-share-server";

export const dynamic="force-dynamic";
export const metadata={title:"Informe de valoración de hombro · FisioFit",robots:{index:false,follow:false},referrer:"no-referrer" as const};

export default async function PrivateShoulderReport({params}:{params:{sessionId:string}}) {
  const payload=await getPublishedShoulderReports(params.sessionId).catch((e:unknown)=>{
    if(e instanceof PilotHttpError&&[401,403,404,409].includes(e.status))notFound();
    throw e;
  });
  return <StandaloneShoulderReport report={payload.report} previous={payload.previous}/>;
}
