import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getOnboardingConfig, normalizeSteps } from "@/lib/onboarding-config";

// GET: config efectiva (BD o defaults). Solo CEO.
export async function GET() {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const config = await getOnboardingConfig();
  return NextResponse.json(config);
}

// PUT: guarda la config editada. Solo CEO.
// body: { anamnesisSteps: AnamnesisStep[], contractText: string, contractVersion: string }
export async function PUT(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  const steps = normalizeSteps(body?.anamnesisSteps);
  if (steps.length === 0) {
    return NextResponse.json(
      { error: "El cuestionario debe tener al menos un paso con preguntas." },
      { status: 400 }
    );
  }

  const contractText = typeof body?.contractText === "string" ? body.contractText.trim() : "";
  if (!contractText) {
    return NextResponse.json({ error: "El texto del contrato no puede estar vacío." }, { status: 400 });
  }
  const contractVersion =
    typeof body?.contractVersion === "string" && body.contractVersion.trim()
      ? body.contractVersion.trim()
      : "v1";

  const data = {
    anamnesisSteps: JSON.stringify(steps),
    contractText,
    contractVersion,
    updatedById: user.id,
  };

  await prisma.onboardingConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });

  // Devuelve la config normalizada (ya saneada) para refrescar el editor
  return NextResponse.json({ ok: true, anamnesisSteps: steps, contractText, contractVersion });
}
