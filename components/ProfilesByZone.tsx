"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

type Profile = {
  id: string;
  name: string;
  bodyZone: string;
  description: string;
  levelsCount: number;
};

const ZONES = [
  { key: "hombro", label: "Hombro", icon: "💪" },
  { key: "lumbar", label: "Lumbar", icon: "🦴" },
  { key: "rodilla", label: "Rodilla", icon: "🦵" },
  { key: "otros", label: "Otros", icon: "✨" },
];

function normalizeZone(z: string): string {
  const l = (z || "").toLowerCase();
  if (l.includes("hombro")) return "hombro";
  if (l.includes("lumbar")) return "lumbar";
  if (l.includes("rodilla")) return "rodilla";
  return "otros";
}

export function ProfilesByZone({ profiles }: { profiles: Profile[] }) {
  const [openZone, setOpenZone] = useState<string | null>("hombro");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return profiles;
    const s = search.toLowerCase();
    return profiles.filter(
      (p) => p.name.toLowerCase().includes(s) || p.description.toLowerCase().includes(s)
    );
  }, [profiles, search]);

  const byZone: Record<string, Profile[]> = {};
  for (const p of filtered) {
    const zone = normalizeZone(p.bodyZone);
    if (!byZone[zone]) byZone[zone] = [];
    byZone[zone].push(p);
  }

  const isSearching = search.trim().length > 0;

  return (
    <>
      <div className="mb-3 relative">
        <input
          className="input pl-8 text-sm"
          placeholder="🔍 Buscar perfil..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
                <div className="border-t border-neutral-100 p-3 space-y-2">
                  {list.length === 0 ? (
                    <p className="text-xs text-neutral-400 text-center py-4 italic">
                      Sin perfiles en esta zona.
                    </p>
                  ) : (
                    list.map((p) => (
                      <Link
                        key={p.id}
                        href={`/fisio/biblioteca/perfiles/${p.id}`}
                        className="flex justify-between items-start p-3 bg-neutral-50 rounded-lg hover:bg-neutral-100"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{p.name}</div>
                          {p.description && (
                            <div className="text-xs text-neutral-500 mt-0.5 line-clamp-1">{p.description}</div>
                          )}
                          <div className="text-xs text-neutral-400 mt-1">
                            {p.levelsCount} niveles
                          </div>
                        </div>
                        <span className="text-neutral-300 ml-2 self-center">→</span>
                      </Link>
                    ))
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
