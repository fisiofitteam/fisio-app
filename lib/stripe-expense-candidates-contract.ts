import { madridDay } from "./grok-ceo-contract";

type FeeRow = { id:string; type:string; currency:string; fee:number; created:number };
export function groupStripeChargeFees(rows:readonly FeeRow[], start:Date, end:Date) {
  const seen=new Set<string>(), days=new Map<string,number>();
  for(const row of rows){
    if(seen.has(row.id))continue;
    seen.add(row.id);
    if(row.type!=="charge"||row.currency!=="eur"||!Number.isSafeInteger(row.fee)||row.fee<=0||!Number.isSafeInteger(row.created))continue;
    const at=new Date(row.created*1000);
    if(at<start||at>end)continue;
    const day=madridDay(at);
    const total=(days.get(day)??0)+row.fee;
    if(!Number.isSafeInteger(total)||total>100000000)throw Error("Invalid fee total");
    days.set(day,total);
  }
  return [...days.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([date,amountCents])=>({
    source:"stripe" as const, sourceRef:"stripe-charge-fees:"+date, merchant:"Stripe",
    description:"Comisiones de cobros en EUR · día completo de Madrid. Revisar conciliación.",
    amountCents,currency:"EUR" as const,date,category:"otros" as const,
  }));
}
