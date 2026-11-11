import type { Prisma, ShoulderPilotReview } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canAccessEvidencePatient } from "@/lib/patient-evidence";
import { getOnboardingConfig } from "@/lib/onboarding-config";
import { getCurrentPilotConfig } from "@/lib/shoulder-pilot-config-server";
import { pilotSnapshotRefs } from "@/lib/shoulder-pilot-snapshot";
import { PILOT_PROGRAM_ID, RUBRIC_VERSION, PILOT_TESTS, scorePilot, validatePilotConfig, sanitizePilotObservations, validatePilotPain,
  type PilotObservations, type PilotPain, type PilotConfig } from "@/lib/shoulder-pilot";

export class PilotHttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const fail = (s: number, m: string): never => { throw new PilotHttpError(s,m); };
const unavailable = () => new PilotHttpError(404, "Valoración no disponible.");
const conflict = () => new PilotHttpError(409, "La valoración o uno de sus vídeos ha cambiado. Recarga antes de guardar.");
const object = (x: unknown): x is Record<string,unknown> => !!x && typeof x === "object" && !Array.isArray(x);
function allowedKeys(obj: Record<string,unknown>, keys: readonly string[]) {
  if (Object.keys(obj).some(k => !keys.includes(k))) fail(400,"El formulario contiene campos no permitidos.");
}
const decode = <T,>(s: string | undefined | null, fallback: T): T => s ? JSON.parse(s) : fallback;
const rmIds = new Set(["86d6177e-a02e-4ef9-a62c-677323e9f8b9","701ef4c7-6de1-4428-b55e-fefa01ae2336"]);
type Marks = Record<string,{ source: string|null; reviewerId: string; reviewedAt: string }>;
type Published = { weekNumber:number; scheduledDate:string; publishedAt:string; rubricVersion:string; config:PilotConfig; videoVersions:Record<string,string>; observations:PilotObservations; pain:PilotPain; notAssessable:Record<string,string>; scores:ReturnType<typeof scorePilot> };
const apiInput = <T,>(f: () => T): T => { try { return f(); } catch(e) { throw new PilotHttpError(400, e instanceof Error ? e.message : "Datos incorrectos."); } };

export async function requirePilotAccess(sessionId: string, professionalOnly = false) {
  const actor = await getSessionUser();
  if (!actor) throw new PilotHttpError(401,"Inicia sesión.");
  if (professionalOnly && actor.kind !== "professional") throw new PilotHttpError(403,"Acceso reservado al equipo clínico.");
  const session = await prisma.programSession.findUnique({where:{id:sessionId}, select:{
    id:true,assignmentId:true,scheduledDate:true,weekNumber:true,tasksSnapshot:true,
    assignment:{select:{id:true,programId:true,patientId:true,patient:{select:{fullName:true,isTest:true}}}}
  }});
  if (!session?.assignment.patient.isTest || session.assignment.programId !== PILOT_PROGRAM_ID || ![1,14].includes(session.weekNumber)) throw unavailable();
  if (actor.kind === "patient" ? actor.patient.id !== session.assignment.patientId :
        !await canAccessEvidencePatient(session.assignment.patientId,actor.pro)) throw unavailable();
  const refs=pilotSnapshotRefs(session.tasksSnapshot);
  if (!refs) throw unavailable();
  const [row,protocol]=await Promise.all([
    prisma.shoulderPilotReview.findUnique({where:{sessionId}}),
    prisma.shoulderPilotProtocol.findUnique({where:{assignmentId:session.assignmentId}}),
  ]);
  if (protocol && protocol.rubricVersion !== RUBRIC_VERSION) throw new PilotHttpError(409,"Esta valoración usa otra versión del baremo.");
  const config=protocol ? validatePilotConfig(JSON.parse(protocol.configJson)) : await getCurrentPilotConfig();
  return {actor,session,row,config,refs,testIds:new Set(refs.keys())};
}
type Access = Awaited<ReturnType<typeof requirePilotAccess>>;
type ReadDb = Pick<Prisma.TransactionClient,"assessmentVideo">;
async function media(db:ReadDb, sessionId:string, patientId:string, refs:Map<string,string>) {
  const rows=await db.assessmentVideo.findMany({where:{sessionId, patientId,uploadedAt:{not:null},url:{not:null}},select:{id:true,sessionId:true,testId:true,taskId:true,uploadedAt:true}});
  return rows.filter(r=>refs.get(r.testId)===r.taskId).map(r=>({...r,uploadedAt:r.uploadedAt!.toISOString(),url:"/api/assessments/media?id="+encodeURIComponent(r.id)+"&v="+r.uploadedAt!.getTime()}));
}
const sourceMap=(videos:Awaited<ReturnType<typeof media>>): Record<string,string> =>
  Object.fromEntries(videos.map(v=>[v.testId,v.id+"@"+v.uploadedAt]));
function unpack(row:ShoulderPilotReview|null) {
  return {
    pain:decode<PilotPain>(row?.painJson,{}), loads:decode<PilotObservations>(row?.loadsJson,{}),
    observations:decode<PilotObservations>(row?.observationsJson,{}), marks:decode<Marks>(row?.reviewedJson,{}),
    notAssessable:decode<Record<string,string>>(row?.notAssessableJson,{})
  };
}
function validMarks(marks:Marks, sources: Record<string,string>): string[] {
  return Object.keys(marks).filter(id=>marks[id].source === (sources[id]??null));
}
async function contextFields(patientId:string) {
  const [p,cfg]=await Promise.all([prisma.patient.findUnique({where:{id:patientId},select:{anamnesisData:true}}),getOnboardingConfig()]);
  let answers: Record<string,unknown> = {};
  try { const a=JSON.parse(p?.anamnesisData||"{}"); if(object(a)) answers=a; } catch {}
  const labels=new Map<string,string>([["painLevel","Dolor inicial"],["painWhen","Cuándo aparece el dolor"],["painAggravators","Qué lo empeora"],["painRelievers","Qué lo alivia"]]);
  for (const step of cfg.anamnesisSteps) for (const field of step.fields) {
    if (step.id==="pain" || labels.has(field.key) || (/dolor|molestias/i.test(field.label) && /movimiento|cambia|empeora|alivia|cuándo|intensidad/i.test(field.label))) labels.set(field.key, field.label);
  }
  const out:{label:string;value:string}[]=[];
  for(const [key,label] of labels) {const v=answers[key];const value=Array.isArray(v)?v.filter(x=>typeof x==="string").join(", "):typeof v==="string"||typeof v==="number"?String(v):"";if(value.trim())out.push({label,value:value.slice(0,3000)});}
  return out.slice(0,15);
}
export async function getPilotView(sessionId:string) {
  const a=await requirePilotAccess(sessionId);
  const {row,session,actor,config}=a, patientId=session.assignment.patientId;
  const raw=unpack(row);
  const previous=session.weekNumber===14?await prisma.shoulderPilotReview.findFirst({
    where:{publishedAt:{not:null},session:{assignmentId:session.assignmentId,weekNumber:1,scheduledDate:{lte:session.scheduledDate}}},
    orderBy:[{session:{scheduledDate:"desc"}},{sessionId:"asc"}],
    select:{sessionId:true,publishedJson:true,session:{select:{tasksSnapshot:true}}}
  }):null;
  const common={sessionId,weekNumber:session.weekNumber,scheduledDate:session.scheduledDate.toISOString(),assignmentId:session.assignmentId,patientId,patientName:session.assignment.patient.fullName,version:row?.version||0,aiConsent:row?.aiConsent||false,
    pain:raw.pain,loads:raw.loads,config,rubricVersion:RUBRIC_VERSION,published:decode<Published|null>(row?.publishedJson,null),baseline:decode<Published|null>(previous?.publishedJson,null)};
  if(actor.kind==="patient")return common;
  const [videos,initialFormContext,baselineVideos]=await Promise.all([media(prisma,sessionId,patientId,a.refs),contextFields(patientId),
    previous?media(prisma,previous.sessionId,patientId,pilotSnapshotRefs(previous.session.tasksSnapshot)||new Map()):Promise.resolve([])]);
  // Never present a replacement upload as the evidence for a previously published baseline.
  const baselineEvidence=baselineVideos.filter(v=>common.baseline?.videoVersions?.[v.testId]===v.id+"@"+v.uploadedAt);
  return {...common,observations:raw.observations,reviewedTestIds:validMarks(raw.marks,sourceMap(videos)),notAssessable:raw.notAssessable,initialFormContext,videos,baselineVideos:baselineEvidence,baselineSessionId:previous?.sessionId||null};
}

function parseReasons(raw: unknown, ids:Set<string>) {
  if(!object(raw))throw new PilotHttpError(400,"Indica el motivo de cada test no valorable.");
  const output:Record<string,string>={};
  for(const [id,value] of Object.entries(raw)) {
    if(!ids.has(id)||typeof value!=="string"||value.trim().length<1||value.length>1200)throw new PilotHttpError(400,"Motivo de test no valorable incorrecto.");
    output[id]=value.trim();
  }
  return output;
}
function parseReviewed(raw:unknown, ids:Set<string>): string[] {
  if(!Array.isArray(raw)||raw.length>ids.size||raw.some(id=>typeof id!=="string"||!ids.has(id))||new Set(raw).size!==raw.length)throw new PilotHttpError(400,"Lista de tests revisados incorrecta.");
  return raw;
}
type ChangeData = Prisma.ShoulderPilotReviewUpdateManyMutationInput;
export async function updatePilot(sessionId:string, input:unknown) {
  if (!object(input)) throw new PilotHttpError(400,"Formulario no válido.");
  const b=input, a=await requirePilotAccess(sessionId);
  const {actor,session,refs,testIds}=a;
  if(actor.kind==="patient" ? b.action!=="patient" : !["save","publish"].includes(String(b.action))) throw new PilotHttpError(403,"Acción no permitida.");
  if(!Number.isSafeInteger(b.version)||Number(b.version)<0)throw new PilotHttpError(400,"Falta la versión de la valoración.");
  try {
    await prisma.$transaction(async tx=>{
      // First writer pins the protocol for this assignment, including its week-14 retest.
      const protocol=await tx.shoulderPilotProtocol.upsert({where:{assignmentId:session.assignmentId},create:{assignmentId:session.assignmentId,rubricVersion:RUBRIC_VERSION,configJson:JSON.stringify(a.config)},update:{}});
      const config=validatePilotConfig(JSON.parse(protocol.configJson));
      if (protocol.rubricVersion!==RUBRIC_VERSION) throw conflict();
      const row=await tx.shoulderPilotReview.upsert({where:{sessionId},create:{sessionId},update:{}});
      if(row.version!==b.version)throw conflict();
      const raw=unpack(row);
      const data:ChangeData={version:{increment:1}};
      if(actor.kind==="patient") {
        allowedKeys(b,["action","version","pain","loads","aiConsent"]);
        if(b.aiConsent!==undefined){if(typeof b.aiConsent!=="boolean")throw new PilotHttpError(400,"Consentimiento no válido."); if(row.publishedAt && b.aiConsent && !row.aiConsent)throw new PilotHttpError(409,"La revisión está publicada; el consentimiento solo puede retirarse."); if(b.aiConsent!==row.aiConsent){data.aiConsent=b.aiConsent;data.aiConsentAt=new Date();}}
        if (row.publishedAt && (b.pain!==undefined||b.loads!==undefined)) throw new PilotHttpError(409,"Tu informe ya está publicado; pide al fisio cualquier corrección.");
        if (b.pain!==undefined){
          if(!object(b.pain))throw new PilotHttpError(400,"Datos de dolor inválidos.");
          allowedKeys(b.pain,["before","after","painfulTestIds"]);
          const pain=apiInput(()=>validatePilotPain({...raw.pain,...b.pain as Record<string,unknown>}));
          data.painJson=JSON.stringify(pain);
        }
        if(b.loads!==undefined){
          if(!object(b.loads))throw new PilotHttpError(400,"Pesos no válidos.");
          for(const [id,patch] of Object.entries(b.loads)){
            if(!rmIds.has(id)||!testIds.has(id)||!object(patch))throw new PilotHttpError(400,"Solo puedes registrar tus dos 8RM.");
            allowedKeys(patch,["affectedKg","referenceKg"]);
            const record=apiInput(()=>sanitizePilotObservations({[id]:{...raw.loads[id],...patch}},config))[id]||{};
            if(JSON.stringify(record)!==JSON.stringify(raw.loads[id]||{})){
              raw.loads[id]=record;raw.observations[id]={...raw.observations[id],...record};delete raw.marks[id];
            }
          }
          data.loadsJson=JSON.stringify(raw.loads);data.observationsJson=JSON.stringify(raw.observations);data.reviewedJson=JSON.stringify(raw.marks);
        }
      }else{
        const videos=await media(tx,sessionId,session.assignment.patientId,refs), sources=sourceMap(videos);
        if(b.action==="save"){
          allowedKeys(b,["action","version","observations","reviewedTestIds","notAssessable","videoVersions"]);
          const reasons=parseReasons(b.notAssessable??{},testIds);
          const obs=apiInput(()=>sanitizePilotObservations(b.observations,config));
          for(const id of Object.keys(reasons))delete obs[id];
          const reviewed=parseReviewed(b.reviewedTestIds,testIds);
          const computed=scorePilot(obs,raw.pain,config);
          const marks:Marks={};
          for(const id of reviewed){
            if(!Object.prototype.hasOwnProperty.call(reasons,id) && computed.tests[id]?.missing!==false)throw new PilotHttpError(400,"Completa los datos o indica por qué el test no es valorable antes de revisarlo.");
            const expected=object(b.videoVersions)?b.videoVersions[id]:null;
            if((expected??null)!==(sources[id]??null))throw conflict();
            const old=raw.marks[id],same=old&&old.source===(sources[id]??null)&&raw.notAssessable[id]===reasons[id]&&JSON.stringify(raw.observations[id])===JSON.stringify(obs[id]);
            marks[id]=same?old:{source:sources[id]??null,reviewerId:actor.pro.id,reviewedAt:new Date().toISOString()};
          }
          data.notAssessableJson=JSON.stringify(reasons);data.reviewedJson=JSON.stringify(marks);data.observationsJson=JSON.stringify(obs);
        }else{
          allowedKeys(b,["action","version"]);
          const reviewed=validMarks(raw.marks,sources);
          if(reviewed.length!==testIds.size||[...testIds].some(id=>!reviewed.includes(id)))throw new PilotHttpError(409,"Revisa cada test o indica expresamente por qué no es valorable.");
          const scores=scorePilot(raw.observations,raw.pain,config);
          if(PILOT_TESTS.some(t=>!raw.notAssessable[t.id]&&scores.tests[t.id]?.missing!==false))throw new PilotHttpError(409,"Hay tests pendientes de revisión.");
          if(reviewed.every(id=>!!raw.notAssessable[id]))throw new PilotHttpError(409,"Hace falta al menos un test valorado.");
          const when=new Date();
          const published:Published={weekNumber:session.weekNumber,scheduledDate:session.scheduledDate.toISOString(),publishedAt:when.toISOString(),rubricVersion:RUBRIC_VERSION,config,videoVersions:sources,observations:raw.observations,pain:raw.pain,notAssessable:raw.notAssessable,scores};
          // A reviewed upload uses the normal assessment locking rules; a pending replacement cannot silently replace it.
          if(videos.length)await tx.assessmentVideo.updateMany({where:{id:{in:videos.map(v=>v.id)},sessionId,patientId:session.assignment.patientId,reviewedAt:null},data:{
            reviewedAt:when,reviewedById:actor.pro.id,pendingPath:null,pendingUntil:null,pendingMime:null,pendingSize:null,
          }});
          data.publishedJson=JSON.stringify(published);data.publishedAt=when;data.publishedById=actor.pro.id;
        }
      }
      const saved=await tx.shoulderPilotReview.updateMany({where:{sessionId,version:row.version}, data});
      if(!saved.count)throw conflict();
    },{isolationLevel:"Serializable",timeout:12000});
  }catch(e){
    if(object(e)&&["P2002","P2034"].includes(String(e.code)))throw conflict();
    throw e;
  }
  return getPilotView(sessionId);
}
