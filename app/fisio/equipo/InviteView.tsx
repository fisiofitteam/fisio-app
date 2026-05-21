"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type TeamMember = {
  id: string;
  fullName: string;
  email: string | null;
  role: string;
  active: boolean;
  hasPassword: boolean;
  pendingInvite: boolean;
  lastLoginAt: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  ceo: "CEO",
  head_success: "Head of Success",
  fisio: "Fisioterapeuta",
  setter: "Setter",
  closer: "Closer",
};

const ROLE_OPTIONS = [
  { value: "fisio", label: "Fisioterapeuta" },
  { value: "head_success", label: "Head of Success" },
  { value: "setter", label: "Setter" },
  { value: "closer", label: "Closer" },
];

export function InviteView({ team }: { team: TeamMember[] }) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);

  async function resendInvite(id: string) {
    if (!confirm("¿Reenviar invitación por email?")) return;
    const res = await fetch("/api/admin/invite", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      alert("Invitación reenviada");
      router.refresh();
    } else {
      alert("Error al reenviar");
    }
  }

  return (
    <>
      <div className="flex justify-end mb-3">
        <button onClick={() => setShowNew(true)} className="btn btn-primary text-xs">
          + Invitar profesional
        </button>
      </div>

      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-neutral-500 uppercase border-b border-neutral-200">
              <th className="text-left py-2 px-2 font-medium">Nombre</th>
              <th className="text-left py-2 px-2 font-medium">Email</th>
              <th className="text-left py-2 px-2 font-medium">Rol</th>
              <th className="text-left py-2 px-2 font-medium">Estado</th>
              <th className="text-right py-2 px-2 font-medium">Último acceso</th>
              <th className="text-right py-2 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {team.map((m) => (
              <tr key={m.id} className={`border-b border-neutral-100 ${!m.active ? "opacity-50" : ""}`}>
                <td className="py-2 px-2 font-medium">{m.fullName}</td>
                <td className="py-2 px-2 text-neutral-600 font-mono text-xs">{m.email ?? <span className="text-neutral-300">—</span>}</td>
                <td className="py-2 px-2">
                  <span className="text-[10px] uppercase bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded">
                    {ROLE_LABELS[m.role] ?? m.role}
                  </span>
                </td>
                <td className="py-2 px-2">
                  {!m.active ? (
                    <span className="text-[10px] uppercase bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded">Inactivo</span>
                  ) : m.hasPassword ? (
                    <span className="text-[10px] uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">✓ Activo</span>
                  ) : m.pendingInvite ? (
                    <span className="text-[10px] uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded">⏳ Invitación pendiente</span>
                  ) : (
                    <span className="text-[10px] uppercase bg-red-100 text-red-800 px-2 py-0.5 rounded">Invitación caducada</span>
                  )}
                </td>
                <td className="text-right py-2 px-2 text-xs text-neutral-500">
                  {m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : <span className="text-neutral-300">—</span>}
                </td>
                <td className="text-right py-2 px-2">
                  {(!m.hasPassword || m.pendingInvite) && m.active && (
                    <button onClick={() => resendInvite(m.id)} className="text-[11px] text-blue-600 hover:underline">
                      Reenviar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {showNew && (
        <NewInviteModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function NewInviteModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("fisio");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!fullName || !email) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email, role }),
    });
    if (res.ok) {
      onCreated();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Error al invitar");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">Invitar profesional</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Nombre completo</label>
            <input className="input text-sm" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Email</label>
            <input type="email" className="input text-sm" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@fisiofitteam.com" />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Rol</label>
            <select className="input text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <p className="text-xs text-neutral-500 bg-neutral-50 p-2 rounded">
            Recibirá un email con un enlace para establecer su contraseña. El enlace caduca en 7 días.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="text-sm text-neutral-500">Cancelar</button>
            <button onClick={submit} disabled={!fullName || !email || loading} className="btn btn-primary text-sm">
              {loading ? "Enviando..." : "Enviar invitación"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
