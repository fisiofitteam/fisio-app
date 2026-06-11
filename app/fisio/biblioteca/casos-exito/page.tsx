import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { SuccessCasesList } from "@/components/SuccessCasesList";

export default async function CasosExitoPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  const canManage = user.role === "ceo" || user.role === "head_success";
  if (!canManage) redirect("/fisio/biblioteca/programas");

  const cases = await prisma.successCase.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return (
    <SuccessCasesList
      cases={cases.map((c) => ({
        id: c.id,
        name: c.name,
        injury: c.injury,
        youtubeUrl: c.youtubeUrl,
        notes: c.notes ?? "",
        active: c.active,
      }))}
    />
  );
}
