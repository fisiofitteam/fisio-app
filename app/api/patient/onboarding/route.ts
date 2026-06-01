import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActivePatient } from "@/lib/auth";
import {
  missingRequiredAnamnesis,
  parseOnboardingTasks,
  summarizeBodyZone,
} from "@/lib/onboarding-content";
import { getOnboardingConfig } from "@/lib/onboarding-config";

// POST /api/patient/onboarding
// body: { action: "anamnesis", data: {...} }
//     | { action: "contract", dni: string, accepted: true }
//
// Siempre opera sobre el paciente de la sesión activa (no se acepta id externo,
// para que un paciente no pueda modificar el onboarding de otro).
export async function POST(req: NextRequest) {
  const patient = await getActivePatient();
  if (!patient) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  // Tareas actuales del onboarding (para hacer merge sin perder el resto)
  const current = await prisma.patient.findUnique({
    where: { id: patient.id },
    select: { onboardingTasks: true },
  });
  const tasks = parseOnboardingTasks(current?.onboardingTasks);

  if (action === "anamnesis") {
    const data = body?.data;
    if (!data || typeof data !== "object") {
      return NextResponse.json({ error: "Faltan respuestas" }, { status: 400 });
    }
    const config = await getOnboardingConfig();
    const missing = missingRequiredAnamnesis(data as Record<string, unknown>, config.anamnesisSteps);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios", missing },
        { status: 400 }
      );
    }

    // Derivar resumen de zona corporal para la ficha clínica (cache denormalizada).
    // Si el paciente no marcó nada en los multiselects, se mantiene el bodyZone
    // previo (no lo borramos: respetamos lo que el fisio pudo haber anotado a mano).
    const bodyZoneSummary = summarizeBodyZone(data as Record<string, unknown>);

    const updated = await prisma.patient.update({
      where: { id: patient.id },
      data: {
        anamnesisData: JSON.stringify(data),
        anamnesisCompletedAt: new Date(),
        ...(bodyZoneSummary ? { bodyZone: bodyZoneSummary } : {}),
        onboardingTasks: { ...tasks, anamnesis: true },
      },
      select: { onboardingTasks: true },
    });
    return NextResponse.json({ ok: true, tasks: updated.onboardingTasks });
  }

  if (action === "contract") {
    const dni = typeof body?.dni === "string" ? body.dni.trim() : "";
    if (!dni) {
      return NextResponse.json({ error: "DNI requerido" }, { status: 400 });
    }
    if (body?.accepted !== true) {
      return NextResponse.json({ error: "Debes aceptar el contrato" }, { status: 400 });
    }

    // Evidencia técnica de la firma
    const fwd = req.headers.get("x-forwarded-for") || "";
    const ip = fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || null;
    const userAgent = req.headers.get("user-agent") || null;

    // Texto/versión vigentes (editables por el CEO) — se guarda el snapshot
    const config = await getOnboardingConfig();

    const updated = await prisma.patient.update({
      where: { id: patient.id },
      data: {
        contractDNI: dni,
        contractSignedAt: new Date(),
        contractSignedFromIP: ip,
        contractSignedUserAgent: userAgent,
        contractVersion: config.contractVersion,
        contractTextSnapshot: config.contractText,
        onboardingTasks: { ...tasks, contract: true },
      },
      select: { onboardingTasks: true },
    });
    return NextResponse.json({ ok: true, tasks: updated.onboardingTasks });
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
