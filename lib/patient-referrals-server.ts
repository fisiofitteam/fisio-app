import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canAccessEvidencePatient } from "@/lib/patient-evidence";
import { isReferralProgram, validReferralCode, sameReferralContact, normalizeReferralEmail, normalizeReferralPhone } from "./patient-referrals";

export class ReferralError extends Error {
  constructor(public status:number, message:string) { super(message); }
}
export async function getReferralPath(patientId:string):Promise<string> {
  const actor=await getSessionUser();
  if(!actor)throw new ReferralError(401,"Inicia sesión para compartir tu recomendación.");
  if(actor.kind==="patient" ? actor.patient.id!==patientId : !await canAccessEvidencePatient(patientId,actor.pro))
    throw new ReferralError(404,"Recomendación no disponible.");
  const patient=await prisma.patient.findUnique({where:{id:patientId},select:{programType:true,referralCode:true}});
  if(!patient || !isReferralProgram(patient.programType))throw new ReferralError(404,"Recomendación no disponible.");
  if(patient.referralCode)return "/recomienda/"+patient.referralCode;
  // Compare-and-set keeps one stable code even when two devices share at once.
  for(let attempt=0;attempt<3;attempt++){
    try{
      await prisma.patient.updateMany({where:{id:patientId,referralCode:null},data:{referralCode:randomBytes(24).toString("base64url")}});
      const saved=await prisma.patient.findUnique({where:{id:patientId},select:{referralCode:true}});
      if(saved?.referralCode)return "/recomienda/"+saved.referralCode;
    }catch(error){if((error as {code?:string}).code!=="P2002")throw error;}
  }
  throw new ReferralError(503,"No se ha podido preparar tu enlace. Inténtalo de nuevo.");
}
export async function getPublicReferral(code:unknown):Promise<{valid:boolean}> {
  if(!validReferralCode(code))return {valid:false};
  const patient=await prisma.patient.findUnique({where:{referralCode:code},select:{programType:true}});
  return {valid:!!patient && isReferralProgram(patient.programType)};
}
export async function resolveReferralAttribution(code:unknown, contact:{email?:string;phone?:string}):Promise<{referredByPatientId:string}|null> {
  if(!validReferralCode(code))return null;
  const referrer=await prisma.patient.findUnique({where:{referralCode:code},select:{id:true,programType:true,email:true,phone:true}});
  if(!referrer || !isReferralProgram(referrer.programType) || sameReferralContact(referrer,contact))return null;
  // The offer is for a first programme. Do not promise it to an existing patient.
  const email=normalizeReferralEmail(contact.email),phone=normalizeReferralPhone(contact.phone);
  if(email && await prisma.patient.findFirst({where:{email:{equals:email,mode:"insensitive"}},select:{id:true}}))return null;
  if(phone){
    // PostgreSQL production provider: normalize stored formatting inside the DB,
    // matching normalizeReferralPhone without loading patient contact data.
    const existingPhone=await prisma.$queryRaw<Array<{id:string}>>`
      SELECT id FROM (
        SELECT "id" AS id,
          regexp_replace(regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g'), '^00', '') AS digits
        FROM "Patient"
      ) AS contacts
      WHERE CASE WHEN length(digits) = 9 THEN '34' || digits ELSE digits END = ${phone}
      LIMIT 1
    `;
    if(existingPhone.length)return null;
  }
  return {referredByPatientId:referrer.id};
}
