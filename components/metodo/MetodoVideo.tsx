"use client";
import {useEffect,useRef,useState} from "react";
import Image from "next/image";
import {youtubeId} from "@/lib/metodo/content";
import {viewedProgress} from "@/lib/metodo/events";
import type {Track} from "./useMetodoAnalytics";
type Player={getCurrentTime:()=>number;getDuration:()=>number;getPlayerState:()=>number;destroy:()=>void;getIframe:()=>HTMLIFrameElement};
declare global{interface Window{YT?:{Player:new(node:HTMLElement,options:Record<string,unknown>)=>Player};onYouTubeIframeAPIReady?:()=>void}}
let youtubePromise:Promise<void>|undefined;
function youtubeApi(){
  if(window.YT?.Player)return Promise.resolve();
  if(!youtubePromise)youtubePromise=new Promise<void>((resolve,reject)=>{
    const previous=window.onYouTubeIframeAPIReady;const timer=setTimeout(()=>{youtubePromise=undefined;reject(Error("No se pudo cargar YouTube."));},15000);
    window.onYouTubeIframeAPIReady=()=>{previous?.();clearTimeout(timer);resolve();};
    const script=document.createElement("script");script.src="https://www.youtube.com/iframe_api";script.async=true;script.onerror=()=>{clearTimeout(timer);youtubePromise=undefined;reject(Error("No se pudo cargar YouTube."));};document.head.appendChild(script);
  });return youtubePromise;
}
export function MetodoVideo({url,poster,title,target,track}:{url:string;poster?:string;title:string;target:string;track:Track}){
  const [active,setActive]=useState(false),[error,setError]=useState(false);const mount=useRef<HTMLDivElement>(null),last=useRef(-1),intervals=useRef<Array<[number,number]>>([]),trackRef=useRef(track);
  trackRef.current=track;const id=youtubeId(url);
  const progress=(current:number,duration:number,ended=false)=>{const p=viewedProgress(intervals.current,last.current,current,duration);last.current=current;for(const n of [25,50,75,100])if(p>=n||(ended&&n===100&&p>=98))trackRef.current("video_progress",target,n);};
  useEffect(()=>{if(!active||!id||!mount.current)return;let disposed=false,player:Player|undefined,timer:ReturnType<typeof setInterval>|undefined;
    void youtubeApi().then(()=>{if(disposed||!mount.current)return;const slot=document.createElement("div");mount.current.replaceChildren(slot);
      player=new window.YT!.Player(slot,{host:"https://www.youtube-nocookie.com",videoId:id,width:"100%",height:"100%",playerVars:{playsinline:1,rel:0,autoplay:0,origin:location.origin},events:{onReady:()=>{player?.getIframe().setAttribute("title",title);},onStateChange:(e:{data:number})=>{if(e.data===1){last.current=player?.getCurrentTime()??-1;trackRef.current("video_start",target);}else if(e.data===0&&player)progress(player.getCurrentTime(),player.getDuration(),true);else last.current=-1;},onError:()=>setError(true)}});
      timer=setInterval(()=>{if(player?.getPlayerState()===1)progress(player.getCurrentTime(),player.getDuration());},1000);
    }).catch(()=>{if(!disposed)setError(true);});
    return()=>{disposed=true;if(timer)clearInterval(timer);player?.destroy();};
    // Media identity controls the player; tracking callback is read from a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[active,id,target,url]);
  if(!active)return <div className="mf-video-cover">{poster&&<Image src={poster} alt="" loading="lazy" width={900} height={600} sizes="(max-width: 700px) 100vw, 50vw"/>}<button type="button" onClick={()=>{setActive(true);if(!["hero","introduction"].includes(target))track("case_open",target);}} aria-label={`Reproducir: ${title}`}><span className="mf-play" aria-hidden="true">▶</span><span>{title}</span></button>{id&&<small>Al pulsar, cargas el reproductor de YouTube. <a href="/metodo/privacidad">Privacidad</a></small>}</div>;
  return <div className="mf-video-active">{error?<p>No hemos podido cargar el vídeo. <a href={url} target="_blank" rel="noopener noreferrer">Verlo en otra pestaña</a></p>:id?<div ref={mount} className="mf-embed"/>:<video controls playsInline preload="metadata" poster={poster||undefined} aria-label={title} onPlay={e=>{last.current=e.currentTarget.currentTime;track("video_start",target);}} onPause={()=>{last.current=-1;}} onSeeking={()=>{last.current=-1;}} onTimeUpdate={e=>{const v=e.currentTarget;if(!v.paused&&!v.seeking)progress(v.currentTime,v.duration);}} onEnded={e=>progress(e.currentTarget.currentTime,e.currentTarget.duration,true)} onError={()=>setError(true)}><source src={url}/></video>}</div>;
}
