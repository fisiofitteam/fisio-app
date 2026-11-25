// Optional browser regression: NODE_PATH=/path/to/playwright/node_modules node scripts/test-recording-audio-browser.cjs
// All capture sources are synthetic. No desktop, camera, microphone or speech service is accessed.
const fs=require("fs"),path=require("path"),http=require("http"),ts=require("typescript"),assert=require("node:assert/strict");
const {chromium}=require("playwright");
const compile=file=>ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}}).outputText;
(async()=>{
 const server=http.createServer((_,response)=>response.end("<!doctype html><html><body><div id='root'></div></body></html>"));
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 let browser;
 try {
  browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:["--autoplay-policy=no-user-gesture-required"]});
  const page=await browser.newPage();await page.goto("http://127.0.0.1:"+server.address().port);
  await page.addScriptTag({content:"window.modules={};"});
  for(const [file,id] of [["lib/recording-rules.ts","./recording-rules"],["lib/recording-audio.ts","./recording-audio"],["lib/browser-recorder.ts","recorder"]]) {
   await page.addScriptTag({content:`(()=>{const exports={};const require=id=>window.modules[id];${compile(file)};window.modules[${JSON.stringify(id)}]=exports;})();`});
  }
  const output=await page.evaluate(async()=>{
   const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
   const context=new AudioContext();await context.resume();
   const tone=frequency=>{const oscillator=context.createOscillator();oscillator.frequency.value=frequency;const gain=context.createGain();gain.gain.value=.1;const dest=context.createMediaStreamDestination();oscillator.connect(gain).connect(dest);oscillator.start();return {oscillator,stream:dest.stream}};
   const mic=tone(440),client=tone(880),canvas=document.createElement("canvas");canvas.width=640;canvas.height=360;
   const paint=setInterval(()=>{const c=canvas.getContext("2d");c.fillStyle="#124";c.fillRect(0,0,640,360);c.fillStyle="#fff";c.fillText("Synthetic call "+performance.now(),20,20)},40);
   const video=canvas.captureStream(24),screen=new MediaStream([...video.getVideoTracks(),...client.stream.getAudioTracks()]);
   const camera=canvas.captureStream(24),devices=new MediaStream([...camera.getVideoTracks(),...mic.stream.getAudioTracks()]);
   navigator.mediaDevices.getDisplayMedia=async()=>screen;navigator.mediaDevices.getUserMedia=async()=>devices;
   let finish,latest;const finished=new Promise(resolve=>finish=resolve);
   const recording=await window.modules.recorder.startBrowserRecording({camera:true,microphone:true,systemAudio:true,onTick(){},onAudioState:s=>latest=s,onFinish:finish,onError:message=>{throw Error(message)}});
   await delay(1100);const levels=latest;recording.pause();await delay(150);recording.resume();await delay(350);
   client.stream.getAudioTracks()[0].stop();await delay(600);const disconnected=latest.shared.state;
   recording.stop();const result=await finished;
   const decoded=await context.decodeAudioData(await result.blob.arrayBuffer());const data=decoded.getChannelData(0);
   // Spectral projection of the recorded first half-second verifies BOTH inputs in the saved video.
   const amplitude=frequency=>{let re=0,im=0;const start=Math.floor(decoded.sampleRate*.15),count=Math.min(Math.floor(decoded.sampleRate*.5),data.length-start);for(let i=0;i<count;i++){const angle=2*Math.PI*frequency*i/decoded.sampleRate;re+=data[start+i]*Math.cos(angle);im+=data[start+i]*Math.sin(angle)}return 2*Math.hypot(re,im)/count};
   const answer={bytes:result.blob.size,duration:result.durationSeconds,mime:result.blob.type,mic:amplitude(440),client:amplitude(880),other:amplitude(1500),levels,disconnected,reason:result.reason,closed:[...screen.getTracks(),...devices.getTracks(),recording.audioTrack].every(t=>t.readyState==="ended")};
   clearInterval(paint);mic.oscillator.stop();client.oscillator.stop();await context.close();return answer;
  });
  assert(output.bytes>1000);assert(output.mic>.03);assert(output.client>.03);assert(output.other<.015);assert(output.levels.microphone.level>.02);assert(output.levels.shared.level>.02);assert.equal(output.disconnected,"ended");assert.equal(output.closed,true);assert.match(output.reason,/perdió una fuente/);
  console.log("PASS: Chrome saved video has microphone 440Hz and client 880Hz, independent activity meters, camera composition, pause/resume, source loss and track cleanup.",JSON.stringify(output));
  // Render the actual launcher without an account or production API.
  await page.addScriptTag({path:path.join(path.dirname(require.resolve("react/package.json")),"umd/react.development.js")});
  await page.addScriptTag({path:path.join(path.dirname(require.resolve("react-dom/package.json")),"umd/react-dom.development.js")});
  await page.addScriptTag({content:`window.workspace={busy:false,recovering:false,supported:true,speechSupported:true,mixedSpeechSupported:true,start:o=>window.started=o};(()=>{const exports={};const require=id=>id==='react'?React:{useRecordingWorkspace:()=>window.workspace};${compile("components/ScreenRecorder.tsx")};ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(exports.ScreenRecorder,{enabled:true,professionalId:'synthetic'}));})();`});
  await page.getByRole("button",{name:/Videollamada/}).click();
  assert(await page.getByLabel("Incluir audio del cliente / ordenador").isChecked());
  await page.getByLabel("Micrófono",{exact:true}).uncheck();
  assert(await page.getByLabel("Transcribir audio").isEnabled());
  await page.getByRole("button",{name:/Empezar a grabar/}).click();
  const started=await page.evaluate(()=>window.started);assert.equal(started.systemAudio,true);assert.equal(started.microphone,false);assert.equal(started.transcribe,true);
  console.log("PASS: videollamada preset and shared-audio-only transcription launcher.");
 } finally {await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
