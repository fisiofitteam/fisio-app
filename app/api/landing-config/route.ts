import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { normalizeRenewalCopy } from "@/lib/landing-content";
import { getRenewalLandingCopy } from "@/lib/landing-config";

// GET /api/landing-config?key=renewal — copy efectivo (BD o defaults). Solo CEO.
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const key = req.nextUrl.searchParams.get("key") || "renewal";
  if (key !== "renewal") return NextResponse.json({ error: "Landing no válida" }, { status: 400 });
  const content = await getRenewalLandingCopy();
  return NextResponse.json({ key, content });
}

// PUT /api/landing-config — guarda el copy. Solo CEO.
// body: { key: "renewal", content: {...} }
export async function PUT(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const key = String(body?.key || "");
  if (key !== "renewal") {
    return NextResponse.json({ error: "Landing no válida" }, { status: 400 });
  }

  const content = normalizeRenewalCopy(body?.content);

  await prisma.landingConfig.upsert({
    where: { id: key },
    create: { id: key, content: JSON.stringify(content), updatedById: user.id },
    update: { content: JSON.stringify(content), updatedById: user.id },
  });

  return NextResponse.json({ ok: true, key, content });
}
