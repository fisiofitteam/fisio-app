"use server";
import { revalidateTag, revalidatePath } from "next/cache";
import { getActiveProfessional } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { sidebarIdsForRole } from "@/lib/sidebar-order";
import { validateSidebarLayout } from "@/lib/sidebar-layout";
export async function saveSidebarLayout(raw: unknown) {
  const user = await getActiveProfessional();
  if (!user) throw new Error("Debes iniciar sesión para guardar tu menú.");
  const layout = validateSidebarLayout(raw, sidebarIdsForRole(user.role, user.extraRoles ?? []));
  await prisma.professional.update({ where: { id: user.id }, data: { sidebarLayout: JSON.stringify(layout) } });
  revalidateTag("sidebar-layout:" + user.id);
  revalidatePath("/fisio", "layout");
  return layout;
}
