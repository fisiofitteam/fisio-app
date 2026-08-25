/**
 * POST /api/exercises/match
 *
 * Recibe una lista de nombres de ejercicios (los que la IA extrajo del guion
 * generado) y devuelve el matching contra la biblioteca `ExerciseLibrary`.
 * Match case-insensitive por nombre exacto y, si no hay exacto, contiene.
 *
 * Uso: el Programador IA del calendario del paciente lo llama tras generar
 * cada sesión para adjuntar los ejercicios de la biblioteca (con vídeo)
 * al snapshot que persiste en ProgramSession.tasksSnapshot.
 *
 * Body: { names: string[] }
 * Respuesta: { matches: { [nameOriginal]: { id, name, category, youtubeUrl, description } | null } }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !["ceo", "head_success", "fisio"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const namesRaw = Array.isArray(body?.names) ? body.names : [];
  const names = namesRaw
    .map((n: unknown) => String(n ?? "").trim())
    .filter((n: string) => n.length > 0)
    .slice(0, 60); // límite defensivo

  if (names.length === 0) {
    return NextResponse.json({ matches: {} });
  }

  // Traemos toda la biblioteca — es pequeña y así hacemos el match en
  // memoria (con normalización + contains) sin explotar el número de queries.
  const library = await prisma.exerciseLibrary.findMany({
    select: {
      id: true,
      name: true,
      category: true,
      youtubeUrl: true,
      description: true,
    },
  });
  const indexed = library.map((ex) => ({ ex, key: normalize(ex.name) }));

  const matches: Record<string, {
    id: string; name: string; category: string;
    youtubeUrl: string | null; description: string | null;
  } | null> = {};

  for (const original of names) {
    const key = normalize(original);
    // 1) Match exacto
    let hit = indexed.find((x) => x.key === key);
    // 2) Biblioteca contiene el nombre buscado (ej. "hip thrust" vs "hip thrust con barra")
    if (!hit) hit = indexed.find((x) => x.key.includes(key));
    // 3) Nombre buscado contiene el de biblioteca (ej. "goblet squat a cajón alto" vs "goblet squat")
    if (!hit) hit = indexed.find((x) => key.includes(x.key));
    matches[original] = hit
      ? {
          id: hit.ex.id,
          name: hit.ex.name,
          category: hit.ex.category,
          youtubeUrl: hit.ex.youtubeUrl,
          description: hit.ex.description,
        }
      : null;
  }

  return NextResponse.json({ matches });
}
