// Isolated browser, synthetic lead and intercepted API: no real credentials or contacts.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),esbuild=require('esbuild');
const {chromium}=require('playwright');
(async()=>{
 const bundle=await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{SkalexCallContextBlock}from'./components/SkalexCallContextBlock';createRoot(document.getElementById('root')).render(React.createElement('article',{onClick:()=>window.cardClicks=(window.cardClicks||0)+1},React.createElement(SkalexCallContextBlock,{leadId:'fixture',autoLoad:true})));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try {
  const page=await browser.newPage({viewport:{width:900,height:800}});let requests=0;
  const context={status:'ready',reason:null,message:'',checkedAt:new Date().toISOString(),generatedAt:'2026-11-25T09:00:00Z',retryAt:null,fields:[{key:'pain',label:'Dolor principal',value:'Molestias de hombro al elevar el brazo.'},{key:'previous',label:'Qué ha probado',value:'• Reposo\n• Fisioterapia'},{key:'goals',label:'Objetivos',value:'Volver a entrenar con confianza.'},{key:'objections',label:'Objeciones',value:'Dudas sobre cómo organizar las sesiones.'},{key:'custom',label:'Campo nuevo',value:'<img src=x onerror=alert(1)> Texto recibido como texto.'}]};
  await page.route('https://fixture.test/**',route=>{
   if(route.request().url().includes('/api/leads/')){requests++;return route.fulfill({status:requests===1?503:200,json:requests===1?{error:'Fallo temporal de conexión'}:{context}})}
   return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main style="max-width:760px;margin:24px auto;padding:16px"><h1>Llamadas agendadas</h1><h2>Lead de prueba</h2><div id="root"></div></main></body></html>'});
  });
  await page.goto('https://fixture.test');
  for(const file of fs.readdirSync('.next/static/css').filter(f=>f.endsWith('.css')))await page.addStyleTag({content:fs.readFileSync(path.join('.next/static/css',file),'utf8')});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.getByRole('alert').getByText('Fallo temporal de conexión').waitFor();
  await page.getByRole('button',{name:'Volver a consultar',exact:true}).click();
  await page.getByText('Molestias de hombro al elevar el brazo.',{exact:true}).waitFor();assert.equal(requests,2);
  assert.equal(await page.getByText('Objeciones',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Ver contexto completo',exact:true}).click();
  await page.getByText('Objeciones',{exact:true}).waitFor();assert.equal(await page.locator('#root img').count(),0);assert.equal(await page.evaluate(()=>window.cardClicks||0),0,'context controls must not open the call edit modal');
  await page.screenshot({path:'/tmp/fisio-skalex-context-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.screenshot({path:'/tmp/fisio-skalex-context-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Ver menos',exact:true}).click();assert.equal(await page.getByText('Campo nuevo',{exact:true}).count(),0);
  console.log('PASS: visible-card auto-load, error/retry, structured fields, expand/collapse, unknown fields as escaped text, no accidental modal opening, mobile layout.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
