// Next may expose its internal origin even when the incoming Host is the public host.
// Compare the parsed browser origin to the routed request or its actual Host, never to a forwarded host list.
export function pilotSameOrigin(req:Request):boolean {
 const header=req.headers.get("origin");
 if(header===null)return true;
 try {
   const origin=new URL(header), destination=new URL(req.url);
   if(!["http:","https:"].includes(origin.protocol) || header!==origin.origin || origin.protocol!==destination.protocol)return false;
   return origin.origin===destination.origin || origin.host===req.headers.get("host")?.toLowerCase();
 } catch {return false;}
}
