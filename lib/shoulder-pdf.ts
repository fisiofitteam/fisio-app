// Client-only: the report, its notes and the generated file stay on this device.
// Walk the semantic report tree (not innerText/screenshots), including closed details.
type PdfBlock = {text?:string; svg?:string; width?:number|string; alignment?:string; style?:string; margin?:number[]; columns?:{width:string;stack:PdfBlock[]}[]; columnGap?:number; headlineLevel?:number};
const inline = new Set(["SPAN","STRONG","B","I","EM","SMALL","BR","DT","DD"]);
function plain(node:Node):string {
  if(node.nodeType===3)return (node.textContent||"").replace(/\s*→\s*/g," a ");
  if(!(node instanceof Element)||node.matches('[data-pdf-ignore],.sr-only'))return "";
  if(node.tagName==="BR")return "\n";
  if(node.tagName==="SPAN" && node.parentElement?.tagName==="H4")return ": "+Array.from(node.childNodes).map(plain).join("");
  return Array.from(node.childNodes).map(plain).join("");
}
function words(el:Element) {
  const value=plain(el).trim();
  return el.classList.contains("whitespace-pre-wrap")?value:value.replace(/\s+/g," ");
}
function item(value:string,style="body"):PdfBlock[]{return value?[{text:value,style}]:[];}
function vectorRadar(el:Element):PdfBlock[] {
  const clone=el.cloneNode(true) as SVGElement;
  clone.removeAttribute("class");clone.setAttribute("color","#334155");clone.setAttribute("font-family","Roboto");
  for(const part of [clone,...Array.from(clone.querySelectorAll("*"))]){
    for(const attr of ["stroke","fill"])if(part.getAttribute(attr)==="currentColor")part.setAttribute(attr,"#334155");
  }
  return [{svg:new XMLSerializer().serializeToString(clone),width:315,alignment:"center",margin:[0,4,0,6]}];
}
function children(el:Element):PdfBlock[]{return Array.from(el.children).flatMap(blocks);}
function blocks(el:Element):PdfBlock[] {
  if(el.matches('[data-pdf-ignore],.sr-only'))return [];
  const tag=el.tagName.toUpperCase();
  if(tag==="SVG")return vectorRadar(el);
  if(/^H[1-6]$/.test(tag))return [{text:words(el),style:tag==="H2"?"title":tag==="H3"?"section":"subheading",headlineLevel:Number(tag[1])}];
  if(tag==="SUMMARY")return [{text:el.getAttribute("data-pdf-heading")||words(el),style:"subheading",headlineLevel:4}];
  if(tag==="P")return item(words(el),el.classList.contains("text-xs")?"caption":"body");
  if(tag==="DL")return Array.from(el.children).flatMap(row=>item(Array.from(row.children).map(words).filter(Boolean).join(" "),"caption"));
  if(el.classList.contains("grid-cols-2")&&el.children.length===2){
    return [{columns:Array.from(el.children).map(col=>({width:"*",stack:blocks(col)})),columnGap:14,margin:[0,2,0,4]}];
  }
  if(Array.from(el.children).every(k=>inline.has(k.tagName))){
    if(el.classList.contains("flex"))return item(Array.from(el.children).map(words).filter(Boolean).join("   ·   "),"caption");
    return item(words(el));
  }
  return children(el);
}

export function shoulderPdfDefinition(root:HTMLElement,week:number,example=false) {
  if(!root.matches("[data-shoulder-report]"))throw new Error("Informe no disponible.");
  const reportTitle=(example?"Ejemplo ficticio · ":"")+"Valoración de hombro · Semana "+week;
  return {
    info:{title:reportTitle,author:"FisioFit Team",subject:"Informe de valoración"},
    pageSize:"A4",pageMargins:[44,46,44,50],defaultStyle:{font:"Roboto",fontSize:10,color:"#172021",lineHeight:1.15},
    header:()=>({text:"FISIOFIT TEAM  /  VALORACIÓN DE HOMBRO"+(example?"  /  EJEMPLO FICTICIO":""),margin:[44,19,44,0],fontSize:8,color:"#37605f",bold:true}),
    footer:(page:number,total:number)=>({text:page+" / "+total,alignment:"right",margin:[44,16,44,0],fontSize:8,color:"#526469"}),
    styles:{
      title:{fontSize:24,bold:true,color:"#153b3a",margin:[0,1,0,6]},
      section:{fontSize:15,bold:true,color:"#115e59",margin:[0,11,0,4]},
      subheading:{fontSize:11,bold:true,color:"#213c3b",margin:[0,5,0,2]},
      body:{margin:[0,1,0,3]},caption:{fontSize:9,color:"#445256",margin:[0,1,0,2]},
    },
    content:children(root),
    pageBreakBefore:(node:{headlineLevel?:number},following:{headlineLevel?:number}[])=>!!node.headlineLevel&&following.length===0,
  };
}

export async function downloadShoulderPdf(root:HTMLElement,week:number,example=false) {
  const definition=shoulderPdfDefinition(root,week,example);
  const [{default:pdf},{default:fonts}]=await Promise.all([import("pdfmake/build/pdfmake"),import("pdfmake/build/vfs_fonts")]);
  const blob=await new Promise<Blob>((resolve,reject)=>{
    try{
      // All font resources are embedded. The synchronous layout path reports errors
      // to this promise and never resolves remote resources or opens a print dialog.
      const stream=pdf.createPdf(definition,undefined,undefined,fonts).getStream();
      const parts:ArrayBuffer[]=[];
      stream.on("data",chunk=>parts.push(new Uint8Array(chunk).buffer));
      stream.on("error",reject);
      stream.on("end",()=>resolve(new Blob(parts,{type:"application/pdf"})));
      stream.end();
    }catch(err){reject(err);}
  });
  const fileURL=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=fileURL;link.download="FisioFit-"+(example?"ejemplo-":"")+"valoracion-hombro-semana-"+week+".pdf";
  document.body.appendChild(link);link.click();link.remove();
  // Give Safari time to open or copy the file before releasing the URL.
  window.setTimeout(()=>URL.revokeObjectURL(fileURL),60000);
}
