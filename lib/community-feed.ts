// Categorías del muro de la comunidad (Community). Inspiradas en las de Skool.
export type FeedCategory = {
  value: string;
  label: string;
  emoji: string;
  // clases tailwind para el chip/etiqueta
  chip: string;
  dot: string;
};

export const FEED_CATEGORIES: FeedCategory[] = [
  { value: "general", label: "General", emoji: "⚡", chip: "bg-neutral-100 text-neutral-700 border-neutral-200", dot: "#3B82F6" },
  { value: "exitos", label: "Éxitos", emoji: "🏆", chip: "bg-amber-100 text-amber-800 border-amber-200", dot: "#F59E0B" },
  { value: "noticias", label: "Noticias y avisos", emoji: "📣", chip: "bg-purple-100 text-purple-800 border-purple-200", dot: "#A855F7" },
  { value: "dudas", label: "Dudas / Ayuda", emoji: "❓", chip: "bg-blue-100 text-blue-800 border-blue-200", dot: "#3B82F6" },
  { value: "entrenamiento", label: "Entrenamiento", emoji: "🏋️", chip: "bg-emerald-100 text-emerald-800 border-emerald-200", dot: "#10B981" },
];

export const FEED_CATEGORY_VALUES = FEED_CATEGORIES.map((c) => c.value);

export function feedCategoryMeta(value: string): FeedCategory {
  return FEED_CATEGORIES.find((c) => c.value === value) ?? FEED_CATEGORIES[0];
}
