"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Member = {
  id: string;
  fullName: string;
  role: string;
  closerIntro: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  ceo: "CEO",
  closer: "Closer",
};

/**
 * Bloque para gestionar la "Presentación para mensajes" ({closer.intro}) de
 * los profesionales que realmente la usan: CEO + closers. Aparece arriba de
 * la lista de plantillas en /fisio/recursos/mensajes (solo CEO/head_success
 * ven esta página).
 */
export function CloserIntrosBlock({ members }: { members: Member[] }) {
  return (
    <section className="card mb-4">
      <div className="mb-3">
        <h2 className="font-medium text-sm">👋 Presentación del closer</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Una frase corta que sustituye a{" "}
          <code className="text-[11px] bg-neutral-100 px-1 rounded">{`{closer.intro}`}</code>{" "}
          en las plantillas que se envían desde Llamadas. Una por persona.
        </p>
      </div>
      <div className="divide-y divide-neutral-100">
        {members.length === 0 && (
          <p className="text-xs text-neutral-400 italic py-4 text-center">
            No hay closers todavía. Invita a uno desde Equipo.
          </p>
        )}
        {members.map((m) => (
          <CloserIntroRow key={m.id} member={m} />
        ))}
      </div>
    </section>
  );
}

function CloserIntroRow({ member }: { member: Member }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(member.closerIntro ?? "");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function save() {
    setSaving(true);
    await fetch("/api/team/closer-intro", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ professionalId: member.id, closerIntro: value }),
    });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="py-3 flex items-start justify-between gap-3 flex-wrap">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{member.fullName}</div>
        <div className="text-[11px] text-neutral-400">{ROLE_LABEL[member.role] ?? member.role}</div>
      </div>
      <div className="flex-1 min-w-[280px]">
        {editing ? (
          <div className="flex items-start gap-2">
            <textarea
              className="input text-sm flex-1"
              rows={3}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Ej: Soy Ales, fundador de FisioFit. Llevo 7 años ayudando a deportistas con lesiones recurrentes."
              autoFocus
            />
            <div className="flex flex-col gap-1">
              <button onClick={save} disabled={saving} className="btn btn-primary text-xs">
                {saving ? "..." : "Guardar"}
              </button>
              <button onClick={() => { setValue(member.closerIntro ?? ""); setEditing(false); }} className="text-xs text-neutral-500">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="text-sm text-neutral-700 whitespace-pre-line flex-1">
              {member.closerIntro || <span className="italic text-neutral-400">Sin presentación</span>}
            </div>
            <button onClick={() => setEditing(true)} className="text-xs text-neutral-500 hover:text-neutral-900 flex-shrink-0">
              ✏️ Editar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
