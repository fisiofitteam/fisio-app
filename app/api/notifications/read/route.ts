import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { markNotificationRead } from "@/lib/notifications";

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const ok = await markNotificationRead(id, { id: user.id, role: user.role });
  return NextResponse.json({ ok });
}
