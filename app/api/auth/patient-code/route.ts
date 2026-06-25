import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateNumericCode, hashCode } from "@/lib/auth";
import { emailLoginCode } from "@/lib/email";

const CODE_EXPIRY_MINUTES = 10;
const COOLDOWN_SECONDS = 30; // entre peticiones del mismo email

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "Email requerido" }, { status: 400 });

  const normalized = email.toLowerCase().trim();

  // ─── Modo demo para Apple Review ───
  // Si está configurado DEMO_PATIENT_EMAIL y el lead pide código para ese
  // email exacto, NO enviamos email ni creamos LoginCode (el reviewer no
  // tiene buzón). Devolvemos OK para que el cliente avance a la pantalla
  // de "introducir código" — el reviewer usará el DEMO_PATIENT_CODE fijo
  // que se documenta en App Store Connect.
  const demoEmail = process.env.DEMO_PATIENT_EMAIL?.toLowerCase().trim();
  if (demoEmail && normalized === demoEmail) {
    return NextResponse.json({ ok: true });
  }

  // Búsqueda case-insensitive: cubre pacientes guardados antes del fix de
  // normalización (algunos leads se crearon con email con mayúsculas y al
  // cascadear al Patient quedó así → al normalizar el input no coincidía).
  const patient = await prisma.patient.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" } },
  });

  // No revelamos si existe el paciente o no
  if (!patient) {
    // Simulamos el delay
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ ok: true });
  }

  // Cooldown: si hay un código emitido hace menos de COOLDOWN_SECONDS, devolvemos sin reenviar
  const recent = await prisma.loginCode.findFirst({
    where: {
      email: normalized,
      createdAt: { gte: new Date(Date.now() - COOLDOWN_SECONDS * 1000) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    return NextResponse.json({ ok: true, cooldown: true });
  }

  // Invalidar códigos anteriores no consumidos
  await prisma.loginCode.updateMany({
    where: { email: normalized, consumed: false },
    data: { consumed: true },
  });

  const code = generateNumericCode(6);
  const expires = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

  await prisma.loginCode.create({
    data: {
      email: normalized,
      codeHash: hashCode(code),
      expiresAt: expires,
    },
  });

  const emailRes: any = await emailLoginCode({ to: patient.email!, code, fullName: patient.fullName });
  console.log("[patient-code] sendCode →", patient.email, "ok:", emailRes?.ok, "err:", emailRes?.error ?? "-");

  // Si el debug=1 se pide explícitamente, devolvemos el resultado real para
  // que el CEO pueda ver el motivo del fallo. En flujo normal nunca lo pasa el
  // cliente, así que seguimos siendo opacos para usuarios públicos.
  const debug = req.nextUrl.searchParams.get("debug") === "1";
  if (debug) {
    return NextResponse.json({ ok: !!emailRes?.ok, error: emailRes?.error ?? null });
  }
  return NextResponse.json({ ok: true });
}
