import {redirect} from "next/navigation";
import {getActiveProfessional} from "@/lib/session";
import {effectiveWhatsapp,getMetodoConfig} from "@/lib/metodo/server";
import {metodoMetrics} from "@/lib/metodo/metrics";
import {ContentNav} from "@/components/ContentNav";
import {MetodoEditor} from "@/components/metodo/MetodoEditor";
import {MetodoMetrics} from "@/components/metodo/MetodoMetrics";
export const dynamic="force-dynamic";
export default async function MetodoAdminPage({searchParams}:{searchParams:{tab?:string;from?:string;to?:string}}){
  const user=await getActiveProfessional();if(!user)redirect("/login");if(!["ceo","setter"].includes(user.role))redirect("/fisio");
  const editing=searchParams.tab==="editor"&&user.role==="ceo";
  const content=editing?await getMetodoConfig():null;
  let report:Awaited<ReturnType<typeof metodoMetrics>>|null=null,error="";
  if(!editing)try{report=await metodoMetrics(searchParams.from,searchParams.to);}catch{error="No se han podido cargar las métricas. Comprueba las fechas o vuelve a intentarlo.";}
  return <div className="space-y-6"><ContentNav active="metodo" role={user.role}/><div><h1 className="text-2xl font-semibold">Método FisioFitCross</h1><p className="text-neutral-600 mt-2">Presentación pública y calidad de la captación.</p></div><nav aria-label="Administración de la landing" className="flex flex-wrap gap-3"><a className={`btn ${!editing?"btn-accent":""}`} href="/fisio/contenido/metodo">Métricas y atribución</a>{user.role==="ceo"&&<a className={`btn ${editing?"btn-accent":""}`} href="/fisio/contenido/metodo?tab=editor">Editar landing</a>}<a className="btn" href="/metodo" target="_blank" rel="noopener noreferrer">Abrir página pública</a></nav>{content?<MetodoEditor initial={content.config} revision={content.revision} sharedNumber={(await effectiveWhatsapp({...content.config,whatsapp:{...content.config.whatsapp,number:""}})).number}/>:report?<MetodoMetrics initial={report}/>:<p className="card" role="alert">{error}</p>}</div>;
}
