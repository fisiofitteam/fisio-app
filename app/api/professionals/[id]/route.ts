import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/auth";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") return NextResponse.json({ error: "Solo el CEO puede eliminar miembros" }, { status: 403 });
  if (user.id === params.id) return NextResponse.json({ error: "No puedes eliminar tu propia cuenta" }, { status: 400 });
  const result = await prisma.$transaction(async (tx) => {
    const member = await tx.professional.findUnique({ where: { id: params.id } });
    if (!member) return { status: 404, error: "Miembro no encontrado" };
    if (member.role === "ceo") return { status: 400, error: "No se puede eliminar una cuenta de CEO" };
    if (member.deletedAt) return null;
    const patients = await tx.patient.count({ where: { assignedProfessionalId: member.id } });
    const calls = await tx.lead.count({ where: { closerId: member.id, OR: [{ status: "scheduled" }, { inFollowUp: true }] } });
    if (patients || calls) return { status: 409, error: 'Reasigna primero sus ' + patients + ' pacientes y ' + calls + ' llamadas pendientes o en seguimiento.' };
    await tx.professional.update({ where: { id: member.id }, data: { active: false, deletedAt: new Date(), passwordResetToken: null, passwordResetExpires: null, passwordHash: null } });
    await tx.session.deleteMany({ where: { professionalId: member.id } });
    return null;
  });
  return result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json({ ok: true });
}
