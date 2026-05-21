import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ProfilesByZone } from "@/components/ProfilesByZone";

export default async function ProfilesListPage() {
  const profiles = await prisma.clinicalProfile.findMany({
    include: {
      _count: { select: { levels: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-neutral-500">Protocolos clínicos con niveles</p>
        <Link href="/fisio/biblioteca/perfiles/nuevo" className="btn btn-primary text-xs">
          + Nuevo perfil
        </Link>
      </div>

      <ProfilesByZone
        profiles={profiles.map((p) => ({
          id: p.id,
          name: p.name,
          bodyZone: p.bodyZone || "otros",
          description: p.description ?? "",
          levelsCount: p._count.levels,
        }))}
      />
    </div>
  );
}
