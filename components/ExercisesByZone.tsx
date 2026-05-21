"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { youtubeThumbnail } from "@/lib/youtube";

type Exercise = {
  id: string;
  name: string;
  bodyZone: string;
  category: string;
  tags: string;
  youtubeUrl: string;
};

const ZONES = [
  { key: "hombro", label: "Hombro", icon: "💪" },
  { key: "lumbar", label: "Lumbar", icon: "🦴" },
  { key: "rodilla", label: "Rodilla", icon: "🦵" },
  { key: "otros", label: "Otros", icon: "✨" },
];

export function ExercisesByZone({ exercises }: { exercises: Exercise[] }) {
  const [openZone, setOpenZone] = useState<string | null>("hombro");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");

  // Tags únicos
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const ex of exercises) {
      ex.tags.split(",").map((t) => t.trim()).filter(Boolean).forEach((t) => set.add(t));
    }
    return Array.from(set).sort();
  }, [exercises]);

  const filtered = useMemo(() => {
    return exercises.filter((ex) => {
      if (tagFilter && !ex.tags.split(",").map((t) => t.trim()).includes(tagFilter)) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !ex.name.toLowerCase().includes(s) &&
          !ex.category.toLowerCase().includes(s) &&
          !ex.tags.toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [exercises, search, tagFilter]);

  const byZone: Record<string, Exercise[]> = {};
  for (const ex of filtered) {
    const zone = ZONES.find((z) => z.key === ex.bodyZone)?.key ?? "otros";
    if (!byZone[zone]) byZone[zone] = [];
    byZone[zone].push(ex);
  }

  const isSearching = search.trim().length > 0 || tagFilter !== "";

  return (
    <>
      <div className="flex gap-2 mb-3 flex-wrap">
        <input
          className="input text-sm flex-1 min-w-[200px]"
          placeholder="🔍 Buscar ejercicio por nombre, categoría o tag..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input text-sm w-auto"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
        >
          <option value="">Todas las etiquetas</option>
          {allTags.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {ZONES.map((zone) => {
          const list = byZone[zone.key] ?? [];
          const open = isSearching ? list.length > 0 : openZone === zone.key;

          if (isSearching && list.length === 0) return null;

          return (
            <section key={zone.key} className="border border-neutral-200 rounded-xl bg-white overflow-hidden">
              <button
                onClick={() => !isSearching && setOpenZone(open ? null : zone.key)}
                className="w-full flex items-center justify-between p-4 hover:bg-neutral-50"
                disabled={isSearching}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{zone.icon}</span>
                  <span className="font-medium">{zone.label}</span>
                  <span className="text-xs text-neutral-500">({list.length})</span>
                </div>
                {!isSearching && <span className="text-neutral-400 text-sm">{open ? "▴" : "▾"}</span>}
              </button>
              {open && (
                <div className="border-t border-neutral-100 p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {list.length === 0 ? (
                    <p className="text-xs text-neutral-400 text-center py-4 italic col-span-full">
                      Sin ejercicios en esta zona.
                    </p>
                  ) : (
                    list.map((ex) => {
                      const thumb = ex.youtubeUrl ? youtubeThumbnail(ex.youtubeUrl) : null;
                      return (
                        <Link
                          key={ex.id}
                          href={`/fisio/biblioteca/ejercicios/${ex.id}`}
                          className="bg-neutral-50 rounded-lg flex overflow-hidden hover:bg-neutral-100"
                        >
                          {thumb ? (
                            <img src={thumb} alt="" className="w-20 h-14 object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-20 h-14 bg-neutral-200 flex items-center justify-center text-xs text-neutral-400 flex-shrink-0">
                              sin vídeo
                            </div>
                          )}
                          <div className="p-2 flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{ex.name}</div>
                            <div className="text-xs text-neutral-500 truncate">{ex.category}</div>
                          </div>
                        </Link>
                      );
                    })
                  )}
                </div>
              )}
            </section>
          );
        })}

        {isSearching && filtered.length === 0 && (
          <p className="text-sm text-neutral-500 text-center py-8 italic">
            No hay ejercicios que coincidan.
          </p>
        )}
      </div>
    </>
  );
}
