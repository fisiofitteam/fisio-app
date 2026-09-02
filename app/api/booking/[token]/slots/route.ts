import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchBusyBlocks } from "@/lib/googleFreeBusy";
import { computeFreeSlots } from "@/lib/patient-call-slots";

/**
 * GET /api/booking/[token]/slots?from=ISO&to=ISO
 *
 * Endpoint PÚBLICO (sin sesión). Valida el token del PatientCall, consulta
 * FreeBusy del fisio para la ventana pedida y devuelve la lista de huecos
 * libres para esa duración. La landing muestra estos slots al paciente.
 *
 * Contrato de "from/to": obligatorio, ISO. Recomendado ventana de <=14 días.
 */
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const url = new URL(req.url);
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");
  if (!fromStr || !toStr) {
    return NextResponse.json({ error: "from y to obligatorios" }, { status: 400 });
  }
  const from = new Date(fromStr);
  const to = new Date(toStr);
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from) {
    return NextResponse.json({ error: "from/to inválidos" }, { status: 400 });
  }
  const spanMs = to.getTime() - from.getTime();
  if (spanMs > 30 * 24 * 3600 * 1000) {
    return NextResponse.json({ error: "Ventana máxima 30 días" }, { status: 400 });
  }

  const call = await prisma.patientCall.findUnique({
    where: { bookingToken: params.token },
    select: {
      id: true,
      status: true,
      tokenExpiresAt: true,
      professionalId: true,
      durationMin: true,
      type: true,
      requiresForm: true,
      formCompletedAt: true,
    },
  });
  if (!call) return NextResponse.json({ error: "Token inválido" }, { status: 404 });
  if (call.status !== "pending") {
    return NextResponse.json({ error: "Este link ya fue usado", status: call.status }, { status: 409 });
  }
  if (call.tokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "Link caducado" }, { status: 410 });
  }

  // Gate: si el fisio pidió formulario previo y aún no está rellenado, no
  // devolvemos huecos — la landing muestra el formulario primero. Es también
  // un backstop por si alguien manipula la UI para saltarse el paso.
  if (call.requiresForm && !call.formCompletedAt) {
    return NextResponse.json({ needsForm: true, slots: [], durationMin: call.durationMin ?? null });
  }

  const [availability, oneOffs, exceptions, settings] = await Promise.all([
    prisma.professionalCallAvailability.findMany({
      where: { professionalId: call.professionalId },
      select: { dayOfWeek: true, startTime: true, endTime: true },
    }),
    // Cargamos one-offs cuya fecha caiga dentro de [from, to). Usamos un
    // margen de 1 día por cada lado para no perder ninguno por el offset
    // horario Madrid vs UTC (00:00 Madrid = 22:00/23:00 UTC del día previo).
    prisma.professionalCallAvailabilityOneOff.findMany({
      where: {
        professionalId: call.professionalId,
        date: {
          gte: new Date(from.getTime() - 86_400_000),
          lte: new Date(to.getTime() + 86_400_000),
        },
      },
      select: { date: true, startTime: true, endTime: true },
    }),
    prisma.professionalCallException.findMany({
      where: {
        professionalId: call.professionalId,
        date: {
          gte: new Date(from.getTime() - 86_400_000),
          lte: new Date(to.getTime() + 86_400_000),
        },
      },
      select: { date: true, startTime: true, endTime: true },
    }),
    prisma.professionalCallSettings.findUnique({
      where: { professionalId: call.professionalId },
      select: { optimizationDurationMin: true, renewalDurationMin: true },
    }),
  ]);

  const durationMin = call.durationMin
    ?? (call.type === "optimization"
      ? settings?.optimizationDurationMin ?? 45
      : settings?.renewalDurationMin ?? 45);

  let busy: Awaited<ReturnType<typeof fetchBusyBlocks>> = [];
  try {
    busy = await fetchBusyBlocks({ professionalId: call.professionalId, from, to });
  } catch (err: any) {
    // Si falla FreeBusy no arriesgamos ofrecer huecos que colapsen con
    // otra cita. Mejor fallar visible al paciente para que el fisio lo vea.
    return NextResponse.json(
      { error: "No se pudo consultar el calendario del fisio", detail: err?.message ?? "unknown" },
      { status: 502 },
    );
  }

  // Convertir cada one-off / excepción a la clave YYYY-MM-DD en zona Madrid
  // (el mismo formato que usa el helper computeFreeSlots internamente).
  const oneOffRows = oneOffs.map((o) => ({
    dateKey: o.date.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }),
    startTime: o.startTime,
    endTime: o.endTime,
  }));
  const exceptionRows = exceptions.map((e) => ({
    dateKey: e.date.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }),
    startTime: e.startTime,
    endTime: e.endTime,
  }));

  const slots = computeFreeSlots({
    availability,
    oneOffs: oneOffRows,
    exceptions: exceptionRows,
    busy,
    from,
    to,
    durationMin,
  });

  return NextResponse.json({
    durationMin,
    slots: slots.map((d) => d.toISOString()),
  });
}
