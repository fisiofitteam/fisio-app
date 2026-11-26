import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
process.env.FISIO_DEV_BYPASS="false";
for(const [path,method] of [
  ["/api/cron/ponto-sync","GET"],
  ["/api/integrations/grok-ceo/metrics","GET"],
  ["/api/integrations/grok-ceo/report","POST"],
  ["/api/integrations/grok-ceo/exchange","GET"],
  ["/api/integrations/grok-ceo/exchange","POST"],
  ["/api/integrations/expense-candidates","POST"],
]){
  const res=middleware(new NextRequest("https://app.fisiofitteam.com"+path,{method}));
  assert.equal(res.headers.get("x-middleware-next"),"1");
  assert.equal(res.headers.get("location"),null);
}
for(const [path,method] of [
  ["/api/cron/ponto-sync","POST"],
  ["/api/cron/ponto-sync-extra","GET"],
  ["/api/ceo/bank","GET"],
  ["/api/integrations/grok-ceo/exchange","DELETE"],
  ["/api/integrations/expense-candidates","GET"],
  ["/api/integrations/grok-ceo/exchange-extra","GET"],
  ["/api/ceo/grok-exchange","GET"],
  ["/api/ceo/expense-candidates/stripe","POST"],
]){
  const res=middleware(new NextRequest("https://app.fisiofitteam.com"+path,{method}));
  assert.equal(res.status,307);
  assert.equal(new URL(res.headers.get("location")!).pathname,"/login");
}
console.log("CEO integration exact routes: OK");
