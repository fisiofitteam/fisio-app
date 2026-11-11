// Render a published follow-up using synthetic athlete responses only.
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PublishedShoulderTestFeedback, ShoulderTestPainOverview } from "../components/ShoulderTestFeedbackDisplay";
import { ShoulderPilotReport, type PilotReportSnapshot } from "../components/ShoulderPilotReport";
import { PILOT_TESTS, scorePilot } from "../lib/shoulder-pilot";
import type { ShoulderTestFeedbackMap } from "../lib/shoulder-test-feedback";
(globalThis as any).React=React;
const [wall, pull, , , hold]=PILOT_TESTS.map(t=>t.id);
const face=PILOT_TESTS.find(t=>t.key==="facePull8rm")!.id;
function snapshot(weekNumber:number,testFeedback?:ShoulderTestFeedbackMap):PilotReportSnapshot{
  return {weekNumber,testFeedback,publishedAt:"fixture",rubricVersion:"fixture",pain:{},observations:{},scores:scorePilot()};
}
const baseline=snapshot(1,{[face]:{reps:2,loadKg:8,pain:6,comment:"Paré <aquí>."},[wall]:{pain:4},[pull]:{comment:"Sin puntuación."}});
const retest=snapshot(14,{[face]:{reps:8,loadKg:10,pain:3},[wall]:{pain:4},[pull]:{pain:0},[hold]:{comment:"Solo comentario."}});
const view=renderToStaticMarkup(<ShoulderPilotReport report={retest} previous={baseline}/>);
assert.match(view,/id="sensaciones-por-test"/);
assert.match(view,/2 repeticiones con 8 kg/);assert.match(view,/8 repeticiones con 10 kg/);
assert.match(view,/6 repeticiones más, 2 kg más y 3 puntos menos de dolor/);
assert.match(view,/Paré &lt;aquí&gt;/);assert.match(view,/el mismo dolor/);
assert.match(view,/Dolor: 0\/10/);assert.match(view,/Dolor sin registrar/);assert.match(view,/Sin registro por test/);
assert.match(view,/Ver las demás pruebas con registro \(1\)/);
const worse=renderToStaticMarkup(<PublishedShoulderTestFeedback current={snapshot(14,{[face]:{pain:7}})} previous={baseline} retest/>);
assert.match(worse,/1 punto más de dolor/);
const old=snapshot(1);old.pain.painfulTestIds=[face,PILOT_TESTS[2].id];
const migrated=renderToStaticMarkup(<PublishedShoulderTestFeedback current={retest} previous={old} retest/>);
assert.match(migrated,/Wall press/);assert.match(migrated,/Con dolor · intensidad sin registrar/);assert.doesNotMatch(migrated,/puntos menos de dolor/);
assert.equal(renderToStaticMarkup(<PublishedShoulderTestFeedback current={old} retest={false}/>),"");
const clinical=renderToStaticMarkup(<ShoulderTestPainOverview current={retest} openTest={()=>{}}/>);
assert.ok(clinical.indexOf("4/10")<clinical.indexOf("3/10"));assert.match(clinical,/3 de 15/);
console.log("PASS: published before/after attempts & self-reported pain, worsening, unchanged, escaped comments, unknown vs zero, legacy marks, clinician pain ranking");
