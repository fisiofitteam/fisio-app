"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { youtubeThumbnail } from "@/lib/youtube";

type Video = {
  id: string;
  title: string;
  youtubeUrl: string;
  category: string;
  tags: string;
};

const CATEGORIES = [
  { key: "pildoras", label: "Píldoras y gestión del dolor", icon: "💊" },
  { key: "educacion", label: "Educación en entrenamiento", icon: "📘" },
  { key: "proceso", label: "Proceso y programa", icon: "🗺️" },
  { key: "exitos", label: "Éxitos", icon: "🏆" },
];

// Mapea cualquier valor histórico del campo `category` a una de las 4 nuevas
function normalizeCategory(c: string): string {
  const l = (c || "").toLowerCase();
  if (l.includes("dolor") || l.includes("pildora") || l.includes("píldora")) return "pildoras";
  if (l.includes("educacion") || l.includes("educación") || l.includes("anatomía") || l.includes("anatomia") || l.includes("técnica") || l.includes("tecnica")) return "educacion";
  if (l.includes("proceso") || l.includes("programa")) return "proceso";
  if (l.includes("éxito") || l.includes("exito") || l.includes("testimonio")) return "exitos";
  return "educacion"; // default razonable
}

export function VideosByCategory({ videos }: { videos: Video[] }) {
  const [openCat, setOpenCat] = useState<string | null>("pildoras");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return videos;
    const s = search.toLowerCase();
    return videos.filter(
      (v) => v.title.toLowerCase().includes(s) || v.tags.toLowerCase().includes(s)
    );
  }, [videos, search]);

  const byCat: Record<string, Video[]> = {};
  for (const v of filtered) {
    const cat = normalizeCategory(v.category);
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(v);
  }

  const isSearching = search.trim().length > 0;

  return (
    <>
      <div className="mb-3">
        <input
          className="input text-sm"
          placeholder="🔍 Buscar vídeo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        {CATEGORIES.map((cat) => {
          const list = byCat[cat.key] ?? [];
          const open = isSearching ? list.length > 0 : openCat === cat.key;

          if (isSearching && list.length === 0) return null;

          return (
            <section key={cat.key} className="border border-neutral-200 rounded-xl bg-white overflow-hidden">
              <button
                onClick={() => !isSearching && setOpenCat(open ? null : cat.key)}
                className="w-full flex items-center justify-between p-4 hover:bg-neutral-50"
                disabled={isSearching}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{cat.icon}</span>
                  <span className="font-medium">{cat.label}</span>
                  <span className="text-xs text-neutral-500">({list.length})</span>
                </div>
                {!isSearching && <span className="text-neutral-400 text-sm">{open ? "▴" : "▾"}</span>}
              </button>
              {open && (
                <div className="border-t border-neutral-100 p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {list.length === 0 ? (
                    <p className="text-xs text-neutral-400 text-center py-4 italic col-span-full">
                      Sin vídeos en esta categoría.
                    </p>
                  ) : (
                    list.map((v) => {
                      const thumb = youtubeThumbnail(v.youtubeUrl);
                      return (
                        <Link
                          key={v.id}
                          href={`/fisio/biblioteca/videos/${v.id}`}
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
                            <div className="font-medium text-sm truncate">{v.title}</div>
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
            No hay vídeos que coincidan.
          </p>
        )}
      </div>
    </>
  );
}
