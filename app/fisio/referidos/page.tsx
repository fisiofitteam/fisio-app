import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { hasRole } from "@/lib/auth";
import { referralQualifyingSale } from "@/lib/patient-referrals";
import { ReferralRewardButton } from "@/components/ReferralRewardButton";

export const dynamic="force-dynamic";
const statuses:Record<string,string>={scheduled:"Llamada agendada",reserved:"Señal de reserva",won:"Contratación",lost:"No contratado",cancelled:"Llamada cancelada",no_show:"No asistió"};
const date=(value:Date)=>value.toLocaleDateString("es-ES",{timeZone:"Europe/Madrid"});
export default async function ReferralsPage({searchParams}:{searchParams:{page?:string}}){
  const actor=await getActiveProfessional();
  if(!actor || !hasRole(actor,"ceo"))redirect("/fisio");
  const requested=Number(searchParams.page??1);
  const page=Number.isInteger(requested)&&requested>0?Math.min(requested,10000):1;
  const rows=await prisma.lead.findMany({
    where:{referredByPatientId:{not:null}},
    include:{
      referredByPatient:{select:{id:true,fullName:true,isTest:true}},
      convertedPatient:{select:{isTest:true}},
      sales:{select:{status:true,isReservation:true,programType:true,amountCents:true,paidAt:true,refundedAt:true}},
    },
    orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(page-1)*50,take:51,
  });
  const visible=rows.slice(0,50),hasNext=rows.length>50;
  return <main className="space-y-6">
    <header><p className="text-sm text-neutral-500">Crecimiento por recomendación</p><h1 className="text-2xl font-bold">Referidos</h1><p className="mt-2 max-w-3xl text-sm text-neutral-600">50 € de descuento para el nuevo cliente y 50 € de regalo para quien lo recomienda cuando contrate su primer programa.</p></header>
    <section className="card border-amber-200 bg-amber-50 text-amber-950">
      <h2 className="font-semibold">Cómo gestionarlo</h2>
      <p className="mt-1 text-sm">El equipo aplica los 50 € de descuento al preparar el precio del primer programa en la llamada. Este panel registra la entrega manual del regalo al recomendador: no realiza transferencias ni modifica cobros.</p>
      <p className="mt-2 text-xs">Una señal de reserva no activa el regalo. Si el alta se hizo manualmente y no hay un programa pagado registrado, revisa la contratación antes de entregar el regalo.</p>
    </section>
    {!visible.length?<section className="card py-12 text-center"><h2 className="font-semibold">Todavía no hay referidos registrados</h2><p className="mt-2 text-sm text-neutral-500">Aparecerán aquí cuando alguien reserve su valoración desde el enlace de un paciente.</p></section>:<div className="space-y-3">{visible.map(lead=>{
      const sale=referralQualifyingSale(lead.sales);
      const test=!!lead.referredByPatient?.isTest||!!lead.convertedPatient?.isTest;
      const canDeliver=!!sale&&!test&&lead.convertedPatientId!==lead.referredByPatientId;
      const paidAt=lead.referralRewardPaidAt?.toISOString()??null;
      const label=paidAt?"Regalo entregado":test?"Registro de prueba":canDeliver?"Regalo listo para entregar":lead.status==="won"?"Revisar contratación":"Pendiente de contratación";
      return <article key={lead.id} className="card flex flex-col gap-4 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{lead.fullName}</h2><span className="rounded-full bg-neutral-100 px-2 py-1 text-xs">{statuses[lead.status]??lead.status}</span></div>
          <p className="mt-1 text-sm text-neutral-600">Recomendado por {lead.referredByPatient?<Link className="font-medium underline" href={"/fisio/paciente/"+lead.referredByPatient.id+"/info"}>{lead.referredByPatient.fullName}</Link>:"paciente no disponible"}</p>
          <p className="mt-1 text-xs text-neutral-500">Registrado el {date(lead.createdAt)}{sale?" · Programa pagado: "+sale.programType:""} · Descuento de 50 € a gestionar en la venta.</p>
          <Link className="mt-2 inline-block text-xs underline" href={"/fisio/llamadas-venta?status="+encodeURIComponent(lead.status)+(lead.closerId?"&closer="+encodeURIComponent(lead.closerId):"")}>Ver llamadas</Link>
        </div>
        <div className="space-y-2 md:w-64"><p className={"text-sm font-medium "+(paidAt?"text-emerald-700":canDeliver?"text-amber-700":"text-neutral-600")}>{label}{paidAt?" · "+date(lead.referralRewardPaidAt!):""}</p>
          {paidAt&&!sale&&<p className="text-xs text-red-700">Revisa este registro: actualmente no consta un programa pagado válido. Puede haber una devolución.</p>}
          <ReferralRewardButton leadId={lead.id} paidAt={paidAt} canDeliver={canDeliver}/>
        </div>
      </article>;
    })}</div>}
    {(page>1||hasNext)&&<nav aria-label="Páginas de referidos" className="flex items-center justify-between gap-3 text-sm">{page>1?<Link className="btn btn-ghost" href={"/fisio/referidos?page="+(page-1)}>Anterior</Link>:<span/>}<span>Página {page}</span>{hasNext?<Link className="btn btn-ghost" href={"/fisio/referidos?page="+(page+1)}>Siguiente</Link>:<span/>}</nav>}
  </main>;
}
