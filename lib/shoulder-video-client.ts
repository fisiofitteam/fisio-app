"use client";
import {
  SHOULDER_VIDEO_TESTS, canAnalyzeShoulderTest, MAX_CLIP_SECONDS, MAX_FRAME_REQUEST_BYTES,
  type ShoulderAIDraft, type VideoInput, type FrameSheet,
} from "./shoulder-analysis-types";
export { canAnalyzeShoulderTest };
export type { ShoulderAIDraft };

function mediaEvent(video:HTMLVideoElement,event:string,act:()=>void,signal?:AbortSignal) {
  return new Promise<void>((resolve,reject)=>{
    let timer:ReturnType<typeof setTimeout>;
    const clean=()=>{clearTimeout(timer);video.removeEventListener(event,done);video.removeEventListener("error",bad);signal?.removeEventListener("abort",cancel);};
    const done=()=>{clean();resolve();};
    const bad=()=>{clean();reject(new Error("El navegador no ha podido leer este vídeo. Puedes revisarlo manualmente."));};
    const cancel=()=>{clean();reject(new Error("Análisis cancelado."));};
    timer=setTimeout(bad,15000);
    video.addEventListener(event,done,{once:true});video.addEventListener("error",bad,{once:true});
    signal?.addEventListener("abort",cancel,{once:true});
    if(signal?.aborted){cancel();return;}
    try{act();}catch{bad();}
  });
}
function encodeSheet(canvas:HTMLCanvasElement,budget:number,qualities:readonly number[]):string {
  const limit=Math.min(450000,Math.floor(budget));
  for(const quality of qualities){
    const jpeg=canvas.toDataURL("image/jpeg",quality).split(",")[1]||"";
    if(jpeg&&jpeg.length<=limit)return jpeg;
  }
  throw new Error("El vídeo supera el límite de imágenes para analizarlo con detalle. Recorta el fragmento o valora manualmente.");
}
export async function analyzeShoulderVideo(input:VideoInput, progress?:(message:string)=>void, signal?:AbortSignal):Promise<ShoulderAIDraft> {
  const revision=Date.parse(input.uploadedAt);
  if(!canAnalyzeShoulderTest(input.testId)||!input.videoId||!Number.isFinite(revision))throw new Error("Esta entrega no admite análisis automático.");
  const endpoint="/api/shoulder-pilot/"+encodeURIComponent(input.sessionId)+"/analyze";
  const url=new URL(endpoint,window.location.origin);
  for(const key of ["videoId","testId","uploadedAt"] as const)url.searchParams.set(key,input[key]);
  // Check staff access, source revision and provider BEFORE reading the private media.
  const check=await fetch(url.toString(),{cache:"no-store",credentials:"same-origin",signal});
  const session=await check.json().catch(()=>null);
  if(!check.ok||session?.available!==true)throw new Error(session?.error||"Análisis no disponible.");
  const v=document.createElement("video");
  v.preload="auto";v.muted=true;v.playsInline=true;
  const fps=SHOULDER_VIDEO_TESTS[input.testId].kind==="hold"?8:3;
  let canvas:HTMLCanvasElement|undefined,detailCanvas:HTMLCanvasElement|undefined;
  try{
    progress?.("Preparando fotogramas del vídeo…");
    await mediaEvent(v,"loadeddata",()=>{v.src="/api/assessments/media?id="+encodeURIComponent(input.videoId)+"&v="+revision;v.load();},signal);
    const duration=v.duration;
    if(!Number.isFinite(duration)||duration<0.5||duration>MAX_CLIP_SECONDS+0.01)
      throw new Error("Para el borrador IA utiliza un vídeo de entre 0,5 y 60 segundos. El vídeo original sigue disponible para revisión manual.");
    if(!v.videoWidth||!v.videoHeight)throw new Error("No se puede medir este vídeo.");
    const landscape=v.videoWidth>=v.videoHeight;
    const tileW=landscape?256:176,tileH=landscape?160:240;
    const scale=Math.min(tileW/v.videoWidth,tileH/v.videoHeight);
    const imgW=Math.round(v.videoWidth*scale),imgH=Math.round(v.videoHeight*scale);
    canvas=document.createElement("canvas");canvas.width=tileW*4;canvas.height=(tileH+22)*4;
    const ctx=canvas.getContext("2d",{alpha:false});if(!ctx)throw new Error("El navegador no permite extraer imágenes.");
    const detailW=landscape?768:432,detailH=landscape?432:768;
    const detailScale=Math.min(detailW/v.videoWidth,detailH/v.videoHeight);
    const detailImgW=Math.round(v.videoWidth*detailScale),detailImgH=Math.round(v.videoHeight*detailScale);
    detailCanvas=document.createElement("canvas");detailCanvas.width=detailW*2;detailCanvas.height=(detailH+32)*2;
    const detailCtx=detailCanvas.getContext("2d",{alpha:false});if(!detailCtx)throw new Error("El navegador no permite extraer imágenes ampliadas.");
    const sheets:FrameSheet[]=[],detailSheets:FrameSheet[]=[];let times:number[]=[],detailTimes:number[]=[];let used=0;
    const count=Math.ceil(duration*fps),detailCount=Math.ceil(duration),started=Date.now();
    const maxSheet=(MAX_FRAME_REQUEST_BYTES*.38-30000)/Math.ceil(count/16);
    const maxDetailSheet=(MAX_FRAME_REQUEST_BYTES*.62-30000)/Math.ceil(detailCount/4);
    const addSheet=(target:FrameSheet[],image:HTMLCanvasElement,sampleTimes:number[],budget:number,qualities:readonly number[])=>{
      const jpeg=encodeSheet(image,budget,qualities);
      used+=jpeg.length;if(used>MAX_FRAME_REQUEST_BYTES-20000)throw new Error("El fragmento supera el límite de análisis.");
      target.push({times:sampleTimes,jpeg});
    };
    for(let i=0;i<count;i++){
      if(signal?.aborted)throw new Error("Análisis cancelado.");
      if(Date.now()-started>150000)throw new Error("La lectura está tardando demasiado. Usa un vídeo más corto o revisa manualmente.");
      const t=Math.min(i/fps,Math.max(0,duration-.01));
      if(i>0)await mediaEvent(v,"seeked",()=>{v.currentTime=t;},signal);
      const slot=i%16,x=(slot%4)*tileW,y=Math.floor(slot/4)*(tileH+22);
      if(!slot){ctx.fillStyle="#101315";ctx.fillRect(0,0,canvas.width,canvas.height);}
      ctx.drawImage(v,x+(tileW-imgW)/2,y+(tileH-imgH)/2,imgW,imgH);
      ctx.fillStyle="#fff";ctx.font="16px monospace";ctx.fillText(t.toFixed(3)+" s",x+3,y+tileH+17);
      times.push(Math.round(t*1000)/1000);
      // Reuse the current seek: one enlarged frame per second supplements, never replaces, the temporal overview.
      if(i%fps===0){
        const index=i/fps,detailSlot=index%4,dx=(detailSlot%2)*detailW,dy=Math.floor(detailSlot/2)*(detailH+32);
        if(!detailSlot){detailCtx.fillStyle="#101315";detailCtx.fillRect(0,0,detailCanvas.width,detailCanvas.height);}
        detailCtx.drawImage(v,dx+(detailW-detailImgW)/2,dy+(detailH-detailImgH)/2,detailImgW,detailImgH);
        detailCtx.fillStyle="#fff";detailCtx.font="22px monospace";detailCtx.fillText(t.toFixed(3)+" s",dx+5,dy+detailH+24);
        detailTimes.push(Math.round(t*1000)/1000);
        if(detailSlot===3||index===detailCount-1){
          addSheet(detailSheets,detailCanvas,detailTimes,maxDetailSheet,[.85,.75,.65,.55,.45,.35]);detailTimes=[];
        }
      }
      if(slot===15||i===count-1){
        addSheet(sheets,canvas,times,maxSheet,[.69,.56,.43,.34]);times=[];
        progress?.("Preparando fotogramas: "+Math.round((i+1)/count*100)+" %");
      }
    }
    progress?.("Analizando la secuencia. El resultado será un borrador…");
    const body=JSON.stringify({videoId:input.videoId,testId:input.testId,uploadedAt:input.uploadedAt,duration,fps,sheets,detailSheets});
    if(new TextEncoder().encode(body).byteLength>MAX_FRAME_REQUEST_BYTES)throw new Error("El fragmento supera el límite de análisis.");
    const res=await fetch(endpoint,{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},signal,body});
    const result=await res.json().catch(()=>null);if(!res.ok||!result?.draft)throw new Error(result?.error||"Análisis no disponible; puedes continuar manualmente.");
    return result.draft as ShoulderAIDraft;
  }finally{
    v.removeAttribute("src");v.load();v.remove();
    if(canvas){canvas.width=0;canvas.height=0;}
    if(detailCanvas){detailCanvas.width=0;detailCanvas.height=0;}
  }
}
