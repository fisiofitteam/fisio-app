/**
 * Diagnóstico de login del paciente.
 *
 * GET /api/admin/diagnose-login?email=xxx[&send=1]
 *
 * Devuelve TODO lo que el sistema sabe sobre ese email:
 *   - ¿Existe un paciente con ese email? ¿Coincide tal cual o solo
 *     "contiene"? ¿Cuál es el email guardado exactamente (con espacios
 *     o mayúsculas si los hubiera)?
 *   - ¿Cuántos LoginCode se han creado en las últimas 24h?
 *   - ¿Está activo el modo demo de Apple?
 *   - ¿Está configurado Resend? ¿Qué EMAIL_FROM se usa?
 *   - Si pasas &send=1, intenta enviar el código AHORA y devuelve el
 *     resultado real del proveedor (ok o error). Útil para reproducir
 *     un fallo de envío y ver el mensaje exacto.
 *
 * Solo CEO y head_success. Pensado como herramienta de soporte rápido:
 * el CEO puede pegar el email del paciente y entender en 5 segundos
 * por qué no le llega el código.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { generateNumericCode, hashCode } from "@/lib/auth";
import { emailLoginCode } from "@/lib/email";

export const dynamic = "force-dynamic";

const CODE_EXPIRY_MINUTES = 10;

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo" && user.role !== "head_success") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const emailRaw = req.nextUrl.searchParams.get("email") || "";
  const normalized = emailRaw.trim().toLowerCase();
  if (!normalized) {
    return NextResponse.json({ error: "Parámetro email requerido" }, { status: 400 });
  }
  const send = req.nextUrl.searchParams.get("send") === "1";

  // 1) ¿Existe paciente con ese email?
  // Probamos tres estrategias para detectar fallos de normalización en BD:
  //   - exact: coincidencia literal con el normalizado
  //   - insensitive: case-insensitive (modo postgres)
  //   - fuzzy: contains, por si el email guardado tiene espacios u otros
  //     caracteres invisibles que el alta no limpió
  const exact = await prisma.patient.findFirst({
    where: { email: normalized },
    select: { id: true, fullName: true, email: true, accessToken: true, accessTokenExpiresAt: true },
  });
  const insensitive = !exact
    ? await prisma.patient.findFirst({
        where: { email: { equals: normalized, mode: "insensitive" } },
        select: { id: true, fullName: true, email: true, accessToken: true, accessTokenExpiresAt: true },
      })
    : null;
  const fuzzyMatches = !exact && !insensitive
    ? await prisma.patient.findMany({
        where: { email: { contains: normalized, mode: "insensitive" } },
        select: { id: true, fullName: true, email: true },
        take: 5,
      })
    : [];

  const patient = exact ?? insensitive;

  // 2) Códigos recientes para ese email
  const recentCodes = await prisma.loginCode.findMany({
    where: {
      email: normalized,
      createdAt: { gte: new Date(Date.now() - 86400 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { createdAt: true, consumed: true, attempts: true, expiresAt: true },
  });

  // 3) Configuración del entorno
  const resendConfigured = !!process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM || "FisioFit App <noreply@fisiofitteam.com>";
  const demoEmail = (process.env.DEMO_PATIENT_EMAIL || "").toLowerCase().trim();
  const demoModeActive = !!demoEmail && normalized === demoEmail;

  // 4) Diagnóstico textual
  const reasons: string[] = [];
  if (!patient) {
    reasons.push("No hay paciente con ese email en BD. Revisa que el email guardado en la ficha sea exactamente el mismo que escribe el paciente.");
    if (fuzzyMatches.length > 0) {
      reasons.push(`Hay ${fuzzyMatches.length} paciente(s) con email PARECIDO. Revisa si está mal tecleado.`);
    }
  } else {
    const dbEmail = patient.email ?? "";
    if (dbEmail !== normalized) {
      reasons.push(`El email guardado en BD ("${dbEmail}") no coincide literal con la versión normalizada ("${normalized}"). Probablemente tiene espacios o mayúsculas. Edítalo en la ficha y guarda para limpiarlo.`);
    }
  }
  if (demoModeActive) {
    reasons.push("⚠ Modo DEMO activo para ese email (DEMO_PATIENT_EMAIL). El sistema NUNCA envía email — el paciente solo entra con el DEMO_PATIENT_CODE. Si es un paciente real, cambia el env var.");
  }
  if (!resendConfigured) {
    reasons.push("⚠ RESEND_API_KEY no está configurada en este entorno. Los emails NO se envían (solo se loggean por consola). Configúrala en Vercel.");
  }

  // 5) Si pide send=1, intentamos enviar AHORA y devolvemos el resultado.
  // Saltamos el cooldown porque esta herramienta es de soporte. Generamos
  // un código nuevo, lo guardamos en LoginCode (igual que el flujo real),
  // y llamamos a Resend. Solo si hay paciente y no es demo.
  let sendResult: any = null;
  if (send) {
    if (!patient) {
      sendResult = { ok: false, error: "No hay paciente con ese email — no se intenta envío" };
    } else if (demoModeActive) {
      sendResult = { ok: false, error: "Modo demo activo — no se envía email" };
    } else if (!patient.email) {
      sendResult = { ok: false, error: "El paciente no tiene email en BD" };
    } else {
      // Invalidar códigos anteriores
      await prisma.loginCode.updateMany({
        where: { email: normalized, consumed: false },
        data: { consumed: true },
      });
      const code = generateNumericCode(6);
      const expires = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);
      await prisma.loginCode.create({
        data: { email: normalized, codeHash: hashCode(code), expiresAt: expires },
      });
      const emailRes: any = await emailLoginCode({
        to: patient.email,
        code,
        fullName: patient.fullName,
      });
      sendResult = {
        ok: !!emailRes?.ok,
        previewMode: !!emailRes?.previewMode,
        error: emailRes?.error ?? null,
        to: patient.email,
        code: process.env.NODE_ENV === "development" ? code : "(oculto en prod)",
      };
    }
  }

  return NextResponse.json({
    input: { emailRaw, normalized },
    patient: patient
      ? {
          id: patient.id,
          fullName: patient.fullName,
          emailInDb: patient.email,
          hasAccessToken: !!patient.accessToken,
          accessTokenExpiresAt: patient.accessTokenExpiresAt?.toISOString() ?? null,
          matchedBy: exact ? "exact" : "insensitive",
        }
      : null,
    fuzzyMatches: fuzzyMatches.map((p) => ({ id: p.id, fullName: p.fullName, emailInDb: p.email })),
    recentCodes: recentCodes.map((c) => ({
      createdAt: c.createdAt.toISOString(),
      consumed: c.consumed,
      attempts: c.attempts,
      expiresAt: c.expiresAt.toISOString(),
      expired: c.expiresAt.getTime() < Date.now(),
    })),
    config: {
      resendConfigured,
      emailFrom,
      demoModeActive,
    },
    diagnosis: reasons,
    sendResult,
  });
}
