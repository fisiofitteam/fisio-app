// Keep open browser requests small enough to abandon cheaply on a seek. A normal
// GET (and a resumed download) can stream the complete entity, without buffering.
export const PLAYBACK_RANGE_BYTES = 4 * 1024 * 1024;
type RangeSpec = { start: number; end?: number } | { suffix: number };
type Part = { start: number; end: number; total: number };
const decimal = (s: string | null) => s !== null && /^\d+$/.test(s) && Number.isSafeInteger(Number(s)) ? Number(s) : null;
const common = () => new Headers({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
export function mediaFailure(status: number, total?: number) {
  const h = common();
  if (status === 416) { h.set("Accept-Ranges", "bytes"); if (total !== undefined) h.set("Content-Range", "bytes */" + total); }
  return new Response(null, {status, headers:h});
}
function parseRange(raw: string): RangeSpec | null {
  const m = /^bytes=(\d*)-(\d*)$/i.exec(raw.trim());
  if (!m) return null;
  if (!m[1]) { const suffix = decimal(m[2]); return suffix && suffix > 0 ? {suffix} : null; }
  const start = decimal(m[1]), end = decimal(m[2]);
  if (start === null || (m[2] && (end === null || end < start))) return null;
  return {start, ...(end === null ? {} : {end})};
}
function readPart(h: Headers): Part | null {
  const m = /^bytes (\d+)-(\d+)\/(\d+)$/i.exec(h.get("content-range") || "");
  if (!m) return null;
  const [start,end,total] = m.slice(1).map(decimal);
  if (start === null || end === null || total === null || end < start || end >= total) return null;
  const length=h.get("content-length");
  return length === null || decimal(length) === end-start+1 ? {start,end,total} : null;
}
function span(range: RangeSpec, total: number, cap: number): Part | null {
  const start = "suffix" in range ? Math.max(0,total-range.suffix) : range.start;
  if (start >= total) return null;
  const end = Math.min(total-1,"end" in range && range.end !== undefined ? range.end : total-1,start+cap-1);
  return {start,end,total};
}
function abortBody(r: Response){ if(r.body)void r.body.cancel().catch(()=>{}); }
function originFailure(r: Response) {
  abortBody(r);
  const unsatisfied = /^bytes \*\/(\d+)$/i.exec(r.headers.get("content-range") || "");
  if (r.status === 416) return mediaFailure(416,unsatisfied ? decimal(unsatisfied[1]) ?? undefined : undefined);
  if (r.status === 404 || r.status === 410) return mediaFailure(404);
  return mediaFailure(r.status === 429 || r.status === 503 ? 503 : r.status === 504 ? 504 : 502);
}
function headersFor(r:Response,url:URL,download:boolean,etag?:string){
  const h=common(), ext=url.pathname.split(".").pop()?.toLowerCase();
  const declared=(r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const type=["video/mp4","video/quicktime","video/webm"].includes(declared) ? declared
    : ext==="mov"?"video/quicktime":ext==="webm"?"video/webm":ext==="mp4"?"video/mp4":"application/octet-stream";
  h.set("Content-Type",type);
  h.set("Accept-Ranges","bytes");
  h.set("Content-Disposition",download?'attachment; filename="video-test.'+(type==="video/quicktime"?"mov":type==="video/webm"?"webm":type==="video/mp4"?"mp4":"bin")+'"':"inline");
  if(etag)h.set("ETag",etag);
  return h;
}
// Only for a CDN which ignored a range even without its cache. Cancel upstream as
// soon as the requested bytes are delivered; never discard an entire large video for a seek.
function slicePrefix(body:ReadableStream<Uint8Array>,start:number,length:number){
  const reader=body.getReader();let skip=start,left=length;
  return new ReadableStream<Uint8Array>({
    async pull(out){
      try{
        while(left){
          const {done,value}=await reader.read();
          if(done)throw new Error("Secuencia de vídeo incompleta.");
          if(skip>=value.byteLength){skip-=value.byteLength;continue;}
          const piece=value.subarray(skip,Math.min(value.byteLength,skip+left));skip=0;left-=piece.byteLength;
          if(piece.length)out.enqueue(piece);
          if(left===0){out.close();void reader.cancel().catch(()=>{});}
          return;
        }
      }catch(e){out.error(e);void reader.cancel().catch(()=>{});}
    },
    cancel(){return reader.cancel();}
  });
}
export async function serveAssessmentMedia(req:Request,url:URL,token:string,headOnly:boolean,download:boolean,etag?:string):Promise<Response>{
  const fetchOrigin=(method:"GET"|"HEAD",range?:string,fresh=false)=>{
    const target=new URL(url);if(fresh)target.searchParams.set("cache","0");
    return fetch(target,{method,headers:{Authorization:"Bearer "+token,"Accept-Encoding":"identity",...(range?{Range:range}:{})},
      cache:"no-store",redirect:"error",signal:req.signal});
  };
  const raw=req.headers.get("range"), ifRange=req.headers.get("if-range");
  const wantsRange=!headOnly && raw!==null && (!ifRange || ifRange===etag);
  const range=wantsRange?parseRange(raw!):null;
  const cap=download?Number.MAX_SAFE_INTEGER:PLAYBACK_RANGE_BYTES;
  try {
    // HEAD never starts the transfer. Only ask separately for the total when it is
    // required for an invalid or unusually large suffix range.
    if(headOnly || wantsRange && (!range || "suffix" in range && range.suffix>cap)){
      let meta=await fetchOrigin("HEAD");
      if(meta.status===405 || meta.status===501 || meta.ok && decimal(meta.headers.get("content-length"))===null){
        abortBody(meta);meta=await fetchOrigin("GET","bytes=0-0");
      }
      if(!meta.ok)return originFailure(meta);
      const total=meta.status===206?readPart(meta.headers)?.total??null:decimal(meta.headers.get("content-length"));
      const h=headersFor(meta,url,download,etag);abortBody(meta);
      if(headOnly){
        if(total!==null)h.set("Content-Length",String(total));
        return new Response(null,{status:200,headers:h});
      }
      if(!range)return mediaFailure(416,total??undefined);
      if(total===null)return mediaFailure(502);
      const part=span(range,total,cap);if(!part)return mediaFailure(416,total);
      return await getRange("bytes="+part.start+"-"+part.end);
    }
    if(range){
      const header="suffix" in range?"bytes=-"+range.suffix:"bytes="+range.start+"-"+(download?range.end??"":Math.min(range.end??Number.MAX_SAFE_INTEGER,range.start+cap-1));
      return await getRange(header);
    }
    const r=await fetchOrigin("GET");
    if(r.status!==200||!r.body)return originFailure(r);
    if((r.headers.get("content-encoding")||"identity").toLowerCase()!=="identity"){abortBody(r);return mediaFailure(502);}
    const h=headersFor(r,url,download,etag),len=decimal(r.headers.get("content-length"));
    if(len!==null)h.set("Content-Length",String(len));
    return new Response(r.body,{status:200,headers:h});
  } catch { return mediaFailure(req.signal.aborted?499:502); }

  async function getRange(header:string){
    for(const fresh of [false,true]){
      const r=await fetchOrigin("GET",header,fresh);
      if(!r.ok || !r.body)return originFailure(r);
      const identity=(r.headers.get("content-encoding")||"identity").toLowerCase()==="identity";
      const p=identity && r.status===206?readPart(r.headers):null;
      const total=p?.total ?? (identity&&r.status===200?decimal(r.headers.get("content-length")):null);
      const expected=total!==null?span(range!,total,cap):null;
      if(total!==null&&!expected){abortBody(r);return mediaFailure(416,total);}
      if(expected){
        const {start,end}=expected, length=end-start+1;
        const h=headersFor(r,url,download,etag);
        h.set("Content-Length",String(length));h.set("Content-Range","bytes "+start+"-"+end+"/"+total);
        if(p&&p.start===start&&p.end===end)return new Response(r.body,{status:206,headers:h});
        // Some origins return an aligned range surrounding the requested probe/seek.
        if(p&&p.start<=start&&p.end>=end&&start-p.start<=PLAYBACK_RANGE_BYTES)
          return new Response(slicePrefix(r.body,start-p.start,length),{status:206,headers:h});
        if(fresh&&r.status===200&&start<=PLAYBACK_RANGE_BYTES)return new Response(slicePrefix(r.body,start,length),{status:206,headers:h});
      }
      abortBody(r);
    }
    // A broken origin must not make the player decode bytes from another offset.
    return mediaFailure(502);
  }
}
