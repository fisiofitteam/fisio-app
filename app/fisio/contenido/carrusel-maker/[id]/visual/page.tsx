import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { parseSlides } from "@/lib/carousel-maker/types";
import { parseVisual } from "@/lib/carousel-maker/visual";
import { VisualEditor } from "@/components/CarouselMaker/VisualEditor";

export const dynamic = "force-dynamic";

export default async function CarouselVisualPage({ params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) redirect("/");
  const canManage = user.role === "ceo" || user.role === "head_success" || user.role === "fisio";
  if (!canManage) redirect("/fisio");

  const draft = await (prisma as any).carousel.findUnique({ where: { id: params.id } });
  if (!draft) notFound();

  const slides = parseSlides(draft.slidesJson);
  const visual = parseVisual(draft.visualJson);

  return (
    <main>
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <Link href={`/fisio/contenido/carrusel-maker/${draft.id}`} className="text-xs text-neutral-500 hover:text-neutral-900">
          ← Volver al editor de texto
        </Link>
        <h1 className="text-lg font-semibold truncate">{draft.title}</h1>
      </div>
      <VisualEditor
        carouselId={draft.id}
        title={draft.title}
        slides={slides}
        initialVisual={visual}
      />
    </main>
  );
}
