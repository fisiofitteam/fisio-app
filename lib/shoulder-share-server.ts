import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PilotHttpError, requirePilotAccess } from "@/lib/shoulder-pilot-server";
import { PILOT_PROGRAM_ID } from "./shoulder-pilot";
import { publicShoulderSnapshot,type SharedShoulderReports } from "./shoulder-shared-snapshot";

type Access=Awaited<ReturnType<typeof requirePilotAccess>>;
type Reader=Pick<Prisma.TransactionClient,"shoulderPilotReview">;
export const SHARE_LIFETIME=30*24*60*60*1000;
type StateRow={expiresAt:Date;publishedAt:Date;baselinePublishedAt:Date|null};
const none={active:false,expiresAt:null,sharedPublishedAt:null,upToDate:false};
const gone=()=>new PilotHttpError(404,"Informe no disponible.");
const mismatch=()=>new PilotHttpError(409,"El informe o el enlace ha cambiado. Recarga la revisión.");
// Prisma raw binds JS Date as timestamptz; explicitly encode UTC wall-clock digits for
// the existing Prisma TIMESTAMP(3) convention, independent of the database session timezone.
const utc=(date:Date)=>date.toISOString().slice(0,-1);
const digest=(s:string)=>createHash("sha256").update(s).digest("hex");

function baselineWhere(a:Access){
 return {publishedAt:{not:null},session:{assignmentId:a.session.assignmentId,weekNumber:1,scheduledDate:{lte:a.session.scheduledDate}}};
}
async function published(db:Reader,a:Access):Promise<SharedShoulderReports>{
 const [row,base]=await Promise.all([
   db.shoulderPilotReview.findUnique({where:{sessionId:a.session.id},select:{publishedJson:true,publishedAt:true}}),
   a.session.weekNumber===14?db.shoulderPilotReview.findFirst({where:baselineWhere(a),orderBy:[{session:{scheduledDate:"desc"}},{sessionId:"asc"}],select:{publishedJson:true,publishedAt:true}}):null,
 ]);
 if(!row?.publishedAt||!row.publishedJson)throw gone();
 const report=publicShoulderSnapshot(JSON.parse(row.publishedJson));
 if(report.publishedAt!==row.publishedAt.toISOString()||report.weekNumber!==a.session.weekNumber)throw gone();
 const previous=base?.publishedJson&&base.publishedAt?publicShoulderSnapshot(JSON.parse(base.publishedJson)):null;
 if(previous && (previous.weekNumber!==1||previous.publishedAt!==base?.publishedAt?.toISOString()))throw gone();
 return {report,previous};
}
export async function getPublishedShoulderReports(sessionId:string,professionalOnly=false){
 const a=await requirePilotAccess(sessionId,professionalOnly);
 return published(prisma,a);
}
export async function getShoulderShareStatus(sessionId:string){
 const a=await requirePilotAccess(sessionId,true);
 const [rows,base]=await Promise.all([
   prisma.$queryRaw<StateRow[]>`SELECT "expiresAt","publishedAt","baselinePublishedAt" FROM "ShoulderReportShare"
     WHERE "sessionId"=${sessionId} AND "assignmentId"=${a.session.assignmentId} AND "patientId"=${a.session.assignment.patientId} AND "expiresAt"> CAST(${utc(new Date())} AS timestamp)`,
   a.session.weekNumber===14?prisma.shoulderPilotReview.findFirst({where:baselineWhere(a),orderBy:[{session:{scheduledDate:"desc"}},{sessionId:"asc"}],select:{publishedAt:true}}):null,
 ]);
 const active=rows[0];
 return active?{active:true,expiresAt:active.expiresAt.toISOString(),sharedPublishedAt:active.publishedAt.toISOString(),
  upToDate:a.row?.publishedAt?.getTime()===active.publishedAt.getTime()&&(base?.publishedAt?.getTime()??null)===(active.baselinePublishedAt?.getTime()??null)}:none;
}
export async function issueShoulderShare(sessionId:string,expectedPublishedAt:string){
 const a=await requirePilotAccess(sessionId,true);
 if(!a.row?.publishedAt) throw new PilotHttpError(409,"Publica el informe antes de compartirlo.");
 const token=randomBytes(32).toString("base64url"),now=new Date(),expiresAt=new Date(now.getTime()+SHARE_LIFETIME);
 try{return await prisma.$transaction(async tx=>{
   const payload=await published(tx,a),date=new Date(payload.report.publishedAt),before=payload.previous?new Date(payload.previous.publishedAt):null;
   if(expectedPublishedAt!==payload.report.publishedAt)throw mismatch();
   await tx.$executeRaw`INSERT INTO "ShoulderReportShare"
     ("sessionId","patientId","assignmentId","tokenHash","issuedAt","publishedAt","baselinePublishedAt","expiresAt","reportJson")
     VALUES (${sessionId},${a.session.assignment.patientId},${a.session.assignmentId},${digest(token)},CAST(${utc(now)} AS timestamp),CAST(${utc(date)} AS timestamp),CAST(${before?utc(before):null} AS timestamp),CAST(${utc(expiresAt)} AS timestamp),${JSON.stringify(payload)})
     ON CONFLICT ("sessionId") DO UPDATE SET "patientId"=excluded."patientId","assignmentId"=excluded."assignmentId",
      "tokenHash"=excluded."tokenHash","issuedAt"=excluded."issuedAt","publishedAt"=excluded."publishedAt","baselinePublishedAt"=excluded."baselinePublishedAt",
      "expiresAt"=excluded."expiresAt","reportJson"=excluded."reportJson"`;
   return {path:"/informe-hombro/"+token,active:true,expiresAt:expiresAt.toISOString(),sharedPublishedAt:date.toISOString(),upToDate:true};
 },{isolationLevel:"Serializable",timeout:10000});}
 catch(e){if((e as {code?:string})?.code==="P2034")throw mismatch();throw e;}
}
export async function revokeShoulderShare(sessionId:string){
 const a=await requirePilotAccess(sessionId,true);
 await prisma.$executeRaw`DELETE FROM "ShoulderReportShare" WHERE "sessionId"=${sessionId} AND "patientId"=${a.session.assignment.patientId} AND "assignmentId"=${a.session.assignmentId}`;
 return none;
}
export async function getSharedShoulderReports(token:string):Promise<SharedShoulderReports|null>{
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
 // No draft, user identity, session, asset URL or clinical history is selected for a visitor.
 const rows=await prisma.$queryRaw<{reportJson:string}[]>`SELECT sh."reportJson" FROM "ShoulderReportShare" sh
 JOIN "ProgramSession" s ON s."id"=sh."sessionId" AND s."assignmentId"=sh."assignmentId"
 JOIN "ProgramAssignment" a ON a."id"=s."assignmentId" AND a."patientId"=sh."patientId"
 JOIN "Patient" p ON p."id"=a."patientId"
 WHERE sh."tokenHash"=${digest(token)} AND sh."expiresAt"> CAST(${utc(new Date())} AS timestamp) AND p."isTest"=true AND a."programId"=${PILOT_PROGRAM_ID} AND s."weekNumber" IN (1,14) LIMIT 1`;
 if(!rows.length)return null;
 const payload=JSON.parse(rows[0].reportJson);
 return {report:publicShoulderSnapshot(payload.report),previous:payload.previous?publicShoulderSnapshot(payload.previous):null};
}
