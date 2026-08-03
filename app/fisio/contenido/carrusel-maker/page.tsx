import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ContentNav } from "@/components/ContentNav";
import { LandingActions } from "@/components/CarouselMaker/LandingActions";

export const dynamic = "force-dynamic";

export default async function CarouselMakerLandingPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/");
  const canManage = user.role === "ceo" || user.role === "head_success" || user.role === "fisio";
  if (!canManage) redirect("/fisio");

  const [libraryCount, drafts] = await Promise.all([
    (prisma as any).carouselLibraryEntry.count(),
    (prisma as any).carousel.findMany({
      where: { status: { in: ["draft", "published"] } },
      orderBy: { updatedAt: "desc" },
      take: 12,
    }),
  ]);

  return (
    <main>
      <ContentNav active="carousel-maker" role={user.role} />

      <header className="mb-6">
        <h1 className="text-xl font-semibold">Carrusel Maker</h1>
        <p className="text-xs text-neutral-500 mt-0.5 max-w-2xl">
          Genera carruseles para Instagram con IA usando tus carruseles publicados como
          referencia de tono. Cuanta más biblioteca acumules, mejor te sonará.
        </p>
      </header>

      <LandingActions libraryCount={libraryCount} />

      <section>
        <h2 className="font-medium text-sm mb-3">Drafts recientes</h2>
        {drafts.length === 0 ? (
          <p className="text-sm text-neutral-500 py-8 text-center border border-dashed border-neutral-200 rounded-xl">
            Aún no has generado ningún carrusel. Empieza por rellenar la biblioteca.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {drafts.map((d: any) => (
              <Link
                key={d.id}
                href={`/fisio/contenido/carrusel-maker/${d.id}`}
                className="card !p-3 hover:border-neutral-400 transition-colors"
              >
                <div className="font-medium text-sm truncate">{d.title}</div>
                <div className="text-[10px] uppercase tracking-wide text-neutral-500 mt-0.5">
                  {d.status} · {new Date(d.updatedAt).toLocaleDateString("es-ES")}
                </div>
                <p className="text-xs text-neutral-600 line-clamp-2 mt-1">{d.brief}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
