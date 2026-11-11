"use client";

import { useEffect, useRef, useState } from "react";
import { analyzeShoulderVideo } from "@/lib/shoulder-video-client";
import { revisionKey, runShoulderQueue, type ProposalEntry, type ShoulderVideoSource } from "@/lib/shoulder-analysis-queue";

type Active={key:string;index:number;total:number;message:string};
export function useShoulderVideoQueue(){
  const controller=useRef<AbortController|null>(null);
  const [active,setActive]=useState<Active|null>(null);
  const [entries,setEntries]=useState<Record<string,ProposalEntry>>({});
  const [outcomes,setOutcomes]=useState<Record<string,"ready"|"error">>({});
  const [lastRun,setLastRun]=useState<ShoulderVideoSource[]>([]),[stopped,setStopped]=useState(false);
  useEffect(()=>()=>{controller.current?.abort();controller.current=null;},[]);
  async function run(sources:ShoulderVideoSource[]){
    if(controller.current||!sources.length)return;
    const job=new AbortController();controller.current=job;
    setLastRun(sources);setOutcomes({});setStopped(false);
    try{
      await runShoulderQueue(sources,job.signal,(source,report,signal)=>analyzeShoulderVideo({
        sessionId:source.sessionId,testId:source.testId,videoId:source.id,uploadedAt:source.uploadedAt,
      },report,signal),event=>{
        if(controller.current!==job)return;
        const key=revisionKey(event.source);
        switch(event.type){
          case "start":
            setActive({key,index:event.index+1,total:sources.length,message:"Preparando vídeo…"});
            setEntries(p=>({...p,[key]:{...p[key],error:undefined}}));break;
          case "progress":setActive(a=>a?.key===key?{...a,message:event.message}:a);break;
          case "ready":setOutcomes(p=>({...p,[key]:"ready"}));setEntries(p=>({...p,[key]:{draft:event.draft}}));break;
          case "error":setOutcomes(p=>({...p,[key]:"error"}));setEntries(p=>({...p,[key]:{...p[key],error:event.message}}));break;
        }
      });
    }finally{
      if(controller.current===job){controller.current=null;setActive(null);setStopped(job.signal.aborted);}
    }
  }
  function applied(source:ShoulderVideoSource){const key=revisionKey(source);setEntries(p=>({...p,[key]:{...p[key],applied:true}}));}
  return {active,entries,outcomes,lastRun,stopped,run,applied,stop:()=>controller.current?.abort()};
}
