import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { founderSession } from "@/lib/grok-ceo-exchange";
import { madridDay, completeWindow, reportId } from "@/lib/grok-ceo-contract";
import { currentIsoWeek } from "@/lib/ceo-personal";
import { weeklyAnchor, mondayForDay, offsetDay, parseRecord, metricValue, stringList, weeklyStrategySchema } from "@/lib/grok-ceo-weekly";
export const dynamic = "force-dynamic";
const metrics = [
  { label:"Cobrado", path:"finance.income", unit:"money" },
  { label:"Ventas ganadas", path:"sales.won", unit:"count" },
  { label:"Cierre comercial", path:"sales.closeRate", unit:"rate" },
  { label:"Renovación", path:"renewals.renewalRate", unit:"rate" },
] as const;
function format(value:number|null,unit:"money"|"count"|"rate") {
  if(value===null)return "—";
  return unit==="money"?value.toLocaleString("es-ES",{style:"currency",currency:"EUR"}):value.toLocaleString("es-ES",{maximumFractionDigits:1})+(unit==="rate"?"%":"");
}
function Items({title,items}:{title:string;items:string[]}) {
  return items.length?<div className="rounded-xl border bg-white p-4"><h3 className="text-sm font-semibold mb-2">{title}</h3><ul className="space-y-2 text-sm list-disc pl-4">{items.map((x,i)=><li key={i}>{x}</li>)}</ul></div>:null;
}
export default async function WeeklyPage({searchParams}:{searchParams:{week?:string}}) {
  const user=await founderSession();if(!user)redirect("/fisio");
  const today=madridDay(),latest=mondayForDay(today),anchor=weeklyAnchor(today,searchParams.week);
  const first=offsetDay(anchor,-7),last=offsetDay(anchor,-1);
  const {start,end}=completeWindow(7,0,new Date(anchor+"T12:00:00Z"));
  const {isoYear,isoWeek}=currentIsoWeek(new Date(first+"T12:00:00Z"));
  const [reports,goals,decisions]=await Promise.all([
    prisma.ceoReport.findMany({where:{periodType:"grok_daily",id:{gte:reportId(offsetDay(anchor,-6)),lte:reportId(anchor)}},orderBy:{id:"asc"},select:{id:true,periodStart:true,periodEnd:true,generatedAt:true,metrics:true,narrative:true}}),
    prisma.ceoWeeklyGoal.findMany({where:{professionalId:user.id,isoYear,isoWeek},orderBy:{order:"asc"},select:{id:true,title:true,completedAt:true}}),
    prisma.grokCeoExchange.findMany({where:{founderId:user.id,createdAt:{gte:start,lte:end}},orderBy:{createdAt:"desc"},take:100,select:{id:true,kind:true,decision:true,question:true,message:true,response:true,createdAt:true,respondedAt:true}}).catch(()=>null),
  ]);
  const monday=reports.find(x=>x.id===reportId(anchor));
  const snapshot=monday?parseRecord(monday.metrics):null,narrative=monday?parseRecord(monday.narrative):null;
  const weekly=weeklyStrategySchema.safeParse(narrative?.weeklyStrategy);
  const previous=snapshot?.previous7;
  return <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
    <header><Link href="/fisio/informe-ceo" className="text-xs underline text-neutral-600">← Informes del CEO</Link><h1 className="text-2xl font-semibold mt-2">Dirección estratégica semanal</h1><p className="text-sm text-neutral-600 mt-1">Semana {isoWeek} · {first} – {last} · Cierre del lunes {anchor}</p></header>
    <nav aria-label="Semana" className="flex flex-wrap gap-3 text-sm"><Link className="underline" href={"/fisio/informe-ceo/semanal?week="+offsetDay(anchor,-7)}>← Semana anterior</Link>{anchor<latest&&<Link className="underline" href={"/fisio/informe-ceo/semanal?week="+offsetDay(anchor,7)}>Semana siguiente →</Link>}</nav>
    {!monday||!snapshot?<p className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">No existe un informe del lunes con los datos del cierre de esta semana. No se estiman ni se reconstruyen cifras históricas.</p>:<>
      <section><h2 className="font-semibold mb-3">Cierre semanal · datos guardados</h2><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{metrics.map(m=>{const current=metricValue(snapshot,m.path),prev=metricValue(previous,m.path);return <div key={m.path} className="rounded-xl border bg-white p-4"><p className="text-xs text-neutral-500">{m.label}</p><p className="text-xl font-semibold tabular-nums mt-1">{format(current,m.unit)}</p><p className="text-xs text-neutral-500 mt-1">Semana anterior: {format(prev,m.unit)}</p>{current!==null&&prev!==null&&<p className="text-xs mt-1">Cambio: {format(current-prev,m.unit==="rate"?"count":m.unit)}{m.unit==="rate"?" pp":""}</p>}</div>})}</div><p className="text-xs text-neutral-500 mt-2">Comparación de semanas completas a fecha de publicación. Los ingresos cobrados no equivalen al beneficio.</p></section>
      {weekly.success?<><section className="rounded-xl border bg-white p-4"><h2 className="font-semibold mb-2">Análisis estratégico de Grok</h2><p className="whitespace-pre-wrap text-sm leading-relaxed">{weekly.data.summary}</p></section><div className="grid md:grid-cols-2 gap-3"><Items title="Riesgos" items={weekly.data.risks}/><Items title="Foco estratégico" items={weekly.data.focus}/><Items title="Siguientes acciones" items={weekly.data.nextActions}/><Items title="Decisiones propuestas" items={weekly.data.decisions}/></div></>:<section className="rounded-xl border bg-white p-4"><h2 className="font-semibold mb-2">Informe diario del lunes</h2><p className="text-xs text-neutral-500 mb-2">No se ha recibido un análisis estratégico semanal específico. Se conserva el diagnóstico diario, sin presentarlo como un informe adicional de Grok.</p><p className="whitespace-pre-wrap text-sm">{typeof narrative?.resumenEjecutivo==="string"?narrative.resumenEjecutivo:"Sin narrativa disponible."}</p><div className="mt-3"><Items title="Prioridades publicadas" items={stringList(narrative?.accionesRecomendadas)}/></div></section>}
    </>}
    <section className="rounded-xl border bg-white p-4"><div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Objetivos de la semana</h2><Link href="/fisio" className="text-xs underline">Panel CEO</Link></div>{!goals.length?<p className="text-sm text-neutral-500 mt-2">No se registraron objetivos semanales.</p>:<ul className="mt-3 space-y-2 text-sm">{goals.map(g=><li key={g.id} className="flex justify-between gap-3"><span>{g.title}</span><span className={g.completedAt?"text-emerald-700":"text-neutral-500"}>{g.completedAt?"Completado":"Pendiente"}</span></li>)}</ul>}<p className="text-xs text-neutral-500 mt-2">Estado actual de los objetivos registrados para esta semana.</p><Link className="text-xs underline mt-2 inline-block" href="/fisio/finanzas/anual">Ver objetivos trimestrales y métricas anuales</Link></section>
    <section className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Memoria de decisiones y encargos</h2>{decisions===null?<p className="text-sm text-neutral-500 mt-2">Buzón no disponible.</p>:!decisions.length?<p className="text-sm text-neutral-500 mt-2">No hay registros durante esta semana.</p>:<div className="divide-y mt-2">{decisions.map(d=><article key={d.id} className="py-3 text-sm space-y-1"><p className="font-medium">{d.kind==="decision"?(d.decision==="approved"?"Propuesta aprobada (registro)":"Propuesta rechazada"):"Encargo de análisis"} · {d.createdAt.toLocaleDateString("es-ES",{timeZone:"Europe/Madrid"})}</p>{d.question&&<p>{d.question}</p>}{d.message&&<p className="whitespace-pre-wrap">{d.message}</p>}<p className="text-xs text-neutral-500">{d.respondedAt?"Respondido":"Pendiente de respuesta"}</p>{d.response&&<p className="whitespace-pre-wrap text-neutral-700">{d.response}</p>}</article>)}</div>}</section>
    <section className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Histórico de informes</h2><p className="text-xs text-neutral-500 mt-1">Cada fila es una ventana móvil de 7 días guardada, no un resultado diario. No se suman entre sí.</p><div className="overflow-x-auto mt-3"><table className="w-full text-sm text-left"><thead className="border-b text-xs text-neutral-500"><tr><th className="py-2 pr-3">Fecha del informe</th>{metrics.map(m=><th key={m.path} className="py-2 pr-3 whitespace-nowrap">{m.label}</th>)}</tr></thead><tbody>{reports.map(row=>{const s=parseRecord(row.metrics);return <tr key={row.id} className="border-b last:border-0"><td className="py-2 pr-3"><Link className="underline whitespace-nowrap" href={"/fisio/informe-ceo?report="+row.id}>{row.id.slice(9)}</Link></td>{metrics.map(m=><td key={m.path} className="py-2 pr-3 whitespace-nowrap tabular-nums">{format(metricValue(s,m.path),m.unit)}</td>)}</tr>})}</tbody></table></div>{!reports.length&&<p className="text-sm text-neutral-500 mt-2">Sin informes en este periodo.</p>}</section>
  </main>;
}
