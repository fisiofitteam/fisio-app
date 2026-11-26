export function screenFor(path: string) {
  if (/^\/fisio\/valoraciones\//.test(path)) return "Revisión de valoración de hombro";
  if (/^\/fisio\/paciente\//.test(path)) {
    if (path.endsWith("/valoraciones")) return "Valoraciones del paciente";
    if (path.endsWith("/calendario")) return "Calendario del paciente";
    if (path.endsWith("/cargas")) return "Control de cargas";
    if (path.endsWith("/grabaciones")) return "Grabaciones del paciente";
    return "Ficha del paciente";
  }
  const sections: Record<string, string> = { grabaciones: "Grabaciones", leads: "Llamadas", "llamadas-venta": "Llamadas de venta", followup: "Follow-up", biblioteca: "Biblioteca", contenido: "Contenido", ajustes: "Ajustes", soporte: "Soporte y mejoras", equipo: "Equipo", finanzas: "Cuadro de mandos", "informe-ceo": "Informe CEO", pacientes: "Pacientes", comunidad: "Comunidad" };
  return sections[path.split("/")[2]] ?? "Panel del equipo";
}
