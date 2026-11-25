import { NextRequest, NextResponse } from "next/server";
import { authorizeGrok } from "@/lib/grok-ceo-contract";
import { collectGrokSnapshot } from "@/lib/grok-ceo";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(req: NextRequest) {
  if (!authorizeGrok(req.headers.get("authorization"), process.env.GROK_CEO_READ_TOKEN))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await collectGrokSnapshot(), { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Metrics unavailable" }, { status: 503 }); }
}
