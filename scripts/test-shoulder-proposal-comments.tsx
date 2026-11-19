// Synthetic proposals only: no patient videos, provider, browser, or database.
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {ShoulderVideoProposal} from "../components/ShoulderVideoProposal";
import {ShoulderPilotReport,type PilotReportSnapshot} from "../components/ShoulderPilotReport";
import {proposalFields,proposalConflicts,type ShoulderVideoSource} from "../lib/shoulder-analysis-queue";
import {SHOULDER_VIDEO_TESTS,type ShoulderAIDraft} from "../lib/shoulder-analysis-types";
import {PILOT_TESTS,HOLD_SCORING_VERSION,sanitizePilotObservations,scorePilot} from "../lib/shoulder-pilot";
(globalThis as any).React=React;
const test=(key:string)=>PILOT_TESTS.find(t=>t.key===key)!;
const source=(key:string):ShoulderVideoSource=>({sessionId:"synthetic-session",id:"synthetic-video",testId:test(key).id,uploadedAt:"2026-01-01T00:00:00.000Z",url:"/synthetic-video"});
function draft(key:string,notes="",observationFields:Record<string,number>={}):ShoulderAIDraft{
  const s=source(key);
  return {testId:s.testId,videoId:s.id,uploadedAt:s.uploadedAt,kind:SHOULDER_VIDEO_TESTS[s.testId].kind,notes,observationFields,
    findings:[],limitations:[],method:"synthetic",hold:null,intervals:{lossOfPosition:null}};
}
const note="No se distingue el contacto de la espalda con la pared.";
const notesOnly=draft("wallFlexion","  "+note+"  ");
const fields=proposalFields(notesOnly);
assert.deepEqual(fields,{comment:note},"a numerical test can incorporate its comment without fabricated measurements");
assert(!("leftProgress" in fields)&&!("rightProgress" in fields));
const clean=sanitizePilotObservations({[notesOnly.testId]:fields});
assert.deepEqual(clean,{[notesOnly.testId]:{comment:note}});
const score=scorePilot(clean);
assert.equal(score.tests[notesOnly.testId].score,null);
assert.equal(score.tests[notesOnly.testId].missing,true);
assert.equal(score.complete,false);
assert.equal(score.hasResults,false,"a comment alone is not a measured result");
assert.deepEqual(proposalFields(draft("wallFlexion"," \n ")),{});
assert.deepEqual(proposalFields(draft("wallFlexion",note,{leftProgress:0})),{leftProgress:0,comment:note},"an observed zero survives alongside a comment");
assert.deepEqual(proposalFields(draft("wallFlexion","",{leftProgress:50,affectedKg:80,unknown:1,rightProgress:NaN})),{leftProgress:50},"only finite numeric fields belonging to this test are incorporated");
assert.deepEqual(proposalFields(draft("pvcHold",note,{holdSeconds:12,positionLossSeconds:0,inRangeSeconds:4})),{holdSeconds:12,positionLossSeconds:0,comment:note});
assert.deepEqual(proposalFields(draft("facePull8rm",note,{affectedKg:99,referenceKg:100})),{comment:note},"load observations remain manual even when AI notes are incorporated");
assert.deepEqual(proposalFields(draft("pushJerk",note,{leftProgress:100})),{comment:note});
assert.deepEqual(proposalFields({...notesOnly,testId:"unknown"}),{});
assert.equal(proposalConflicts({leftProgress:50,comment:"Comentario del fisio."},fields),true,"existing manual comments require confirmation");
assert.equal(proposalConflicts({leftProgress:50,comment:note},fields),false);
assert.equal(proposalConflicts({leftProgress:50},fields),false,"incorporating text must not conflict with untouched measurements");
assert.equal(proposalConflicts({leftProgress:0},proposalFields(draft("wallFlexion",note,{leftProgress:50}))),true);
assert.deepEqual({...{leftProgress:50},...fields},{leftProgress:50,comment:note},"merging a comment preserves the clinician's measurement");
const withNumbers={[notesOnly.testId]:{leftProgress:100,rightProgress:50,comment:note}};
assert.equal(scorePilot(sanitizePilotObservations(withNumbers)).tests[notesOnly.testId].score,5,"optional prose does not alter numeric scoring");

function markup(d:ShoulderAIDraft,extra:Record<string,unknown>={}){
  return renderToStaticMarkup(<ShoulderVideoProposal source={source(PILOT_TESTS.find(t=>t.id===d.testId)!.key)} entry={{draft:d}} disabled={false} conflict={false} batchBusy={false} onAnalyze={()=>{}} onCancel={()=>{}} onProposal={()=>{}} {...extra}/>);
}
function incorporate(html:string){
  const match=html.match(/<button\b([^>]*)>Incorporar[^<]*<\/button>/);
  assert(match,"the proposal exposes an incorporation action");
  return {disabled:/\bdisabled(?:=|\s|$)/.test(match[1]),html:match[0]};
}
assert.match(markup(notesOnly),/0 medidas propuestas · 2 sin estimar/);
assert.match(markup(draft("wallFlexion","",{leftProgress:50})),/1 medida propuesta · 1 sin estimar/);
assert.match(markup(draft("wallFlexion","",{leftProgress:50,rightProgress:75})),/2 medidas propuestas/);
assert.doesNotMatch(markup(draft("wallPress","",{externalDeficit:20})),/sin estimar|Pendientes:/,"conditional abduction is not missing when external rotation deficit is observed");
const unconfirmedZero=draft("wallPress","Contacto que debe comprobar el fisio.",{externalDeficit:0,abduction:160});
assert.equal(incorporate(markup(unconfirmedZero)).disabled,true,"a zero from a new or legacy proposal needs an explicit contact check before entering the draft");
assert.match(markup(unconfirmedZero),/type="checkbox"/);
assert.match(markup(unconfirmedZero),/desde la posición inicial hasta la abducción propuesta/);
assert.match(markup(draft("wallPress","",{externalDeficit:0})),/en la posición inicial/);
assert.equal(incorporate(markup(draft("wallPress","",{externalDeficit:20}))).disabled,false,"a measurable positive deficit is still directly actionable");
assert.equal(incorporate(markup(draft("wallPress",note))).disabled,false,"a blocked wall press measurement can still contribute its comment");
const contactEvidence={leftImageArm:"visible_gap" as const,rightImageArm:"not_visible" as const,backContact:null,wristsNeutral:true,start:10,end:12,reason:"La separación no permite medir el ángulo."};
assert.match(markup({...draft("wallPress",note),wallPressEvidence:{initial:{...contactEvidence,deficitAngleVisible:false},elevation:contactEvidence}}),/Separación visible/);
assert.match(markup({...draft("wallPress",note),wallPressEvidence:{initial:{...contactEvidence,deficitAngleVisible:false},elevation:contactEvidence}}),/No comprobable/);
const commentButton=incorporate(markup(notesOnly));
assert.equal(commentButton.disabled,false,"the screenshot's text-only numerical proposal is actionable");
assert.match(commentButton.html,/comentario/);
assert.equal(incorporate(markup(draft("wallFlexion"))).disabled,true,"an empty proposal still has nothing to incorporate");
assert.equal(incorporate(markup(draft("wallFlexion","",{leftProgress:0}))).disabled,false);
assert.equal(incorporate(markup(notesOnly,{conflict:true})).disabled,true,"a stale review cannot receive a proposal");
assert.equal(incorporate(markup(notesOnly,{progress:"Analizando vídeo…"})).disabled,true,"an old proposal cannot be incorporated while its replacement is running");
assert.match(markup(notesOnly,{entry:{draft:notesOnly,applied:true}}),/disabled=""[^>]*>Propuesta incorporada/);
assert.equal(incorporate(markup(draft("facePull8rm",note))).disabled,false,"text can be incorporated while kg remain manual");

const numeric=PILOT_TESTS.filter(t=>t.kind==="numeric");
const comments=Object.fromEntries(numeric.map(t=>[t.id,{comment:"Comentario publicado de "+t.key+"."}]));
const snapshot:PilotReportSnapshot={holdScoringVersion:HOLD_SCORING_VERSION,weekNumber:1,publishedAt:"synthetic",rubricVersion:"synthetic",pain:{},observations:comments,scores:scorePilot(comments)};
const report=renderToStaticMarkup(<ShoulderPilotReport report={snapshot}/>);
for(const t of numeric){
  const text=comments[t.id].comment;
  assert.equal(report.split(text).length-1,1,"published comment appears exactly once for "+t.key);
  assert.equal(snapshot.scores.tests[t.id].score,null);
  assert.equal(snapshot.scores.tests[t.id].missing,true);
}
const escaped=renderToStaticMarkup(<ShoulderPilotReport report={{...snapshot,observations:{[notesOnly.testId]:{comment:"Comentario <script>no ejecutable</script>"}}}}/>);
assert.match(escaped,/Comentario &lt;script&gt;no ejecutable&lt;\/script&gt;/);
console.log("PASS: text-only numerical proposals, optional comment persistence, null vs zero, unchanged scoring, manual conflict protection, enabled UI action and consistently escaped published comments");
