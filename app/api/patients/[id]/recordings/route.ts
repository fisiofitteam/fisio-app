import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canAccessEvidencePatient } from "@/lib/patient-evidence";
import { validateRecording } from "@/lib/cap-recordings";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const actor = await getActiveProfessional();
  if (!actor || !await canAccessEvidencePatient(params.id, actor)) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  let data;
  try { data = validateRecording(await req.json()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Datos incorrectos" }, { status: 400 }); }
  const row = await prisma.patientRecording.create({ data: { ...data, patientId: params.id, createdById: actor.id } });
  return NextResponse.json({ id: row.id }, { status: 201 });
}
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const actor = await getActiveProfessional();
  if (!actor || !await canAccessEvidencePatient(params.id, actor)) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta la grabación" }, { status: 400 });
  const result = await prisma.patientRecording.deleteMany({ where: { id, patientId: params.id } });
  return NextResponse.json({ deleted: result.count });
}
