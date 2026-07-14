/**
 * GET /api/community/unread
 *
 * Devuelve el número de posts + comentarios creados en la comunidad desde
 * la última vez que el profesional entró en /fisio/comunidad. Usado por el
 * badge del sidebar.
 *
 * Excluye lo que ha escrito ÉL MISMO (no los de otros pros, no los de
 * pacientes). Bug arreglado: antes NOT { professionalId: user.id } tambien
 * excluia los comentarios de pacientes (professionalId=null en ese caso),
 * asi que el CEO/head no veia el 90% de la actividad.
 *
 * Si el profesional nunca ha abierto la pestana, `since = 0` para contarle
 * TODO lo que hay. Antes hacia fallback a lastLoginAt lo cual efectivamente
 * dejaba el contador siempre en 0 para quien se loguea a diario.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const runtime = "nodejs";

function canSee(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "fisio" || role === "setter" || role === "closer";
}

export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !canSee(user.role)) return NextResponse.json({ count: 0 });

  const pro = await prisma.professional.findUnique({
    where: { id: user.id },
    select: { communityLastSeenAt: true } as any,
  });
  // Si nunca ha abierto la pestana → since = epoch (le mostramos TODO).
  // Nunca cae a lastLoginAt porque eso dejaria el contador siempre a 0
  // para pros que se loguean todos los dias sin entrar a comunidad.
  const since = (pro as any)?.communityLastSeenAt ?? new Date(0);

  const [newPosts, newComments] = await Promise.all([
    prisma.communityFeedPost.count({
      where: {
        createdAt: { gt: since },
        published: true,
        // OR explicito: contamos posts sin authorId (son de pacientes,
        // vienen via patientAuthorId) + posts de OTROS pros.
        OR: [
          { authorId: null },
          { authorId: { not: user.id } },
        ],
      },
    }),
    prisma.communityComment.count({
      where: {
        createdAt: { gt: since },
        // Igual con comentarios: los sin professionalId son de pacientes.
        OR: [
          { professionalId: null },
          { professionalId: { not: user.id } },
        ],
      },
    }),
  ]);

  return NextResponse.json({ count: newPosts + newComments, posts: newPosts, comments: newComments });
}
