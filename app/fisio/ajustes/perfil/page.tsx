import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ProfileEditor } from "@/components/ProfileEditor";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");

  const p = await prisma.professional.findUnique({
    where: { id: user.id },
    select: { fullName: true, fiscalName: true, taxId: true, fiscalAddress: true, iban: true, photoUrl: true, vatExempt: true },
  });

  return (
    <main className="max-w-lg">
      <header className="mb-4">
        <Link href="/fisio/ajustes" className="text-xs text-neutral-500">← Ajustes</Link>
        <h1 className="text-xl font-semibold mt-1">Mi perfil</h1>
        <p className="text-xs text-neutral-500 mt-0.5">Estos datos aparecen en tus facturas mensuales.</p>
      </header>
      <ProfileEditor
        fullName={p?.fullName ?? user.fullName}
        initial={{
          fiscalName: p?.fiscalName ?? "",
          taxId: p?.taxId ?? "",
          fiscalAddress: p?.fiscalAddress ?? "",
          iban: p?.iban ?? "",
          photoUrl: p?.photoUrl ?? "",
          vatExempt: p?.vatExempt ?? true,
        }}
      />
    </main>
  );
}
