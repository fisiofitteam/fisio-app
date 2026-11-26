import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { PontoClient, PontoError, pontoConfiguration, type PontoTransaction } from "./ponto-client";
import { bankExpenseDate, cents, classifyMovement, detectSubscriptions, matchStripePayout, type BankRule, type Payout } from "./bank-finance-contract";
import { expenseCandidate } from "./business-expense-candidate-contract";
import type { Prisma } from "@prisma/client";

const STATE = "ponto-ais";
export async function configuredAccountIds() {
  const env=pontoConfiguration();
  if(env.accounts)return env.accountIds;
  const state=await prisma.bankSyncState.findUnique({where:{id:STATE}});
  try{const ids:unknown=JSON.parse(state?.selectedAccountIds||"[]");return Array.isArray(ids)&&ids.length<=5&&ids.every(x=>typeof x==="string"&&/^[a-zA-Z0-9_-]{1,100}$/.test(x))?ids as string[]:[];}catch{return [];}
}
export async function discoverBankAccounts() {
  if(!pontoConfiguration().credentials)throw new PontoError("credentials_invalid");
  return new PontoClient(process.env.PONTO_CLIENT_ID!,process.env.PONTO_CLIENT_SECRET!).accounts();
}
export const bankErrors: Record<string,string> = {
  credentials_invalid:"Revisa las credenciales de la integración Ponto.", ais_only_required:"Ponto debe conceder exclusivamente AIS. Desactiva PIS en la integración.",
  consent_required:"Revisa o renueva el consentimiento de CaixaBank en Ponto.", account_unavailable:"La cuenta seleccionada no está disponible. Revísala en Ponto.",
  rate_limited:"Ponto ha limitado las consultas. Se reintentará en la siguiente ejecución.", pagination_incomplete:"El histórico no se recibió completo. No se han guardado datos de esa cuenta.",
  ponto_unavailable:"No se pudo completar la consulta a Ponto.", import_failed:"No se pudo completar la importación. Los gastos siguen sujetos a validación.",
};
const dateOrNull = (value?:string|null) => value && Number.isFinite(Date.parse(value)) ? new Date(value) : null;
function normalizedTransaction(accountId:string, row:PontoTransaction, rules:BankRule[]) {
  const a=row.attributes, amountCents=cents(a.amount), occurredAt=dateOrNull(a.executionDate);
  if(!occurredAt) throw new PontoError("import_failed");
  const original=[a.description,a.remittanceInformation].filter(Boolean).join(" · ").slice(0,600) || "Movimiento bancario";
  // Incoming customer names/references are unnecessary for business aggregates.
  const isStripe=/\bstripe\b/i.test([a.counterpartName,original].join(" "));
  const description=amountCents>0 ? (isStripe ? "Abono Stripe" : "Entrada bancaria") : original;
  const classification=classifyMovement(amountCents>0 ? (isStripe?"Stripe":"Entrada bancaria") : a.counterpartName||"",description,amountCents,rules);
  return { accountId, externalId:row.id, amountCents, currency:a.currency.toUpperCase(), occurredAt, description,...classification,
    fingerprint:createHash("sha256").update(JSON.stringify([amountCents,a.currency,occurredAt.toISOString(),description,classification.merchant])).digest("hex") };
}
async function candidateFor(tx:Prisma.TransactionClient, row:{id:string;accountId:string;externalId:string;amountCents:number;currency:string;occurredAt:Date;merchant:string;description:string;category:string}) {
  const data=expenseCandidate.parse({source:"bank",sourceRef:`ponto:${row.accountId}:${row.externalId}`,merchant:row.merchant,description:row.description,amountCents:-row.amountCents,currency:row.currency,date:bankExpenseDate(row.occurredAt),category:row.category});
  const candidate=await tx.businessExpenseCandidate.upsert({where:{source_sourceRef:{source:data.source,sourceRef:data.sourceRef}},create:{source:data.source,sourceRef:data.sourceRef,merchant:data.merchant,description:data.description,amountCents:data.amountCents,occurredAt:new Date(data.date+"T12:00:00Z"),category:data.category},update:{}});
  await tx.bankMovement.update({where:{id:row.id},data:{candidateId:candidate.id}});
}
export async function importBankRows(tx:Prisma.TransactionClient, accountId:string, rows:PontoTransaction[], rules:BankRule[]) {
  let inserted=0;
  for(const raw of rows) {
    const {ruleId:_,...data}=normalizedTransaction(accountId,raw,rules);
    const existing=await tx.bankMovement.findUnique({where:{accountId_externalId:{accountId,externalId:data.externalId}}});
    if(existing) {
      if(existing.fingerprint!==data.fingerprint) await tx.bankMovement.update({where:{id:existing.id},data:{conflict:true,reason:"Ponto ha modificado un movimiento ya importado; requiere revisión."}});
      else if(existing.candidateId&&!existing.conflict) {
        // Repair earlier UTC truncation only for pending bank candidates. Never change booked expenses.
        const occurredAt=new Date(bankExpenseDate(data.occurredAt)+"T12:00:00Z");
        await tx.businessExpenseCandidate.updateMany({where:{id:existing.candidateId,source:"bank",status:"pending",occurredAt:{not:occurredAt}},data:{occurredAt}});
      }
      continue;
    }
    const row=await tx.bankMovement.create({data}); inserted++;
    if(data.amountCents<0&&!data.personal&&data.currency==="EUR") await candidateFor(tx,row);
  }
  return inserted;
}
async function reconcileStripe() {
  if(!stripe) return "not_configured";
  const rows=await prisma.bankMovement.findMany({where:{amountCents:{gt:0},merchant:"Stripe",stripePayoutId:null,conflict:false},orderBy:{occurredAt:"desc"},take:1000});
  if(!rows.length) return "complete";
  const payouts:Payout[]=[]; let cursor:string|undefined;
  const earliest=Math.min(...rows.map(r=>r.occurredAt.getTime()));
  do {
    // Only settlements, no customers/charges/invoices and no write calls.
    const page=await stripe.payouts.list({limit:100,created:{gte:Math.floor(earliest/1000)-45*86400},...(cursor?{starting_after:cursor}:{})});
    payouts.push(...page.data.map(p=>({id:p.id,amount:p.amount,currency:p.currency,arrival_date:p.arrival_date,status:p.status})));
    if(payouts.length>=3000&&page.has_more) return "incomplete";
    cursor=page.has_more?page.data.at(-1)?.id:undefined;
    if(page.has_more&&!cursor) return "incomplete";
  }while(cursor);
  const used=new Set((await prisma.bankMovement.findMany({where:{stripePayoutId:{not:null}},select:{stripePayoutId:true}})).map(r=>r.stripePayoutId!));
  // Ambiguous same-amount bank entries are never paired automatically.
  for(const row of rows) {
    const match=matchStripePayout(row,payouts,used);
    if(!match || rows.filter(r=>matchStripePayout(r,payouts,used)===match).length!==1)continue;
    await prisma.bankMovement.update({where:{id:row.id},data:{stripePayoutId:match}});used.add(match);
  }
  return "complete";
}
export async function syncPonto() {
  const config=pontoConfiguration();
  if(!config.credentials)return {status:"not_configured",inserted:0};
  const accountIds=await configuredAccountIds();
  if(!accountIds.length)return {status:"account_not_selected",inserted:0};
  await prisma.bankSyncState.upsert({where:{id:STATE},create:{id:STATE},update:{}});
  const now=new Date(), leaseId=randomUUID();
  const lease=await prisma.bankSyncState.updateMany({where:{id:STATE,paused:false,OR:[{leaseUntil:null},{leaseUntil:{lt:now}}]},data:{leaseId,leaseUntil:new Date(now.getTime()+5*60000),lastAttemptAt:now}});
  if(!lease.count)return {status:"paused_or_running",inserted:0};
  let inserted=0;
  try {
    const client=new PontoClient(process.env.PONTO_CLIENT_ID!,process.env.PONTO_CLIENT_SECRET!);
    const rules=await prisma.bankClassificationRule.findMany({where:{enabled:true},orderBy:{createdAt:"desc"}});
    await prisma.pontoBankAccount.updateMany({where:{id:{notIn:accountIds}},data:{active:false}});
    for(const accountId of accountIds) {
      const account=await client.account(accountId);
      const transactions=await client.transactions(accountId);
      const a=account.attributes;
      const data={label:(a.description||"CaixaBank").slice(0,180),maskedReference:a.reference?"•••• "+a.reference.slice(-4):"Sin referencia",currency:a.currency.toUpperCase(),
        currentBalanceCents:a.currentBalance==null?null:cents(a.currentBalance),availableBalanceCents:a.availableBalance==null?null:cents(a.availableBalance),
        balanceAt:dateOrNull(a.currentBalanceReferenceDate||account.meta?.synchronizedAt),authorizationExpiresAt:dateOrNull(a.authorizationExpirationExpectedAt),
        transactionsAt:dateOrNull(transactions.synchronizedAt),lastImportedAt:new Date(),active:true};
      inserted+=await prisma.$transaction(async tx=>{
        const guard=await tx.bankSyncState.updateMany({where:{id:STATE,leaseId,paused:false},data:{leaseUntil:new Date(Date.now()+5*60000)}});
        if(!guard.count)throw new PontoError("import_failed");
        await tx.pontoBankAccount.upsert({where:{id:accountId},create:{id:accountId,...data},update:data});
        return importBankRows(tx,accountId,transactions.rows,rules);
      },{timeout:90000});
    }
    let stripeStatus="unavailable";try{stripeStatus=await reconcileStripe();}catch{/* no provider error bodies or credentials in logs */}
    await prisma.bankSyncState.updateMany({where:{id:STATE,leaseId},data:{lastSuccessAt:new Date(),lastError:null,stripeStatus}});
    return {status:"complete",inserted,stripeStatus};
  } catch(e) {
    const code=e instanceof PontoError&&bankErrors[e.code]?e.code:"import_failed";
    await prisma.bankSyncState.updateMany({where:{id:STATE,leaseId},data:{lastError:code}});
    throw new PontoError(code);
  } finally {
    await prisma.bankSyncState.updateMany({where:{id:STATE,leaseId},data:{leaseId:null,leaseUntil:null}});
  }
}
export async function bankOverview(now=new Date()) {
  const accountIds=await configuredAccountIds();
  const [accounts,state,rules,movements,history]=await Promise.all([
    prisma.pontoBankAccount.findMany({where:{active:true,id:{in:accountIds}},orderBy:{id:"asc"}}), prisma.bankSyncState.findUnique({where:{id:STATE}}),
    prisma.bankClassificationRule.findMany({where:{enabled:true},orderBy:{createdAt:"desc"}}),
    prisma.bankMovement.findMany({orderBy:{occurredAt:"desc"},take:200}),
    prisma.bankMovement.findMany({where:{currency:"EUR",occurredAt:{gte:new Date(now.getTime()-800*86400000)}},orderBy:{occurredAt:"asc"}}),
  ]);
  const activeIds=new Set(accounts.map(a=>a.id));
  const activeRows=history.filter(r=>activeIds.has(r.accountId)&&!r.duplicateOfId);
  const fingerprints=new Set<string>();
  let suspectedDuplicates=0;
  for(const row of activeRows){const key=row.accountId+":"+row.fingerprint;if(fingerprints.has(key))suspectedDuplicates++;fingerprints.add(key);}
  const subscriptions=detectSubscriptions(activeRows,now);
  const cutoff=new Date(now.getTime()-30*86400000);
  const recent=activeRows.filter(r=>r.occurredAt>=cutoff&&!r.conflict);
  const personalOutflow=recent.filter(r=>r.personal&&r.amountCents<0).reduce((s,r)=>s-r.amountCents,0);
  const businessOutflow=recent.filter(r=>!r.personal&&r.amountCents<0).reduce((s,r)=>s-r.amountCents,0);
  const cashInflow=recent.filter(r=>r.amountCents>0).reduce((s,r)=>s+r.amountCents,0);
  const fresh=accounts.length>0&&accounts.every(a=>a.currency==="EUR"&&a.currentBalanceCents!==null&&a.balanceAt&&now.getTime()-a.balanceAt.getTime()>=-300000&&now.getTime()-a.balanceAt.getTime()<48*3600000&&(!a.authorizationExpiresAt||a.authorizationExpiresAt>now));
  const balance=fresh?accounts.reduce((s,a)=>s+a.currentBalanceCents!,0):null;
  const historyDays=activeRows.length?Math.max(0,Math.floor((now.getTime()-activeRows[0].occurredAt.getTime())/86400000)):0;
  const reliable=fresh&&historyDays>=30&&accounts.every(a=>activeRows.some(r=>r.accountId===a.id&&r.occurredAt<=cutoff))&&!state?.lastError&&!state?.paused&&!suspectedDuplicates&&!activeRows.some(r=>r.conflict);
  // Personal cash still leaves this account. Reserve at least the known monthly mortgage.
  const personalReserve=Math.max(20300,personalOutflow);
  const netMonthly=cashInflow-businessOutflow-personalReserve;
  const forecast=reliable?[7,30,90].map(days=>({days,balanceCents:Math.round(balance!+netMonthly*days/30)})):[];
  const candidateIds=activeRows.flatMap(r=>r.candidateId?[r.candidateId]:[]);
  const pending=await prisma.businessExpenseCandidate.aggregate({where:{id:{in:candidateIds},status:"pending"},_sum:{amountCents:true},_count:true});
  const visibleReviews=await prisma.businessExpenseCandidate.findMany({where:{id:{in:movements.flatMap(r=>r.candidateId?[r.candidateId]:[])}},select:{id:true,status:true}});
  const reviewStatus=new Map(visibleReviews.map(r=>[r.id,r.status]));
  return {configuration:{credentials:pontoConfiguration().credentials,accounts:accountIds.length>0,ready:pontoConfiguration().credentials&&accountIds.length>0},accounts,
    state:state?{paused:state.paused,lastAttemptAt:state.lastAttemptAt,lastSuccessAt:state.lastSuccessAt,lastError:state.lastError?bankErrors[state.lastError]||bankErrors.import_failed:null,stripeStatus:state.stripeStatus}:null,
    rules,movements:movements.map(r=>({...r,candidateStatus:r.candidateId?reviewStatus.get(r.candidateId)||null:null,
      duplicateMatchId:history.find(other=>other.id!==r.id&&!other.duplicateOfId&&other.accountId===r.accountId&&other.fingerprint===r.fingerprint&&other.createdAt<=r.createdAt)?.id||null})),subscriptions,summary:{currency:"EUR",currentBalanceCents:balance,stale:!fresh,historyDays,suspectedDuplicates,
      last30:{cashInflowCents:cashInflow,businessOutflowCents:businessOutflow,personalOutflowCents:personalOutflow},pendingCount:pending._count,pendingExpenseCents:pending._sum.amountCents||0,
      stripeMatchedCount:recent.filter(r=>r.stripePayoutId).length,stripeUnmatchedCount:recent.filter(r=>r.merchant==="Stripe"&&r.amountCents>0&&!r.stripePayoutId).length,
      subscriptionCount:subscriptions.length,forecast,personalReserveCents:personalReserve,forecastStatus:reliable?"provisional":"insufficient_data",
      forecastBasis:"Proyección de flujos bancarios de los últimos 30 días, incluida una reserva personal mínima de 203 €/mes. No es beneficio contable ni incorpora cobros futuros confirmados. Suscripciones incluidas en el histórico, no sumadas de nuevo."}};
}
export async function bankAggregate() {
  if(!pontoConfiguration().credentials)return {status:"not_configured",currency:"EUR",currentBalanceCents:null};
  try {
    const data=await bankOverview();
    // Explicit allowlist. Never expose account, transaction, merchant or personal details to Grok.
    const s=data.summary;
    return {status:data.state?.paused?"paused":data.state?.lastError?"error":s.stale?"stale":"available",currency:"EUR",asOf:data.state?.lastSuccessAt||null,
      currentBalanceCents:s.currentBalanceCents,pendingExpenseCount:s.pendingCount,pendingExpenseCents:s.pendingExpenseCents,
      observedBusinessOutflow30dCents:s.last30.businessOutflowCents,observedCashInflow30dCents:s.last30.cashInflowCents,
      stripeMatchedCount:s.stripeMatchedCount,stripeUnmatchedCount:s.stripeUnmatchedCount,subscriptionCount:s.subscriptionCount,forecast:s.forecast,forecastStatus:s.forecastStatus,
      definition:"Bank cash flows, not accounting revenue or validated expenses. Stripe settlements are internal cash transfers. Forecast uses 30-day observed flows and personal cash reserve; provisional, not committed cash."};
  }catch{return {status:"unavailable",currency:"EUR",currentBalanceCents:null};}
}
export async function classifyBankMovement(d:{id:string;category:string;personal:boolean;remember:boolean;exactAmount:boolean},userId:string) {
  return prisma.$transaction(async tx=>{
    const row=await tx.bankMovement.findUnique({where:{id:d.id}});
    if(!row||row.amountCents>=0||row.currency!=="EUR"||row.conflict||row.duplicateOfId)throw new Error("El movimiento no admite esta revisión.");
    const candidate=row.candidateId?await tx.businessExpenseCandidate.findUnique({where:{id:row.candidateId}}):null;
    if(candidate?.status==="approved")throw new Error("El gasto ya está contabilizado. Corrige primero el asiento en Finanzas.");
    if(d.remember)await tx.bankClassificationRule.create({data:{merchantKey:row.merchantKey,amountCents:d.exactAmount?-row.amountCents:null,category:d.category,personal:d.personal,createdById:userId}});
    const updated=await tx.bankMovement.update({where:{id:row.id},data:{category:d.category,personal:d.personal,reviewedById:userId,reviewedAt:new Date(),reason:d.personal?"Exclusión personal validada":"Clasificación revisada"}});
    if(candidate){
      await tx.businessExpenseCandidate.update({where:{id:candidate.id},data:{category:d.category,status:d.personal?"rejected":"pending",reviewNote:d.personal?"Movimiento personal excluido":null,reviewedAt:d.personal?new Date():null,reviewedById:d.personal?userId:null}});
    } else if(!d.personal)await candidateFor(tx,updated);
  },{isolationLevel:"Serializable"});
}
export async function reviewBankDuplicate(id:string,duplicateOfId:string|null,userId:string){
  return prisma.$transaction(async tx=>{
    const row=await tx.bankMovement.findUnique({where:{id}});
    if(!row||id===duplicateOfId)throw new Error("Invalid duplicate");
    const candidate=row.candidateId?await tx.businessExpenseCandidate.findUnique({where:{id:row.candidateId}}):null;
    if(candidate?.status==="approved")throw new Error("Already booked");
    if(duplicateOfId){
      const original=await tx.bankMovement.findUnique({where:{id:duplicateOfId}});
      if(!original||original.duplicateOfId||original.accountId!==row.accountId||original.fingerprint!==row.fingerprint)throw new Error("Not a matching movement");
    }
    await tx.bankMovement.update({where:{id},data:{duplicateOfId,reviewedById:userId,reviewedAt:new Date()}});
    if(candidate)await tx.businessExpenseCandidate.update({where:{id:candidate.id},data:{status:duplicateOfId||row.personal?"rejected":"pending",reviewedById:userId,reviewedAt:new Date(),reviewNote:duplicateOfId?"Duplicado bancario confirmado":null}});
  },{isolationLevel:"Serializable"});
}
