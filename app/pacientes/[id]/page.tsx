import { redirect } from "next/navigation";

/**
 * Compatibilidad: notificaciones antiguas apuntan a /pacientes/[id].
 * La ruta canónica es /fisio/paciente/[id]/ficha. Redirigimos para que el
 * histórico de notificaciones en BD siga funcionando.
 */
export default function LegacyPatientRedirect({ params }: { params: { id: string } }) {
  redirect(`/fisio/paciente/${params.id}/ficha`);
}
