// Offline integration: no real API key, production data, patient footage or Google calls.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawnSync } from "node:child_process";
import { parseAIDraft,readLimitedBody,validateFrames,analyzeFrames,buildVideoInstruction,buildVideoOutputSchema, type FrameRequest } from "../lib/shoulder-video-analysis";
import { HOLD_PVC,SHOULDER_VIDEO_TESTS } from "../lib/shoulder-analysis-types";
import { DEFAULT_PILOT_CONFIG as config,PILOT_TESTS } from "../lib/shoulder-pilot";

async function main(){
  const b={testId:HOLD_PVC,videoId:"synthetic-upload",uploadedAt:"2026-01-01T00:00:00.000Z",duration:24,fps:8,sheets:[] as {times:number[],jpeg:string}[]};
  const response={hold:{start:2,end:24},holdPositionVisible:true,rangeVisible:true,stabilityVisible:true,aboveEars:[{start:2,end:10},{start:8,end:14}],lossOfPosition:[{start:10,end:12}],notes:"Borrador verificable.",findings:[{start:10,end:12,text:"Cambio de posición."}],limitations:[]};
  const d=parseAIDraft(response,b,config);
  assert.deepEqual(d.observationFields,{holdSeconds:20,positionLossSeconds:2});
  assert.deepEqual(Object.keys(d.intervals).sort(),["lossOfPosition"]);
  // A visible person or unchanged posture does not establish that the prescribed
  // lift-off/hold is actually sustained. Require explicit visual confirmation.
  for(const holdPositionVisible of [false,undefined,null,"true",1]){
    const unsupported=parseAIDraft({...response,hold:{start:0,end:20},holdPositionVisible,stabilityVisible:true,lossOfPosition:[]},b,config);
    assert.deepEqual(unsupported.observationFields,{},"unconfirmed hold position cannot supply timing or stability measures");
    assert.equal(unsupported.hold,null);
    assert.deepEqual(unsupported.intervals,{lossOfPosition:null});
  }
  assert.deepEqual(parseAIDraft({...response,holdPositionVisible:true,stabilityVisible:false},b,config).observationFields,{holdSeconds:20});

  // Disregard obsolete model fields even if a provider still includes them.
  assert.deepEqual(parseAIDraft({...response,tremor:[{start:2,end:19}]},b,config),d);
  assert.equal(parseAIDraft({...response,lossOfPosition:[]},b,config).observationFields.positionLossSeconds,0);
  assert(!("positionLossSeconds" in parseAIDraft({...response,lossOfPosition:null},b,config).observationFields));
  // Only count observable loss within the scored portion of the hold; overlap counts once.
  assert.equal(parseAIDraft({...response,lossOfPosition:[{start:1,end:4},{start:3,end:5},{start:21,end:24}]},b,config).observationFields.positionLossSeconds,4);
  assert.deepEqual(parseAIDraft({...response,rangeVisible:false,stabilityVisible:false},b,config).observationFields,{holdSeconds:20});
  assert.deepEqual(parseAIDraft({...response,hold:null},b,config).observationFields,{});
  assert.deepEqual(parseAIDraft({...response,lossOfPosition:[{start:-3,end:4}]},b,config).observationFields,{holdSeconds:20});
  assert.deepEqual(parseAIDraft({...response,aboveEars:null,rangeVisible:false,inRangeSeconds:2},b,config),d);
  assert.doesNotMatch(buildVideoInstruction(b),/aboveEars|rangeVisible|inRangeSeconds/);
  // A continuous visible target-length segment remains measurable if recording
  // begins after the athlete has already lifted. Stability remains independent.
  const clipped=parseAIDraft({...response,hold:{start:0,end:20},stabilityVisible:false},b,config);
  assert.deepEqual(clipped.observationFields,{holdSeconds:20});
  assert.equal(parseAIDraft({...response,hold:{start:0,end:0}},b,config).hold,null);
  assert.equal(parseAIDraft({...response,hold:{start:24.005,end:24.009}},b,config).hold,null);
  assert.deepEqual(parseAIDraft({...response,hold:{start:24.005,end:24.009}},b,config).observationFields,{});
  assert.match(buildVideoInstruction(b,{...config,holdTargetSeconds:15}),/objetivo puntuable es 15 s/i);
  assert.match(buildVideoInstruction(b),/tramo continuo OBSERVADO/i);

  const numeric=PILOT_TESTS.find(t=>t.key==="wallFlexion")!;
  const measurement={...b,testId:numeric.id,fps:3};
  const validMeasurement={value:75,start:2,end:3};
  const measured=parseAIDraft({measurements:{leftProgress:validMeasurement,rightProgress:{value:60,start:4,end:5},affectedKg:{value:20,start:2,end:3}}},measurement,config);
  assert.deepEqual(measured.observationFields,{leftProgress:75,rightProgress:60});
  assert.equal(measured.findings.length,2);
  assert.deepEqual(parseAIDraft({measurements:{leftProgress:{value:80},rightProgress:{...validMeasurement,end:50}}},measurement,config).observationFields,{});
  assert.deepEqual(parseAIDraft({measurements:{leftProgress:{...validMeasurement,value:101},rightProgress:{...validMeasurement,value:"80"}}},measurement,config).observationFields,{});
  assert.deepEqual(parseAIDraft({measurements:{leftProgress:{...validMeasurement,value:0},rightProgress:null}},measurement,config).observationFields,{leftProgress:0});
  // One static frame can evidence a visible angle/progress; it must not force a
  // fictional duration or suppress an independent visible side.
  const pointDraft=parseAIDraft({measurements:{leftProgress:{value:65,start:5,end:5},rightProgress:null}},measurement,config);
  assert.deepEqual(pointDraft.observationFields,{leftProgress:65});
  assert.equal(pointDraft.findings[0].start,5);
  assert.equal(pointDraft.findings[0].end,5);
  assert.deepEqual(parseAIDraft({measurements:{leftProgress:{value:65,start:5,end:4},rightProgress:{value:55,start:6,end:6}}},measurement,config).observationFields,{rightProgress:55});
  assert.deepEqual(parseAIDraft({measurements:{leftProgress:{value:65,start:-1,end:-1},rightProgress:{value:55,start:50,end:50}}},measurement,config).observationFields,{});
  assert.deepEqual(parseAIDraft({measurements:{leftProgress:{value:65,start:24.005,end:24.009},rightProgress:null}},measurement,config).observationFields,{});

  const pullover={...b,testId:PILOT_TESTS.find(t=>t.key==="pullover")!.id,fps:3};
  assert.deepEqual(parseAIDraft({measurements:{angle:{value:170,start:2,end:2.1}}},pullover,config).observationFields,{});
  assert.deepEqual(parseAIDraft({measurements:{angle:{value:170,start:2,end:2}}},pullover,config).observationFields,{});

  assert.deepEqual(parseAIDraft({measurements:{angle:{value:170,start:2,end:3}}},pullover,config).observationFields,{angle:170});
  const scap={...b,testId:PILOT_TESTS.find(t=>t.key==="scapLateral")!.id,fps:3};
  assert.deepEqual(parseAIDraft({measurements:{r1Smooth:{...validMeasurement,value:.5},r2Smooth:{...validMeasurement,value:1}}},scap,config).observationFields,{r2Smooth:1});
  assert.deepEqual(parseAIDraft({measurements:{r1Smooth:{value:1,start:2,end:2},r1Symmetric:null,r2Smooth:{value:0,start:3,end:4}}},scap,config).observationFields,{r2Smooth:0});

  const raises={...b,testId:PILOT_TESTS.find(t=>t.key==="bumperRaises")!.id,fps:3};
  assert.deepEqual(parseAIDraft({measurements:{reps5:{...validMeasurement,value:4},range5:{...validMeasurement,value:6},range10:{...validMeasurement,value:2}}},raises,config).observationFields,{reps5:4});
  assert.deepEqual(parseAIDraft({measurements:{reps5:{value:4,start:2,end:2},range5:{value:2,start:2,end:2}}},raises,config).observationFields,{});

  const wallPress={...b,testId:PILOT_TESTS.find(t=>t.key==="wallPress")!.id,fps:3};
  const visibleSupport={leftImageArm:"visible_contact",rightImageArm:"visible_contact",backContact:true,wristsNeutral:true,start:2,end:3,reason:"Ambos antebrazos y manos contactan directamente con la pared."};
  const hiddenSupport={leftImageArm:"not_visible",rightImageArm:"not_visible",backContact:null,wristsNeutral:null,start:null,end:null,reason:"El contacto no se distingue; las sombras no lo confirman."};
  const wallEvidence={initial:{...visibleSupport,deficitAngleVisible:false},elevation:{...visibleSupport,start:2,end:8}};
  const hiddenWallEvidence={initial:{...hiddenSupport,deficitAngleVisible:false},elevation:{...hiddenSupport}};
  const wallMeasures={externalDeficit:{value:0,start:2,end:3},abduction:{value:160,start:8,end:8}};
  const parseWall=(wallPressEvidence:any,measurements:any=wallMeasures)=>parseAIDraft({measurements,wallPressEvidence},wallPress,config);
  assert.deepEqual(parseWall(wallEvidence).observationFields,{externalDeficit:0,abduction:160},"direct bilateral contact and a continuously supported elevation are measurable");
  assert.deepEqual(parseWall({...wallEvidence,initial:{...wallEvidence.initial,start:2,end:2}},{
    externalDeficit:{value:0,start:2,end:2},abduction:{value:125,start:4,end:4},
  }).observationFields,{externalDeficit:0,abduction:125},"static contact frames remain usable when the elevation path is covered");
  assert.deepEqual(parseWall(wallEvidence,{externalDeficit:wallMeasures.externalDeficit,abduction:{...validMeasurement,value:45}}).observationFields,{externalDeficit:0},"the established 0 or 90–180 abduction rubric still applies");
  assert.deepEqual(parseWall(wallEvidence,{abduction:wallMeasures.abduction}).observationFields,{},"abduction cannot survive a missing initial deficit");
  for(const evidence of [undefined,null,{},hiddenWallEvidence]){
    const unverified=parseWall(evidence);
    assert.deepEqual(unverified.observationFields,{},"missing or occluded support is not zero deficit or full elevation");
    assert(!unverified.findings.some(f=>f.text.startsWith("Estimación")),"rejected numbers must not remain as generated numeric findings");
    assert(unverified.limitations.some(x=>x.includes("0°")),"the rejected zero has an actionable reason");
  }
  const shadowInference=parseAIDraft({
    measurements:wallMeasures,wallPressEvidence:hiddenWallEvidence,
    notes:"El apoyo se infiere por las sombras, no se ve directamente.",
    findings:[{start:2,end:3,text:"Antebrazos verticales; contacto oculto."}],
    limitations:["No se ve directamente el contacto del antebrazo y de la mano."],
  },wallPress,config);
  assert.deepEqual(shadowInference.observationFields,{},"regression: shadow inference must not become 0° and 10/10");
  assert.match(shadowInference.notes,/sombras/,"useful narrative remains available without unsupported measurements");
  // The structured contact check can be useful clinical commentary even when
  // every numeric claim was rejected and the model supplied no extra findings.
  const unmeasurableComment="Se observa separación del antebrazo, pero la perspectiva no permite estimar los grados.";
  const timedUnmeasurable={...hiddenSupport,start:2,end:3,reason:"Separación visible; referencias angulares ocultas."};
  for(const wallPressEvidence of [
    {...hiddenWallEvidence,initial:{...timedUnmeasurable,deficitAngleVisible:false}},
    {...hiddenWallEvidence,elevation:timedUnmeasurable},
    {...hiddenWallEvidence,initial:{...timedUnmeasurable,start:2,end:2,deficitAngleVisible:false}},
  ]){
    const commentary=parseAIDraft({measurements:wallMeasures,wallPressEvidence,notes:unmeasurableComment,findings:[]},wallPress,config);
    assert.deepEqual(commentary.observationFields,{});
    assert.deepEqual(commentary.findings,[],"structured evidence does not duplicate findings or retain rejected numbers");
    assert.equal(commentary.notes,unmeasurableComment,"timed structured evidence keeps the comment available for incorporation");
    assert(!commentary.limitations.some(x=>x.includes("No hay observaciones con una referencia temporal")),"valid structured timing must not be reported as missing temporal evidence");
  }
  for(const wallPressEvidence of [
    undefined,null,{},hiddenWallEvidence,
    {...hiddenWallEvidence,initial:{...timedUnmeasurable,start:-1,deficitAngleVisible:false}},
    {...hiddenWallEvidence,elevation:{...timedUnmeasurable,end:25}},
    {...hiddenWallEvidence,elevation:{...timedUnmeasurable,start:4,end:3}},
    {...hiddenWallEvidence,elevation:{...timedUnmeasurable,start:"2"}},
    {...hiddenWallEvidence,elevation:{...timedUnmeasurable,reason:"   "}},
  ]){
    const unsupportedComment=parseAIDraft({measurements:wallMeasures,wallPressEvidence,notes:unmeasurableComment,findings:[]},wallPress,config);
    assert.equal(unsupportedComment.notes,"","bare notes need a valid timed observation or contact-evidence phase");
    assert(unsupportedComment.limitations.some(x=>x.includes("No hay observaciones con una referencia temporal")));
  }
  for(const change of [
    {leftImageArm:"visible_gap"},{rightImageArm:"visible_gap"},
    {leftImageArm:"not_visible"},{rightImageArm:"not_visible"},
    {leftImageArm:"inferred_contact"},{backContact:false},{backContact:null},
    {wristsNeutral:false},{wristsNeutral:null},{backContact:"true"},{wristsNeutral:1},
    {reason:""},{reason:"   "},{start:2.01},{end:2.99},
    {start:-1},{end:24.001},{start:4,end:3},{start:null},{end:null},
  ]){
    assert.deepEqual(parseWall({...wallEvidence,initial:{...wallEvidence.initial,...change}}).observationFields,{},
      "zero requires both supported arms, valid posture and relevant evidence: "+JSON.stringify(change));
  }
  const gapEvidence={initial:{...visibleSupport,leftImageArm:"visible_gap",deficitAngleVisible:true},elevation:{...hiddenSupport}};
  for(const value of [2,5,15]){
    assert.deepEqual(parseWall(gapEvidence,{externalDeficit:{...wallMeasures.externalDeficit,value},abduction:wallMeasures.abduction}).observationFields,{externalDeficit:value},
      "a visible positive deficit remains measurable independently and is never rounded to zero");
  }
  assert.deepEqual(parseWall({...gapEvidence,initial:{...gapEvidence.initial,leftImageArm:"visible_contact",rightImageArm:"visible_gap"}}).observationFields,{},"a visible gap on either arm contradicts a proposed zero");
  assert.deepEqual(parseWall({...gapEvidence,initial:{...gapEvidence.initial,leftImageArm:"not_visible",rightImageArm:"visible_gap"}},{
    externalDeficit:{...wallMeasures.externalDeficit,value:15},abduction:null,
  }).observationFields,{externalDeficit:15},"one observable gap can support a positive deficit without inventing hidden contact");
  for(const change of [
    {leftImageArm:"not_visible"},{leftImageArm:"visible_contact"},{deficitAngleVisible:false},
    {deficitAngleVisible:"true"},{backContact:false},{wristsNeutral:false},{start:4,end:5},
  ]){
    assert.deepEqual(parseWall({...gapEvidence,initial:{...gapEvidence.initial,...change}},{
      externalDeficit:{...wallMeasures.externalDeficit,value:15},abduction:null,
    }).observationFields,{},"a positive number needs a visible gap and angular evidence: "+JSON.stringify(change));
  }
  for(const change of [
    {leftImageArm:"visible_gap"},{rightImageArm:"not_visible"},{backContact:false},
    {wristsNeutral:null},{reason:""},{start:4,end:8},{start:8,end:8},
    {start:2,end:7.99},{start:-1,end:8},{start:2,end:25},
  ]){
    assert.deepEqual(parseWall({...wallEvidence,elevation:{...wallEvidence.elevation,...change}}).observationFields,{externalDeficit:0},
      "initial contact does not establish uninterrupted support during elevation: "+JSON.stringify(change));
  }
  assert.deepEqual(parseWall(wallEvidence,{externalDeficit:wallMeasures.externalDeficit,abduction:{value:160,start:1,end:2}}).observationFields,{externalDeficit:0},"elevation evidence cannot come from before the confirmed initial posture");
  assert.deepEqual(parseWall({...wallEvidence,elevation:{...visibleSupport}},{externalDeficit:wallMeasures.externalDeficit,abduction:{value:0,start:2,end:3}}).observationFields,{externalDeficit:0,abduction:0},"confirmed initial support can evidence zero elevation without a fictional movement");
  assert.deepEqual(parseWall({...wallEvidence,elevation:hiddenSupport},{externalDeficit:wallMeasures.externalDeficit,abduction:{value:0,start:2,end:3}}).observationFields,{externalDeficit:0},"zero elevation also requires the prescribed support evidence");
  const wallInstruction=buildVideoInstruction(wallPress);
  assert.match(wallInstruction,/sombras/i);
  assert.match(wallInstruction,/redonde/i);
  assert.match(wallInstruction,/visible_contact/);

  for(const t of PILOT_TESTS){
    const desc=SHOULDER_VIDEO_TESTS[t.id];assert(desc,t.name+" has analysis support");
    const input={...b,testId:t.id,fps:desc.kind==="hold"?8:3};
    const instruction=buildVideoInstruction(input);
    if(desc.kind==="measurement"){
      const numericFields=t.fields.filter(f=>f.type==="number");
      assert.match(instruction,/measurements/);for(const f of numericFields)assert(instruction.includes(f.key));
      const fields=Object.fromEntries(numericFields.map(f=>[f.key,{...validMeasurement,value:f.min??0}]));
      assert.deepEqual(Object.keys(parseAIDraft({measurements:fields,...(t.key==="wallPress"?{wallPressEvidence:wallEvidence}:{})},input,config).observationFields).sort(),numericFields.map(f=>f.key).sort());
    }else if(desc.kind==="load"){
      assert.match(instruction,/No infieras cargas/);
      const proposed=parseAIDraft({notes:"Ocho repeticiones visibles.",findings:[{start:1,end:4,text:"Ejecución visible."}],measurements:{affectedKg:{...validMeasurement,value:99},referenceKg:{...validMeasurement,value:99}}},input,config);
      assert.deepEqual(proposed.observationFields,{});
      assert.equal(proposed.notes,"Ocho repeticiones visibles.");
      assert.equal(parseAIDraft({notes:"Sin evidencia"},input,config).notes,"");
    }
  }
  function verifySchema(node:any){
    if(!node||typeof node!=="object")return;
    for(const key of ["minimum","maximum","minLength","maxLength","maxItems","oneOf"])assert(!(key in node),"unsupported provider schema keyword: "+key);
    if(node.type==="object"){
      assert.equal(node.additionalProperties,false);
      assert.deepEqual([...node.required].sort(),Object.keys(node.properties).sort());
    }
    for(const value of Object.values(node))if(Array.isArray(value)){for(const child of value)verifySchema(child);}else verifySchema(value);
  }
  for(const test of PILOT_TESTS){
    const schema=buildVideoOutputSchema(test.id) as any,kind=SHOULDER_VIDEO_TESTS[test.id].kind;
    verifySchema(schema);
    const expected=["notes","findings","limitations",...(kind==="hold"?["hold","holdPositionVisible","lossOfPosition","stabilityVisible"]:kind==="measurement"?["measurements"]:[]),...(test.key==="wallPress"?["wallPressEvidence"]:[])];
    assert.deepEqual(Object.keys(schema.properties).sort(),expected.sort());
    if(kind==="hold"){
      assert(schema.properties.hold.anyOf.some((s:any)=>s.type==="null"));
      assert(schema.properties.lossOfPosition.anyOf.some((s:any)=>s.type==="null"));
      assert.equal(schema.properties.stabilityVisible.type,"boolean");
      assert.equal(schema.properties.holdPositionVisible.type,"boolean");
    }
    if(kind==="measurement"){
      const fields=test.fields.filter(f=>f.type==="number");
      assert.deepEqual(Object.keys(schema.properties.measurements.properties).sort(),fields.map(f=>f.key).sort());
      if(test.key==="wallPress"){
        const evidence=schema.properties.wallPressEvidence;
        assert.deepEqual(Object.keys(evidence.properties).sort(),["elevation","initial"]);
        for(const position of ["initial","elevation"]){
          const props=evidence.properties[position].properties;
          assert.deepEqual(props.leftImageArm.enum,["visible_contact","visible_gap","not_visible"]);
          assert.deepEqual(props.rightImageArm.enum,["visible_contact","visible_gap","not_visible"]);
        }
      }
      for(const field of fields){
        const union=schema.properties.measurements.properties[field.key].anyOf;
        assert(union.some((s:any)=>s.type==="null"));
        const measured=union.find((s:any)=>s.type==="object");
        assert.deepEqual(Object.keys(measured.properties).sort(),["end","start","value"]);
        assert.equal(measured.properties.value.type,field.step===1?"integer":"number");
      }
    }
  }
  const q={...b,testId:"08f41761-3bfd-4172-8be8-0b860a0df414",fps:3};
  assert.equal(parseAIDraft({notes:"No verificable",findings:[]},q,config).notes,"");
  assert.deepEqual(parseAIDraft(response,q,config).observationFields,{});
  await assert.rejects(()=>readLimitedBody(new Request("https://local.invalid",{method:"POST",body:"[]",headers:{"Content-Type":"application/json","Content-Length":"9000000"}})),/grande/);
  assert.throws(()=>validateFrames({...b,sheets:[{times:[0],jpeg:"https://example.invalid/image.jpg"}]}));
  function fixtureJPEG(dimensions:string) {
    const f=spawnSync("ffmpeg",["-hide_banner","-loglevel","error","-f","lavfi","-i","color=gray:s="+dimensions,"-frames:v","1","-f","image2pipe","-c:v","mjpeg","pipe:1"],{maxBuffer:1024*1024});
    if(f.status!==0)throw Error("This offline SDK transport test needs ffmpeg for its synthetic JPEG fixture.");
    return f.stdout.toString("base64");
  }
  const jpeg=fixtureJPEG("1024x728");
  const detailJPEG=fixtureJPEG("1536x928"),portraitDetailJPEG=fixtureJPEG("864x1600");
  const detailSheets=Array.from({length:Math.ceil(b.duration/4)},(_,sheet)=>({
    jpeg:detailJPEG,times:Array.from({length:Math.min(4,Math.ceil(b.duration)-sheet*4)},(_,j)=>Math.min(sheet*4+j,b.duration-.01)),
  }));

  for(let i=0;i<b.duration*b.fps;i+=16)b.sheets.push({jpeg,times:Array.from({length:16},(_,j)=>(i+j)/b.fps)});
  validateFrames(b);
  const detailed:FrameRequest={...b,detailSheets};
  validateFrames(detailed);
  validateFrames({...detailed,detailSheets:detailSheets.map(s=>({...s,jpeg:portraitDetailJPEG}))});
  assert.match(buildVideoInstruction(detailed),/dos columnas|2.columns|2×2|2x2/i);
  assert.match(buildVideoInstruction(detailed),/1.*segundo|segundo.*1|un fotograma por segundo/i);
  assert.throws(()=>validateFrames({...detailed,detailSheets:[]}));
  assert.throws(()=>validateFrames({...detailed,detailSheets:null}));
  assert.throws(()=>validateFrames({...detailed,detailSheets:detailSheets.slice(1)}));
  assert.throws(()=>validateFrames({...detailed,detailSheets:[...detailSheets,detailSheets[0]]}));
  assert.throws(()=>validateFrames({...detailed,detailSheets:detailSheets.map(s=>({...s,jpeg}))}),"overview dimensions are not accepted as detail images");
  assert.throws(()=>validateFrames({...detailed,sheets:b.sheets.map(s=>({...s,jpeg:detailJPEG}))}),"detail images cannot masquerade as temporal overviews");
  assert.throws(()=>validateFrames({...detailed,detailSheets:detailSheets.map(s=>({...s,times:s.times.map(()=>0)}))}));
  assert.throws(()=>validateFrames({...detailed,detailSheets:[{...detailSheets[0],times:[0,1,2]},...detailSheets.slice(1)]}));
  assert.throws(()=>validateFrames({...detailed,detailSheets:[{...detailSheets[0],jpeg:detailJPEG.slice(0,-4)},...detailSheets.slice(1)]}));
  assert.throws(()=>validateFrames({...detailed,detailSheets:[{...detailSheets[0],jpeg:"https://example.invalid/private-frame"},...detailSheets.slice(1)]}));
  // Both streams use the same final-frame clamp, including near-integer clips.
  for(const duration of [.5,1.005,4.001,60]){
    const fps=3,frameCount=Math.ceil(duration*fps);
    const overview=Array.from({length:Math.ceil(frameCount/16)},(_,sheet)=>({jpeg,times:Array.from({length:Math.min(16,frameCount-sheet*16)},(_,j)=>Math.round(Math.min((sheet*16+j)/fps,duration-.01)*1000)/1000)}));
    const detail=Array.from({length:Math.ceil(Math.ceil(duration)/4)},(_,sheet)=>({jpeg:detailJPEG,times:Array.from({length:Math.min(4,Math.ceil(duration)-sheet*4)},(_,j)=>Math.round(Math.min(sheet*4+j,duration-.01)*1000)/1000)}));
    validateFrames({...detailed,testId:numeric.id,duration,fps,sheets:overview,detailSheets:detail});
  }
  // Insert valid JPEG comment segments to exercise byte budgets without real
  // footage. Each stream fits alone but the combined payload must be rejected.
  function paddedJPEG(base64:string,bytes:number){
    const source=Buffer.from(base64,"base64"),comments:Buffer[]=[];
    let remaining=Math.max(0,bytes-source.length);
    while(remaining>=4){const size=Math.min(remaining,65000),segment=Buffer.alloc(size,32);segment[0]=255;segment[1]=254;segment.writeUInt16BE(size-2,2);comments.push(segment);remaining-=size;}
    return Buffer.concat([source.subarray(0,2),...comments,source.subarray(2)]).toString("base64");
  }
  const paddedOverview=b.sheets.map(s=>({...s,jpeg:paddedJPEG(s.jpeg,190000)}));
  const paddedDetails=detailSheets.map(s=>({...s,jpeg:paddedJPEG(s.jpeg,130000)}));
  validateFrames({...b,sheets:paddedOverview});
  validateFrames({...detailed,detailSheets:paddedDetails});
  assert.throws(()=>validateFrames({...detailed,sheets:paddedOverview,detailSheets:paddedDetails}),"the total budget includes both image streams");
  assert.throws(()=>validateFrames({...detailed,detailSheets:[{...detailSheets[0],jpeg:paddedJPEG(detailJPEG,340000)},...detailSheets.slice(1)]}),"single detail-sheet byte limit");

  for(const t of PILOT_TESTS){
    const fps=SHOULDER_VIDEO_TESTS[t.id].kind==="hold"?8:3;
    const duration=1,times=Array.from({length:fps},(_,i)=>Math.round(i/fps*1000)/1000);
    validateFrames({...b,testId:t.id,duration,fps,sheets:[{jpeg,times}]});
  }
  assert.throws(()=>validateFrames({...b,sheets:[{...b.sheets[0],times:b.sheets[0].times.map(()=>0)},...b.sheets.slice(1)]}));
  const providerResponse={hold:response.hold,holdPositionVisible:response.holdPositionVisible,stabilityVisible:response.stabilityVisible,lossOfPosition:response.lossOfPosition,notes:response.notes,findings:response.findings,limitations:response.limitations};
  let requests=0,expectedInput:FrameRequest=b,expectedModel="claude-opus-5-5";
  let mockReply:any={content:[{type:"text",text:JSON.stringify(providerResponse)}],stop_reason:"end_turn"};
  const mock=createServer((req,res)=>{
    const chunks:Buffer[]=[];req.on("data",x=>chunks.push(Buffer.from(x)));req.on("end",()=>{
      const body=JSON.parse(Buffer.concat(chunks).toString());assert.equal(req.url,"/v1/messages");assert.equal(req.headers["x-api-key"],"synthetic-only");
      const parts=body.messages[0].content;
      assert.doesNotMatch(parts[0].text,/temblor|tremor|aboveEars|rangeVisible|inRangeSeconds/i);
      if(SHOULDER_VIDEO_TESTS[expectedInput.testId].kind==="hold")assert.match(parts[0].text,/lossOfPosition/);
      assert.equal(parts.filter((x:any)=>x.type==="image").length,expectedInput.sheets.length+(expectedInput.detailSheets?.length??0));
      assert.deepEqual(parts.filter((x:any)=>x.type==="image").map((x:any)=>x.source.data),[...expectedInput.sheets,...(expectedInput.detailSheets??[])].map(s=>s.jpeg));
      assert.equal(parts.find((x:any)=>x.type==="image").source.media_type,"image/jpeg");
      assert(!JSON.stringify(body).includes("synthetic-upload"));
      assert(!JSON.stringify(body).includes("2026-01-01T00:00:00.000Z"));
      assert.equal(body.model,expectedModel);
      assert.equal(body.max_tokens,16000);
      assert.deepEqual(body.output_config,{effort:"medium",format:{type:"json_schema",schema:buildVideoOutputSchema(expectedInput.testId)}});
      assert.equal(body.thinking,undefined,"Opus adaptive thinking must not be disabled or given a manual budget");
      assert.equal(body.tool_choice,undefined,"video output uses structured JSON, not an unsupported forced tool");
      assert.match(parts[0].text,/máximo de 8 observaciones/);
      assert.match(parts[0].text,/máximo de 5 limitaciones/);
      requests++;res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({
        id:"mock-only",type:"message",role:"assistant",model:"synthetic",usage:{input_tokens:20,output_tokens:12},...mockReply,
      }));
    });
  });mock.listen(0,"127.0.0.1");await once(mock,"listening");const addr=mock.address();assert(addr&&typeof addr==="object");
  const old=process.env.ANTHROPIC_API_KEY,oldUrl=process.env.ANTHROPIC_BASE_URL,oldModel=process.env.SHOULDER_VIDEO_AI_MODEL;
  async function rejected(reply:any,message:RegExp){
    mockReply=reply;const before=requests;
    await assert.rejects(()=>analyzeFrames(expectedInput,config),message);
    assert.equal(requests,before+1,"failed analysis does not automatically resend patient images");
  }
  try{process.env.ANTHROPIC_API_KEY="synthetic-only";process.env.ANTHROPIC_BASE_URL="http://127.0.0.1:"+addr.port;
    delete process.env.SHOULDER_VIDEO_AI_MODEL;
    const opusDraft=await analyzeFrames(b,config);
    assert.deepEqual(opusDraft.observationFields,d.observationFields);
    assert.equal(opusDraft.model,"synthetic","show the model returned by the provider, not the configured alias");
    mockReply={content:[{type:"text",text:JSON.stringify({...providerResponse,holdPositionVisible:false})}],stop_reason:"end_turn"};
    const notVisible=await analyzeFrames(b,config);
    assert.deepEqual(notVisible.observationFields,{});
    assert.equal(notVisible.hold,null);
    assert.deepEqual(notVisible.intervals,{lossOfPosition:null});
    mockReply={content:[{type:"text",text:JSON.stringify(providerResponse)}],stop_reason:"end_turn"};

    expectedInput=detailed;
    const detailedDraft=await analyzeFrames(detailed,config);
    assert.deepEqual(detailedDraft.observationFields,d.observationFields);
    expectedInput=b;

    // Model overrides are intentional; they must not silently fall back to Opus.
    expectedModel="claude-sonnet-4-6";process.env.SHOULDER_VIDEO_AI_MODEL=expectedModel;
    mockReply={content:[{type:"thinking",thinking:"",signature:"synthetic-signature"},{type:"text",text:JSON.stringify(providerResponse)}],stop_reason:"end_turn",model:"provider-resolved-test-model"};
    const overrideDraft=await analyzeFrames(b,config);
    assert.deepEqual(overrideDraft.observationFields,d.observationFields);
    assert.equal(overrideDraft.model,"provider-resolved-test-model");
    delete process.env.SHOULDER_VIDEO_AI_MODEL;expectedModel="claude-opus-5-5";
    // Opus may put empty/redacted thinking blocks before its JSON text.
    mockReply={content:[{type:"thinking",thinking:"",signature:"synthetic-signature"},{type:"redacted_thinking",data:"synthetic-redaction"},{type:"text",text:JSON.stringify(providerResponse)}],stop_reason:"end_turn"};
    assert.deepEqual((await analyzeFrames(b,config)).observationFields,d.observationFields);
    // Every analysis kind uses its own precise schema through the actual SDK.
    for(const test of PILOT_TESTS){
      const kind=SHOULDER_VIDEO_TESTS[test.id].kind,fps=kind==="hold"?8:3;
      expectedInput={...b,testId:test.id,duration:1,fps,sheets:[{jpeg,times:Array.from({length:fps},(_,i)=>i/fps)}]};
      const data={notes:"",findings:[],limitations:["No se puede medir con certeza."],
        ...(kind==="hold"?{hold:null,holdPositionVisible:false,lossOfPosition:null,stabilityVisible:false}:kind==="measurement"?{measurements:Object.fromEntries(test.fields.filter(f=>f.type==="number").map(f=>[f.key,null]))}:{}),
        ...(test.key==="wallPress"?{wallPressEvidence:hiddenWallEvidence}:{})};
      mockReply={content:[{type:"text",text:JSON.stringify(data)}],stop_reason:"end_turn"};
      const draft=await analyzeFrames(expectedInput,config);
      assert.deepEqual(draft.observationFields,{},"null measures never become zero");
      assert(draft.limitations.length>0);
    }
    // Validate the wall-press contact enum and required structure through the
    // actual provider SDK path, not only permissive raw parser fixtures.
    expectedInput=wallPress;
    const wallProviderResponse={notes:"Apoyo visible.",findings:[],limitations:[],measurements:wallMeasures,wallPressEvidence:wallEvidence};
    mockReply={content:[{type:"text",text:JSON.stringify(wallProviderResponse)}],stop_reason:"end_turn"};
    assert.deepEqual((await analyzeFrames(expectedInput,config)).observationFields,{externalDeficit:0,abduction:160});
    mockReply={content:[{type:"text",text:JSON.stringify({...wallProviderResponse,wallPressEvidence:hiddenWallEvidence})}],stop_reason:"end_turn"};
    assert.deepEqual((await analyzeFrames(expectedInput,config)).observationFields,{},"schema-valid uncertain contact cannot manufacture numeric confidence");
    for(const invalid of [
      {...wallProviderResponse,wallPressEvidence:undefined},
      {...wallProviderResponse,wallPressEvidence:null},
      {...wallProviderResponse,wallPressEvidence:{...wallEvidence,initial:{...wallEvidence.initial,leftImageArm:"inferred_contact"}}},
      {...wallProviderResponse,wallPressEvidence:{...wallEvidence,elevation:{...wallEvidence.elevation,rightImageArm:true}}},
      {...wallProviderResponse,wallPressEvidence:{...wallEvidence,initial:{...wallEvidence.initial,deficitAngleVisible:null}}},
      {...wallProviderResponse,wallPressEvidence:{...wallEvidence,elevation:{...wallEvidence.elevation,start:"2"}}},
    ])await rejected({content:[{type:"text",text:JSON.stringify(invalid)}],stop_reason:"end_turn"},/campos no válidos/);
    expectedInput=b;
    const text=JSON.stringify(providerResponse),cut=Math.floor(text.length/2);
    mockReply={content:[{type:"text",text:text.slice(0,cut)},{type:"text",text:text.slice(cut)}],stop_reason:"end_turn"};
    assert.deepEqual((await analyzeFrames(b,config)).observationFields,d.observationFields);
    for(const invalid of ["","No se pudo analizar.","\u0060\u0060\u0060json\n"+text+"\n\u0060\u0060\u0060","Aquí está el análisis: "+text,text.slice(0,-1)]){
      await rejected({content:[{type:"text",text:invalid}],stop_reason:"end_turn"},/formato incorrecto/);
    }
    await rejected({content:[],stop_reason:"end_turn"},/formato incorrecto/);
    for(const invalid of [{},[],null,{...providerResponse,notes:7},{...providerResponse,findings:"none"},{...providerResponse,limitations:[4]},{...providerResponse,hold:{start:1}},{...providerResponse,stabilityVisible:"true"},{...providerResponse,holdPositionVisible:"true"},{...providerResponse,holdPositionVisible:null},Object.fromEntries(Object.entries(providerResponse).filter(([key])=>key!=="holdPositionVisible")),{...providerResponse,lossOfPosition:{}},{...providerResponse,unexpected:0}]){
      await rejected({content:[{type:"text",text:JSON.stringify(invalid)}],stop_reason:"end_turn"},/campos no válidos/);
    }
    expectedInput={...b,testId:numeric.id,fps:3};
    for(const invalid of [
      {notes:"",findings:[],limitations:[],measurements:{}},
      {notes:"",findings:[],limitations:[],measurements:{leftProgress:3,rightProgress:null}},
      {notes:"",findings:[],limitations:[],measurements:{leftProgress:{value:70,start:1},rightProgress:null}},
      {notes:"",findings:[],limitations:[],measurements:{leftProgress:null,rightProgress:null,affectedKg:10}},
    ])await rejected({content:[{type:"text",text:JSON.stringify(invalid)}],stop_reason:"end_turn"},/campos no válidos/);
    expectedInput=b;
    for(const incomplete of [text,text.slice(0,-1)]){
      await rejected({content:[{type:"text",text:incomplete}],stop_reason:"max_tokens"},/interrumpido antes de terminar/);
    }
    await rejected({content:[{type:"text",text}],stop_reason:"refusal"},/no ha podido revisar/);
    for(const reason of ["pause_turn","tool_use","stop_sequence",null]){
      await rejected({content:[{type:"text",text}],stop_reason:reason},/no ha completado la respuesta/);
    }
  }finally{if(old===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=old;
    if(oldUrl===undefined)delete process.env.ANTHROPIC_BASE_URL;else process.env.ANTHROPIC_BASE_URL=oldUrl;
    if(oldModel===undefined)delete process.env.SHOULDER_VIDEO_AI_MODEL;else process.env.SHOULDER_VIDEO_AI_MODEL=oldModel;mock.close();}
  console.log("PASS: Opus default/override, provider model provenance, thinking blocks, all 15 tests, overview/detail transport and combined budgets, static-frame and partial measures, bilateral wall-contact and continuous-elevation evidence, positive deficits without false zeros, bounded evidence, strict schemas, complete-response checks, null ≠ zero and offline SDK failures without automatic resends");
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
