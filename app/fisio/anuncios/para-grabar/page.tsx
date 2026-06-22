import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { AdsSubnav } from "@/components/AdsSubnav";
import { AD_STATUS_LABELS } from "@/lib/ads";

export const dynamic = "force-dynamic";

function formatIcon(format: string): string {
  if (format === "video") return "🎥";
  if (format === "image") return "🖼️";
  if (format === "carousel") return "🎠";
  if (format === "story") return "📖";
  return "📄";
}

function formatLabel(format: string): string {
  if (format === "video") return "Vídeo";
  if (format === "image") return "Imagen";
  if (format === "carousel") return "Carrusel";
  if (format === "story") return "Story";
  return format;
}

export default async function AdsToRecordPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo" && user.role !== "setter") redirect("/fisio");

  // Anuncios en estado "recording" (Grabación), agrupados por campaña.
  const ads = await prisma.ad.findMany({
    where: { status: "recording" },
    include: {
      adset: {
        select: {
          id: true,
          name: true,
          campaign: { select: { id: true, name: true, status: true } },
        },
      },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  // Agrupar por campaña para que cuando vayas al box sepas qué montas en bloque
  const byCampaign = new Map<string, { campaignName: string; campaignId: string; ads: typeof ads }>();
  for (const a of ads) {
    const cId = a.adset.campaign.id;
    if (!byCampaign.has(cId)) {
      byCampaign.set(cId, { campaignId: cId, campaignName: a.adset.campaign.name, ads: [] });
    }
    byCampaign.get(cId)!.ads.push(a);
  }
  const groups = Array.from(byCampaign.values());

  return (
    <main>
      <header className="mb-3">
        <h1 className="text-xl font-semibold">🎬 Pendientes de grabación</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Anuncios en estado <strong>{AD_STATUS_LABELS.recording}</strong> agrupados por campaña.
          Lo que toca rodar la próxima vez que vayas al box.
        </p>
      </header>

      <AdsSubnav />

      <div className="mt-4">
        {ads.length === 0 ? (
          <section className="card text-center py-12">
            <p className="text-sm text-neutral-500 italic">
              No tienes anuncios en estado "Grabación". Marca un anuncio como Grabación desde su editor para que aparezca aquí.
            </p>
          </section>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <section key={g.campaignId} className="card">
                <header className="mb-2 flex justify-between items-baseline gap-2 flex-wrap">
                  <h2 className="text-sm font-semibold">
                    <Link href={`/fisio/anuncios/campanas/${g.campaignId}`} className="hover:underline">
                      🗂️ {g.campaignName}
                    </Link>
                  </h2>
                  <span className="text-[11px] text-neutral-500">{g.ads.length} para grabar</span>
                </header>
                <div className="divide-y divide-neutral-100">
                  {g.ads.map((a) => (
                    <Link
                      key={a.id}
                      href={`/fisio/anuncios/ad/${a.id}`}
                      className="block py-3 px-2 -mx-2 hover:bg-neutral-50 rounded transition-colors"
                    >
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span>{formatIcon(a.format)}</span>
                        <span className="font-medium">{a.name}</span>
                        <span className="text-[10px] text-neutral-400 uppercase">{formatLabel(a.format)}</span>
                      </div>
                      {a.hook && (
                        <p className="text-xs text-neutral-700 italic line-clamp-2 mt-1">"{a.hook}"</p>
                      )}
                      {(a.recordingLocation || a.recordingOutfit || a.recordingMaterial) && (
                        <div className="text-[11px] text-neutral-500 mt-1 flex gap-3 flex-wrap">
                          {a.recordingLocation && <span>📍 {a.recordingLocation}</span>}
                          {a.recordingOutfit && <span>👕 {a.recordingOutfit}</span>}
                          {a.recordingMaterial && <span>🎒 {a.recordingMaterial}</span>}
                        </div>
                      )}
                      <div className="text-[11px] text-neutral-400 mt-1">
                        Conjunto: {a.adset.name}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
