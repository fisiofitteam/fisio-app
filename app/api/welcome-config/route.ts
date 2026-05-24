import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { normalizeWelcomeConfig } from "@/lib/welcome-content";
import { getWelcomeConfig } from "@/lib/welcome-config";

// GET /api/welcome-config — config efectiva (BD o defaults). Solo CEO.
export async function GET() {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(await getWelcomeConfig());
}

// PUT /api/welcome-config — guarda el mensaje de bienvenida. Solo CEO.
// body: WelcomeConfig
export async function PUT(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const config = normalizeWelcomeConfig(body);
  if (!config.fallbackLine1.trim() && !config.fallbackLine2.trim()) {
    return NextResponse.json({ error: "El mensaje por defecto no puede estar vacío." }, { status: 400 });
  }

  await prisma.welcomeMessageConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", content: JSON.stringify(config), updatedById: user.id },
    update: { content: JSON.stringify(config), updatedById: user.id },
  });

  return NextResponse.json({ ok: true, ...config });
}
