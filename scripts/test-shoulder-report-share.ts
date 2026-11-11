// The report projection is the boundary between the clinical record and the browser.
// Synthetic fixture; the full report lifecycle is also exercised against a disposable PostgreSQL.
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { publicShoulderSnapshot } from "../lib/shoulder-shared-snapshot";
import { PILOT_TESTS,scorePilot } from "../lib/shoulder-pilot";

const secret="PRIVATE_FIXTURE_DO_NOT_INCLUDE",time="2026-11-11T10:12:30.000Z";
const id=(key:string)=>PILOT_TESTS.find(t=>t.key===key)!.id;
const hold=id("pvcHold"),qual=id("overheadSquat"),face=id("facePull8rm");
const sc=scorePilot({[qual]:{comment:"Pausa revisada."},[hold]:{holdSeconds:10,inRangeSeconds:9,positionLossSeconds:1}},{});
const raw={weekNumber:14,rubricVersion:"shoulder-men-v1",publishedAt:time, patientId:secret,patientName:secret,
 sessionId:secret,assignmentId:secret,videoVersions:{[hold]:secret}, initialFormContext:secret,draft:secret,
 pain:{before:0,after:1,painfulTestIds:[face,secret],medicalHistory:secret},
 observations:{[hold]:{holdSeconds:10,unstableSeconds:3,coachNotes:secret},[qual]:{comment:"Pausa revisada."},[secret]:secret},
 notAssessable:{[id("pullover")]:"No hay medida.",[secret]:secret},
 testFeedback:{[face]:{pain:0,reps:2,loadKg:8,comment:"Noté tirantez en la última.",internal:secret},[secret]:secret},
 narrative:{general:"Perfil revisado.",stability:"Recolocación al final.",privatePrompt:secret},
 scores:{...sc,axes:sc.axes.map(a=>({...a,label:secret,private:secret})),tests:{...sc.tests,[secret]:secret},
  symmetry:sc.symmetry.map(s=>({...s,private:secret})),private:secret,missing:[secret]}};
const out=publicShoulderSnapshot(raw);
assert.ok(!JSON.stringify(out).includes(secret));
assert.equal(out.narrative?.general,raw.narrative.general);
assert.equal(out.observations[hold].unstableSeconds,3);
assert.equal(out.observations[qual].comment,"Pausa revisada.");
assert.equal(out.testFeedback?.[face]?.pain,0);
assert.equal(out.testFeedback?.[face]?.comment,"Noté tirantez en la última.");
assert.deepEqual(out.pain.painfulTestIds,[face]);
assert.equal(out.scores.axes.find(a=>a.key==="mobility")?.score,null);
assert.deepEqual(publicShoulderSnapshot(out),out);
assert.throws(()=>publicShoulderSnapshot({...raw,publishedAt:""}));
const token="Q".repeat(43);
for(const path of ["/informe-hombro/"+token,"/informe-hombro/corto","/informe-hombro/"+token+"/otro"]){
 const res=middleware(new NextRequest("https://local.test"+path));
 assert.equal(res.status,path.endsWith(token)?200:404);
 assert.match(res.headers.get("cache-control")||"",/no-store/);
 assert.equal(res.headers.get("referrer-policy"),"no-referrer");
 assert.match(res.headers.get("x-robots-tag")||"",/noindex/);
 assert.match(res.headers.get("content-security-policy")||"",/frame-ancestors 'none'/);
}
assert.equal(middleware(new NextRequest("https://local.test/informe-hombro/"+token,{method:"POST"})).status,404);
assert.equal(middleware(new NextRequest("https://local.test/api/shoulder-pilot/test/share")).status,307);
console.log("PASS: published report allowlist excludes identifying/private fields, preserves explicit notes, zeros and historic scoring; only the exact read-only public route bypasses login with no-store/no-referrer.");
