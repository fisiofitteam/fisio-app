import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";

const VALID = new Set(NOTIFICATION_TYPES.map((t) => t.value));

// GET /api/notification-prefs — preferencias propias (objeto { tipo: boolean }).
export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const p = await prisma.professional.findUnique({
    where: { id: user.id },
    select: { notificationPrefs: true },
  });
  return NextResponse.json(p?.notificationPrefs ?? {});
}

// PUT /api/notification-prefs — body { prefs: { tipo: boolean } }
export async function PUT(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const incoming = b?.prefs && typeof b.prefs === "object" ? b.prefs : {};
  const clean: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (VALID.has(k)) clean[k] = v !== false; // solo guardamos booleanos válidos
  }

  await prisma.professional.update({
    where: { id: user.id },
    data: { notificationPrefs: clean },
  });
  return NextResponse.json({ ok: true });
}
