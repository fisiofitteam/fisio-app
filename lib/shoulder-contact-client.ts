"use client";
import { MAX_CLIP_SECONDS, MAX_FRAME_REQUEST_BYTES, type VideoInput } from "./shoulder-analysis-types";
import {
  WALL_PRESS_TEST_ID, MAX_CONTACT_PROBE_EDGE, MAX_CONTACT_PROBE_JPEG_BYTES,
  type CropRegion, type ContactProbeVariant, type ContactProbeInput, type ContactProbeResult,
} from "./shoulder-contact-analysis-types";

export type ContactVariant = {
  variant:ContactProbeVariant; jpeg:string; times:number[];
  width:number; height:number; quality:number;
};
export type PreparedContactComparison = {
  duration:number; width:number; height:number; time:number;
  sourceKey:string; variants:ContactVariant[];
};
const sourceKey=(input:VideoInput)=>JSON.stringify([input.sessionId,input.testId,input.videoId,input.uploadedAt]);
const endpoint=(input:VideoInput)=>"/api/shoulder-pilot/"+encodeURIComponent(input.sessionId)+"/analyze";
const cancelled=()=>new Error("Comparación cancelada.");
function checkAbort(signal?:AbortSignal){if(signal?.aborted)throw cancelled();}
function mediaEvent(video:HTMLVideoElement,event:string,act:()=>void,signal?:AbortSignal){
  return new Promise<void>((resolve,reject)=>{
    let timer:ReturnType<typeof setTimeout>;
    const clean=()=>{clearTimeout(timer);video.removeEventListener(event,done);video.removeEventListener("error",bad);signal?.removeEventListener("abort",cancel);};
    const done=()=>{clean();resolve();};
    const bad=()=>{clean();reject(new Error("No se ha podido leer el vídeo para comparar el fotograma."));};
    const cancel=()=>{clean();reject(cancelled());};
    timer=setTimeout(bad,15000);
    video.addEventListener(event,done,{once:true});video.addEventListener("error",bad,{once:true});signal?.addEventListener("abort",cancel,{once:true});
    if(signal?.aborted){cancel();return;}
    try{act();}catch{bad();}
  });
}
function encode(canvas:HTMLCanvasElement,limit:number,qualities:readonly number[]){
  for(const quality of qualities){
    const jpeg=canvas.toDataURL("image/jpeg",quality).split(",")[1]||"";
    if(jpeg&&jpeg.length<=Math.floor(limit))return {jpeg,quality};
  }
  throw new Error("El fotograma supera el límite de detalle. Elige un recorte más pequeño.");
}
function checkedCrop(crop:CropRegion):CropRegion {
  if(!crop||![crop.x,crop.y,crop.width,crop.height].every(Number.isFinite)||crop.x<0||crop.y<0||crop.width<=0||crop.height<=0||crop.x+crop.width>1.000001||crop.y+crop.height>1.000001)
    throw new Error("El recorte debe estar dentro del vídeo y tener ancho y alto mayores que cero.");
  return {x:crop.x,y:crop.y,width:Math.min(crop.width,1-crop.x),height:Math.min(crop.height,1-crop.y)};
}

// Produces previews only. No provider call, result persistence or clinical mutation.
export async function prepareContactComparison(input:VideoInput,time:number,crop:CropRegion,signal?:AbortSignal):Promise<PreparedContactComparison>{
  checkAbort(signal);
  const revision=Date.parse(input.uploadedAt),region=checkedCrop(crop);
  if(input.testId!==WALL_PRESS_TEST_ID||!input.videoId||!input.sessionId||!Number.isFinite(revision))throw new Error("Esta entrega no admite la comparación de contacto.");
  if(!Number.isInteger(time)||time<0)throw new Error("Selecciona un segundo entero del vídeo.");
  const preflight=new URL(endpoint(input),window.location.origin);
  for(const key of ["videoId","testId","uploadedAt"] as const)preflight.searchParams.set(key,input[key]);
  const check=await fetch(preflight.toString(),{cache:"no-store",credentials:"same-origin",signal});
  const access=await check.json().catch(()=>null);
  if(!check.ok||access?.available!==true)throw new Error(access?.error||"Comparación no disponible.");
  checkAbort(signal);
  const video=document.createElement("video"),canvases:HTMLCanvasElement[]=[];
  video.preload="auto";video.muted=true;video.playsInline=true;
  try{
    await mediaEvent(video,"loadeddata",()=>{video.src="/api/assessments/media?id="+encodeURIComponent(input.videoId)+"&v="+revision;video.load();},signal);
    const duration=video.duration,width=video.videoWidth,height=video.videoHeight;
    if(!Number.isFinite(duration)||duration<0.5||duration>MAX_CLIP_SECONDS+0.01||!width||!height)throw new Error("La comparación requiere un vídeo de entre 0,5 y 60 segundos con imagen disponible.");
    if(time>Math.max(0,duration-.01))throw new Error("El segundo seleccionado está fuera del tramo muestreable del vídeo.");
    const createCanvas=(w:number,h:number)=>{const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;canvases.push(canvas);return canvas;};
    const context=(canvas:HTMLCanvasElement)=>{const ctx=canvas.getContext("2d",{alpha:false});if(!ctx)throw new Error("El navegador no permite extraer el fotograma.");return ctx;};
    const landscape=width>=height,tileW=landscape?768:432,tileH=landscape?432:768;
    const mosaic=createCanvas(tileW*2,(tileH+32)*2),ctx=context(mosaic);
    ctx.fillStyle="#101315";ctx.fillRect(0,0,mosaic.width,mosaic.height);
    // This is the exact detail-sheet geometry, cadence and JPEG budget used by the general analysis.
    const detailScale=Math.min(tileW/width,tileH/height),imgW=Math.round(width*detailScale),imgH=Math.round(height*detailScale);
    const first=Math.floor(time/4)*4,times=Array.from({length:Math.min(4,Math.ceil(duration)-first)},(_,i)=>Math.round(Math.min(first+i,Math.max(0,duration-.01))*1000)/1000);
    const variants:ContactVariant[]=[];let frame:ContactVariant|undefined,cropped:ContactVariant|undefined;
    const started=Date.now();
    const single=(variant:"frame"|"crop",sx:number,sy:number,sw:number,sh:number):ContactVariant=>{
      // Keep the source geometry; the label fits within the provider's final edge limit.
      const scale=Math.min(1,MAX_CONTACT_PROBE_EDGE/sw,(MAX_CONTACT_PROBE_EDGE-32)/sh);
      const outW=Math.max(1,Math.round(sw*scale)),outH=Math.max(1,Math.round(sh*scale));
      const canvas=createCanvas(outW,outH+32),draw=context(canvas);
      draw.fillStyle="#101315";draw.fillRect(0,0,canvas.width,canvas.height);
      draw.drawImage(video,sx,sy,sw,sh,0,0,outW,outH);
      draw.fillStyle="#fff";draw.font="22px monospace";draw.fillText(time.toFixed(3)+" s",5,outH+24);
      const encoded=encode(canvas,MAX_CONTACT_PROBE_JPEG_BYTES,[.9,.85,.75,.65]);
      return {variant,times:[time],width:canvas.width,height:canvas.height,...encoded};
    };
    for(let i=0;i<times.length;i++){
      checkAbort(signal);
      if(Date.now()-started>150000)throw new Error("La lectura está tardando demasiado. Prueba de nuevo con otro instante.");
      const t=times[i];
      if(video.currentTime!==t)await mediaEvent(video,"seeked",()=>{video.currentTime=t;},signal);
      checkAbort(signal);
      const x=(i%2)*tileW,y=Math.floor(i/2)*(tileH+32);
      ctx.drawImage(video,x+(tileW-imgW)/2,y+(tileH-imgH)/2,imgW,imgH);
      ctx.fillStyle="#fff";ctx.font="22px monospace";ctx.fillText(t.toFixed(3)+" s",x+5,y+tileH+24);
      if(t===time){
        frame=single("frame",0,0,width,height);
        const sx=Math.floor(region.x*width),sy=Math.floor(region.y*height);
        const sw=Math.min(width-sx,Math.round(region.width*width)),sh=Math.min(height-sy,Math.round(region.height*height));
        if(sw<32||sh<32)throw new Error("El recorte es demasiado pequeño. Incluye los brazos y una referencia de la pared.");
        cropped=single("crop",sx,sy,sw,sh);
      }
    }
    checkAbort(signal);
    const budget=Math.min(450000,(MAX_FRAME_REQUEST_BYTES*.62-30000)/Math.ceil(Math.ceil(duration)/4));
    variants.push({variant:"mosaic",times,width:mosaic.width,height:mosaic.height,...encode(mosaic,budget,[.85,.75,.65,.55,.45,.35])});
    if(!frame||!cropped)throw new Error("No se ha extraído el instante seleccionado.");
    variants.push(frame,cropped);
    return {duration,width,height,time,sourceKey:sourceKey(input),variants};
  }finally{
    video.removeAttribute("src");video.load();video.remove();
    for(const canvas of canvases){canvas.width=0;canvas.height=0;}
  }
}

export async function runContactProbe(input:VideoInput,prepared:PreparedContactComparison,variant:ContactVariant,signal?:AbortSignal,options?:{approach:"strict"|"spatial";effort:"medium"|"high"}):Promise<ContactProbeResult>{
  checkAbort(signal);
  if(prepared.sourceKey!==sourceKey(input)||!prepared.variants.includes(variant))throw new Error("Las imágenes no corresponden a esta entrega. Prepáralas de nuevo.");
  const body:ContactProbeInput={mode:"contact-probe",videoId:input.videoId,testId:input.testId,uploadedAt:input.uploadedAt,
    duration:prepared.duration,time:prepared.time,variant:variant.variant,times:variant.times,jpeg:variant.jpeg,...(options?{approach:options.approach,effort:options.effort}:{})};
  const response=await fetch(endpoint(input),{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},signal,body:JSON.stringify(body)});
  const result=await response.json().catch(()=>null);
  if(!response.ok||!result?.probe)throw new Error(result?.error||"No se ha podido comparar el contacto en este fotograma.");
  if(result.probe.time!==prepared.time)throw new Error("La respuesta no corresponde al instante seleccionado.");
  checkAbort(signal);
  return result.probe as ContactProbeResult;
}
