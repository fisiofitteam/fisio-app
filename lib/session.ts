// Este archivo se mantiene por compatibilidad con código que ya lo importa.
// La implementación real está en lib/auth.ts.
export { getActiveProfessional, getActivePatient, getSessionUser, type Role, type ActiveProfessional, type ActivePatient } from "./auth";

// Cookie name antigua del sistema de "switch user". Solo válida en dev con FISIO_DEV_BYPASS.
export function getActiveProfessionalCookieName() {
  return "active-pro-id";
}
