import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/auth";
import { activePatientCondition, currentlyPausedCondition } from "@/lib/patient-active";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") return NextResponse.json({ error: "Solo el CEO puede eliminar miembros" }, { status: 403 });
  if (user.id === params.id) return NextResponse.json({ error: "No puedes eliminar tu propia cuenta" }, { status: 400 });
  const result = await prisma.$transaction(async (tx) => {
    const member = await tx.professional.findUnique({ where: { id: params.id } });
    if (!member) return { status: 404, error: "Miembro no encontrado" };
    if (member.role === "ceo") return { status: 400, error: "No se puede eliminar una cuenta de CEO" };
    if (member.deletedAt) return null;

    // A finished patient's links identify their former team. Leave them in place.
    const patients = await tx.patient.count({ where: { AND: [
      { OR: [{ assignedProfessionalId: member.id }, { derivations: { some: { toProfessionalId: member.id } } }] },
      { OR: [activePatientCondition(), currentlyPausedCondition()] },
    ] } });
    const calls = await tx.lead.count({ where: { closerId: member.id, OR: [{ status: "scheduled" }, { inFollowUp: true }] } });
    if (patients || calls) {
      const reasons = [
        patients && (patients === 1
          ? "Revisa la asignación o derivación de 1 paciente vigente o en pausa."
          : `Revisa las asignaciones o derivaciones de ${patients} pacientes vigentes o en pausa.`),
        calls && (calls === 1
          ? "Reasigna 1 llamada pendiente o en seguimiento."
          : `Reasigna ${calls} llamadas pendientes o en seguimiento.`),
      ].filter(Boolean);
      return { status: 409, error: reasons.join(" ") };
    }
    await tx.professional.update({ where: { id: member.id }, data: { active: false, deletedAt: new Date(), passwordResetToken: null, passwordResetExpires: null, passwordHash: null } });
    await tx.session.deleteMany({ where: { professionalId: member.id } });
    return null;
  }, { isolationLevel: "Serializable" }).catch((e: unknown) => {
    if (e && typeof e === "object" && "code" in e && e.code === "P2034") {
      return { status: 409, error: "Las asignaciones han cambiado. Recarga el equipo y vuelve a intentarlo." };
    }
    throw e;
  });
  return result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json({ ok: true });
}
