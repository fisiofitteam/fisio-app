import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canUseEvidence, canAccessEvidencePatient, evidencePatientIds, EVIDENCE_TYPES, MAX_EVIDENCE_BYTES, MAX_WHATSAPP_CHARS, MAX_WHATSAPP_BYTES } from "@/lib/patient-evidence";
import { validEvidenceZone } from "@/lib/evidence-zones";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!canUseEvidence(user)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const patientId = req.nextUrl.searchParams.get("patientId");
  if (patientId && !await canAccessEvidencePatient(patientId, user)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const ids = await evidencePatientIds(user);
  const page = Math.max(0, Math.min(10000, Math.floor(Number(req.nextUrl.searchParams.get("page")) || 0)));
  const unassigned = req.nextUrl.searchParams.get("unassigned") === "1";
  const scope = patientId ? { patientId } : unassigned
    ? { patientId: null, ...(!user.isManager ? { createdById: user.id } : {}) }
    : ids ? { OR: [{ patientId: { in: ids } }, { patientId: null, createdById: user.id }] } : {};
  const zone = req.nextUrl.searchParams.get("bodyZone");
  if (zone && zone !== "unlabelled" && !validEvidenceZone(zone)) return NextResponse.json({ error: "Zona no válida" }, { status: 400 });
  const baseWhere = { status: "ready", ...scope };
  const where = { ...baseWhere, ...(zone ? { bodyZone: zone === "unlabelled" ? null : zone } : {}) };
  const [items, total, patients, folders] = await Promise.all([
    prisma.patientEvidence.findMany({ where, orderBy: { createdAt: "desc" }, skip: page * 30, take: 30,
      select: { id: true, patientId: true, name: true, kind: true, mimeType: true, url: true, notes: true, bodyZone: true, createdAt: true,
        patient: { select: { fullName: true } } } }),
    prisma.patientEvidence.count({ where }),
    prisma.patient.findMany({ where: ids ? { id: { in: ids } } : {}, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    prisma.patientEvidence.groupBy({ by: ["bodyZone"], where: baseWhere, _count: { _all: true } }),
  ]);
  return NextResponse.json({ items, total, patients, folders: folders.map(f => ({ bodyZone: f.bodyZone, count: f._count._all })) });
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!canUseEvidence(user)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const b = await req.json().catch(() => null);
  if (!b || (b.patientId != null && typeof b.patientId !== "string")) return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  if (b.bodyZone !== undefined && !validEvidenceZone(b.bodyZone)) return NextResponse.json({ error: "Zona no válida" }, { status: 400 });
  const bodyZone = b.bodyZone ?? null;
  const patientId = typeof b.patientId === "string" && b.patientId.trim() ? b.patientId.trim() : null;
  if (patientId && !await canAccessEvidencePatient(patientId, user)) return NextResponse.json({ error: "Cliente no disponible" }, { status: 403 });
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 180) : "";
  const notes = typeof b.notes === "string" ? b.notes.trim().slice(0, 4000) : "";
  if (!name) return NextResponse.json({ error: "Nombre obligatorio" }, { status: 400 });
  if (b.kind === "whatsapp" && b.chunked === true) {
    if (!Number.isInteger(b.size) || b.size <= 0 || b.size > MAX_WHATSAPP_BYTES) return NextResponse.json({ error: "El TXT debe tener un máximo de 50 MB." }, { status: 400 });
    const item = await prisma.patientEvidence.create({ data: { patientId, createdById: user.id, name, bodyZone,
      notes, kind: "whatsapp", mimeType: "text/plain", textContent: "", size: b.size, status: "pending" } });
    return NextResponse.json({ id: item.id });
  }
  if (b.kind === "whatsapp") {
    if (typeof b.textContent !== "string" || !b.textContent.trim() || b.textContent.length > MAX_WHATSAPP_CHARS || b.textContent.includes("\u0000"))
      return NextResponse.json({ error: "El TXT debe contener texto y tener un máximo de 200.000 caracteres." }, { status: 400 });
    const item = await prisma.patientEvidence.create({ data: { patientId, createdById: user.id, name, bodyZone,
      notes, kind: "whatsapp", mimeType: "text/plain", textContent: b.textContent, status: "ready" } });
    return NextResponse.json({ id: item.id });
  }
  if (!EVIDENCE_TYPES.includes(b.mimeType) || !Number.isInteger(b.size) || b.size <= 0 || b.size > MAX_EVIDENCE_BYTES)
    return NextResponse.json({ error: "Formato no admitido o archivo mayor de 1 GB." }, { status: 400 });
  const item = await prisma.patientEvidence.create({ data: { patientId, createdById: user.id, name, notes, bodyZone,
    mimeType: b.mimeType, size: b.size, kind: b.mimeType.startsWith("video/") ? "video" : b.mimeType.startsWith("image/") ? "image" : "document",
    status: "pending" } });
  return NextResponse.json({ id: item.id, pathname: "testimonials/" + item.id + "/" + name.replace(/[^a-zA-Z0-9._-]/g, "_") });
}
