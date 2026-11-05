import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { decrypt } from "@/lib/encryption";
import { getValidAccessToken } from "@/lib/googleCalendar";
import { revokeToken } from "@/lib/googleOAuth";

/**
 * GET /api/google/status[?scope=personal]
 *
 * Devuelve estado de la conexión Google. Por defecto la organizacional
 * (videoconsultas). Con ?scope=personal, la del profesional logueado.
 */
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ connected: false });

  const scope = req.nextUrl.searchParams.get("scope") === "personal" ? "personal" : "organizational";

  const conn = await prisma.googleCalendarConnection.findFirst({
    where: scope === "personal"
      ? { professionalId: user.id }
      : { isOrganizational: true },
    orderBy: { createdAt: "desc" },
  });

  if (!conn) {
    return NextResponse.json({ connected: false, scope });
  }

  let connectedBy: { id: string; fullName: string } | null = null;
  if (conn.connectedById) {
    const p = await prisma.professional.findUnique({
      where: { id: conn.connectedById },
      select: { id: true, fullName: true },
    });
    if (p) connectedBy = p;
  }

  return NextResponse.json({
    connected: true,
    scope,
    googleEmail: conn.googleEmail,
    googleName: conn.googleName,
    tokenExpiresAt: conn.tokenExpiresAt.toISOString(),
    connectedBy,
    createdAt: conn.createdAt.toISOString(),
    lastUsedAt: conn.lastUsedAt?.toISOString() ?? null,
    scopes: conn.scopes.split(" ").filter(Boolean),
  });
}

/**
 * DELETE /api/google/status[?scope=personal]
 *
 * Desconecta y revoca. Por defecto la organizacional (solo CEO/head_success).
 * Con ?scope=personal, cualquier usuario logueado desconecta la suya.
 */
export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const scope = req.nextUrl.searchParams.get("scope") === "personal" ? "personal" : "organizational";

  if (scope === "organizational" && !(user.role === "ceo" || user.role === "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const conn = await prisma.googleCalendarConnection.findFirst({
    where: scope === "personal"
      ? { professionalId: user.id }
      : { isOrganizational: true },
    orderBy: { createdAt: "desc" },
  });
  if (!conn) {
    return NextResponse.json({ ok: true, note: "No había conexión" });
  }

  if (scope === "organizational") {
    await prisma.googleCalendarConnection.update({ where: { id: conn.id }, data: { isOrganizational: false } });
    return NextResponse.json({ ok: true });
  }
  if (conn.isOrganizational || await prisma.lead.count({ where: { googleCalendarEmail: conn.googleEmail } })) {
    return NextResponse.json({ error: "Esta cuenta se usa en la agenda compartida o en llamadas guardadas. Cambia la agenda compartida y transfiere sus llamadas antes de desconectarla." }, { status: 409 });
  }
  try {
    const accessToken = decrypt(conn.accessTokenEnc);
    await revokeToken(accessToken);
  } catch {
    // Ignoramos errores; lo importante es borrar de nuestra BD
  }

  await prisma.googleCalendarConnection.delete({ where: { id: conn.id } });
  return NextResponse.json({ ok: true });
}

// Select an already-authorized Google account without losing its personal binding.
export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") return NextResponse.json({ error: "Solo el CEO puede cambiar la agenda compartida" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.googleEmail !== "string") return NextResponse.json({ error: "Cuenta requerida" }, { status: 400 });
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { googleEmail: body.googleEmail } });
  if (!conn) return NextResponse.json({ error: "Conecta primero esta cuenta de Google" }, { status: 400 });
  try {
    const token = await getValidAccessToken({ googleEmail: conn.googleEmail });
    const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList/' + encodeURIComponent(conn.googleEmail), { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
    const calendar = await res.json();
    if (!res.ok || !['owner', 'writer'].includes(calendar.accessRole)) return NextResponse.json({ error: "La cuenta no tiene acceso de escritura a su calendario. Reconéctala antes de cambiar la agenda." }, { status: 409 });
    await prisma.$transaction(async tx => {
      const previous = await tx.googleCalendarConnection.findFirst({ where: { isOrganizational: true } });
      if (previous) await tx.lead.updateMany({ where: { googleEventId: { not: null }, googleCalendarEmail: null }, data: { googleCalendarEmail: previous.googleEmail } });
      await tx.googleCalendarConnection.updateMany({ where: { isOrganizational: true }, data: { isOrganizational: false } });
      await tx.googleCalendarConnection.update({ where: { id: conn.id }, data: { isOrganizational: true } });
    });
    return NextResponse.json({ ok: true, googleEmail: conn.googleEmail });
  } catch {
    return NextResponse.json({ error: "No se pudo validar Google Calendar. Reconecta la cuenta e inténtalo de nuevo." }, { status: 409 });
  }
}
