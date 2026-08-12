import { redirect } from "next/navigation";

/**
 * La antigua Biblioteca fue sustituida por Clases (/paciente/[id]/clases).
 * Redirigimos por si algún link antiguo (email, WhatsApp, marcadores) sigue
 * apuntando aquí.
 */
export default function DeprecatedLibraryPage({ params }: { params: { id: string } }) {
  redirect(`/paciente/${params.id}/clases`);
}
