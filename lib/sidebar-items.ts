import {
  LayoutDashboard,
  Users,
  BookOpen,
  CheckSquare,
  Phone,
  Package,
  Wallet,
  Target,
  PhoneCall,
  Repeat,
  Gift,
  Sparkles,
  UserCog,
  Settings,
  LogOut,
  Stethoscope,
  CalendarDays,
  Gauge,
  Zap,
  MessageSquare,
  Megaphone,
  Brain,
  AlertTriangle,
  Sunrise,
  Bot,
  TrafficCone,
  LucideIcon,
} from "lucide-react";

type Item = {
  id: string;
  label: string;
  Icon: LucideIcon;
  href: string;
  match: (p: string) => boolean;
};

const PANEL: Item = { id: "panel", label: "Panel", Icon: LayoutDashboard, href: "/fisio", match: (p) => p === "/fisio" };
const TESTIMONIOS: Item = { id: "testimonios", label: "Testimonios", Icon: Sparkles, href: "/fisio/testimonios", match: (p) => p.startsWith("/fisio/testimonios") };
const PACIENTES: Item = { id: "pacientes", label: "Pacientes", Icon: Users, href: "/fisio/pacientes", match: (p) => p.startsWith("/fisio/pacientes") || p.startsWith("/fisio/paciente/") };
const LEADS: Item = { id: "leads", label: "Llamadas", Icon: Target, href: "/fisio/leads", match: (p) => p.startsWith("/fisio/leads") };
const LLAMADAS_VENTA: Item = { id: "llamadas-venta", label: "Llamadas", Icon: PhoneCall, href: "/fisio/llamadas-venta", match: (p) => p.startsWith("/fisio/llamadas-venta") };
// Config de disponibilidad de llamadas de VENTA (ClosingShift /
// DefaultClosingShift). La UI vive dentro de /fisio/equipo?tab=llamadas;
// el acceso directo aquí evita que el closer tenga que bucear por Equipo.
// match: () => false → el highlight activo se lo queda la pestaña "Equipo"
// (que ya matchea /fisio/equipo). Este es un acceso directo, no una ruta
// propia, así que no competimos por el active state.
const CALENDARIO_LLAMADAS: Item = { id: "calendario-llamadas", label: "Calendario llamadas", Icon: CalendarDays, href: "/fisio/equipo?tab=llamadas", match: () => false };
const FOLLOWUP: Item = { id: "followup", label: "Follow-up", Icon: Repeat, href: "/fisio/followup", match: (p) => p.startsWith("/fisio/followup") };
const REGALOS: Item = { id: "regalos", label: "Regalos", Icon: Gift, href: "/fisio/regalos", match: (p) => p.startsWith("/fisio/regalos") || p.startsWith("/fisio/parches") };
const CONTENIDO: Item = { id: "contenido", label: "Contenido", Icon: Sparkles, href: "/fisio/contenido/calendario", match: (p) => p.startsWith("/fisio/contenido") };
const ANUNCIOS: Item = { id: "anuncios", label: "Anuncios", Icon: Megaphone, href: "/fisio/anuncios", match: (p) => p.startsWith("/fisio/anuncios") };
const BIBLIOTECA: Item = { id: "biblioteca", label: "Biblioteca", Icon: BookOpen, href: "/fisio/biblioteca", match: (p) => p.startsWith("/fisio/biblioteca") };
const REUNIONES: Item = { id: "reuniones", label: "Reuniones", Icon: Stethoscope, href: "/fisio/reuniones", match: (p) => p.startsWith("/fisio/reuniones") };
const CALENDARIO: Item = { id: "calendario", label: "Calendario", Icon: CalendarDays, href: "/fisio/calendario", match: (p) => p.startsWith("/fisio/calendario") };
const ADVANCE: Item = { id: "advance", label: "Advance", Icon: Zap, href: "/fisio/advance", match: (p) => p.startsWith("/fisio/advance") };
const COMUNIDAD: Item = { id: "comunidad", label: "Comunidad", Icon: CalendarDays, href: "/fisio/comunidad", match: (p) => p.startsWith("/fisio/comunidad") };
const ROLLING_LECTURA: Item = { id: "rolling-lectura", label: "Rolling", Icon: Zap, href: "/fisio/rolling-lectura", match: (p) => p.startsWith("/fisio/rolling-lectura") };
const TAREAS: Item = { id: "tareas", label: "Tareas", Icon: CheckSquare, href: "/fisio/tareas", match: (p) => p.startsWith("/fisio/tareas") };
const LLAMADAS: Item = { id: "llamadas", label: "Llamadas", Icon: Phone, href: "/fisio/llamadas", match: (p) => p.startsWith("/fisio/llamadas") };
const RECURSOS: Item = { id: "recursos", label: "Recursos", Icon: Package, href: "/fisio/recursos", match: (p) => p.startsWith("/fisio/recursos") };
const FINANZAS: Item = { id: "finanzas", label: "Cuadro de mandos", Icon: Gauge, href: "/fisio/finanzas", match: (p) => p.startsWith("/fisio/finanzas") };
const EQUIPO: Item = { id: "equipo", label: "Equipo", Icon: UserCog, href: "/fisio/equipo", match: (p) => p.startsWith("/fisio/equipo") };
const CHAT: Item = { id: "chat", label: "Chat", Icon: MessageSquare, href: "/fisio/chat", match: (p) => p.startsWith("/fisio/chat") };
const FISIO_IA: Item = { id: "fisio-ia", label: "Fisio IA", Icon: Brain, href: "/fisio/fisio-ia", match: (p) => p.startsWith("/fisio/fisio-ia") };
const SETTER_IA: Item = { id: "setter-ia", label: "Setter IA", Icon: Bot, href: "/fisio/setter-ia", match: (p) => p.startsWith("/fisio/setter-ia") };
const ALERTAS: Item = { id: "alertas", label: "Alertas", Icon: AlertTriangle, href: "/fisio/alertas", match: (p) => p.startsWith("/fisio/alertas") };
const RESUMENES: Item = { id: "resumenes", label: "Resúmenes", Icon: Sunrise, href: "/fisio/resumenes", match: (p) => p.startsWith("/fisio/resumenes") };
const AJUSTES: Item = { id: "ajustes", label: "Ajustes", Icon: Settings, href: "/fisio/ajustes", match: (p) => p.startsWith("/fisio/ajustes") };
// Lead magnets — para el setter va directo en el sidebar (es su
// fuente principal de leads). El CEO lo ve dentro de Contenido, y el
// resto de roles no lo tienen a la vista (acceden por URL si hace
// falta). Empareja con "/fisio/contenido/lead-magnets" y con la ruta
// standalone "/fisio/semaforo" que se mantiene por compat.
const LEAD_MAGNETS: Item = {
  id: "lead-magnets",
  label: "Lead magnets",
  Icon: TrafficCone,
  href: "/fisio/contenido/lead-magnets",
  match: (p) => p.startsWith("/fisio/contenido/lead-magnets") || p.startsWith("/fisio/semaforo"),
};

/**
 * Devuelve la lista de items para UN rol concreto. Es un helper interno.
 * Las personas con varios roles usan `itemsForRoles` (abajo), que hace
 * unión + dedup sin perder el orden del rol principal.
 */
function itemsForRole(role: string, opts: { withResumenes: boolean }): Item[] {
  // Managers (CEO / head_success) SIEMPRE ven "Resúmenes", aunque no
  // haya contenido pendiente — desde ahí pueden disparar la regeneración
  // manual cuando el cron falla. Los fisios normales solo lo ven cuando
  // hay algo que revisar (evita ruido visual).
  const isManager = role === "ceo" || role === "head_success";
  const R = (opts.withResumenes || isManager) ? [RESUMENES] : [];
  if (role === "ceo") {
    // CEO no ve el buzon de Alertas (lo gestionan head_success y fisios).
    // Lead magnets vive dentro de Contenido → Lead magnets, no en el
    // sidebar (para no ensuciar la navegación principal).
    return [PANEL, PACIENTES, TESTIMONIOS, ...R, ADVANCE, LLAMADAS_VENTA, CONTENIDO, ANUNCIOS, BIBLIOTECA, REUNIONES, CALENDARIO, COMUNIDAD, TAREAS, RECURSOS, FINANZAS, EQUIPO, CHAT, FISIO_IA, SETTER_IA, AJUSTES];
  }
  if (role === "head_success") {
    return [PANEL, PACIENTES, TESTIMONIOS, ALERTAS, ...R, ADVANCE, BIBLIOTECA, REUNIONES, CALENDARIO, COMUNIDAD, TAREAS, LLAMADAS, RECURSOS, EQUIPO, CHAT, FISIO_IA, AJUSTES];
  }
  if (role === "setter") {
    // Setter tiene Lead magnets DIRECTO en el sidebar — es su fuente
    // principal de leads entrantes.
    return [PANEL, LEADS, PACIENTES, LEAD_MAGNETS, REGALOS, CONTENIDO, COMUNIDAD, REUNIONES, CALENDARIO, EQUIPO, CHAT, FISIO_IA, AJUSTES];
  }
  if (role === "closer") {
    return [PANEL, LLAMADAS_VENTA, FOLLOWUP, CALENDARIO_LLAMADAS, COMUNIDAD, REUNIONES, CALENDARIO, EQUIPO, CHAT, FISIO_IA, AJUSTES];
  }
  // fisio normal
  return [PANEL, PACIENTES, TESTIMONIOS, ALERTAS, ...R, ROLLING_LECTURA, BIBLIOTECA, REUNIONES, CALENDARIO, COMUNIDAD, TAREAS, LLAMADAS, RECURSOS, EQUIPO, CHAT, FISIO_IA, AJUSTES];
}

/**
 * Compose items para una persona que puede tener varios roles. Mantiene
 * el ORDEN del rol principal y añade al final los items del resto de
 * roles que aún no estén presentes. Dedupe por `item.id`.
 *
 * Ejemplo: fisio (principal) + closer → aparece la navegación completa
 * de fisio, y al final se suman las pestañas que solo tenga closer
 * (Llamadas venta, Follow-up).
 */
export function itemsForRoles(mainRole: string, extraRoles: string[], opts: { withResumenes: boolean }): Item[] {
  const main = itemsForRole(mainRole, opts);
  const seen = new Set(main.map((i) => i.id));
  const out = [...main];
  for (const r of extraRoles) {
    if (r === mainRole) continue;
    for (const item of itemsForRole(r, opts)) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

