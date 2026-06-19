/**
 * GET /api/anuncios/meta-diag
 *
 * Solo CEO. Devuelve un diagnóstico de la conexión con Meta para detectar
 * por qué algunas métricas (especialmente nuevos seguidores) no se cargan.
 *
 * Útil cuando "Nuevos seguidores" sale 0: comprobamos permisos del token,
 * acceso a la cuenta IG y respuestas de las llamadas críticas.
 */
import { NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { metaConfig, metaConfigured } from "@/lib/meta";

export const dynamic = "force-dynamic";

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v19.0"}`;

async function tryGraph(path: string, params: Record<string, string>) {
  try {
    const qs = new URLSearchParams({ ...params, access_token: metaConfig().token }).toString();
    const res = await fetch(`${GRAPH}/${path}?${qs}`, { cache: "no-store" });
    const data = await res.json();
    return { ok: res.ok && !data?.error, status: res.status, data };
  } catch (e: any) {
    return { ok: false, status: 0, data: { error: { message: e?.message ?? String(e) } } };
  }
}

export async function GET() {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!metaConfigured()) {
    return NextResponse.json({ error: "Meta no configurado" }, { status: 503 });
  }

  const { igUserId } = metaConfig();
  const since = Math.floor((Date.now() - 30 * 86400000) / 1000);
  const until = Math.floor(Date.now() / 1000);

  const results: any = {};

  // 1) Permisos del token
  results.permissions = await tryGraph("me/permissions", {});

  // 2) Quién soy
  results.me = await tryGraph("me", { fields: "id,name" });

  // 3) Cuenta IG básica
  results.igAccount = await tryGraph(igUserId, { fields: "username,followers_count,media_count" });

  // 4) Insights legacy follower_count + period=day
  results.followersLegacy = await tryGraph(`${igUserId}/insights`, {
    metric: "follower_count",
    period: "day",
    since: String(since),
    until: String(until),
  });

  // 5) Insights time_series (v22+)
  results.followersTimeSeries = await tryGraph(`${igUserId}/insights`, {
    metric: "follower_count",
    metric_type: "time_series",
    period: "day",
    since: String(since),
    until: String(until),
  });

  // 6) Versión de Graph
  results.graphVersion = process.env.META_GRAPH_VERSION || "v19.0";

  return NextResponse.json(results);
}
