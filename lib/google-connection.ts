import { prisma } from "@/lib/prisma";

export function getOrganizationalConnection() {
  return prisma.googleCalendarConnection.findFirst({ where: { isOrganizational: true }, orderBy: { createdAt: "desc" } });
}
