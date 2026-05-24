// Categorías del contenido de comunidad. Clasifican días del calendario e ideas.
export type CommunityCategory = "entretener" | "conectar" | "ayudar" | "educar" | "convertir";

export const COMMUNITY_CATEGORIES: {
  value: CommunityCategory;
  label: string;
  // clases para badge (texto + fondo + borde) y color del punto/calendario
  badge: string;
  dot: string;
}[] = [
  { value: "entretener", label: "Entretener", badge: "bg-purple-100 text-purple-800 border-purple-200", dot: "#A855F7" },
  { value: "conectar", label: "Conectar", badge: "bg-pink-100 text-pink-800 border-pink-200", dot: "#EC4899" },
  { value: "ayudar", label: "Ayudar", badge: "bg-blue-100 text-blue-800 border-blue-200", dot: "#3B82F6" },
  { value: "educar", label: "Educar", badge: "bg-emerald-100 text-emerald-800 border-emerald-200", dot: "#10B981" },
  { value: "convertir", label: "Convertir", badge: "bg-amber-100 text-amber-800 border-amber-200", dot: "#F59E0B" },
];

export const COMMUNITY_CATEGORY_VALUES = COMMUNITY_CATEGORIES.map((c) => c.value);

export function categoryMeta(value: string) {
  return COMMUNITY_CATEGORIES.find((c) => c.value === value);
}
