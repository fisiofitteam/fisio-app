"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Loader2, X } from "lucide-react";

type Agent = {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
};

/**
 * Landing de Fisio IA: grid de tarjetas grandes + tarjeta al final para
 * crear un agente nuevo. Al crear se redirige a su chat para que el CEO
 * afine icono, descripción, brief y flag de paciente desde allí.
 */
export function FisioAiLanding({ initialAgents }: { initialAgents: Agent[] }) {
  const [agents, setAgents] = useState(initialAgents);
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {agents.map((a) => (
          <Link
            key={a.id}
            href={`/fisio/fisio-ia/${a.slug}`}
            className="group card hover:border-neutral-900 hover:shadow-md transition-all p-5 flex items-start gap-4"
          >
            <div className="text-4xl flex-shrink-0">{a.icon}</div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-base group-hover:underline">{a.name}</h2>
              <p className="text-sm text-neutral-500 mt-1 leading-snug">{a.description}</p>
              <div className="text-xs text-neutral-400 mt-3 inline-flex items-center gap-1">
                Abrir chat →
              </div>
            </div>
          </Link>
        ))}

        {/* Tile "nuevo agente" */}
        <button
          onClick={() => setShowModal(true)}
          className="card border-2 border-dashed border-neutral-300 hover:border-neutral-900 hover:bg-neutral-50 transition-all p-5 flex items-center justify-center gap-3 text-neutral-500 hover:text-neutral-900"
        >
          <Plus size={20} />
          <span className="font-medium text-sm">Nuevo agente</span>
        </button>
      </div>

      {showModal && (
        <NewAgentModal
          onClose={() => setShowModal(false)}
          onCreated={(a) => {
            setAgents((prev) => [...prev, a]);
          }}
        />
      )}
    </>
  );
}

function NewAgentModal({ onClose, onCreated }: { onClose: () => void; onCreated: (a: Agent) => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("🤖");
  const [usesPatientContext, setUsesPatientContext] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/fisio-ai/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          icon: icon.trim() || "🤖",
          usesPatientContext,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo crear");
      onCreated(data.agent);
      // Al recién creado le llevamos directo al chat para que edite el brief.
      router.push(`/fisio/fisio-ia/${data.agent.slug}`);
    } catch (e: any) {
      setError(e?.message || "Error");
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Nuevo agente</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-neutral-500">
          Crea el agente con lo mínimo. Al guardarlo entrarás a su chat, donde puedes editar el brief
          (system prompt) y el resto de detalles.
        </p>

        <div className="grid grid-cols-[80px_1fr] gap-3 items-start">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Icono</label>
            <input
              className="input text-2xl text-center"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              maxLength={4}
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Nombre *</label>
            <input
              className="input text-sm font-medium"
              placeholder="Ej: Guiones de ventas"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-neutral-500 block mb-1">Descripción corta</label>
          <input
            className="input text-sm"
            placeholder="Frase debajo del nombre en la tarjeta"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={usesPatientContext}
            onChange={(e) => setUsesPatientContext(e.target.checked)}
            className="w-4 h-4 accent-neutral-900"
          />
          <span>Puede leer la ficha de un paciente</span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="text-sm text-neutral-500">Cancelar</button>
          <button
            onClick={create}
            disabled={creating || !name.trim()}
            className="btn btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {creating && <Loader2 size={14} className="animate-spin" />}
            {creating ? "Creando…" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}
