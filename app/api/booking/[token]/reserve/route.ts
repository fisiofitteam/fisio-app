import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createEventWithMeet } from "@/lib/googleEvents";
import { fetchBusyBlocks } from "@/lib/googleFreeBusy";
import { sendEmail } from "@/lib/email";

/**
 * POST /api/booking/[token]/reserve
 * body: { startAt: ISO, patientEmail?: string }
 *
 * Endpoint PÚBLICO. Recibe el slot elegido por el paciente:
 *   1. Valida token + estado + expiración.
 *   2. Re-comprueba FreeBusy contra el mismo tramo (defensivo — evita
 *      condiciones de carrera con otras citas creadas mientras el paciente
 *      elegía en la landing).
 *   3. Crea el evento en el calendario del fisio con Meet incluido.
 *   4. Marca el PatientCall como scheduled, guarda meetingUrl y googleEventId.
 *   5. Envía mail de confirmación al paciente y al fisio.
 *
 * Idempotencia: si el token ya no está pending, no reservamos otra vez.
 */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const body = await req.json().catch(() => ({}));
  const startAtStr = String(body?.startAt ?? "");
  const patientEmailInput = typeof body?.patientEmail === "string" ? body.patientEmail.trim().toLowerCase() : null;

  if (!startAtStr) return NextResponse.json({ error: "startAt obligatorio" }, { status: 400 });
  const startAt = new Date(startAtStr);
  if (isNaN(startAt.getTime())) return NextResponse.json({ error: "startAt inválido" }, { status: 400 });

  const call = await prisma.patientCall.findUnique({
    where: { bookingToken: params.token },
    include: {
      professional: { select: { id: true, fullName: true, email: true } },
      patient: { select: { id: true, fullName: true, email: true } },
    },
  });
  if (!call) return NextResponse.json({ error: "Token inválido" }, { status: 404 });
  if (call.status !== "pending") {
    return NextResponse.json({ error: "Este link ya fue usado", status: call.status }, { status: 409 });
  }
  if (call.tokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "Link caducado" }, { status: 410 });
  }

  const durationMin = call.durationMin ?? 45;
  const endAt = new Date(startAt.getTime() + durationMin * 60_000);

  // Re-check contra el calendario para evitar carrera con nueva cita creada
  // entre "cargar slots" y "reservar".
  const busy = await fetchBusyBlocks({
    professionalId: call.professionalId,
    from: startAt,
    to: endAt,
  });
  const conflict = busy.some((b) => b.start < endAt && b.end > startAt);
  if (conflict) {
    return NextResponse.json(
      { error: "El fisio ha ocupado ese hueco. Vuelve a elegir." },
      { status: 409 },
    );
  }

  // Email de contacto del paciente: preferimos el que ya tenemos en la ficha;
  // si el paciente escribe otro en la landing lo aceptamos igual (invitado).
  const patientEmail = call.patient.email ?? patientEmailInput;
  if (!patientEmail) {
    return NextResponse.json(
      { error: "Falta email de contacto del paciente para enviar la invitación de Meet" },
      { status: 400 },
    );
  }

  const typeLabel = call.type === "optimization" ? "Optimización" : "Renovación";
  const summary = `${typeLabel} — ${call.patient.fullName}`;
  const description = [
    `Llamada de ${typeLabel.toLowerCase()} con ${call.patient.fullName}.`,
    call.fisioNote ? `\nNota del fisio:\n${call.fisioNote}` : "",
  ].join("");

  let created;
  try {
    created = await createEventWithMeet({
      professionalId: call.professionalId,
      summary,
      description,
      start: startAt,
      end: endAt,
      attendeeEmails: [patientEmail, ...(call.professional.email ? [call.professional.email] : [])],
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "No se pudo crear el evento en el calendario del fisio", detail: err?.message ?? "unknown" },
      { status: 502 },
    );
  }

  const updated = await prisma.patientCall.update({
    where: { id: call.id },
    data: {
      status: "scheduled",
      scheduledAt: startAt,
      durationMin,
      meetingUrl: created.meetingUrl,
      googleEventId: created.id,
    },
    select: { id: true, scheduledAt: true, meetingUrl: true },
  });

  // Propagar al ScheduledCall enlazado (aviso del panel /fisio/llamadas):
  // el paciente ya reservó, así que le ponemos scheduledAt y una nota.
  // Best-effort: si la fila ya no existe (borrada a mano) o no está enlazada,
  // seguimos adelante.
  if (call.scheduledCallId) {
    try {
      await prisma.scheduledCall.update({
        where: { id: call.scheduledCallId },
        data: {
          scheduledAt: startAt,
          notes: `Agendada por el paciente vía link · ${typeLabel}`,
        },
      });
    } catch (e) {
      console.warn("[reserve] no se pudo propagar a ScheduledCall", call.scheduledCallId, e);
    }
  }

  // Emails de confirmación — best-effort. Si Resend falla no rompemos la
  // reserva; el evento ya está en el calendario del fisio.
  const humanDate = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    dateStyle: "full",
    timeStyle: "short",
  }).format(startAt);
  const meetLink = created.meetingUrl ?? "";

  await Promise.allSettled([
    sendEmail({
      to: patientEmail,
      subject: `Confirmada tu llamada de ${typeLabel.toLowerCase()} con ${call.professional.fullName}`,
      html: bookingConfirmationHtml({
        title: `Llamada de ${typeLabel.toLowerCase()} confirmada`,
        greeting: `Hola ${call.patient.fullName.split(" ")[0] ?? ""},`,
        body: `Nos vemos el <b>${humanDate}</b> (${durationMin} min) con ${call.professional.fullName}. Únete desde este enlace:`,
        cta: meetLink,
        ctaLabel: "Abrir Google Meet",
      }),
    }),
    call.professional.email
      ? sendEmail({
          to: call.professional.email,
          subject: `${call.patient.fullName} ha reservado su ${typeLabel.toLowerCase()}`,
          html: bookingConfirmationHtml({
            title: `Nueva llamada reservada`,
            greeting: `Hola ${call.professional.fullName.split(" ")[0] ?? ""},`,
            body: `${call.patient.fullName} ha reservado una ${typeLabel.toLowerCase()} el <b>${humanDate}</b> (${durationMin} min).`,
            cta: meetLink,
            ctaLabel: "Abrir Google Meet",
          }),
        })
      : Promise.resolve(),
  ]);

  return NextResponse.json({
    scheduledAt: updated.scheduledAt?.toISOString(),
    meetingUrl: updated.meetingUrl,
  });
}

function bookingConfirmationHtml(input: {
  title: string;
  greeting: string;
  body: string;
  cta: string;
  ctaLabel: string;
}): string {
  const ctaBlock = input.cta
    ? `<p style="margin:24px 0 8px;">
         <a href="${input.cta}" style="display:inline-block;background:#0A0A0A;color:#FAFAFA;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">${input.ctaLabel}</a>
       </p>
       <p style="margin:0;color:#525252;font-size:13px;">O copia este enlace: ${input.cta}</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="es"><body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:20px 28px;background:linear-gradient(135deg,#FCD34D 0%,#F59E0B 100%);color:#1f2937;font-weight:700;">FisioFit App</td></tr>
        <tr><td style="padding:28px;color:#171717;line-height:1.5;font-size:15px;">
          <h2 style="margin:0 0 12px;font-size:18px;">${input.title}</h2>
          <p style="margin:0 0 8px;">${input.greeting}</p>
          <p style="margin:0;">${input.body}</p>
          ${ctaBlock}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
