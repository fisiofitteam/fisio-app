// Isolated Chrome profile, synthetic media, intercepted FisioFit pages/APIs. No real credentials or recordings.
const fs=require("fs"),path=require("path"),os=require("os"),assert=require("node:assert/strict"),esbuild=require("esbuild");
const {chromium}=require("playwright");
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){for(let i=0;i<50;i++){const value=await fn();if(value)return value;await delay(200)}throw Error("Timed out: "+label)}
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),"fisiofit-extension-test-")),extension=path.resolve("extensions/recorder/dist");
 const options={headless:true,executablePath:process.env.CHROME_PATH,args:["--disable-extensions-except="+extension,"--load-extension="+extension,"--autoplay-policy=no-user-gesture-required","--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream"]};
 let context;
 try {
  context=await chromium.launchPersistentContext(profile,options);
  const worker=context.serviceWorkers()[0]||await context.waitForEvent("serviceworker");const id=new URL(worker.url()).host;
  let page=await context.newPage();await page.goto("chrome-extension://"+id+"/controller.html");
  const send=(type,extra={})=>page.evaluate(message=>chrome.runtime.sendMessage({target:"worker",...message}),{type,...extra});
  assert.equal((await send("prepare")).ok,true);
  const root=await context.browser().newBrowserCDPSession();
  const target=await until(async()=> (await root.send("Target.getTargets")).targetInfos.find(t=>t.url==="chrome-extension://"+id+"/offscreen.html"),"offscreen target");
  const {sessionId}=await root.send("Target.attachToTarget",{targetId:target.targetId,flatten:false});let requestId=0;
  async function evaluate(expression){const request=++requestId;return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{root.off("Target.receivedMessageFromTarget",listener);reject(Error("Offscreen evaluate timeout"))},15000);
   const listener=event=>{if(event.sessionId!==sessionId)return;const result=JSON.parse(event.message);if(result.id!==request)return;clearTimeout(timer);root.off("Target.receivedMessageFromTarget",listener);if(result.error||result.result?.exceptionDetails)reject(Error(JSON.stringify(result)));else resolve(result.result.result?.value)};
   root.on("Target.receivedMessageFromTarget",listener);root.send("Target.sendMessageToTarget",{sessionId,message:JSON.stringify({id:request,method:"Runtime.evaluate",params:{expression,awaitPromise:true,returnByValue:true}})}).catch(reject);
  })}
  await evaluate(`(async()=>{
   const context=new AudioContext();await context.resume();
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
   setInterval(()=>{const ctx=canvas.getContext('2d');ctx.fillStyle='#172e3c';ctx.fillRect(0,0,640,360);ctx.fillStyle='#fbbf24';ctx.fillText('Synthetic FisioFit '+performance.now(),20,30)},40);
   const tone=frequency=>{const oscillator=context.createOscillator();oscillator.frequency.value=frequency;const gain=context.createGain();gain.gain.value=.1;const destination=context.createMediaStreamDestination();oscillator.connect(gain).connect(destination);oscillator.start();return destination.stream.getAudioTracks()[0]};
   navigator.mediaDevices.getUserMedia=async constraints=>{
    const desktop=constraints.video?.mandatory?.chromeMediaSource==='desktop';
    return new MediaStream([...(constraints.video?canvas.captureStream(24).getVideoTracks():[]),...(constraints.audio?[tone(desktop?880:440)]:[])]);
   };return true;
  })()`);
  const missing=await send("start",{streamId:"synthetic",camera:false,microphone:true,systemAudio:true,canRequestAudioTrack:false,transcribe:false});assert.match(missing.error,/Compartir audio/);
  const started=await send("start",{streamId:"synthetic",camera:true,microphone:true,systemAudio:true,canRequestAudioTrack:true,transcribe:false});assert.equal(started.ok,true,JSON.stringify(started));
  await until(async()=> (await send("status")).elapsed>=1,"recording");await page.close();
  await delay(1300);page=await context.newPage();await page.goto("chrome-extension://"+id+"/controller.html");
  const active=await send("status");assert.equal(active.phase,"recording");assert(active.elapsed>=2);assert(active.audio.microphone.level>.02);assert(active.audio.shared.level>.02);
  await page.getByRole("button",{name:"Pausar",exact:true}).click();assert.equal((await send("status")).phase,"paused");
  await until(async()=>await page.getByRole("button",{name:"Reanudar",exact:true}).isVisible(),"pause UI");await page.getByRole("button",{name:"Reanudar",exact:true}).click();await delay(350);
  await page.getByRole("button",{name:/Terminar/}).click();const final=await until(async()=>{const s=await send("status");return s.phase==="preview"&&s.drafts[0]},"finished draft");
  const file=await send("download",{id:final.id});assert(file.url);
  const spectrum=await page.evaluate(async url=>{const audio=new AudioContext(),decoded=await audio.decodeAudioData(await(await fetch(url)).arrayBuffer()),data=decoded.getChannelData(0);function amplitude(f){let re=0,im=0;const start=Math.floor(decoded.sampleRate*.2),count=Math.floor(decoded.sampleRate*.5);for(let i=0;i<count;i++){const angle=2*Math.PI*f*i/decoded.sampleRate;re+=data[start+i]*Math.cos(angle);im+=data[start+i]*Math.sin(angle)}return 2*Math.hypot(re,im)/count}const result={microphone:amplitude(440),client:amplitude(880)};await audio.close();return result},file.url);
  assert(spectrum.microphone>.03&&spectrum.client>.03,JSON.stringify(spectrum)); console.log("PASS: offscreen survives panel closure; camera, both audio sources and pause/resume.",JSON.stringify(spectrum));
  await page.setViewportSize({width:470,height:740});await page.getByRole("button",{name:"Guardar en FisioFit",exact:true}).waitFor();await page.screenshot({path:"/tmp/fisiofit-extension-preview.png",fullPage:true});
  await context.close();context=await chromium.launchPersistentContext(profile,options);
  page=await context.newPage();await page.goto("chrome-extension://"+id+"/controller.html");assert((await send("status")).drafts.some(d=>d.id===final.id),"finished recording must survive browser restart");
  // Bundle the actual receiver; only the remote Blob upload is replaced with a controlled double.
  const bundle=await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{ExtensionRecordingImport}from'./components/ExtensionRecordingImport';createRoot(document.getElementById('root')).render(React.createElement(ExtensionRecordingImport,{actor:{id:'fixture-pro',fullName:'Equipo de prueba'},patients:[{id:'fixture-patient',fullName:'Paciente de prueba'}],folders:[{id:'fixture-folder',name:'Equipo'}]}));`,resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'},plugins:[{name:"test-upload",setup(build){build.onResolve({filter:/^@vercel\/blob\/client$/},()=>({path:"upload",namespace:"fixture"}));build.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:"export async function upload(){window.uploadCalls=(window.uploadCalls||0)+1;return {}}"}));}}]});
  let reservations=0,confirmations=0;
  await context.route("https://app.fisiofitteam.com/**",async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.pathname==="/api/recordings"&&request.method()==="POST"){reservations++;const body=request.postDataJSON();assert.equal(body.patientId,"fixture-patient");assert.equal(body.folderId,"fixture-folder");return route.fulfill({status:201,json:{id:"fixture-recording",pathname:"professional-recordings/fixture"}})}
   if(url.pathname==="/api/recordings/fixture-recording"&&request.method()==="POST"){confirmations++;return route.fulfill({status:confirmations===1?503:200,json:confirmations===1?{error:"Fallo temporal de confirmación"}:{ok:true}})}
   return route.fulfill({status:200,contentType:"text/html",body:"<!doctype html><html><body><div id='root'></div></body></html>"});
  });
  const exported=await send("export",{id:final.id});assert.equal(exported.ok,true,JSON.stringify(exported));const app=await until(async()=>context.pages().find(p=>p.url().startsWith("https://app.fisiofitteam.com/")),"receiver page");await app.waitForLoadState();
  // Chrome-created tabs can send the first navigation before Playwright attaches its route.
  // Navigate the same bound tab through the fixture after attachment (no real session).
  await app.goto("https://app.fisiofitteam.com/grabador-extension"+new URL(app.url()).hash);app.on("pageerror",error=>console.error("Receiver error:",error.message));
  const hash=new URL(app.url()).hash;
  await app.addScriptTag({content:bundle.outputFiles[0].text});await app.getByRole("button",{name:"Recibir grabación de la extensión"}).click();
  await app.getByLabel("Título",{exact:true}).waitFor();await app.getByLabel("Título",{exact:true}).fill("Prueba de extensión");await app.getByRole("combobox",{name:/Carpeta/}).selectOption("fixture-folder");await app.getByRole("combobox",{name:/Paciente/}).selectOption("fixture-patient");
  // Same capability on a different tab must be rejected, even on the allowed origin.
  const other=await context.newPage();await other.goto("https://app.fisiofitteam.com/grabador-extension");const params=new URLSearchParams(hash.slice(1));
  const denied=await other.evaluate(({id,transfer})=>new Promise(resolve=>chrome.runtime.sendMessage(id,{type:"metadata",transfer},resolve)),{id,transfer:params.get("transfer")});assert(denied.error);await other.close();
  await app.getByRole("button",{name:"Guardar en FisioFit",exact:true}).click();await app.getByText("Fallo temporal de confirmación",{exact:true}).waitFor();
  assert((await send("status")).drafts.some(d=>d.id===final.id),"failed server confirmation must preserve extension copy");
  await app.getByRole("button",{name:"Confirmar guardado",exact:true}).click();await app.getByRole("heading",{name:"Grabación guardada",exact:true}).waitFor();
  assert.equal(reservations,1);assert.equal(confirmations,2);assert.equal(await app.evaluate(()=>window.uploadCalls),1);
  assert(!(await send("status")).drafts.some(d=>d.id===final.id),"ack after confirmed upload removes local extension copy");
  console.log("PASS: real MV3/offscreen recording survives closed controls; two audio sources in saved MP4; pause/resume; IndexedDB survives browser restart; exact-tab transfer; receiver folder/patient; failed upload confirmation preserves copy and retries without duplicate upload; successful ack cleans draft.",JSON.stringify(spectrum));
 } finally {await context?.close();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1});
