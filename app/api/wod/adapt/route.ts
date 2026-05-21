import { NextRequest, NextResponse } from "next/server";
import { parseWod, adaptWod } from "@/lib/wodParser";

export async function POST(req: NextRequest) {
  const { patientId, rawText } = await req.json();
  if (!patientId || !rawText) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }
  const parsed = await parseWod(rawText);
  const adapted = await adaptWod(parsed, patientId);
  return NextResponse.json({ lines: adapted });
}
