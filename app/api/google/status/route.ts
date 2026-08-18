import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { decrypt } from "@/lib/encryption";
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
      : { professionalId: null },
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
      : { professionalId: null },
    orderBy: { createdAt: "desc" },
  });
  if (!conn) {
    return NextResponse.json({ ok: true, note: "No había conexión" });
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
