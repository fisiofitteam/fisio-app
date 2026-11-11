// Integration test for an EMPTY disposable PostgreSQL database with the production schema.
// TEAM_QA_DATABASE_URL must name a Unix socket in /tmp/ff-teamqa-*/sock (no TCP listener).
// It deliberately never uses a developer's or deployed app's DATABASE_URL.
import assert from "node:assert/strict";
import Module from "node:module";
import { NextRequest } from "next/server";

async function main(){
  const conf=new URL(process.env.TEAM_QA_DATABASE_URL || "invalid:");
  assert.equal(conf.protocol,"postgresql:","Supply an explicit disposable test database.");
  assert.equal(conf.hostname,"localhost");
  assert.match(conf.searchParams.get("host") || "",/^\/(private\/)?tmp\/ff-teamqa-[A-Za-z0-9]+\/sock$/);
  process.env.DATABASE_URL=conf.href;
  delete process.env.FISIO_DEV_BYPASS;
  const {prisma:db}=await import("../lib/prisma");
  const saved=(Module as any)._load;
  const jar=new Map<string,string>();
  (Module as any)._load=function(id:string,...args:unknown[]){
    if(id==="next/headers"||id==="next/headers.js")return {cookies:()=>({
      get:(key:string)=>jar.has(key)?{value:jar.get(key)}:undefined,
      set:(k:string,v:string)=>jar.set(k,v),delete:(k:string)=>jar.delete(k),
    })};
    return saved.call(this,id,...args);
  };
  try{
    const [pg]=await db.$queryRaw<{listens:string}[]>`SELECT current_setting('listen_addresses') AS listens`;
    assert.equal(pg.listens,"","This fixture expects a socket-only disposable database");
    assert.equal(await db.professional.count(),0,"Use an empty disposable database");
    assert.equal(await db.patient.count(),0,"Use an empty disposable database");
    const {DELETE:offboard}=await import("../app/api/professionals/[id]/route");
    const {POST:login}=await import("../app/api/auth/login/route");
    const {hashPassword,getSessionUser}=await import("../lib/auth");
    const day=86400e3,now=Date.now(),past=new Date(now-day),future=new Date(now+day);
    const password="fixture-only-123",pro=(id:string,role:string)=>db.professional.create({data:{id,role,fullName:id,email:id+"@fixture.invalid",passwordHash:hashPassword(password)}});
    await pro("boss","ceo");await pro("other-ceo","ceo");await pro("member","fisio");await pro("colleague","head_success");
    const signIn=async(id:string)=>login(new NextRequest("https://fixture.invalid/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:id+"@fixture.invalid",password})}));
    const remove=(id="member")=>offboard(new Request("https://fixture.invalid/api/professionals/"+id,{method:"DELETE"}),{params:{id}});
    assert.equal((await remove()).status,403);
    assert.equal((await signIn("member")).status,200);
    const memberToken=jar.get("fisio-session")!;
    assert.equal((await remove("colleague")).status,403);
    assert.equal((await signIn("colleague")).status,200);
    assert.equal((await remove()).status,403);
    assert.equal((await signIn("boss")).status,200);
    const bossToken=jar.get("fisio-session")!;
    assert.equal((await remove("boss")).status,400);
    assert.equal((await remove("other-ceo")).status,400);
    const patient=(id:string,assignedProfessionalId="member",isTest=false)=>db.patient.create({data:{id,fullName:id,assignedProfessionalId,isTest}});
    const period=(patientId:string,status:string,endDate:Date)=>db.subscriptionRenewal.create({data:{patientId,status,endDate}});
    await patient("old");await period("old","active",past);
    await patient("lost");await period("lost","lost",future);
    await patient("legacy-no-period");await patient("other-active","colleague");await period("other-active","active",future);
    await db.patientDerivation.create({data:{patientId:"lost",fromProfessionalId:"colleague",toProfessionalId:"member"}});
    await db.fisioTask.create({data:{id:"past-note",title:"Trabajo ya atendido",patientId:"old",assignedByProfessionalId:"member",completedAt:past}});
    await patient("open");await period("open","finished",past);const live=await period("open","active",future);
    // Being both primary and recipient of a referral does not turn one patient into two.
    await db.patientDerivation.create({data:{patientId:"open",fromProfessionalId:"colleague",toProfessionalId:"member"}});
    const r=await remove();assert.equal(r.status,409);
    assert.match((await r.json()).error,/\b1 paciente\b/);
    assert.equal((await db.professional.findUniqueOrThrow({where:{id:"member"}})).active,true);
    await db.subscriptionRenewal.update({where:{id:live.id},data:{status:"finished"}});
    // Legitimate open referral of another professional must still block.
    const referral=await db.patientDerivation.create({data:{patientId:"other-active",fromProfessionalId:"colleague",toProfessionalId:"member"}});
    assert.equal((await remove()).status,409);
    await db.patientDerivation.delete({where:{id:referral.id}});
    // Genuine active pause with no remaining subscription days is still future clinical work.
    const pause=await db.programPause.create({data:{patientId:"old",status:"active",startDate:past,endDate:future}});
    assert.equal((await remove()).status,409);
    await db.programPause.update({where:{id:pause.id},data:{status:"ended"}});
    await patient("test-patient","member",true);const testPeriod=await period("test-patient","active",future);
    assert.equal((await remove()).status,409);
    await db.subscriptionRenewal.update({where:{id:testPeriod.id},data:{status:"finished"}});
    const call=await db.lead.create({data:{fullName:"Fixture",contactType:"email",contactValue:"lead@fixture.invalid",callScheduledAt:future,closerId:"member",status:"scheduled"}});
    assert.equal((await remove()).status,409);
    await db.lead.update({where:{id:call.id},data:{status:"lost",inFollowUp:true}});
    assert.equal((await remove()).status,409);
    await db.lead.update({where:{id:call.id},data:{inFollowUp:false}});
    await db.professional.update({where:{id:"member"},data:{passwordResetToken:"fixture-reset",passwordResetExpires:future}});
    // Positive path: old patients, completed work and lost calls all keep their attribution.
    assert.equal((await remove()).status,200);
    const former=await db.professional.findUniqueOrThrow({where:{id:"member"}});
    assert(former.deletedAt);assert.equal(former.active,false);
    assert.equal(former.passwordHash,null);assert.equal(former.passwordResetToken,null);assert.equal(former.passwordResetExpires,null);
    assert.equal(await db.session.count({where:{professionalId:"member"}}),0);
    assert.equal(await db.patient.count({where:{assignedProfessionalId:"member"}}),5);
    assert.equal((await db.fisioTask.findUniqueOrThrow({where:{id:"past-note"}})).assignedByProfessionalId,"member");
    assert.equal((await db.lead.findUniqueOrThrow({where:{id:call.id}})).closerId,"member");
    assert.equal(await db.patientDerivation.count({where:{toProfessionalId:"member"}}),2);
    assert.equal((await signIn("member")).status,401);
    jar.set("fisio-session",memberToken);assert.equal(await getSessionUser(),null);
    jar.set("fisio-session",bossToken);assert.equal((await remove()).status,200);
    console.log("PASS: CEO guard, current and referred patients, active pauses, pending/follow-up calls, historical attribution, blocked sign-in and revoked sessions.");
  }finally{(Module as any)._load=saved;await db.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});