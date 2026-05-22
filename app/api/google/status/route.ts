import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { decrypt } from "@/lib/encryption";
import { revokeToken } from "@/lib/googleOAuth";

/**
 * GET /api/google/status
 *
 * Devuelve si hay conexión activa con Google Calendar y datos básicos.
 */
export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ connected: false });

  const conn = await prisma.googleCalendarConnection.findFirst({
    orderBy: { createdAt: "desc" },
    include: { },
  });

  if (!conn) {
    return NextResponse.json({ connected: false });
  }

  // Buscar quién hizo la conexión (si aún existe)
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
 * DELETE /api/google/status
 *
 * Desconecta: revoca el token en Google y borra la conexión de la BD.
 * Solo CEO / Head_success.
 */
export async function DELETE() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(user.role === "ceo" || user.role === "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const conn = await prisma.googleCalendarConnection.findFirst({
    orderBy: { createdAt: "desc" },
  });
  if (!conn) {
    return NextResponse.json({ ok: true, note: "No había conexión" });
  }

  // Intentar revocar el token en Google (no fallar si Google ya lo revocó)
  try {
    const accessToken = decrypt(conn.accessTokenEnc);
    await revokeToken(accessToken);
  } catch {
    // Ignoramos errores aquí; lo importante es borrar de nuestra BD
  }

  await prisma.googleCalendarConnection.delete({ where: { id: conn.id } });
  return NextResponse.json({ ok: true });
}
