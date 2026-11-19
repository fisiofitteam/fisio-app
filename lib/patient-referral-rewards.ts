import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { hasRole } from "@/lib/auth";
import { normalizeReferralEmail, referralQualifyingSale } from "@/lib/patient-referrals";

export class ReferralRewardError extends Error {
  constructor(public status:number, message:string) { super(message); }
}
export type ReferralRewardAction = "mark_delivered" | "undo";
export async function updateReferralReward(leadId:string, action:ReferralRewardAction, expectedPaidAt:string|null) {
  const actor=await getActiveProfessional();
  if(!actor || !hasRole(actor,"ceo"))throw new ReferralRewardError(403,"Solo el CEO puede registrar la entrega del regalo.");
  if(!leadId || leadId.length>100 || !["mark_delivered","undo"].includes(action) ||
      (expectedPaidAt!==null && (typeof expectedPaidAt!=="string" || !Number.isFinite(Date.parse(expectedPaidAt)))))
    throw new ReferralRewardError(400,"Registro no válido.");
  try {
    return await prisma.$transaction(async tx=>{
      const lead=await tx.lead.findUnique({where:{id:leadId},include:{
        referredByPatient:{select:{id:true,isTest:true}},
        convertedPatient:{select:{id:true,email:true,isTest:true}},
        sales:{select:{status:true,isReservation:true,programType:true,amountCents:true,paidAt:true,refundedAt:true,patientId:true}},
      }});
      if(!lead || !lead.referredByPatientId || !lead.referredByPatient)throw new ReferralRewardError(404,"Referido no disponible.");
      const paidAt=lead.referralRewardPaidAt?.toISOString()??null;
      // Repeated requests never produce a second entry or change the original actor/date.
      if(action==="mark_delivered" && paidAt)return {paidAt};
      if(action==="undo" && !paidAt)return {paidAt:null};
      if(paidAt!==expectedPaidAt)throw new ReferralRewardError(409,"El registro ha cambiado. Recarga antes de continuar.");
      if(action==="mark_delivered"){
        const sale=referralQualifyingSale(lead.sales);
        if(!sale)throw new ReferralRewardError(409,"Confirma un programa pagado antes de registrar el regalo. Una señal de reserva no activa la recompensa.");
        if(lead.referredByPatient.isTest || lead.convertedPatient?.isTest || lead.convertedPatientId===lead.referredByPatientId)
          throw new ReferralRewardError(409,"Esta contratación no permite registrar un regalo de referido.");
        const customerIds=[...new Set([lead.convertedPatientId,...lead.sales.filter(s=>s.status==="paid"&&!s.isReservation).map(s=>s.patientId)].filter((id):id is string=>!!id))];
        const emails=[...new Set([lead.email,lead.contactType==="email"?lead.contactValue:null,lead.convertedPatient?.email].map(normalizeReferralEmail).filter(Boolean))];
        const identityFilters=[
          ...(customerIds.length?[{convertedPatientId:{in:customerIds}},{sales:{some:{patientId:{in:customerIds}}}}]:[]),
          ...emails.flatMap(email=>[{email:{equals:email,mode:"insensitive" as const}},{contactType:"email",contactValue:{equals:email,mode:"insensitive" as const}}]),
        ];
        if(!identityFilters.length)throw new ReferralRewardError(409,"Falta identificar al nuevo cliente antes de registrar el regalo.");
        const alreadyDelivered=await tx.lead.findFirst({where:{id:{not:leadId},referralRewardPaidAt:{not:null},OR:identityFilters},select:{id:true}});
        if(alreadyDelivered)throw new ReferralRewardError(409,"Ya hay un regalo registrado para esta persona en otra recomendación.");
      }
      const when=action==="mark_delivered"?new Date():null;
      await tx.lead.update({where:{id:leadId},data:{referralRewardPaidAt:when,referralRewardPaidById:when?actor.id:null}});
      return {paidAt:when?.toISOString()??null};
    },{isolationLevel:"Serializable",timeout:10000});
  }catch(error){
    if((error as {code?:string}).code==="P2034")throw new ReferralRewardError(409,"Otra persona ha actualizado los referidos. Recarga antes de continuar.");
    throw error;
  }
}
