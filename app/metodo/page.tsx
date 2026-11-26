import type {Metadata} from "next";
import {cache} from "react";
import {notFound} from "next/navigation";
import {getPublicMetodo} from "@/lib/metodo/server";
import {MetodoLanding} from "@/components/metodo/MetodoLanding";
import {resolveOrigin} from "@/lib/metodo/request";
export const dynamic="force-dynamic";
const content=cache(getPublicMetodo);
export async function generateMetadata():Promise<Metadata>{const c=await content();return{title:c.seo.title,description:c.seo.description,alternates:{canonical:"https://app.fisiofitteam.com/metodo"},robots:{index:c.published,follow:c.published},openGraph:{type:"website",locale:"es_ES",siteName:"FisioFitTeam",title:c.seo.title,description:c.seo.description,url:"https://app.fisiofitteam.com/metodo",images:[{url:c.seo.image||"https://app.fisiofitteam.com/metodo/og",width:1200,height:630,alt:"FisioFitTeam · Fisioterapia y crosstraining"}]},twitter:{card:"summary_large_image",title:c.seo.title,description:c.seo.description,images:[c.seo.image||"https://app.fisiofitteam.com/metodo/og"]}};}
// `?origen=hombro|rodilla|lumbar|codo|cadera|autotest` adapts the hero for ads and Reels. Canonical stays /metodo.
export default async function MetodoPage({searchParams}:{searchParams:{origen?:string|string[]}}){const c=await content();if(!c.published)notFound();const raw=searchParams?.origen;return <MetodoLanding content={c} origin={resolveOrigin(Array.isArray(raw)?raw[0]:raw)}/>;}
