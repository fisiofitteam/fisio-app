import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

test("the installment cron reaches its bearer-authenticated handler without a team cookie", (t) => {
  const previous = process.env.FISIO_DEV_BYPASS;
  process.env.FISIO_DEV_BYPASS = "false";
  t.after(() => { if (previous == null) delete process.env.FISIO_DEV_BYPASS; else process.env.FISIO_DEV_BYPASS = previous; });
  const response = middleware(new NextRequest("https://app.fisiofitteam.com/api/cron/installment-reconcile"));
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(response.headers.get("location"), null);
});

test("opening the installment cron does not open other finance or cron routes", (t) => {
  const previous = process.env.FISIO_DEV_BYPASS;
  process.env.FISIO_DEV_BYPASS = "false";
  t.after(() => { if (previous == null) delete process.env.FISIO_DEV_BYPASS; else process.env.FISIO_DEV_BYPASS = previous; });
  for (const path of ["/fisio/finanzas", "/api/cron/other-job", "/api/cron/installment-reconcile-extra"]) {
    const response = middleware(new NextRequest("https://app.fisiofitteam.com" + path));
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get("location")!).pathname, "/login");
  }
});
