import type {Metadata} from "next";
import {cache} from "react";
import {notFound} from "next/navigation";
import {getPublicMetodo} from "@/lib/metodo/server";
import {MetodoLanding} from "@/components/metodo/MetodoLanding";
export const dynamic="force-dynamic";
const content=cache(getPublicMetodo);
export async function generateMetadata():Promise<Metadata>{const c=await content();return{title:c.seo.title,description:c.seo.description,alternates:{canonical:"https://app.fisiofitteam.com/metodo"},robots:{index:c.published,follow:c.published},openGraph:{type:"website",locale:"es_ES",siteName:"FisioFitCross",title:c.seo.title,description:c.seo.description,url:"https://app.fisiofitteam.com/metodo",images:[{url:c.seo.image||"https://app.fisiofitteam.com/metodo/og",width:1200,height:630,alt:"FisioFitCross · Fisioterapia y crosstraining"}]},twitter:{card:"summary_large_image",title:c.seo.title,description:c.seo.description,images:[c.seo.image||"https://app.fisiofitteam.com/metodo/og"]}};}
export default async function MetodoPage(){const c=await content();if(!c.published)notFound();return <MetodoLanding content={c}/>;}
