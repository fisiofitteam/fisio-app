import { NextRequest, NextResponse } from "next/server";
import { authorizeGrok } from "@/lib/grok-ceo-contract";
import { expenseCandidate } from "@/lib/business-expense-candidate-contract";
import { storeExpenseCandidate } from "@/lib/business-expense-candidate";
export const dynamic = "force-dynamic";
// Ingestion only: this credential cannot read the ledger or approve expenses.
export async function POST(req: NextRequest) {
  if (!authorizeGrok(req.headers.get("authorization"), process.env.GROK_EXPENSE_INGEST_TOKEN))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!req.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "JSON required" }, { status: 415 });
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 12000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const data = expenseCandidate.safeParse(body);
  if (!data.success || data.data.source === "manual") return NextResponse.json({ error: "Invalid candidate" }, { status: 400 });
  try {
    const saved = await storeExpenseCandidate(data.data);
    return saved ? NextResponse.json({ ok: true, ...saved }, { status: 201 }) : NextResponse.json({ error: "Source reference conflict" }, { status: 409 });
  } catch { return NextResponse.json({ error: "Ingestion unavailable" }, { status: 503 }); }
}
