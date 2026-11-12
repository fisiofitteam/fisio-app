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
  try{
    progress?.("Preparando fotogramas del vídeo…");
    await mediaEvent(v,"loadeddata",()=>{v.src="/api/assessments/media?id="+encodeURIComponent(input.videoId)+"&v="+revision;v.load();},signal);
    const duration=v.duration;
    if(!Number.isFinite(duration)||duration<0.5||duration>MAX_CLIP_SECONDS+0.01)
      throw new Error("Para el borrador IA utiliza un vídeo de entre 0,5 y 60 segundos. El vídeo original sigue disponible para revisión manual.");
    if(!v.videoWidth||!v.videoHeight)throw new Error("No se puede medir este vídeo.");
    const tileW=v.videoWidth>=v.videoHeight?256:176,tileH=v.videoWidth>=v.videoHeight?160:240;
    const scale=Math.min(tileW/v.videoWidth,tileH/v.videoHeight);
    const imgW=Math.round(v.videoWidth*scale),imgH=Math.round(v.videoHeight*scale);
    const canvas=document.createElement("canvas");canvas.width=tileW*4;canvas.height=(tileH+22)*4;
    const ctx=canvas.getContext("2d",{alpha:false});if(!ctx)throw new Error("El navegador no permite extraer imágenes.");
    const sheets:FrameSheet[]=[];let times:number[]=[];let used=0;
    const count=Math.ceil(duration*fps),started=Date.now();
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
      if(slot===15||i===count-1){
        const maxSheet=Math.floor((MAX_FRAME_REQUEST_BYTES-30000)/Math.ceil(count/16));
        let jpeg="";
        for(const quality of [.69,.56,.43,.34]){jpeg=canvas.toDataURL("image/jpeg",quality).split(",")[1]||"";if(jpeg.length<=maxSheet)break;}
        if(!jpeg||jpeg.length>maxSheet)throw new Error("Vídeo demasiado complejo para el muestreo. Recorta el fragmento o valora manualmente.");
        used+=jpeg.length;if(used>MAX_FRAME_REQUEST_BYTES-20000)throw new Error("El fragmento supera el límite de análisis.");
        sheets.push({times,jpeg});times=[];
        progress?.("Preparando fotogramas: "+Math.round((i+1)/count*100)+" %");
      }
    }
    progress?.("Analizando la secuencia. El resultado será un borrador…");
    const res=await fetch(endpoint,{method:"POST",credentials:"same-origin",cache:"no-store",
      headers:{"Content-Type":"application/json"},signal,body:JSON.stringify({
        videoId:input.videoId,testId:input.testId,uploadedAt:input.uploadedAt,duration,fps,sheets,
      })});
    const result=await res.json().catch(()=>null);if(!res.ok||!result?.draft)throw new Error(result?.error||"Análisis no disponible; puedes continuar manualmente.");
    return result.draft as ShoulderAIDraft;
  }finally{v.removeAttribute("src");v.load();v.remove();}
}
