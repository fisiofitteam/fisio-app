"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ROLE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  ceo: { label: "CEO", icon: "👑", color: "bg-amber-100 text-amber-900 border-amber-300" },
  head_success: { label: "Head-success physio", icon: "⭐", color: "bg-purple-100 text-purple-900 border-purple-300" },
  fisio: { label: "Fisioterapeuta", icon: "🩺", color: "bg-neutral-100 text-neutral-800 border-neutral-300" },
};

export function ProfessionalPicker({
  professionals,
}: {
  professionals: { id: string; fullName: string; role: string }[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function pick(id: string) {
    setLoading(id);
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ professionalId: id }),
    });
    router.push("/fisio");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {professionals.map((p) => {
        const meta = ROLE_LABELS[p.role] ?? ROLE_LABELS.fisio;
        return (
          <button
            key={p.id}
            onClick={() => pick(p.id)}
            disabled={loading !== null}
            className={`flex justify-between items-center p-3 rounded-lg border hover:opacity-90 transition-opacity ${meta.color} disabled:opacity-50`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{meta.icon}</span>
              <div className="text-left">
                <div className="text-sm font-medium">{p.fullName}</div>
                <div className="text-xs opacity-80">{meta.label}</div>
              </div>
            </div>
            <span>{loading === p.id ? "..." : "→"}</span>
          </button>
        );
      })}
    </div>
  );
}
