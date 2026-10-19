// Run with node scripts/test-installment-reconciliation.cjs. All provider and database dependencies are mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const filename=require('node:path').join(__dirname, '../lib/installment-reconciliation.ts');
const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2017,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
const mod={exports:{}};
new Function('require','module','exports',js)(name=>{if(name==='./installment-receipts')return {recordInstallmentReceipt:()=>{throw Error('real writer invoked')}};throw Error('unexpected import '+name)},mod,mod.exports);
const {reconcileInstallmentReceipts}=mod.exports;
const now=new Date('2026-10-19T12:00:00.000Z');
const base={id:'sale-1',patientId:'patient-1',programType:'RECUPERA',durationMonths:4,installmentCount:3,currency:'eur',paymentToken:'token-1',paypalSubscriptionId:'I-SUB1',stripeSessionId:null,createdAt:new Date('2026-08-01T00:00:00Z'),closerId:'closer-1',status:'paid',isReservation:false};
const pay=(id,date,extra={})=>({id,status:'COMPLETED',time:date,amount_with_breakdown:{gross_amount:{currency_code:'EUR',value:'123.45'}},...extra});
const invoice=(id,date,extra={})=>({id,subscription:'sub_1',status:'paid',currency:'eur',amount_paid:12345,status_transitions:{paid_at:Date.parse(date)/1000},...extra});
function setup({sales=[{...base}],renewals=[],paypal,stripe,writer}={}){
 const calls=[],writes=[];
 const matches=(rows,args)=> rows.filter(row=>Object.entries(args.where??{}).every(([key,value])=>{
  if (key==='installmentCount')return row[key]>=value.gte;
  if (key==='id'&&typeof value==='object')return row.id>value.gt;
  return row[key]===value;
 })).sort((a,b)=>a.id.localeCompare(b.id));
 const repo=rows=>({count:async args=>matches(rows,args).length,findMany:async args=>matches(rows,args).slice(args.skip??0,(args.skip??0)+(args.take??rows.length))});
 const deps={database:{sale:repo(sales),renewalCheckout:repo(renewals)},loadStripe:async()=>stripe??null,paypalConfigured:async()=>true,paypalGet:async(path,query)=>{calls.push({path,query});return paypal?paypal(path,query):path.endsWith('/transactions')?{transactions:[pay('pay-2','2026-09-01T10:00:00Z'),pay('pay-1','2026-08-01T10:00:00Z')],total_items:2,total_pages:1}:{id:'I-SUB1',custom_id:'token-1'}},writeReceipt:async input=>{writes.push(input);return writer?writer(input):{status:input.dryRun?'would-create':'created',transactionId:'receipt:'+input.receiptId}}};
 return {deps,calls,writes};
}
const run=(s,options={})=>reconcileInstallmentReceipts({now,salesAfter:'',renewalsAfter:'',...options},s.deps);
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
test('PayPal real gross amounts and dates, oldest-first, no expected installments',async()=>{
 const s=setup();const r=await run(s);assert.deepEqual(s.writes.map(x=>x.receiptId),['pay-1','pay-2']);assert.equal(r.created,2);assert.equal(r.receiptsConfirmed,2);assert.equal(s.writes[0].amountCents,12345);assert.equal(s.writes[0].paidAt.toISOString(),'2026-08-01T10:00:00.000Z');assert.equal(s.writes[0].contract.professionalId,'closer-1');assert.equal(s.calls.length,2);assert.ok(s.calls.every(c=>c.path.startsWith('/v1/billing/subscriptions/')));
});
test('PayPal skips missing, pending, non-EUR and fractional-cent receipts',async()=>{
 const s=setup({paypal:path=>path.endsWith('/transactions')?{transactions:[pay('ok','2026-08-01T10:00:00Z'),pay('pending','2026-08-01T10:00:00Z',{status:'PENDING'}),pay('usd','2026-08-01T10:00:00Z',{amount_with_breakdown:{gross_amount:{currency_code:'USD',value:'123.45'}}}),pay('precision','2026-08-01T10:00:00Z',{amount_with_breakdown:{gross_amount:{currency_code:'EUR',value:'123.456'}}}),pay('date','not-date'),pay('zero','2026-08-01T10:00:00Z',{amount_with_breakdown:{gross_amount:{currency_code:'EUR',value:'0.00'}}})]}:{id:'I-SUB1',custom_id:'token-1'}});const r=await run(s);assert.equal(s.writes.length,1);assert.equal(r.skipped,5);
});
test('Stripe pagination and history sorted before legacy adoption',async()=>{
 const pages=[];const stripe={subscriptions:{retrieve:async()=>({id:'sub_1',metadata:{productType:'sale',saleId:'sale-1',paymentToken:'token-1'}})},invoices:{list:async args=>{pages.push(args);return args.starting_after?{data:[invoice('in_old','2026-08-01T10:00:00Z')],has_more:false}:{data:[invoice('in_new','2026-10-01T10:00:00Z')],has_more:true}}}};
 const s=setup({sales:[{...base,paypalSubscriptionId:'sub_1'}],stripe});const r=await run(s);assert.deepEqual(s.writes.map(x=>x.receiptId),['in_old','in_new']);assert.equal(pages[1].starting_after,'in_new');assert.equal(r.providerRequests,3);
});
test('Stripe renewal subscription recovered from saved Checkout Session',async()=>{
 const metadata={productType:'renewal',renewalCheckoutId:'renewal-1',paymentToken:'renew-token'};const seen=[];
 const stripe={checkout:{sessions:{retrieve:async id=>{seen.push(id);return{id,mode:'subscription',subscription:'sub_1',metadata}}}},subscriptions:{retrieve:async()=>({id:'sub_1',metadata})},invoices:{list:async()=>({data:[invoice('in_renew','2026-09-02T10:00:00Z')],has_more:false})}};
 const s=setup({sales:[],renewals:[{...base,id:'renewal-1',paypalSubscriptionId:null,stripeSessionId:'cs_1',paymentToken:'renew-token',renewalId:'applied-1',createdById:'creator-1'}],stripe});const r=await run(s);assert.equal(r.created,1);assert.deepEqual(seen,['cs_1']);assert.equal(s.writes[0].contract.kind,'renewal');assert.equal(s.writes[0].contract.professionalId,'creator-1');
});
test('Paid ADHOC installments recover actual cash without requiring a subscription period',async()=>{
 const s=setup({sales:[],renewals:[{...base,id:'adhoc-1',programType:'ADHOC',durationMonths:0,renewalId:null,createdById:'creator-1'}],paypal:path=>path.endsWith('/transactions')?{transactions:[pay('adhoc-paid','2026-09-02T10:00:00Z')]}:{id:'I-SUB1',custom_id:'renewal:token-1'}});const r=await run(s);assert.equal(r.created,1);assert.equal(s.writes[0].contract.programType,'ADHOC');assert.equal(s.writes[0].contract.kind,'renewal');assert.equal(s.writes[0].amountCents,12345);assert.equal(s.writes[0].paidAt.toISOString(),'2026-09-02T10:00:00.000Z');
});
test('Conflicting provider metadata cannot write',async()=>{
 const s=setup({paypal:async()=>({id:'I-SUB1',custom_id:'wrong-token'})});const r=await run(s);assert.equal(s.writes.length,0);assert.equal(r.ambiguous,1);assert.equal(r.incomplete,true);
});
test('PayPal splits incomplete date range and deduplicates boundary receipts',async()=>{
 let n=0;const s=setup({paypal:path=>{if(!path.endsWith('/transactions'))return{id:'I-SUB1',custom_id:'token-1'};n++;return n===1?{transactions:[pay('pay-1','2026-08-02T10:00:00Z')],total_items:2,total_pages:2}:{transactions:[pay('pay-1','2026-08-02T10:00:00Z')],total_items:1,total_pages:1}}});const r=await run(s);assert.equal(r.created,1);assert.equal(s.writes.length,1);assert.equal(r.providerRequests,4);
});
test('Incomplete provider history is skipped rather than partially writing',async()=>{
 const s=setup({paypal:path=>path.endsWith('/transactions')?{transactions:[pay('pay-1','2026-08-02T10:00:00Z')],total_items:2,total_pages:2}:{id:'I-SUB1',custom_id:'token-1'}});const r=await run(s);assert.equal(s.writes.length,0);assert.equal(r.incomplete,true);assert.equal(r.details.at(-1).reason,'paypal_history_incomplete');assert.equal(r.providerRequests,9);
});
test('Request budget cannot write an unread receipt history',async()=>{
 const s=setup();const r=await run(s,{maxProviderRequests:1});assert.equal(s.writes.length,0);assert.equal(r.providerRequests,1);assert.equal(r.details[0].reason,'provider_request_limit');
});
test('Duplicate linked contracts are reported without assigning their cash',async()=>{
 const s=setup({renewals:[{...base,id:'renewal-conflict',status:'pending',renewalId:'applied'}]});const r=await run(s);assert.equal(s.writes.length,0);assert.equal(r.ambiguous,1);assert.equal(r.details[0].reason,'subscription_linked_to_multiple_contracts');
});
test('Dry-run reaches shared writer in read-only preview mode',async()=>{
 const s=setup();const r=await run(s,{dryRun:true});assert.ok(s.writes.every(x=>x.dryRun===true));assert.equal(r.wouldCreate,2);assert.equal(r.created,0);
});
test('Legacy ambiguity remains visible and other receipts stay reviewable',async()=>{
 const s=setup({writer:input=>({status:'ambiguous',reason:'legacy candidates'})});const r=await run(s);assert.equal(r.ambiguous,2);assert.equal(r.created,0);assert.ok(r.details.every(x=>x.action==='ambiguous'));
});
test('Provider identity with contradictory amount prevents all writes',async()=>{
 const s=setup({paypal:path=>path.endsWith('/transactions')?{transactions:[pay('same','2026-08-02T10:00:00Z'),pay('same','2026-08-02T10:00:00Z',{amount_with_breakdown:{gross_amount:{currency_code:'EUR',value:'999.00'}}})]}:{id:'I-SUB1',custom_id:'token-1'}});const r=await run(s);assert.equal(s.writes.length,0);assert.equal(r.ambiguous,1);assert.equal(r.details[0].reason,'provider_receipt_identity_conflict');
});
test('Unknown providers, missing activation and wrong currency do not call providers',async()=>{
 const s=setup({sales:[{...base,id:'a',paypalSubscriptionId:'mystery'},{...base,id:'b',patientId:null},{...base,id:'c',currency:'usd'}]});const r=await run(s);assert.equal(s.writes.length,0);assert.equal(s.calls.length,0);assert.equal(r.skipped,3);
});
test('Explicit cursors backfill subsequent batches',async()=>{
 const sales=['a','b','c','d','e'].map(id=>({...base,id,paypalSubscriptionId:'I-'+id}));const s=setup({sales,paypal:path=>path.endsWith('/transactions')?{transactions:[]}:{id:path.split('/').at(-1),custom_id:'token-1'}});const r=await run(s,{salesAfter:'b',batchSize:2});assert.equal(r.batches.sales.total,3);assert.equal(r.batches.sales.selected,2);assert.equal(r.batches.sales.nextAfter,'d');assert.deepEqual(r.details.map(d=>d.id),['c','d']);assert.deepEqual(r.batches.sales.retryIds,[]);
});
test('Default cron rotation visits later batches',async()=>{
 const sales=['a','b','c','d','e'].map(id=>({...base,id,paypalSubscriptionId:null}));const s=setup({sales});const options={now,batchSize:2};const r=await reconcileInstallmentReceipts(options,s.deps);const expectedOffset=(Math.floor(now.getTime()/(15*60000))%3)*2;assert.equal(r.batches.sales.offset,expectedOffset);assert.equal(r.details[0].id,sales[expectedOffset].id);
});
test('Timed-out GET cannot cause background writes',async()=>{
 const s=setup({paypal:()=>new Promise(()=>{})});const r=await run(s,{maxRunMs:10});assert.equal(s.writes.length,0);assert.equal(r.details[0].reason,'provider_timeout');
});
test('Stripe manually marked paid invoices cannot manufacture collected cash',async()=>{
 const stripe={subscriptions:{retrieve:async()=>({id:'sub_1',metadata:{productType:'sale',saleId:'sale-1',paymentToken:'token-1'}})},invoices:{list:async()=>({data:[invoice('in_manual','2026-08-01T10:00:00Z',{paid_out_of_band:true})],has_more:false})}};const s=setup({sales:[{...base,paypalSubscriptionId:'sub_1'}],stripe});const r=await run(s);assert.equal(s.writes.length,0);assert.equal(r.skipped,1);
});
test('Budget cursor stops before incomplete contracts and returns retry IDs',async()=>{
 const sales=['a','b','c'].map(id=>({...base,id,paypalSubscriptionId:'I-'+id}));const s=setup({sales,paypal:path=>path.endsWith('/transactions')?{transactions:[]}:{id:path.split('/').at(-1),custom_id:'token-1'}});const r=await run(s,{batchSize:3,maxProviderRequests:3});assert.equal(r.batches.sales.nextAfter,'a');assert.equal(r.batches.sales.hasMore,true);assert.deepEqual(r.batches.sales.retryIds,['b','c']);
});
test('Failed first repair retains an empty historical starting cursor',async()=>{
 const s=setup({paypal:()=>{throw Error('provider down')}});const r=await run(s);assert.equal(r.batches.sales.nextAfter,'');assert.equal(r.batches.sales.hasMore,true);assert.deepEqual(r.batches.sales.retryIds,['sale-1']);
});
(async()=>{for(const[name,fn]of tests){await fn();console.log('PASS '+name);}console.log(tests.length+' reconciliation tests passed; all dependencies mocked, no provider or database calls.');})().catch(e=>{console.error(e);process.exitCode=1});
