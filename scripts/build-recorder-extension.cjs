const fs=require("fs"),path=require("path"),esbuild=require("esbuild"),JSZip=require("jszip");
const source=path.resolve("extensions/recorder"),target=path.join(source,"dist"),packagePath=path.resolve("public/fisiofit-recorder.zip");
(async()=>{
 fs.mkdirSync(target,{recursive:true});
 await esbuild.build({entryPoints:["worker","controller","capture"].map(name=>path.join(source,"src",name+".js")),outdir:target,bundle:true,format:"esm",target:"chrome135",minify:true,legalComments:"none"});
 for(const file of ["manifest.json","controller.html","controller.css","offscreen.html","frame-worker.js"]) fs.copyFileSync(path.join(source,file),path.join(target,file));
 fs.cpSync(path.join(source,"assets","icons"),path.join(target,"icons"),{recursive:true});
 const zip=new JSZip();
 function add(directory,prefix=""){for(const file of fs.readdirSync(directory).sort()){const full=path.join(directory,file),relative=prefix+file;if(fs.statSync(full).isDirectory())add(full,relative+"/");else zip.file("FisioFit-Recorder/"+relative,fs.readFileSync(full),{date:new Date("2026-11-25T00:00:00Z")})}}
 add(target);fs.mkdirSync(path.dirname(packagePath),{recursive:true});
 fs.writeFileSync(packagePath,await zip.generateAsync({type:"nodebuffer",compression:"DEFLATE",compressionOptions:{level:9}}));
 console.log("Extension built:",target);console.log("Package:",packagePath);
})().catch(error=>{console.error(error);process.exitCode=1});
