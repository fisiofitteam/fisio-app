import assert from "node:assert/strict";
import { serveAssessmentMedia, PLAYBACK_RANGE_BYTES as chunk } from "../lib/assessment-media";

const url=new URL("https://fixture.private.blob.vercel-storage.com/assessments/v/test.mov");
const token="synthetic-only";
const full=chunk*2+80;
const calls:{method:string;range:string;fresh:boolean;signal:AbortSignal|null}[]=[];
let mode:"normal"|"ignore"|"wrong"|"aligned"|"missing"|"text"|"busy"="normal",headFallback=false,cancelled=0,bytesRead=0;
const bytes=(at:number,n:number)=>Uint8Array.from({length:n},(_,i)=>(at+i)%251);
function stream(start:number,end:number){
 let off=start;
 return new ReadableStream<Uint8Array>({pull(c){if(off>end){c.close();return;}const n=Math.min(16384,end-off+1);c.enqueue(bytes(off,n));off+=n;bytesRead+=n;},cancel(){cancelled++;}},{highWaterMark:0});
}
const server=async(input:any,opts:any)=>{
 const h=new Headers(opts.headers),range=h.get("range")??"",method=opts.method,fresh=new URL(input).searchParams.get("cache")==="0";
 assert.equal(h.get("authorization"),"Bearer "+token);assert.equal(h.get("accept-encoding"),"identity");
 assert.equal(opts.redirect,"error");assert.equal(opts.cache,"no-store");calls.push({method,range,fresh,signal:opts.signal});
 if(mode==="missing"||mode==="busy"||mode==="text")return new Response("untrusted origin details",{status:mode==="missing"?404:mode==="busy"?429:403});
 const base={"content-type":"application/octet-stream"};
 if(method==="HEAD")return new Response(null,headFallback?{status:405}:{headers:{...base,"content-length":String(full)}});
 if(!range||mode==="ignore")return new Response(stream(0,full-1),{headers:{...base,"content-length":String(full)}});
 const m=/^bytes=(\d*)-(\d*)$/.exec(range);assert(m);
 const off=m[1]?Number(m[1]):Math.max(0,full-Number(m[2]));
 const start=mode==="wrong"?off+1:mode==="aligned"?Math.max(0,off-8):off,end=m[1]&&m[2]?Math.min(full-1,Number(m[2])+(mode==="aligned"?8:0)):full-1;
 if(start>=full||end<start)return new Response(null,{status:416,headers:{"content-range":"bytes */"+full}});
 return new Response(stream(start,end),{status:206,headers:{...base,"content-range":"bytes "+start+"-"+end+"/"+full,"content-length":String(end-start+1)}});
};
const request=(range?:string,method="GET",ifRange?:string)=>new Request("https://fixture.test/api/assessments/media?id=v",{method,headers:{...(range?{Range:range}:{}),...(ifRange?{"If-Range":ifRange}:{})}});
const serve=(r:Request,download=false)=>serveAssessmentMedia(r,url,token,r.method==="HEAD",download,'"today"');
const original=globalThis.fetch;
async function main(){
 globalThis.fetch=server;
 const probe=request("bytes=0-1"),p=await serve(probe);assert.equal(p.status,206);assert.equal(p.headers.get("content-range"),"bytes 0-1/"+full);
 assert.deepEqual(new Uint8Array(await p.arrayBuffer()),bytes(0,2));assert.equal(calls.at(-1)?.signal,probe.signal);
 assert.equal(p.headers.get("accept-ranges"),"bytes");assert.equal(p.headers.get("content-type"),"video/quicktime");
 assert.equal(p.headers.get("content-disposition"),"inline");assert(!JSON.stringify([...p.headers]).includes(token));
 const seek=await serve(request("bytes=8388578-"));assert.equal(seek.status,206);assert.deepEqual(new Uint8Array(await seek.arrayBuffer()),bytes(8388578,full-8388578));
 const first=await serve(request("bytes=0-"));assert.equal(first.headers.get("content-range"),"bytes 0-"+(chunk-1)+"/"+full);assert.equal(calls.at(-1)?.range,"bytes=0-"+(chunk-1));
 await first.body!.cancel();
 const later=await serve(request("bytes="+chunk+"-"));assert.equal(later.headers.get("content-length"),String(chunk));await later.body!.cancel();
 const suffix=await serve(request("bytes=-11"));assert.deepEqual(new Uint8Array(await suffix.arrayBuffer()),bytes(full-11,11));
 const largeSuffix=await serve(request("bytes=-"+(chunk+10)));assert.equal(largeSuffix.headers.get("content-range"),"bytes "+(full-chunk-10)+"-"+(full-11)+"/"+full);await largeSuffix.body!.cancel();
 const before=bytesRead;const head=await serve(request("bytes=0-1","HEAD"));assert.equal(head.status,200);assert.equal(head.headers.get("content-length"),String(full));assert.equal(head.body,null);assert.equal(bytesRead,before);
 headFallback=true;const hm=await serve(request(undefined,"HEAD"));headFallback=false;assert.equal(hm.headers.get("content-length"),String(full));assert.equal(hm.body,null);
 for(const range of ["bytes=-","bytes=10-3","bytes=-0","bytes=0-1,5-10","bytes="+full+"-"]){const s=await serve(request(range));assert.equal(s.status,416);assert.equal(s.headers.get("content-range"),"bytes */"+full);}
 const originalFile=await serve(request(),true);assert.equal(originalFile.status,200);assert.equal(originalFile.headers.get("content-length"),String(full));assert.match(originalFile.headers.get("content-disposition")!,/^attachment;.*\.mov/);
 assert.equal(new Uint8Array(await originalFile.arrayBuffer()).length,full);
 const resume=await serve(request("bytes=1-"),true);assert.equal(resume.headers.get("content-length"),String(full-1));await resume.body!.cancel();
 const replace=await serve(request("bytes=0-1","GET",'"previous"'));assert.equal(replace.status,200);await replace.body!.cancel();
 mode="ignore";const mark=bytesRead,oldCancels=cancelled;const fixed=await serve(request("bytes=0-1"));assert.equal(fixed.status,206);assert.deepEqual(new Uint8Array(await fixed.arrayBuffer()),bytes(0,2));assert(bytesRead-mark<=16384);assert(cancelled>=oldCancels+2);assert.equal(calls.at(-1)?.fresh,true);
 const beyond=await serve(request("bytes="+(full-40)+"-"));assert.equal(beyond.status,502);
 mode="aligned";const aligned=await serve(request("bytes=25-36"));assert.equal(aligned.headers.get("content-range"),"bytes 25-36/"+full);assert.deepEqual(new Uint8Array(await aligned.arrayBuffer()),bytes(25,12));
 mode="wrong";assert.equal((await serve(request("bytes=3-7"))).status,502);
 for(const [m,code] of [["missing",404],["busy",503],["text",502]] as const){mode=m;const res=await serve(request("bytes=0-1"));assert.equal(res.status,code);assert.equal(await res.text(),"");assert.equal(res.headers.get("cache-control"),"private, no-store");}
 console.log("PASS: Safari probe, bounded seek/reassembly, suffix, HEAD without transfer, retry/cancellation on ignored ranges, upstream errors, private full download");
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{globalThis.fetch=original;});
