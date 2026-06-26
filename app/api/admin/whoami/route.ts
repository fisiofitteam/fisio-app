/**
 * Diagnóstico: devuelve qué rol y permisos tiene el usuario logueado AHORA.
 * Útil para depurar "no me funciona X" cuando crees que es de permisos.
 *
 * GET /api/admin/whoami
 */
import { NextResponse } from "next/server";
import { getActiveProfessional, getActivePatient } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const pro = await getActiveProfessional();
  const patient = !pro ? await getActivePatient() : null;
  return NextResponse.json({
    kind: pro ? "professional" : patient ? "patient" : "none",
    professional: pro ? {
      id: pro.id,
      fullName: pro.fullName,
      email: pro.email,
      role: pro.role,
      isManager: pro.isManager,
      canSeeLeads: pro.canSeeLeads,
      canEditLeads: pro.canEditLeads,
    } : null,
    patient: patient ? { id: patient.id, fullName: patient.fullName, email: patient.email } : null,
  });
}
