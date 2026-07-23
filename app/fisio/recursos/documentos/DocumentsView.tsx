"use client";

import { useState } from "react";
import { Upload, FileText, Image as ImageIcon, File, Link as LinkIcon, Trash2, X, Download } from "lucide-react";
import { ROLE_LABELS, type ResourceRole } from "@/lib/resource-roles";

type Doc = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  fileType: string;
  fileSize: number | null;
  category: string;
  targetRoles: string;
  createdAt: string;
};

const ICONS: Record<string, React.ReactNode> = {
  pdf: <FileText size={18} />,
  image: <ImageIcon size={18} />,
  doc: <FileText size={18} />,
  sheet: <FileText size={18} />,
  link: <LinkIcon size={18} />,
  other: <File size={18} />,
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsView({ initial, allowedRoles }: { initial: Doc[]; allowedRoles: ResourceRole[] }) {
  const [docs, setDocs] = useState<Doc[]>(initial);
  const [showUpload, setShowUpload] = useState(false);

  async function deleteDoc(id: string) {
    if (!confirm("¿Eliminar este documento?")) return;
    await fetch(`/api/resources/documents/${id}`, { method: "DELETE" });
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <div className="text-xs text-neutral-500">
          {docs.length} {docs.length === 1 ? "documento" : "documentos"}
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-neutral-900 text-white hover:bg-neutral-700 flex items-center gap-1.5"
        >
          <Upload size={13} /> Subir documento
        </button>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-10 text-center">
          <div className="text-3xl mb-2">📄</div>
          <p className="text-sm text-neutral-500">
            Aún no hay documentos en esta vista.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {docs.map((d) => (
            <DocumentCard key={d.id} doc={d} onDelete={() => deleteDoc(d.id)} />
          ))}
        </div>
      )}

      {showUpload && (
        <UploadModal
          allowedRoles={allowedRoles}
          onCancel={() => setShowUpload(false)}
          onUploaded={(d) => {
            setDocs((prev) => [d, ...prev]);
            setShowUpload(false);
          }}
        />
      )}
    </div>
  );
}

function DocumentCard({ doc, onDelete }: { doc: Doc; onDelete: () => void }) {
  const roles = String(doc.targetRoles ?? "all").split(",").map((r) => r.trim());
  const roleLabel = roles.includes("all")
    ? "Todos"
    : roles.map((r) => ROLE_LABELS[r as ResourceRole] ?? r).join(", ");

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 flex items-start gap-3">
      <div className="mt-0.5 text-neutral-500">{ICONS[doc.fileType] ?? ICONS.other}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-sm hover:underline flex-1 min-w-0"
          >
            {doc.title}
          </a>
          <button
            onClick={onDelete}
            title="Eliminar"
            className="text-neutral-400 hover:text-red-600 flex-shrink-0"
          >
            <Trash2 size={13} />
          </button>
        </div>
        {doc.description && (
          <p className="text-xs text-neutral-600 mt-1 line-clamp-2">{doc.description}</p>
        )}
        <div className="flex items-center gap-2 mt-2 text-[10px] text-neutral-500 flex-wrap">
          <span className="uppercase tracking-wider font-semibold" style={{ color: "#78350F" }}>
            {doc.category}
          </span>
          <span>·</span>
          <span>{roleLabel}</span>
          {doc.fileSize && (
            <>
              <span>·</span>
              <span>{formatBytes(doc.fileSize)}</span>
            </>
          )}
          <span>·</span>
          <span>{new Date(doc.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span>
        </div>
        <a
          href={doc.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-neutral-700 hover:underline"
        >
          <Download size={11} /> Abrir / descargar
        </a>
      </div>
    </div>
  );
}

function UploadModal({ allowedRoles, onCancel, onUploaded }: {
  allowedRoles: ResourceRole[];
  onCancel: () => void;
  onUploaded: (d: Doc) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const [rolesMode, setRolesMode] = useState<"all" | "custom">("all");
  const [customRoles, setCustomRoles] = useState<Set<ResourceRole>>(new Set(allowedRoles));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !!file && title.trim().length > 0 && !uploading;

  async function submit() {
    if (!canSubmit || !file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", title.trim());
      if (description.trim()) form.append("description", description.trim());
      form.append("category", category.trim() || "General");
      form.append("targetRoles", rolesMode === "all" ? "all" : Array.from(customRoles).join(","));
      const r = await fetch("/api/resources/documents", { method: "POST", body: form });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error ?? "No se pudo subir");
      } else {
        onUploaded({ ...data.document, createdAt: new Date(data.document.createdAt).toISOString() });
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">📤 Subir documento</h3>
          <button onClick={onCancel} className="text-neutral-400 hover:text-neutral-700">
            <X size={18} />
          </button>
        </div>

        <div>
          <label className="text-xs text-neutral-500 block mb-1">Archivo</label>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.txt,.md"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-xs w-full"
          />
          <p className="text-[10px] text-neutral-400 mt-1">Máximo 25 MB · PDF, Word, Excel, imagen…</p>
        </div>

        <div>
          <label className="text-xs text-neutral-500 block mb-1">Título</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: Protocolo hombro doloroso"
            className="input text-sm w-full"
          />
        </div>

        <div>
          <label className="text-xs text-neutral-500 block mb-1">Descripción (opcional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Breve resumen de qué contiene el documento"
            className="input text-sm w-full"
          />
        </div>

        <div>
          <label className="text-xs text-neutral-500 block mb-1">Categoría</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="General"
            className="input text-sm w-full"
          />
        </div>

        <div>
          <label className="text-xs text-neutral-500 block mb-1">¿Quién puede verlo?</label>
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="radio" checked={rolesMode === "all"} onChange={() => setRolesMode("all")} />
              Todos los profesionales
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="radio" checked={rolesMode === "custom"} onChange={() => setRolesMode("custom")} />
              Solo estos roles
            </label>
          </div>
          {rolesMode === "custom" && (
            <div className="mt-2 flex flex-wrap gap-2">
              {allowedRoles.map((r) => {
                const active = customRoles.has(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setCustomRoles((prev) => {
                      const s = new Set(prev);
                      if (s.has(r)) s.delete(r); else s.add(r);
                      return s;
                    })}
                    className={`text-[11px] px-2 py-1 rounded border ${active ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300 text-neutral-700"}`}
                  >
                    {ROLE_LABELS[r] ?? r}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && (
          <div className="text-xs px-3 py-2 rounded bg-red-50 text-red-700 border border-red-200">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
          <button onClick={onCancel} className="text-sm px-3 py-1.5 rounded border border-neutral-300 hover:bg-neutral-50">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="text-sm font-semibold px-3 py-1.5 rounded bg-neutral-900 text-white flex items-center gap-1.5 disabled:opacity-50"
          >
            <Upload size={13} /> {uploading ? "Subiendo…" : "Subir"}
          </button>
        </div>
      </div>
    </div>
  );
}
