// Run with node scripts/test-installment-cron.cjs. All provider and database dependencies are mocked.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const file=require('node:path').join(__dirname, '../app/api/cron/installment-reconcile/route.ts');
const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2017,module:ts.ModuleKind.CommonJS}}).outputText;
let calls=[];let fail=false;const mod={exports:{}};
new Function('require','module','exports',source)(id=>{
 if(id==='next/server')return {NextResponse:{json:(body,opts)=>({body,status:opts?.status??200})}};
 if(id==='@/lib/installment-reconciliation')return {reconcileInstallmentReceipts:async opts=>{calls.push(opts);if(fail)throw Error('sensitive provider failure');return{failed:0,contractsProcessed:0}}};
 throw Error('unexpected import '+id);
},mod,mod.exports);
const req=(query='',auth='Bearer test-secret')=>new Request('https://example.test/api/cron/installment-reconcile'+query,{headers:auth?{authorization:auth}:{}});
(async()=>{
 delete process.env.CRON_SECRET;let r=await mod.exports.GET(req());assert.equal(r.body.reason,'no_cron_secret');assert.equal(calls.length,0);
 process.env.CRON_SECRET='test-secret';r=await mod.exports.GET(req('','Bearer wrong'));assert.equal(r.status,401);assert.equal(calls.length,0);
 r=await mod.exports.GET(req('',''));assert.equal(r.status,401);
 r=await mod.exports.GET(req('?batchSize=21'));assert.equal(r.status,400);assert.equal(calls.length,0);
 r=await mod.exports.GET(req('?batchSize=NaN'));assert.equal(r.status,400);assert.equal(calls.length,0);
 r=await mod.exports.GET(req('?dryRun=1&batchSize=2&salesAfter=&renewalsAfter=renew-2&saleId=sale-3'));assert.equal(r.body.ok,true);assert.deepEqual(calls[0],{dryRun:true,batchSize:2,salesAfter:'',renewalsAfter:'renew-2',saleId:'sale-3'});
 fail=true;r=await mod.exports.GET(req());assert.equal(r.status,500);assert.equal(r.body.error,'installment_reconciliation_failed');assert.ok(!JSON.stringify(r).includes('sensitive'));
 console.log('7 cron-route checks passed; mocked handler, no provider/database calls.');
})().catch(e=>{console.error(e);process.exitCode=1});
