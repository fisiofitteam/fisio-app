import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { normalizeRenewalCopy, normalizeContractCopy, normalizeAgendaCopy } from "@/lib/landing-content";
import { getRenewalLandingCopy, getContractLandingCopy, getAgendaLandingCopy } from "@/lib/landing-config";

const KEYS = ["renewal", "contract", "agenda"];

function normalizeByKey(key: string, content: unknown) {
  if (key === "renewal") return normalizeRenewalCopy(content);
  if (key === "contract") return normalizeContractCopy(content);
  return normalizeAgendaCopy(content);
}

async function getByKey(key: string) {
  if (key === "renewal") return getRenewalLandingCopy();
  if (key === "contract") return getContractLandingCopy();
  return getAgendaLandingCopy();
}

// GET /api/landing-config?key=renewal|contract|agenda — copy efectivo. Solo CEO.
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const key = req.nextUrl.searchParams.get("key") || "renewal";
  if (!KEYS.includes(key)) return NextResponse.json({ error: "Landing no válida" }, { status: 400 });
  return NextResponse.json({ key, content: await getByKey(key) });
}

// PUT /api/landing-config — body: { key, content }. Solo CEO.
export async function PUT(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const key = String(body?.key || "");
  if (!KEYS.includes(key)) return NextResponse.json({ error: "Landing no válida" }, { status: 400 });

  const content = normalizeByKey(key, body?.content);

  await prisma.landingConfig.upsert({
    where: { id: key },
    create: { id: key, content: JSON.stringify(content), updatedById: user.id },
    update: { content: JSON.stringify(content), updatedById: user.id },
  });

  return NextResponse.json({ ok: true, key, content });
}
