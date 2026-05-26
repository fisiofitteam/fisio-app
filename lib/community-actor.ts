import { getActiveProfessional, getActivePatient } from "./session";

// Identidad de quien interactúa con la comunidad: profesional o paciente.
// Se usa en posts, comentarios y reacciones para atribuir autoría correctamente.
export type CommunityActor =
  | { kind: "professional"; professionalId: string; patientId: null; name: string }
  | { kind: "patient"; patientId: string; professionalId: null; name: string };

export async function getCommunityActor(): Promise<CommunityActor | null> {
  const pro = await getActiveProfessional();
  if (pro) return { kind: "professional", professionalId: pro.id, patientId: null, name: pro.fullName };
  const pat = await getActivePatient();
  if (pat) return { kind: "patient", patientId: pat.id, professionalId: null, name: pat.fullName };
  return null;
}
