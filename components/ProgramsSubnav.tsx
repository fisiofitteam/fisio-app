// El sub-subnav antiguo "Programas → Plantillas / Rolling" se eliminó cuando
// Rolling pasó a vivir en /fisio/advance/rolling (ya no está en Biblioteca).
// Mantenemos el componente vacío para no romper imports antiguos: ahora no
// renderiza nada.
export function ProgramsSubnav() {
  return null;
}
