import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ContentNav } from "@/components/ContentNav";
import { canAccessSemaforoPanel } from "@/lib/semaforo/access";

export const dynamic = "force-dynamic";

/**
 * Índice de lead magnets del área Contenido. Por ahora solo hay uno
 * ("El Semáforo del Hombro"), pero está pensado para acumular varios
 * — cada tarjeta enlaza a su propio panel de gestión.
 *
 * Accesible a CEO / head_success / setter / closer (mismos que el panel
 * del Semáforo). En el sidebar solo aparece el link directo al setter;
 * el CEO llega desde Contenido > Lead magnets.
 */
export default async function LeadMagnetsIndexPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (!canAccessSemaforoPanel(user.role)) redirect("/fisio");

  // Contadores rápidos (30 días) para la tarjeta.
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 30);
  const [total30d, alarmas30d, completadas30d] = await Promise.all([
    prisma.semaforoRespuesta.count({ where: { createdAt: { gte: from } } }),
    prisma.semaforoRespuesta.count({ where: { createdAt: { gte: from }, estado: "ALARMA" } }),
    prisma.semaforoRespuesta.count({ where: { createdAt: { gte: from }, estado: "COMPLETADO" } }),
  ]);

  return (
    <main className="p-4 md:p-6 max-w-[1200px] mx-auto">
      <ContentNav active="lead-magnets" role={user.role} />

      <header className="mb-5">
        <h1 className="text-xl font-semibold">🧲 Lead magnets</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Tests y descargables que captan leads desde Instagram / anuncios.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link
          href="/fisio/contenido/lead-magnets/semaforo"
          className="block rounded-xl p-5 transition-colors"
          style={{ background: "white", border: "1px solid #E5E5E5" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1">Test interactivo</div>
              <h2 className="text-lg font-semibold">🚦 El Semáforo del Hombro</h2>
              <p className="text-sm text-neutral-600 mt-1">
                Atletas con dolor de hombro descubren si pueden entrenar, adaptar o parar.
              </p>
            </div>
            <span className="text-neutral-400 text-xl">→</span>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            <MiniTile label="30d" value={total30d} />
            <MiniTile label="Completados" value={completadas30d} />
            <MiniTile label="Alarmas" value={alarmas30d} color={alarmas30d > 0 ? "#DC2626" : undefined} />
          </div>
          <div className="text-[11px] text-neutral-500 mt-3">
            URL pública: <code>/semaforo</code>
          </div>
        </Link>

        <div
          className="rounded-xl p-5 flex items-center justify-center text-center text-neutral-400 italic"
          style={{ background: "#FAFAFA", border: "1px dashed #D4D4D4" }}
        >
          Próximos lead magnets aparecerán aquí.
        </div>
      </div>
    </main>
  );
}

function MiniTile({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg p-2" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
      <div className="text-[10px] text-neutral-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color: color ?? "#171717" }}>{value}</div>
    </div>
  );
}
