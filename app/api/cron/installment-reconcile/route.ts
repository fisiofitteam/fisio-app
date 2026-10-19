import { NextResponse } from "next/server";
import { reconcileInstallmentReceipts } from "@/lib/installment-reconciliation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Receipt repair only. Provider operations are reads; actual successful EUR
 * receipts are adopted/recorded by the same idempotent writer as webhooks.
 * ?dryRun=1 previews repairs. Explicit salesAfter/renewalsAfter cursors allow
 * historical passes; without cursors the cron rotates batches every 15 min. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, reason: "no_cron_secret" });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const batchSize = params.has("batchSize") ? Number(params.get("batchSize")) : undefined;
  if (batchSize !== undefined && (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 20)) {
    return NextResponse.json({ error: "batchSize debe estar entre 1 y 20" }, { status: 400 });
  }
  try {
    const report = await reconcileInstallmentReceipts({
      dryRun: params.get("dryRun") === "1",
      batchSize,
      ...(params.has("salesAfter") ? { salesAfter: params.get("salesAfter")! } : {}),
      ...(params.has("renewalsAfter") ? { renewalsAfter: params.get("renewalsAfter")! } : {}),
      ...(params.get("saleId") ? { saleId: params.get("saleId")! } : {}),
      ...(params.get("renewalId") ? { renewalId: params.get("renewalId")! } : {}),
    });
    console.log("[cron/installment-reconcile] report", {
      dryRun: report.dryRun, contracts: report.contractsProcessed,
      created: report.created, adopted: report.adopted, existing: report.existing,
      ambiguous: report.ambiguous, skipped: report.skipped, failed: report.failed,
    });
    return NextResponse.json({ ok: report.failed === 0, report });
  } catch (error) {
    console.error("[cron/installment-reconcile] failed", { error: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ ok: false, error: "installment_reconciliation_failed" }, { status: 500 });
  }
}
