import Anthropic from "@anthropic-ai/sdk";
import { cleanShoulderNarrative,type ShoulderNarrative } from "./shoulder-narrative";
import type { NarrativeEvidence } from "./shoulder-narrative-evidence";

export class NarrativeProviderError extends Error {
  constructor(public readonly status:number,message:string){super(message);}
}
export async function proposeShoulderNarrative(evidence:NarrativeEvidence):Promise<ShoulderNarrative>{
  const scored=evidence.capacidades.filter(a=>a.nota!==null);
  if(!scored.length)throw new NarrativeProviderError(422,"Aún no hay ninguna capacidad puntuada. Guarda las mediciones o escribe los comentarios a mano.");
  if(!process.env.ANTHROPIC_API_KEY)throw new NarrativeProviderError(503,"La propuesta automática no está disponible. Puedes escribir los comentarios a mano.");
  const keys=["general",...scored.map(a=>a.key)];
  const client=new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY,timeout:55000,maxRetries:0,logLevel:"off"});
  const toolName="proponer_comentarios";
  let reply;
  try{
    reply=await client.messages.create({
      model:process.env.SHOULDER_NARRATIVE_AI_MODEL||process.env.SHOULDER_VIDEO_AI_MODEL||"claude-sonnet-4-6",
      max_tokens:2000,
      system:"Redacta en español de España un borrador que un fisioterapeuta revisará. Háblale de tú al atleta. En general, resume el patrón de las capacidades que tienen nota en 2–3 frases, sin inventar una nota global. Para cada capacidad puntuada explica en 1–2 frases qué representa en este caso, con un ejemplo del test si hay medidas. No repitas solo la cifra; recuerda que son resultados de estas pruebas. Usa únicamente los datos facilitados. Si comparacion es null no hables de cambios respecto a otra semana. No atribuyas diagnósticos, aptitud deportiva, causas anatómicas, pronósticos ni tratamiento. No juzgues contra población, edad o normas externas. En el resumen general o al explicar la tolerancia, puedes ilustrar un cambio con un mismo intento registrado en ambas valoraciones: muestra juntos repeticiones, kg y dolor si constan. No extrapoles un cambio en un test al conjunto. Los intentos son declarados por el atleta, no son mediciones oficiales de 8RM ni se convierten en nota. Distingue dolor declarado de ejecución observada, y cero de un dato ausente. Todas las cifras han de constar explícitamente en la evidencia. Escribe texto natural sin títulos, listas ni Markdown. Devuelve cada comentario en la clave indicada mediante la herramienta.",
      tools:[{name:toolName,description:"Propuestas de comentarios para revisar y editar antes de publicar.",input_schema:{
        type:"object",properties:Object.fromEntries(keys.map(k=>[k,{type:"string",maxLength:1200}])),required:keys,additionalProperties:false}}],
      tool_choice:{type:"tool",name:toolName},
      messages:[{role:"user",content:JSON.stringify(evidence)}],
    });
  }catch{throw new NarrativeProviderError(502,"No se ha podido generar la propuesta. Tus comentarios siguen intactos.");}
  try{
    const call=reply.content.find(b=>b.type==="tool_use"&&b.name===toolName);
    if(call?.type!=="tool_use")throw Error();
    const result=cleanShoulderNarrative(call.input);
    if(Object.keys(result).length!==keys.length || keys.some(k=>!result[k as keyof ShoulderNarrative]))throw Error();
    for(const axis of evidence.capacidades)if(axis.nota===null){
      result[axis.key]="Aún no hay datos suficientes para valorar esta capacidad.";
    }
    return result;
  }catch{throw new NarrativeProviderError(502,"La propuesta recibida no está completa. Puedes volver a intentarlo o escribir los comentarios.");}
}
