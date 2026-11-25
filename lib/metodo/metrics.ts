import "server-only";
import {prisma} from "@/lib/prisma";
import {ensureMetodoSchema,MetodoError} from "./server";
function madridMidnight(day:string){
  const base=Date.parse(day+"T00:00:00Z");let value=base;
  for(let i=0;i<3;i++){const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Madrid",timeZoneName:"shortOffset"}).formatToParts(new Date(value));const offset=parts.find(p=>p.type==="timeZoneName")?.value.match(/GMT([+-]\d+)(?::(\d+))?/);const minutes=offset?Number(offset[1])*60+Number(offset[2]||0):0;value=base-minutes*60000;}
  return new Date(value);
}
export function metricRange(from?:string|null,to?:string|null){
  const endDay=to||new Date().toLocaleDateString("sv-SE",{timeZone:"Europe/Madrid"}),startDay=from||new Date(Date.now()-29*86400000).toLocaleDateString("sv-SE",{timeZone:"Europe/Madrid"});
  for(const d of [startDay,endDay])if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d)throw new MetodoError(400,"Fechas no válidas.");
  const nextDay=new Date(Date.parse(endDay)+86400000).toISOString().slice(0,10),start=madridMidnight(startDay),end=madridMidnight(nextDay);
  if(end<=start||end.getTime()-start.getTime()>181*86400000)throw new MetodoError(400,"Selecciona un intervalo de hasta 180 días.");
  return{start,end,from:startDay,to:endDay};
}
export async function metodoMetrics(from?:string|null,to?:string|null){
  await ensureMetodoSchema();const range=metricRange(from,to),createdAt={gte:range.start,lt:range.end};
  const contactScope={createdAt,confirmedAt:{not:null}};
  const attributedLead={metodoContact:{is:contactScope}};
  const [visits,events,sources,contacts,clickVisitors,confirmed,calls,wins,cancelled,noShow,paid,invoices,recent,channels]=await Promise.all([
    prisma.$queryRaw<Array<{visitors:number;pageViews:number}>>`SELECT count(DISTINCT "visitorId")::int AS visitors,count(*)::int AS "pageViews" FROM "MetodoEvent" WHERE "type"='page_view' AND "createdAt">=${range.start} AND "createdAt"<${range.end}`,
    prisma.metodoEvent.groupBy({by:["type","target","value"],where:{createdAt},_count:{_all:true}}),
    prisma.$queryRaw<Array<{source:string;medium:string;campaign:string;visitors:number}>>`SELECT COALESCE(v."sourceJson"::jsonb->>'utm_source',v."sourceJson"::jsonb->>'referrer','direct') AS source,COALESCE(v."sourceJson"::jsonb->>'utm_medium','') AS medium,COALESCE(v."sourceJson"::jsonb->>'utm_campaign','') AS campaign,count(DISTINCT e."visitorId")::int AS visitors FROM "MetodoEvent" e JOIN "MetodoVisitor" v ON v.id=e."visitorId" WHERE e.type='page_view' AND e."createdAt">=${range.start} AND e."createdAt"<${range.end} GROUP BY 1,2,3 ORDER BY visitors DESC LIMIT 100`,
    prisma.metodoContact.count({where:{createdAt}}),
    prisma.metodoContact.groupBy({by:["visitorId"],where:{createdAt,visitorId:{not:null},visitor:{events:{some:{type:"page_view",createdAt}}}}}),
    prisma.metodoContact.count({where:contactScope}),
    prisma.lead.count({where:attributedLead}),
    prisma.lead.count({where:{...attributedLead,status:"won"}}),
    prisma.lead.count({where:{...attributedLead,status:"cancelled"}}),
    prisma.lead.count({where:{...attributedLead,status:"no_show"}}),
    prisma.sale.findMany({where:{lead:attributedLead,status:"paid",isReservation:false},select:{id:true,leadId:true,currency:true}}),
    prisma.patientInvoice.findMany({where:{sale:{lead:attributedLead,currency:"eur"},cancelledAt:null},select:{id:true,totalAmount:true,transactionId:true,saleId:true}}),
    prisma.metodoContact.findMany({where:{createdAt},orderBy:{createdAt:"desc"},take:50,select:{reference:true,createdAt:true,confirmedAt:true,leadId:true,sourceJson:true,placement:true}}),
    prisma.$queryRaw<Array<{source:string;medium:string;campaign:string;clicks:number;conversations:number;calls:number;wins:number;paidLeads:number}>>`SELECT COALESCE(c."sourceJson"::jsonb->>'utm_source',c."sourceJson"::jsonb->>'referrer','direct') AS source,COALESCE(c."sourceJson"::jsonb->>'utm_medium','') AS medium,COALESCE(c."sourceJson"::jsonb->>'utm_campaign','') AS campaign,count(*)::int AS clicks,count(*) FILTER (WHERE c."confirmedAt" IS NOT NULL)::int AS conversations,count(*) FILTER (WHERE c."confirmedAt" IS NOT NULL AND l.id IS NOT NULL)::int AS calls,count(*) FILTER (WHERE c."confirmedAt" IS NOT NULL AND l.status='won')::int AS wins,count(*) FILTER (WHERE c."confirmedAt" IS NOT NULL AND EXISTS(SELECT 1 FROM "Sale" s WHERE s."leadId"=l.id AND s.status='paid' AND s."isReservation"=false))::int AS "paidLeads" FROM "MetodoContact" c LEFT JOIN "Lead" l ON l.id=c."leadId" WHERE c."createdAt">=${range.start} AND c."createdAt"<${range.end} GROUP BY 1,2,3 ORDER BY clicks DESC LIMIT 100`,
  ]);
  const transactionIds=[...new Set(invoices.flatMap(i=>i.transactionId?[i.transactionId]:[]))];
  const cash=transactionIds.length?await prisma.transaction.aggregate({where:{id:{in:transactionIds},type:{in:["income_new","income_renewal","income_other"]}},_sum:{amount:true},_count:{_all:true}}):null;
  const base=visits[0]||{visitors:0,pageViews:0};
  return{schemaVersion:1,asOf:new Date().toISOString(),range:{from:range.from,to:range.to,timeZone:"Europe/Madrid"},coverage:"Solo visitas con consentimiento. Cohorte de clics del intervalo; resultados comerciales conocidos hasta ahora.",
    totals:{...base,whatsappClicks:contacts,clickVisitors:clickVisitors.length,visitorToClickRate:base.visitors?clickVisitors.length/base.visitors:null,confirmedConversations:confirmed,bookedCalls:calls,wonLeads:wins,cancelledCalls:cancelled,noShowCalls:noShow,paidLeads:new Set(paid.map(s=>s.leadId)).size,invoicedEur:invoices.reduce((n,i)=>n+i.totalAmount,0),documentedCashEur:cash&&cash._count._all>0?cash._sum.amount||0:null,documentedTransactions:cash?cash._count._all:0,paidSales:paid.length,nonEurPaidSales:paid.filter(s=>s.currency!=="eur").length},
    events:events.map(e=>({type:e.type,target:e.target,value:e.value,count:e._count._all})),sources,channels,
    contacts:recent.map(c=>({...c,createdAt:c.createdAt.toISOString(),confirmedAt:c.confirmedAt?.toISOString()||null,source:JSON.parse(c.sourceJson) as Record<string,string>,sourceJson:undefined})),
    definitions:{whatsappClicks:"Referencias creadas al abrir WhatsApp; no son mensajes enviados.",confirmedConversations:"Referencias cuyo mensaje recibido ha confirmado el equipo. No se deducen de clics.",bookedCalls:"Leads vinculados explícitamente a una referencia confirmada, incluidos los que luego cancelan o no acuden.",wonLeads:"Leads vinculados cuyo estado actual es won; se distinguen de pagos confirmados.",invoicedEur:"Facturas no anuladas con relación directa a una venta del lead atribuido, en EUR.",documentedCashEur:"Cobros brutos del libro de transacciones enlazados explícitamente desde esas facturas. Sin enlace documental, no se presume cobro. No equivale a caja neta ni incluye devoluciones sin enlace.",video_progress:"Porcentaje de intervalos realmente reproducidos, sin sumar saltos ni repeticiones; deduplicado por visita y vídeo."},
    limitations:["Los visitantes únicos son navegadores consentidos, no personas identificadas; borrar cookies o cambiar de dispositivo impide deduplicarlos.","La atribución conserva el origen de la primera visita consentida. Si se elimina la referencia del mensaje, la conexión con el CRM no es automática.","No hay confirmación automática de WhatsApp: Skalex no expone en la API actual la referencia del mensaje recibido.","Las cifras financieras son parciales cuando no existen enlaces directos a facturas y cobros. No se atribuyen renovaciones por proximidad de fechas o teléfono.","Eventos: 180 días. Referencias comerciales verificadas: hasta 730 días. Un rechazo de medición no impide contactar."],
  };
}
