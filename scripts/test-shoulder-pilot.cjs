// No network, database, model, or real patient videos. Run from the repository root.
const assert = require("node:assert/strict");
require("tsx/cjs");
const {
  PILOT_TESTS, DEFAULT_PILOT_CONFIG: C, validatePilotConfig, sanitizePilotObservations,
  validatePilotPain, scorePilot, intervalDuration, legacyPositionLossNeedsReview,
} = require("../lib/shoulder-pilot.ts");
const ids = Object.fromEntries(PILOT_TESTS.map(t => [t.key,t.id]));
const keyObs = o => Object.fromEntries(Object.entries(o).map(([k,v])=>[ids[k],v]));
const test = (key,fields,config=C) => scorePilot(keyObs({[key]:fields}),{},config).tests[ids[key]];
const axis = (key,o={},pain={},config=C) => scorePilot(keyObs(o),pain,config).axes.find(a=>a.key===key).score;
const all = p => Object.fromEntries([1,2,3].flatMap(i=>["Smooth","Symmetric","NoShrug"].map(k=>["r"+i+k,p[k]])));
const near = (actual,expected) => assert(Math.abs(actual-expected)<0.000001, String(actual)+" != "+expected);
const explicitNoPain={before:0,after:0,painfulTestIds:[]};
assert.equal(new Set(Object.values(ids)).size,15);
assert.equal(PILOT_TESTS.filter(t=>t.kind==="qualitative").length,4);
assert(scorePilot({}).axes.every(a=>a.score===null));
assert.equal(scorePilot({}).hasResults,false);
assert.equal(validatePilotConfig(C).mobilityFlexionPct,100/3);
assert.throws(()=>validatePilotConfig({...C,mobilityFlexionPct:80,mobilityPulloverPct:35}));
assert.equal(validatePilotConfig({...C,holdTargetSeconds:1}).holdTargetSeconds,1);
// Read previously pinned configuration without restoring retired controls.
const custom={...C,holdTargetSeconds:12,stabilityPvcPct:42};
assert.deepEqual(validatePilotConfig({...custom,tremorWindowSeconds:5,tremorMinBursts:2,tremorContinuousSeconds:2}),custom);
assert.throws(()=>validatePilotConfig({...C,pulloverStepDegrees:0}));
assert.throws(()=>validatePilotConfig({...C,unknown:10}));
assert.throws(()=>sanitizePilotObservations({unknownId:{}}));
assert.throws(()=>sanitizePilotObservations(keyObs({wallFlexion:{unknownKey:1}})));
assert.throws(()=>sanitizePilotObservations(keyObs({wallPress:{externalDeficit:0,abduction:20}})));
assert.throws(()=>sanitizePilotObservations(keyObs({pvcHold:{holdSeconds:10,inRangeSeconds:12}})));
assert.throws(()=>sanitizePilotObservations(keyObs({pvcHold:{holdSeconds:22}})));
assert.throws(()=>sanitizePilotObservations(keyObs({bumperRaises:{reps5:5,range5:6}})));
assert.throws(()=>sanitizePilotObservations(keyObs({bumperRaises:{reps5:0.3}})));
assert.throws(()=>sanitizePilotObservations(keyObs({bumperRaises:{reps5:"6"}})));
assert.throws(()=>sanitizePilotObservations(keyObs({facePull8rm:{referenceKg:Infinity}})));
assert.deepEqual(sanitizePilotObservations(keyObs({wallFlexion:{leftProgress:0,rightProgress:null}})),keyObs({wallFlexion:{leftProgress:0,rightProgress:null}}));
assert.deepEqual(validatePilotPain({before:0,after:2,painfulTestIds:[ids.pvcHold,ids.pvcHold]}).painfulTestIds,[ids.pvcHold]);
assert.throws(()=>validatePilotPain({before:-1}));
assert.throws(()=>validatePilotPain({painfulTestIds:["bad id"]}));
assert.throws(()=>validatePilotPain({painfulTestIds:{}}));
assert.throws(()=>validatePilotPain({guess:1}));
assert.deepEqual(validatePilotPain({painfulTestIds:null}),{painfulTestIds:null});

// Same test score, distinct athlete profiles: keep time and range separate.
const fullTime={holdSeconds:20,inRangeSeconds:12,positionLossSeconds:0};
const fullRange={holdSeconds:12,inRangeSeconds:12,positionLossSeconds:3};
assert.equal(test("pvcHold",fullTime).score,8);
assert.equal(test("pvcHold",fullRange).score,8);
assert.equal(test("pvcHold",{...fullTime,inRangeSeconds:0}).score,5);
assert.equal(test("pvcHold",fullRange).detail.stabilityScore,7.5);
assert.equal(axis("endurance",{pvcHold:fullTime,bumperHold:fullRange}),8);
assert.equal(axis("stability",{pvcHold:fullTime,bumperHold:fullRange}),8.75);
assert.equal(axis("stability",{pvcHold:{holdSeconds:20,inRangeSeconds:12},bumperHold:fullRange}),null);
assert.equal(test("bumperHold",{holdSeconds:0,inRangeSeconds:0,positionLossSeconds:0}).score,null);
assert.equal(test("bumperHold",{holdSeconds:0,inRangeSeconds:0,positionLossSeconds:0}).detail.timeScore,0);
assert.equal(test("pvcHold",{...fullRange,holdSeconds:12}, {...C,holdTargetSeconds:12}).score,10);
// Compare confirmed zero at a load with a not-yet-entered observation.
const raises={reps5:8,range5:7,reps10:6,range10:3,reps15:0};
assert.equal(test("bumperRaises",raises).score,6.49);
assert.equal(test("bumperRaises",{...raises,reps15:null}).score,null);
assert.equal(axis("endRange",{bumperRaises:raises,bumperHold:fullTime}),6.75);
assert.equal(axis("endRange",{bumperRaises:raises,bumperHold:fullTime,pvcHold:{holdSeconds:20,inRangeSeconds:0}}),6.75);
assert.equal(axis("endurance",{bumperHold:fullTime}, {}, {...C,endurancePvcPct:0}),10);
assert.equal(test("facePull8rm",{affectedKg:8,referenceKg:10}).score,8);
assert.equal(test("press8rm",{affectedKg:0,referenceKg:10}).score,0);
assert.equal(test("press8rm",{affectedKg:12,referenceKg:10}).score,10);
assert.equal(test("press8rm",{affectedKg:8,referenceKg:0}).score,null);
assert.equal(test("press8rm",{affectedKg:8}).score,null);
assert.equal(test("wallFlexion",{leftProgress:100,rightProgress:50}).score,5);
assert.equal(test("wallFlexion",{leftProgress:100,rightProgress:0}).score,0);
assert.equal(test("wallFlexion",{leftProgress:100}).score,null);
for(const [angle,score] of [[180,10],[172.5,8.5],[155,5],[130,0],[120,0]]) assert.equal(test("pullover",{angle}).score,score);
assert.equal(test("pullover",{angle:160},{...C,pulloverStepDegrees:10}).score,8);
for(const [abduction,score] of [[0,7],[90,8],[118,8],[120,8],[121,9],[125,9],[134.9,9],[135,10],[145,10]]){
  assert.equal(test("wallPress",{externalDeficit:0,abduction}).score,score);
}
for(const [externalDeficit,score] of [[5,6],[10,5],[35,0],[40,0]]) assert.equal(test("wallPress",{externalDeficit}).score,score);
const mobility={wallFlexion:{leftProgress:50,rightProgress:50},pullover:{angle:155},wallPress:{externalDeficit:0,abduction:135}};
assert.equal(axis("mobility",mobility),6.67);
assert.equal(axis("mobility",{...mobility,wallPress:{}}),null);
assert.equal(axis("mobility",mobility,{},{...C,mobilityFlexionPct:0,mobilityPulloverPct:0}),10);
const shrug=all({Smooth:1,Symmetric:1,NoShrug:0});
assert.equal(test("scapLateral",shrug).score,6.67);
assert.equal(axis("coordination",{scapLateral:shrug,scapFlexion:shrug,scapPress:shrug}),10);
assert.equal(axis("coordination",{scapLateral:shrug,scapFlexion:shrug}),null);
assert.equal(axis("coordination",{scapLateral:shrug,scapFlexion:shrug,scapPress:{...shrug,r3Symmetric:0}}),9.44);
assert.equal(axis("tolerance",{},explicitNoPain),10);
for(const [before,after,score] of [[1,3,7],[5,7,5],[6,2,8.5]]){
  assert.equal(axis("tolerance",{},{before,after,painfulTestIds:[ids.pvcHold,ids.wallPress,ids.wallPress]}),score);
}
assert.equal(axis("tolerance",{},{before:0,after:10,painfulTestIds:Object.values(ids)}),0);
assert.equal(axis("tolerance",{},{before:0,after:0}),null); // unasked != none
assert.equal(axis("tolerance",{},{before:0,painfulTestIds:[]}),null);

// Only visible losses of posture count; overlapping ranges and out-of-window footage count once.
const spans=(...n)=>n.map(([start,end])=>({start,end}));
near(intervalDuration(20,spans([-2,4],[3,8],[19,56])),9);
near(intervalDuration(20,[]),0);
near(intervalDuration(20,spans([1,3],[2,5],[10,12]),{...C,holdTargetSeconds:10}),4);
assert.throws(()=>intervalDuration(20,spans([0,Infinity])));
assert.throws(()=>intervalDuration(20,spans([10,5])));
const oldHold={holdSeconds:20,inRangeSeconds:12,unstableSeconds:7};
assert.equal(legacyPositionLossNeedsReview(ids.pvcHold,oldHold),true);
assert.equal(legacyPositionLossNeedsReview(ids.pvcHold,{...oldHold,positionLossSeconds:0}),false);
assert.equal(test("pvcHold",oldHold).detail.stabilityScore,null);
assert.equal(test("pvcHold",oldHold).score,8);
assert.equal(test("pvcHold",{...oldHold,positionLossSeconds:0}).detail.stabilityScore,10);
assert.deepEqual(sanitizePilotObservations(keyObs({pvcHold:oldHold})),keyObs({pvcHold:{holdSeconds:20,inRangeSeconds:12}}));
assert.equal(axis("stability",{pvcHold:oldHold,bumperHold:fullTime}),null);
// Qualitative movements never become radar points; clinical signoff is external to this pure rubric.
for(const key of ["overheadSquat","frontSquat","pushJerk","scapPullUps"]){
  assert.equal(test(key,{}).missing,true);
  assert.equal(test(key,{comment:"   "}).missing,true);
  assert.equal(test(key,{comment:"Observación revisada."}).score,null);
  assert.equal(test(key,{comment:"Observación revisada."}).missing,false);
}
const full=Object.assign({}, mobility,{pvcHold:fullTime,bumperHold:fullRange,bumperRaises:raises,
  facePull8rm:{affectedKg:8,referenceKg:10},press8rm:{affectedKg:9,referenceKg:10},
  scapLateral:shrug,scapFlexion:shrug,scapPress:shrug}, Object.fromEntries(["overheadSquat","frontSquat","pushJerk","scapPullUps"].map(k=>[k,{comment:"Validado."}])));
const report=scorePilot(sanitizePilotObservations(keyObs(full)),explicitNoPain);
assert.equal(report.complete,true); assert.deepEqual(report.missing,[]);
assert.equal(report.axes.length,6); assert.equal(report.symmetry.length,2);
assert.equal(scorePilot(keyObs({...full,pushJerk:{}}),explicitNoPain).complete,false);
console.log("PASS: shoulder protocol: 15 tests, 6 independent axes, missing data, journaled configurations, pain, weighted ratios, posture-only stability (legacy and current) and clinical notes");
