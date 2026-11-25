const fs=require("fs"),path=require("path"),vm=require("vm"),ts=require("typescript"),assert=require("node:assert/strict"),crypto=require("crypto");
const cache={};function load(file){if(cache[file])return cache[file];const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,allowJs:true}}).outputText,{exports:m.exports,module:m,require:id=>load(path.resolve(path.dirname(file),id+(path.extname(id)?"":".ts"))),URL,URLSearchParams,Date,Blob,Uint8Array,atob,btoa,Number,Promise});return cache[file]=m.exports}
const protocol=load("extensions/recorder/src/protocol.js"),input=load("lib/extension-recording.ts"),store=load("extensions/recorder/src/store.js");
(async()=>{
 const grant={id:"fixture",tabId:17,expires:2000};const sender={url:protocol.APP_ORIGIN+protocol.IMPORT_PATH,frameId:0,tab:{id:17}};
 assert.equal(protocol.allowedExternal(sender,grant,1000),true);
 for(const bad of [{...sender,id:"foreign-extension"},{...sender,frameId:1},{...sender,tab:{id:18}},{...sender,url:"https://evil.test/grabador-extension"},{...sender,url:protocol.APP_ORIGIN+"/other"},{...sender,url:protocol.APP_ORIGIN+".evil.test/grabador-extension"}]) assert.equal(protocol.allowedExternal(bad,grant,1000),false);
 assert.equal(protocol.allowedExternal(sender,grant,2000),false);assert.equal(protocol.allowedExternal(sender,undefined,1000),false);
 for(const offset of [-1,.5,NaN,Infinity,1,1024*1024])assert.equal(protocol.validChunk(offset,1024*1024),false);
 assert.equal(protocol.validChunk(512*1024,1024*1024),true);
 const token=crypto.randomUUID()+crypto.randomUUID(),hash="#extension="+"a".repeat(32)+"&transfer="+token;
 assert(input.extensionLink(hash));assert.equal(input.extensionLink("#extension=javascript:evil&transfer="+token),null);
 const bytes=crypto.randomBytes(protocol.CHUNK_SIZE*2+19),record={id:crypto.randomUUID(),blob:new Blob([bytes],{type:"video/webm"}),durationSeconds:9,title:"Test",transcript:"Fisio y cliente",transcriptionStatus:"complete"};
 const meta=input.extensionMetadata({...store.metadata(record),chunkSize:protocol.CHUNK_SIZE});assert.equal(meta.size,bytes.length);
 for(const bad of [{...meta,size:0},{...meta,size:600*1024*1024},{...meta,mime:"text/html"},{...meta,transcriptionStatus:"invalid"},{...meta,chunkSize:1},{...meta,id:"../other"}])assert.throws(()=>input.extensionMetadata({...bad,chunkSize:bad.chunkSize??protocol.CHUNK_SIZE}));
 const parts=[];for(let offset=0;offset<bytes.length;offset+=protocol.CHUNK_SIZE){const part=await store.chunk(record,offset,protocol.CHUNK_SIZE);parts.push(Buffer.from(input.extensionChunk(part,offset,bytes.length)));assert.throws(()=>input.extensionChunk({...part,offset:offset+1},offset,bytes.length));assert.throws(()=>input.extensionChunk({...part,data:part.data.slice(4)},offset,bytes.length))}
 assert.equal(Buffer.concat(parts).compare(bytes),0);
 const manifest=JSON.parse(fs.readFileSync("extensions/recorder/manifest.json"));assert.equal(manifest.manifest_version,3);assert.deepEqual(manifest.permissions.sort(),["desktopCapture","offscreen","storage"].sort());assert(!manifest.host_permissions);assert(!manifest.content_scripts);assert.deepEqual(manifest.externally_connectable.matches,[protocol.APP_ORIGIN+"/*"]);
 console.log("PASS: exact origin/path/tab/top-frame binding, capability expiry, chunk boundaries/corruption, byte-identical multi-chunk transfer, metadata bounds and minimum extension permissions.");
})().catch(error=>{console.error(error);process.exitCode=1});
