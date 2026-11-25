"use client";
import {useCallback,useEffect,useRef,useState} from "react";
export type Track=(type:string,target:string,value?:number)=>void;
const PREFERENCE="ff-metodo-consent",VERSION="metodo-2026-11-25-v1";
export function readPreference(){return document.cookie.split("; ").find(v=>v.startsWith(PREFERENCE+"="))?.split("=")[1]||"";}
export function useMetodoAnalytics(preview=false){
  const [choice,setChoice]=useState<"unknown"|"accepted"|"denied">("unknown"),[preferences,setPreferences]=useState(false),[error,setError]=useState("");
  const session=useRef(""),ready=useRef(false),enabled=useRef(false),sent=useRef(new Set<string>()),generation=useRef(0);
  const track=useCallback<Track>((type,target,value=0)=>{if(preview||!enabled.current||!ready.current||readPreference()!=="v1.accepted")return;const key=`${type}:${target}:${value}`;if(sent.current.has(key))return;sent.current.add(key);void fetch("/api/metodo/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:session.current,type,target,value}),keepalive:true}).catch(()=>{});},[preview]);
  const register=useCallback(async()=>{
    if(preview)return;const epoch=++generation.current;enabled.current=true;ready.current=false;
    if(!session.current)session.current=crypto.randomUUID();
    const params=new URLSearchParams(location.search),source:Record<string,string>={};for(const key of ["utm_source","utm_medium","utm_campaign","utm_content","utm_term"]){const value=params.get(key);if(value)source[key]=value;}
    let ref="direct";try{const host=new URL(document.referrer).hostname;ref=(host==="instagram.com"||host.endsWith(".instagram.com"))?"instagram":(host==="facebook.com"||host.endsWith(".facebook.com"))?"facebook":host.includes("google.")?"google":"other";}catch{}source.referrer=ref;
    try{const r=await fetch("/api/metodo/visit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({consent:true,version:VERSION,sessionId:session.current,source})});if(epoch===generation.current&&enabled.current)ready.current=r.ok;else if(!enabled.current)await fetch("/api/metodo/visit",{method:"DELETE"});}catch{/* Failure does not interrupt the page or the contact button. */}
  },[preview]);
  useEffect(()=>{if(preview){setChoice("denied");return;}const pref=readPreference();if(pref==="v1.accepted"){setChoice("accepted");void register();}else if(pref==="v1.denied")setChoice("denied");return()=>{generation.current++;enabled.current=false;};},[preview,register]);
  const choose=useCallback(async(accepted:boolean)=>{
    setError("");setChoice(accepted?"accepted":"denied");setPreferences(false);document.cookie=`${PREFERENCE}=v1.${accepted?"accepted":"denied"}; Path=/; Max-Age=15552000; SameSite=Lax${location.protocol==="https:"?"; Secure":""}`;
    if(accepted){await register();return;}
    generation.current++;enabled.current=false;ready.current=false;sent.current.clear();session.current="";
    try{const r=await fetch("/api/metodo/visit",{method:"DELETE"});if(!r.ok)throw Error();}catch{setError("La medición está desactivada. No hemos podido borrar el historial anterior; puedes volver a intentarlo en Preferencias de privacidad.");}
  },[register]);
  useEffect(()=>{if(preview||choice!=="accepted")return;let queued=false;const handle=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;const height=document.documentElement.scrollHeight-innerHeight;const depth=height>0?(scrollY/height)*100:100;for(const n of [25,50,75,100])if(depth>=n-0.5)track("scroll","page",n);});};window.addEventListener("scroll",handle,{passive:true});return()=>window.removeEventListener("scroll",handle);},[choice,preview,track]);
  return{track,choice,showPreferences:!preview&&(choice==="unknown"||preferences),openPreferences:()=>setPreferences(true),choose,error};
}
