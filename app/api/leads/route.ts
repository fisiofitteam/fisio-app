import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Crear lead: setter, head_success o ceo
  if (user.role !== "setter" && !user.isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await req.json();
  const lead = await prisma.lead.create({
    data: {
      fullName: data.fullName,
      contactType: data.contactType ?? "phone",
      contactValue: data.contactValue,
      aiSummary: data.aiSummary || null,
      callScheduledAt: new Date(data.callScheduledAt),
      closerId: data.closerId || null,
      setterId: user.role === "setter" ? user.id : data.setterId || null,
      status: "scheduled",
    },
  });
  return NextResponse.json(lead);
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const data = await req.json();
  const { id, ...rest } = data;

  // El closer puede editar SUS leads completamente (cambio de petición del CEO)
  if (user.role === "closer") {
    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead || lead.closerId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (user.role !== "setter" && !user.isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updateData: any = {};
  if (rest.fullName !== undefined) updateData.fullName = rest.fullName;
  if (rest.contactType !== undefined) updateData.contactType = rest.contactType;
  if (rest.contactValue !== undefined) updateData.contactValue = rest.contactValue;
  if (rest.aiSummary !== undefined) updateData.aiSummary = rest.aiSummary || null;
  if (rest.callScheduledAt !== undefined) updateData.callScheduledAt = new Date(rest.callScheduledAt);
  if (rest.closerId !== undefined) updateData.closerId = rest.closerId || null;
  if (rest.status !== undefined) {
    updateData.status = rest.status;
    updateData.decidedAt = new Date();
  }
  if (rest.lostReason !== undefined) updateData.lostReason = rest.lostReason || null;

  // Si marcamos inFollowUp=true y todavía no se había iniciado, autocalculamos las 4 fechas
  if (rest.inFollowUp === true) {
    const existing = await prisma.lead.findUnique({ where: { id } });
    updateData.inFollowUp = true;
    if (existing && !existing.followUpStartedAt) {
      const now = new Date();
      const add = (hours: number) => {
        const d = new Date(now);
        d.setHours(d.getHours() + hours);
        return d;
      };
      const addDays = (days: number) => {
        const d = new Date(now);
        d.setDate(d.getDate() + days);
        return d;
      };
      updateData.followUpStartedAt = now;
      updateData.followUp24hDate = add(24);
      updateData.followUp48hDate = add(60); // punto medio 48-72h
      updateData.followUp30dDate = addDays(30);
      updateData.followUp90dDate = addDays(90);
    }
  } else if (rest.inFollowUp === false) {
    updateData.inFollowUp = false;
  }

  // Toggles individuales de follow-up
  if (rest.followUp24hDone !== undefined) updateData.followUp24hDone = !!rest.followUp24hDone;
  if (rest.followUp48hDone !== undefined) updateData.followUp48hDone = !!rest.followUp48hDone;
  if (rest.followUp30dDone !== undefined) updateData.followUp30dDone = !!rest.followUp30dDone;
  if (rest.followUp90dDone !== undefined) updateData.followUp90dDone = !!rest.followUp90dDone;

  if (rest.followUpNote !== undefined) updateData.followUpNote = rest.followUpNote || null;

  const lead = await prisma.lead.update({ where: { id }, data: updateData });
  return NextResponse.json(lead);
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || (user.role !== "setter" && !user.isManager)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await prisma.lead.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
