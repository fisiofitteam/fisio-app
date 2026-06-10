import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ExportReelsView } from "@/components/ExportReelsView";

export const dynamic = "force-dynamic";

/**
 * /fisio/contenido/export-reels?month=YYYY-MM
 *
 * Vista print-friendly con todos los guiones de los REELS del mes
 * seleccionado. Pensada para Cmd+P → guardar como PDF.
 *
 * Solo el formato "reel" — los demás (carrusel, infografía, image, live)
 * NO se exportan porque normalmente solo necesitas tener a mano los
 * guiones de reel para la sesión de grabación.
 */
export default async function ExportReelsPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo" && user.role !== "setter") redirect("/fisio");

  // Parsear ?month=YYYY-MM; si no viene o es inválido, mes actual (Madrid)
  const now = new Date();
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth(); // 0-11
  if (searchParams.month) {
    const m = searchParams.month.match(/^(\d{4})-(\d{2})$/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]) - 1;
      if (y >= 2020 && y <= 2100 && mo >= 0 && mo <= 11) {
        year = y;
        month = mo;
      }
    }
  }

  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(year, month + 1, 1)); // exclusive

  // Cargamos las semanas que solapan con el mes. Filtraremos las piezas a
  // las que efectivamente caen dentro del mes (calculando la fecha real
  // a partir de week.startDate + dayOfWeek - 1).
  const weeks = await prisma.contentWeek.findMany({
    where: {
      // Una semana solapa el mes si su startDate < monthEnd y su endDate >= monthStart
      startDate: { lt: monthEnd },
      endDate: { gte: monthStart },
    },
    include: {
      pieces: {
        where: { format: "reel" },
        orderBy: { dayOfWeek: "asc" },
      },
    },
    orderBy: { startDate: "asc" },
  });

  // Aplanar piezas con su fecha de publicación calculada
  type Piece = (typeof weeks)[number]["pieces"][number] & {
    weekCentralTheme: string;
    pubDate: Date;
  };
  const allPieces: Piece[] = [];
  for (const w of weeks) {
    for (const p of w.pieces) {
      const pubDate = new Date(w.startDate);
      pubDate.setUTCDate(pubDate.getUTCDate() + (p.dayOfWeek - 1));
      // Solo dentro del mes
      if (pubDate >= monthStart && pubDate < monthEnd) {
        allPieces.push({
          ...p,
          weekCentralTheme: w.centralTheme,
          pubDate,
        });
      }
    }
  }
  // Orden cronológico
  allPieces.sort((a, b) => a.pubDate.getTime() - b.pubDate.getTime());

  // Selector de meses: 6 atrás + 6 adelante
  const monthOptions: Array<{ value: string; label: string }> = [];
  for (let off = -6; off <= 6; off++) {
    const d = new Date(Date.UTC(year, month + off, 1));
    const v = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const l = d.toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
    monthOptions.push({ value: v, label: l });
  }

  const monthLabel = monthStart.toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <ExportReelsView
      monthLabel={monthLabel}
      currentMonth={`${year}-${String(month + 1).padStart(2, "0")}`}
      monthOptions={monthOptions}
      pieces={allPieces.map((p) => ({
        id: p.id,
        title: p.title,
        format: p.format,
        goal: p.goal,
        hook: p.hook,
        blocks: p.blocks,
        caption: p.caption,
        dmKeyword: p.dmKeyword,
        pubDate: p.pubDate.toISOString(),
        weekCentralTheme: p.weekCentralTheme,
      }))}
    />
  );
}
