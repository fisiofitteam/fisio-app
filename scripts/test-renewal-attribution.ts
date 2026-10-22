import assert from "node:assert/strict";
const d = (s: string) => new Date(s + "T00:00:00Z");
const rows = [
 { id: "early-old", patientId: "early", startDate: d("2020-04-01"), endDate: d("2020-10-15"), decidedAt: d("2020-04-01"), isReservation: false, amountPaid: null, status: "finished" },
 { id: "early-new", patientId: "early", startDate: d("2020-10-15"), endDate: d("2021-02-15"), decidedAt: d("2020-08-10"), isReservation: false, amountPaid: 597, status: "active" },
 { id: "lost-old", patientId: "lost", startDate: d("2020-06-15"), endDate: d("2020-10-15"), decidedAt: d("2020-06-15"), isReservation: false, amountPaid: null, status: "finished" },
];
(globalThis as any).prisma = {
 subscriptionRenewal: { findMany: async ({where}: any) => rows.filter(r => {
   if (where.patientId) return where.patientId.in.includes(r.patientId);
   const key = where.decidedAt ? "decidedAt" : "endDate";
   const range = where[key];
   return r[key] >= range.gte && r[key] <= range.lte;
 }).map(r => ({...r, patient: {assignedProfessionalId: "fisio"}})) },
 patient: { findMany: async ({where}: any) => where.id.in.map((id: string) => ({id,assignedProfessionalId:"fisio"})) },
};
async function main(){
 const {getRenewalActivityInPeriod,listRealRenewalsInPeriod} = await import("../lib/renewals");
 const aug=await getRenewalActivityInPeriod(d("2020-08-01"),d("2020-08-31"));
 assert.equal(aug.filter(r=>r.patientId==="early"&&r.outcome==="renewed").length,1);
 const oct=await getRenewalActivityInPeriod(d("2020-10-01"),d("2020-10-31"));
 assert.equal(oct.some(r=>r.patientId==="early"),false,"earlier renewal must not become a loss");
 assert.equal(oct.filter(r=>r.patientId==="lost"&&r.outcome==="lost").length,1);
 const annual=await getRenewalActivityInPeriod(d("2020-01-01"),d("2020-12-31"));
 assert.deepEqual(oct,annual.filter(r=>r.when.getUTCMonth()===9),"monthly and annual reporting must agree");
 assert.equal((await listRealRenewalsInPeriod(d("2020-08-01"),d("2020-08-31"))).length,1);
 assert.equal((await listRealRenewalsInPeriod(d("2020-10-01"),d("2020-10-31"))).length,0);
 console.log("PASS: cross-month renewal excluded from losses, genuine losses retained, month/year consistency, renewal counted once");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
