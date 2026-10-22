/**
 * POST /api/patients/[id]/invoices — emite factura nueva al paciente. Solo CEO.
 * GET  /api/patients/[id]/invoices — lista las facturas del paciente. Solo CEO.
 *
 * Body POST:
 *   {
 *     concept: string,            // "Programa RECUPERA · 4 meses (mar - jul 2026)"
 *     baseAmount: number,         // importe sin IVA
 *     vatExempt?: boolean,        // default true
 *     vatRate?: number,           // default 0
 *     irpfRate?: number,          // default 0
 *     issueDate?: string,         // ISO; default ahora
 *     saleId?: string,
 *     subscriptionRenewalId?: string,
 *     transactionId?: string,
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { parseInvoiceDetails } from "@/lib/invoice-details";
import { issuePatientInvoice, getPatientInvoiceDefaults } from "@/lib/patient-invoices";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Solo el CEO puede emitir facturas" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const concept = String(body?.concept || "").trim();
  const baseAmount = Number(body?.baseAmount);
  if (!concept) return NextResponse.json({ error: "Concepto obligatorio" }, { status: 400 });
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
    return NextResponse.json({ error: "Importe inválido" }, { status: 400 });
  }

  let details;
  try { details = parseInvoiceDetails(body?.details); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Datos inválidos" }, { status: 400 }); }
  const issueDate = body?.issueDate ? new Date(body.issueDate) : undefined;
  if (issueDate && !Number.isFinite(issueDate.getTime())) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  for (const key of ["vatRate", "irpfRate"]) {
    if (body?.[key] !== undefined && (typeof body[key] !== "number" || !Number.isFinite(body[key]) || body[key] < 0 || body[key] > 100)) {
      return NextResponse.json({ error: "Los impuestos deben estar entre 0 y 100%" }, { status: 400 });
    }
  }
  try {
    const invoice = await issuePatientInvoice({
      patientId: params.id,
      issuerProfessionalId: user.id,
      details,
      concept,
      baseAmount,
      vatExempt: body?.vatExempt !== false,
      vatRate: typeof body?.vatRate === "number" ? body.vatRate : 0,
      irpfRate: typeof body?.irpfRate === "number" ? body.irpfRate : 0,
      issueDate,
      saleId: body?.saleId || null,
      subscriptionRenewalId: body?.subscriptionRenewalId || null,
      transactionId: body?.transactionId || null,
    });
    return NextResponse.json({ ok: true, invoice });
  } catch (e: any) {
    console.error("[POST invoice]", e);
    return NextResponse.json({ error: e?.message || "Error emitiendo factura" }, { status: 500 });
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (_req.nextUrl.searchParams.get("defaults") === "1") {
    try {
      const details = await getPatientInvoiceDefaults(params.id, user.id);
      return NextResponse.json({ details });
    } catch {
      return NextResponse.json({ error: "No se pudieron cargar los datos fiscales" }, { status: 404 });
    }
  }
  const invoices = await prisma.patientInvoice.findMany({
    where: { patientId: params.id },
    orderBy: [{ year: "desc" }, { sequence: "desc" }],
  });
  return NextResponse.json({ invoices });
}
