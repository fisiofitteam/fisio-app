import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { metaConfigured, getInstagramAccount, getNewFollowers, getRecentMedia, getAdSpend } from "@/lib/meta";

export const dynamic = "force-dynamic";

// GET /api/integrations/meta — estado de la conexión + datos para mostrar.
export async function GET() {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!metaConfigured()) return NextResponse.json({ configured: false });

  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const until = now.toISOString().slice(0, 10);

  const errors: string[] = [];
  let account = null, newFollowers = null, adSpendMonth = null, posts: any[] = [];

  try { account = await getInstagramAccount(); } catch (e: any) { errors.push(`Instagram: ${e.message}`); }
  try { newFollowers = await getNewFollowers(30); } catch (e: any) { errors.push(`Seguidores: ${e.message}`); }
  try { posts = await getRecentMedia(12); } catch (e: any) { errors.push(`Posts: ${e.message}`); }
  try { adSpendMonth = await getAdSpend(since, until); } catch (e: any) { errors.push(`Anuncios: ${e.message}`); }

  return NextResponse.json({ configured: true, account, newFollowers, adSpendMonth, posts, errors });
}

// POST /api/integrations/meta — acciones de sincronización.
// body: { action: "sync-followers" }
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!metaConfigured()) return NextResponse.json({ error: "Meta no configurado" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  if (b?.action === "sync-followers") {
    try {
      const account = await getInstagramAccount();
      const newFollowers = await getNewFollowers(30);
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth();
      await prisma.businessMonthlyInput.upsert({
        where: { year_month: { year, month } },
        create: { year, month, totalFollowers: account.followersCount, newFollowers },
        update: { totalFollowers: account.followersCount, newFollowers },
      });
      return NextResponse.json({ ok: true, totalFollowers: account.followersCount, newFollowers });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
