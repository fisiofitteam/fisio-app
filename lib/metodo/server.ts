import "server-only";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getAgendaGraciasCopy, getAgendaLandingCopy } from "@/lib/landing-config";
import { mediaUrl, normalizeMetodo, publicStory, type MetodoConfig, type PublicMetodo, type Story } from "./content";
import { METODO_MIGRATION } from "./migration";
export const COOKIE = "ff-metodo-analytics";
export const CONSENT_VERSION = "metodo-2026-11-25-v1";
export const NO_STORE = { "Cache-Control":"private, no-store, max-age=0", "Referrer-Policy":"no-referrer", "X-Content-Type-Options":"nosniff" };
export class MetodoError extends Error { constructor(public status:number,message:string){super(message);} }
export function json(value:unknown,status=200){return NextResponse.json(value,{status,headers:NO_STORE});}
export function failure(e:unknown){return e instanceof MetodoError ? json({error:e.message},e.status) : json({error:"No se ha podido completar la operación. Inténtalo de nuevo."},503);}
export const hash = (v:string)=>createHash("sha256").update(v).digest("hex");
let setup:Promise<void>|undefined;
export async function ensureMetodoSchema(){
  if(!setup)setup=prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(149331,20261125)`;
    for(const sql of METODO_MIGRATION)await tx.$executeRawUnsafe(sql);
  },{timeout:20000}).then(()=>{}).catch(e=>{setup=undefined;throw e;});
  return setup;
}
export function requireOrigin(req:NextRequest){
  let valid=false; try{const o=new URL(req.headers.get("origin")||"");valid=o.host===(req.headers.get("host")||req.nextUrl.host)&&o.protocol===req.nextUrl.protocol;}catch{}
  if(!valid||req.headers.get("sec-fetch-site")==="cross-site")throw new MetodoError(403,"Origen no permitido.");
}
export async function body(req:NextRequest,max=24000):Promise<any>{
  if(!req.headers.get("content-type")?.startsWith("application/json"))throw new MetodoError(415,"Formato no válido.");
  const reader=req.body?.getReader();if(!reader)throw new MetodoError(400,"Faltan datos.");
  const chunks:Uint8Array[]=[];let size=0;while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>max){await reader.cancel();throw new MetodoError(413,"Demasiados datos.");}chunks.push(r.value);}
  try{return JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new MetodoError(400,"Datos no válidos.");}
}
export async function staff(ceoOnly=false){const user=await getActiveProfessional();if(!user)throw new MetodoError(401,"Inicia sesión.");const roles=[user.role,...(user.extraRoles||[])];if(ceoOnly?user.role!=="ceo":!roles.some(r=>["ceo","setter","closer"].includes(r)))throw new MetodoError(403,"No autorizado.");return user;}
export async function rateLimit(req:NextRequest,action:string,limit=80){
  await ensureMetodoSchema();const ip=req.headers.get("x-real-ip")||req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";
  const bucket=Math.floor(Date.now()/60000),key=createHmac("sha256",process.env.DATABASE_URL||"local-only").update(`${bucket}:${action}:${ip}`).digest("hex");
  const r=await prisma.metodoRateLimit.upsert({where:{key},create:{key,expiresAt:new Date((bucket+2)*60000)},update:{count:{increment:1}}});
  if(r.count>limit)throw new MetodoError(429,"Espera un momento antes de volver a intentarlo.");
}
export function sourceData(raw:unknown){
  const o=raw&&typeof raw==="object"?raw as Record<string,unknown>:{};const result:Record<string,string>={};
  // Campaign labels only: no full URLs, emails, phone numbers, handles, fbclid or clinical answers.
  for(const k of ["utm_source","utm_medium","utm_campaign","utm_content","utm_term"]){const v=o[k];if(typeof v==="string"&&/^[a-zA-Z0-9 _.-]{1,100}$/.test(v)&&!/[0-9]{7,}/.test(v))result[k]=v;}
  if(["instagram","facebook","google","direct","other"].includes(String(o.referrer)))result.referrer=String(o.referrer);
  return result;
}
export async function visitor(req:NextRequest){const token=req.cookies.get(COOKIE)?.value;if(!token||!/^[A-Za-z0-9_-]{32}$/.test(token))return null;const v=await prisma.metodoVisitor.findUnique({where:{tokenHash:hash(token)}});return v&&Date.now()-v.createdAt.getTime()<180*86400000?v:null;}
export function setVisitorCookie(res:NextResponse,token:string){res.cookies.set(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:180*86400});}
export const CONTACT_PLACEMENTS=["header","hero","final","sticky","presentation","empathy","compare","method","stories","team","fit"] as const;
/** Consented visitors only: a random MF reference ties this contact to the visit. Never throws. */
export async function contactReference(req:NextRequest,rawPlacement:string|null){
  if(req.cookies.get("ff-metodo-consent")?.value!=="v1.accepted"||req.headers.get("sec-fetch-site")!=="same-origin")return "";
  try{await rateLimit(req,"contact",15);const v=await visitor(req);if(!v)return "";
    const placement=(CONTACT_PLACEMENTS as readonly string[]).includes(rawPlacement||"")?rawPlacement!:"other";
    // Repeated navigation within 30 seconds reuses the reference (double-tap / browser retry).
    return await prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${v.id}),20261128)`;
      const previous=await tx.metodoContact.findFirst({where:{visitorId:v.id,createdAt:{gte:new Date(Date.now()-30000)}},orderBy:{createdAt:"desc"}});
      if(previous)return previous.reference;
      const next="MF-"+randomBytes(6).toString("hex").toUpperCase();await tx.metodoContact.create({data:{reference:next,visitorId:v.id,sourceJson:v.sourceJson,placement}});return next;
    });
  }catch{return "";/* Analytics must never prevent contacting the team. */}
}
export async function getMetodoConfig(){const row=await prisma.landingConfig.findUnique({where:{id:"metodo"}});let parsed:unknown;try{parsed=JSON.parse(row?.content||"null");}catch{}return{config:normalizeMetodo(parsed),revision:row?.updatedAt.toISOString()||null};}
export async function effectiveWhatsapp(config:MetodoConfig){const shared=await getAgendaGraciasCopy();const number=config.whatsapp.number||(shared.whatsappNumber||process.env.NEXT_PUBLIC_SEMAFORO_WHATSAPP||"").replace(/\D/g,"");return{number,message:config.whatsapp.message};}
export async function sourceRecords(stories:Story[]){
  const [evidence,success]=await Promise.all([
    prisma.patientEvidence.findMany({where:{id:{in:stories.filter(s=>s.sourceType==="evidence").map(s=>s.sourceId)},status:"ready",source:{in:["general","legacy"]},kind:{in:["image","video","whatsapp"]}},select:{id:true,updatedAt:true,url:true,kind:true,mimeType:true}}),
    prisma.successCase.findMany({where:{id:{in:stories.filter(s=>s.sourceType==="success").map(s=>s.sourceId)},active:true},select:{id:true,updatedAt:true,youtubeUrl:true}}),
  ]);
  const map=new Map<string,{version:string;url:string;kind:string}>();
  for(const e of evidence)map.set(`evidence:${e.id}`,{version:e.updatedAt.toISOString(),url:e.url||"",kind:e.kind==="video"||e.kind==="image"?e.kind:"text"});
  for(const s of success)map.set(`success:${s.id}`,{version:s.updatedAt.toISOString(),url:s.youtubeUrl,kind:"video"});
  return map;
}
export async function getPublicMetodo():Promise<PublicMetodo>{
  const {config}=await getMetodoConfig(), records=await sourceRecords(config.stories.filter(s=>s.visible&&s.authorized));
  const stories=config.stories.flatMap(s=>{const source=records.get(`${s.sourceType}:${s.sourceId}`);return s.visible&&s.authorized&&s.authorizedAt&&s.authorizedBy&&s.authorizationNote&&source&&source.version===s.sourceVersion?[publicStory(s,source)]:[];});
  // Explicitly omit authorization evidence and all private source identifiers.
  const sections=structuredClone(config.sections),media=structuredClone(config.media);
  // Agenda already publishes this team photograph. Inherit only its validated
  // media URL, never the rest of its configuration, copy or unverified figures.
  if(config.sections.hero.visible||config.sections.founder.visible){
    if(!media.team.url){const agenda=await getAgendaLandingCopy();media.team.url=mediaUrl(agenda.groupImageUrl,false);}
  }else media.team={url:"",alt:"",poster:""};
  for(const key of Object.keys(sections) as (keyof typeof sections)[])if(!sections[key].visible)sections[key]={visible:false,eyebrow:"",title:"",body:"",items:[]};
  if(!config.sections.hero.visible)media.hero={url:"",alt:"",poster:""};
  if(!config.sections.founder.visible)for(const key of ["athlete","clinician","introduction"] as const)media[key]={url:"",alt:"",poster:""};
  return{published:config.published,sections,media,buttons:config.buttons,whatsapp:await effectiveWhatsapp(config),seo:config.seo,stories:config.sections.results.visible?stories:[],tools:config.sections.tools.visible?config.tools.filter(t=>t.visible):[]};
}
export async function saveMetodo(raw:unknown,revision:unknown,actorId:string){
  const config=normalizeMetodo(raw),records=await sourceRecords(config.stories);
  const input=raw as Partial<MetodoConfig>;
  for(const key of Object.keys(config.media) as (keyof MetodoConfig["media"])[]) {
    if((typeof input?.media?.[key]?.url==="string"&&input.media[key].url.trim())&&!config.media[key].url)throw new MetodoError(400,"Utiliza imágenes de Blob y vídeos de YouTube o Blob. No se admiten enlaces privados ni formatos desconocidos.");
    if((typeof input?.media?.[key]?.poster==="string"&&input.media[key].poster.trim())&&!config.media[key].poster)throw new MetodoError(400,"La portada del vídeo no tiene una URL válida.");
  }
  if((typeof input?.whatsapp?.number==="string"&&input.whatsapp.number.trim())&&!config.whatsapp.number)throw new MetodoError(400,"Escribe un teléfono internacional válido, con prefijo.");
  if((Array.isArray(input?.tools)&&input.tools.some((t,i)=>typeof t?.url==="string"&&t.url.trim()&&!config.tools[i]?.url)))throw new MetodoError(400,"Revisa los enlaces de las herramientas: solo rutas públicas permitidas o comunidades de WhatsApp y Skool.");
  const ids=new Set<string>();
  for(const s of config.stories){
    if(!/^[a-zA-Z0-9_-]{8,64}$/.test(s.id)||ids.has(s.id))throw new MetodoError(400,"Hay una historia duplicada o no válida.");ids.add(s.id);
    const source=records.get(`${s.sourceType}:${s.sourceId}`);
    if(s.authorized){if(!source||source.version!==s.sourceVersion||!s.authorizationNote.trim()||!s.name.trim()||!s.title.trim())throw new MetodoError(400,"Revisa la fuente, el nombre público, el título y la autorización de cada historia.");s.authorizedAt=new Date().toISOString();s.authorizedBy=actorId;}
    else{s.authorizedAt="";s.authorizedBy="";}
    if(s.visible&&!s.authorized)throw new MetodoError(400,"Confirma la autorización antes de publicar una historia.");
    if(source?.url&&!mediaUrl(source.url)&&s.visible)throw new MetodoError(400,"El archivo de esta historia no tiene un formato público compatible.");
  }
  await ensureMetodoSchema();
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(149331,20261126)`;
    const current=await tx.landingConfig.findUnique({where:{id:"metodo"}});
    if((current?.updatedAt.toISOString()||null)!==revision)throw new MetodoError(409,"Otra persona ha actualizado la landing. Recarga antes de guardar.");
    const saved=await tx.landingConfig.upsert({where:{id:"metodo"},create:{id:"metodo",content:JSON.stringify(config),updatedById:actorId},update:{content:JSON.stringify(config),updatedById:actorId}});
    await tx.metodoAudit.create({data:{id:randomUUID(),actorId,action:"content_saved",reference:"metodo",detail:JSON.stringify({published:config.published,publicStories:config.stories.filter(s=>s.visible&&s.authorized).map(s=>s.id)})}});
    return{config,revision:saved.updatedAt.toISOString()};
  });
}
export async function cleanupMetodo(){await ensureMetodoSchema();await prisma.$transaction([
  prisma.metodoRateLimit.deleteMany({where:{expiresAt:{lt:new Date()}}}),
  prisma.metodoEvent.deleteMany({where:{createdAt:{lt:new Date(Date.now()-180*86400000)}}}),
  prisma.metodoVisitor.deleteMany({where:{createdAt:{lt:new Date(Date.now()-180*86400000)}}}),
  prisma.metodoContact.deleteMany({where:{createdAt:{lt:new Date(Date.now()-730*86400000)}}}),
  prisma.metodoAudit.deleteMany({where:{createdAt:{lt:new Date(Date.now()-730*86400000)}}}),
]);}
export {randomBytes,randomUUID};
