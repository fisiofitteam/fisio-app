"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FORMAT_TEMPLATES, BODY_ZONES, type FormatKey } from "@/lib/content-templates";

type Idea = {
  id: string;
  title: string;
  description: string | null;
  funnelStage: string; // attract / educate / convert
  bodyZone: string | null;
  suggestedFormat: string | null;
  used: boolean;
  usedPieceId: string | null;
};

type Hook = {
  id: string;
  text: string;
  format: string | null;
  bodyZone: string | null;
  url: string | null;
  notes: string | null;
};

type ClinicalCase = {
  id: string;
  athleteName: string;
  injury: string;
  insight: string | null;
  shortSummary: string | null;
  consentSigned: boolean;
  videoUrls: string[];
  notes: string | null;
  patientId: string | null;
  hasNarrative: boolean;
};

type LeadMagnet = {
  id: string;
  name: string;
  keyword: string | null;
  description: string | null;
  url: string | null;
  active: boolean;
  lastPromotedAt: string | null;
};

const FUNNEL_STAGES = [
  { value: "attract", label: "Atraer", color: "bg-blue-100 text-blue-800 border-blue-200", chipActive: "bg-blue-600 text-white border-blue-600" },
  { value: "educate", label: "Educar", color: "bg-purple-100 text-purple-800 border-purple-200", chipActive: "bg-purple-600 text-white border-purple-600" },
  { value: "convert", label: "Convertir", color: "bg-emerald-100 text-emerald-800 border-emerald-200", chipActive: "bg-emerald-600 text-white border-emerald-600" },
];

export function BankView({
  activeTab,
  ideas,
  hooks,
  cases,
  leadMagnets,
  patientsForLink,
}: {
  activeTab: "ideas" | "hooks" | "cases" | "leadmagnets";
  ideas: Idea[];
  hooks: Hook[];
  cases: ClinicalCase[];
  leadMagnets: LeadMagnet[];
  patientsForLink: { id: string; fullName: string }[];
}) {
  const router = useRouter();

  function switchTab(t: string) {
    const url = new URL(window.location.href);
    if (t === "ideas") url.searchParams.delete("tab");
    else url.searchParams.set("tab", t);
    router.push(url.pathname + url.search);
    router.refresh();
  }

  return (
    <>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Banco de recursos</h1>
        <p className="text-xs text-neutral-500 mt-0.5">Ideas, hooks, casos y lead magnets para reutilizar</p>
      </header>

      <div className="flex gap-1 mb-4 border-b border-neutral-200 overflow-x-auto">
        <SubTab active={activeTab === "ideas"} onClick={() => switchTab("ideas")} label="💡 Ideas" count={ideas.length} />
        <SubTab active={activeTab === "hooks"} onClick={() => switchTab("hooks")} label="⚡ Hooks" count={hooks.length} />
        <SubTab active={activeTab === "cases"} onClick={() => switchTab("cases")} label="🩺 Casos éxito" count={cases.length} />
        <SubTab active={activeTab === "leadmagnets"} onClick={() => switchTab("leadmagnets")} label="🧲 Lead magnets" count={leadMagnets.length} />
      </div>

      {activeTab === "ideas" && <IdeasTab items={ideas} />}
      {activeTab === "hooks" && <HooksTab items={hooks} />}
      {activeTab === "cases" && <CasesTab items={cases} patientsForLink={patientsForLink} />}
      {activeTab === "leadmagnets" && <LeadMagnetsTab items={leadMagnets} />}
    </>
  );
}

function SubTab({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
        active ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"
      }`}
    >
      <span>{label}</span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600"}`}>
        {count}
      </span>
    </button>
  );
}

// ============================================================================
// IDEAS DE CONTENIDO (vista principal)
// ============================================================================

function IdeasTab({ items }: { items: Idea[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Idea | "new" | null>(null);
  const [filterStage, setFilterStage] = useState<string>("all");
  const [filterZone, setFilterZone] = useState<string>("all");
  const [hideUsed, setHideUsed] = useState(true);

  const filtered = items.filter((i) => {
    if (hideUsed && i.used) return false;
    if (filterStage !== "all" && i.funnelStage !== filterStage) return false;
    if (filterZone !== "all" && i.bodyZone !== filterZone) return false;
    return true;
  });

  async function save(data: any) {
    const isNew = editing === "new";
    await fetch("/api/content/ideas", {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isNew ? data : { id: (editing as Idea).id, ...data }),
    });
    setEditing(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar esta idea?")) return;
    await fetch(`/api/content/ideas?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function toggleUsed(idea: Idea) {
    await fetch("/api/content/ideas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: idea.id, used: !idea.used }),
    });
    router.refresh();
  }

  // Contadores por etapa
  const stageCounts: Record<string, number> = { attract: 0, educate: 0, convert: 0 };
  for (const i of items) {
    if (!i.used) stageCounts[i.funnelStage] = (stageCounts[i.funnelStage] ?? 0) + 1;
  }

  return (
    <>
      {/* Filtros */}
      <section className="card mb-3">
        <div className="flex justify-between items-end flex-wrap gap-3">
          <div className="flex gap-2 flex-wrap items-end">
            <div>
              <label className="text-[10px] uppercase text-neutral-500 block mb-1">Etapa del embudo</label>
              <div className="flex gap-1">
                <FilterChip active={filterStage === "all"} onClick={() => setFilterStage("all")}>
                  Todas <span className="text-[10px] opacity-70 ml-1">{stageCounts.attract + stageCounts.educate + stageCounts.convert}</span>
                </FilterChip>
                {FUNNEL_STAGES.map((s) => (
                  <FilterChip
                    key={s.value}
                    active={filterStage === s.value}
                    onClick={() => setFilterStage(s.value)}
                    activeColor={s.chipActive}
                  >
                    {s.label} <span className="text-[10px] opacity-70 ml-1">{stageCounts[s.value]}</span>
                  </FilterChip>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase text-neutral-500 block mb-1">Zona</label>
              <select className="input text-xs w-auto" value={filterZone} onChange={(e) => setFilterZone(e.target.value)}>
                <option value="all">Todas</option>
                {BODY_ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-neutral-600 mb-2">
              <input type="checkbox" checked={hideUsed} onChange={(e) => setHideUsed(e.target.checked)} />
              Ocultar ya usadas
            </label>
          </div>
          <button onClick={() => setEditing("new")} className="btn btn-primary text-xs">+ Nueva idea</button>
        </div>
      </section>

      {filtered.length === 0 ? (
        <section className="card text-center py-12">
          <p className="text-sm text-neutral-400 italic">
            {items.length === 0 ? "Aún no hay ideas. Añade la primera para empezar el banco." : "Ninguna idea cumple los filtros."}
          </p>
        </section>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((idea) => {
            const stageMeta = FUNNEL_STAGES.find((s) => s.value === idea.funnelStage);
            const fmt = idea.suggestedFormat ? FORMAT_TEMPLATES[idea.suggestedFormat as FormatKey] : null;
            const zone = idea.bodyZone ? BODY_ZONES.find((z) => z.value === idea.bodyZone)?.label : null;
            return (
              <div key={idea.id} className={`card group cursor-pointer hover:border-neutral-300 ${idea.used ? "opacity-50" : ""}`} onClick={() => setEditing(idea)}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  {stageMeta && (
                    <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded border ${stageMeta.color}`}>
                      {stageMeta.label}
                    </span>
                  )}
                  {idea.used && (
                    <span className="text-[10px] uppercase text-neutral-500 italic">Usada ✓</span>
                  )}
                </div>
                <h3 className={`font-medium text-sm mb-1 ${idea.used ? "line-through" : ""}`}>{idea.title}</h3>
                {idea.description && (
                  <p className="text-xs text-neutral-600 line-clamp-3 mb-2">{idea.description}</p>
                )}
                <div className="flex flex-wrap gap-1 mt-2">
                  {fmt && <span className="text-[10px] bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded">{fmt.label}</span>}
                  {zone && <span className="text-[10px] bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded">{zone}</span>}
                </div>
                <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleUsed(idea); }}
                    className="text-[11px] text-neutral-500 hover:text-neutral-900"
                  >
                    {idea.used ? "Marcar no usada" : "Marcar usada"}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); remove(idea.id); }}
                    className="text-[11px] text-neutral-300 hover:text-red-600 ml-auto"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <IdeaModal
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
    </>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  activeColor,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  activeColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1.5 rounded border font-medium transition-colors ${
        active ? (activeColor ?? "bg-neutral-900 text-white border-neutral-900") : "bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50"
      }`}
    >
      {children}
    </button>
  );
}

function IdeaModal({ item, onClose, onSave }: { item: Idea | null; onClose: () => void; onSave: (d: any) => Promise<void> }) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [funnelStage, setFunnelStage] = useState(item?.funnelStage ?? "educate");
  const [bodyZone, setBodyZone] = useState(item?.bodyZone ?? "");
  const [suggestedFormat, setSuggestedFormat] = useState(item?.suggestedFormat ?? "");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!title) return;
    setSaving(true);
    await onSave({ title, description, funnelStage, bodyZone: bodyZone || null, suggestedFormat: suggestedFormat || null });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">{item ? "Editar idea" : "Nueva idea de contenido"}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Título</label>
            <input className="input text-sm" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder='Ej: "Cómo entrenar con dolor de hombro sin empeorarlo"' />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Etapa del embudo</label>
            <div className="flex gap-1">
              {FUNNEL_STAGES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setFunnelStage(s.value)}
                  className={`flex-1 text-xs px-2 py-2 rounded border font-medium ${
                    funnelStage === s.value ? s.chipActive : "bg-white border-neutral-200 text-neutral-700"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-neutral-500 mt-1">
              Atraer = top funnel · Educar = mid · Convertir = bottom
            </p>
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Descripción / desarrollo</label>
            <textarea className="input text-sm" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Apunta el ángulo, hooks que se te ocurren, datos a usar..." />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Zona corporal</label>
              <select className="input text-sm" value={bodyZone} onChange={(e) => setBodyZone(e.target.value)}>
                <option value="">— Sin definir —</option>
                {BODY_ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Formato sugerido</label>
              <select className="input text-sm" value={suggestedFormat} onChange={(e) => setSuggestedFormat(e.target.value)}>
                <option value="">— Sin definir —</option>
                {Object.entries(FORMAT_TEMPLATES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="text-sm text-neutral-500">Cancelar</button>
            <button onClick={submit} disabled={!title || saving} className="btn btn-primary text-sm">
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HOOKS (igual que antes, sin cambios estructurales)
// ============================================================================

function HooksTab({ items }: { items: Hook[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Hook | "new" | null>(null);
  const [filterFormat, setFilterFormat] = useState("all");
  const [filterZone, setFilterZone] = useState("all");

  const filtered = items.filter((h) => {
    if (filterFormat !== "all" && h.format !== filterFormat) return false;
    if (filterZone !== "all" && h.bodyZone !== filterZone) return false;
    return true;
  });

  async function save(data: any) {
    const isNew = editing === "new";
    await fetch("/api/content/hooks", {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isNew ? data : { id: (editing as Hook).id, ...data }),
    });
    setEditing(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar este hook?")) return;
    await fetch(`/api/content/hooks?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <>
      <div className="flex justify-between items-end mb-3 flex-wrap gap-2">
        <div className="flex gap-2 items-end">
          <div>
            <label className="text-[10px] uppercase text-neutral-500 block mb-1">Formato</label>
            <select className="input text-xs w-auto" value={filterFormat} onChange={(e) => setFilterFormat(e.target.value)}>
              <option value="all">Todos</option>
              {Object.entries(FORMAT_TEMPLATES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase text-neutral-500 block mb-1">Zona</label>
            <select className="input text-xs w-auto" value={filterZone} onChange={(e) => setFilterZone(e.target.value)}>
              <option value="all">Todas</option>
              {BODY_ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
            </select>
          </div>
        </div>
        <button onClick={() => setEditing("new")} className="btn btn-primary text-xs">+ Nuevo hook</button>
      </div>

      {filtered.length === 0 ? (
        <section className="card text-center py-12">
          <p className="text-sm text-neutral-400 italic">
            {items.length === 0 ? "Aún no hay hooks. Añade el primero." : "Ningún hook cumple los filtros."}
          </p>
        </section>
      ) : (
        <div className="space-y-2">
          {filtered.map((h) => {
            const tpl = h.format ? FORMAT_TEMPLATES[h.format as FormatKey] : null;
            const zone = h.bodyZone ? BODY_ZONES.find((z) => z.value === h.bodyZone)?.label : null;
            return (
              <div key={h.id} className="card group">
                <p className="text-sm font-medium mb-2">{h.text}</p>
                {(tpl || zone) && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {tpl && <span className="text-[10px] uppercase bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded">{tpl.label}</span>}
                    {zone && <span className="text-[10px] uppercase bg-blue-100 text-blue-800 px-2 py-0.5 rounded">{zone}</span>}
                  </div>
                )}
                {h.notes && <p className="text-xs text-neutral-600 mb-2">{h.notes}</p>}
                {h.url && (
                  <a href={h.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline break-all inline-flex items-center gap-1">
                    🔗 Ver referencia
                  </a>
                )}
                <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setEditing(h)} className="text-[11px] text-neutral-500 hover:text-neutral-900">Editar</button>
                  <button onClick={() => remove(h.id)} className="text-[11px] text-neutral-300 hover:text-red-600 ml-auto">Eliminar</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <HookModal item={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={save} />
      )}
    </>
  );
}

function HookModal({ item, onClose, onSave }: { item: Hook | null; onClose: () => void; onSave: (d: any) => Promise<void> }) {
  const [text, setText] = useState(item?.text ?? "");
  const [format, setFormat] = useState(item?.format ?? "");
  const [bodyZone, setBodyZone] = useState(item?.bodyZone ?? "");
  const [url, setUrl] = useState(item?.url ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!text) return;
    setSaving(true);
    await onSave({
      text, format: format || null, bodyZone: bodyZone || null,
      url: url.trim() || null,
      notes,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">{item ? "Editar hook" : "Nuevo hook"}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Título del hook</label>
            <textarea className="input text-sm" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej: 'Si te truena la rodilla al sentar, mira esto'" autoFocus />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Descripción</label>
            <textarea className="input text-sm" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="De qué va la idea, ángulo, a quién va dirigido…" />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">URL de referencia (opcional)</label>
            <input className="input text-sm" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Enlace a un reel o vídeo de referencia" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Formato (opcional)</label>
              <select className="input text-sm" value={format} onChange={(e) => setFormat(e.target.value)}>
                <option value="">— Sin definir —</option>
                {Object.entries(FORMAT_TEMPLATES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Zona corporal (opcional)</label>
              <select className="input text-sm" value={bodyZone} onChange={(e) => setBodyZone(e.target.value)}>
                <option value="">— Sin definir —</option>
                {BODY_ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="text-sm text-neutral-500">Cancelar</button>
            <button onClick={submit} disabled={!text || saving} className="btn btn-primary text-sm">
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CASOS DE ÉXITO
// ============================================================================

function CasesTab({ items, patientsForLink }: { items: ClinicalCase[]; patientsForLink: { id: string; fullName: string }[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ClinicalCase | "new" | null>(null);
  const [detail, setDetail] = useState<ClinicalCase | null>(null);

  async function save(data: any) {
    const isNew = editing === "new";
    await fetch("/api/content/cases", {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isNew ? data : { id: (editing as ClinicalCase).id, ...data }),
    });
    setEditing(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar este caso?")) return;
    await fetch(`/api/content/cases?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <>
      <div className="flex justify-end mb-3">
        <button onClick={() => setEditing("new")} className="btn btn-primary text-xs">+ Nuevo caso</button>
      </div>
      <p className="text-xs text-neutral-500 mb-3 italic">
        💡 Los casos también pueden crearse desde la ficha de cualquier paciente, con un click. Haz clic en un caso para ver el detalle y generar piezas.
      </p>

      {items.length === 0 ? (
        <section className="card text-center py-12">
          <p className="text-sm text-neutral-400 italic">Aún no hay casos. Añade el primero (lesión + atleta + permiso).</p>
        </section>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((c) => (
            <div key={c.id} className="card group hover:border-emerald-400 transition-colors">
              <button onClick={() => setDetail(c)} className="w-full text-left">
                <div className="flex justify-between items-start gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm">{c.athleteName}</h3>
                    <p className="text-xs text-neutral-500 mt-0.5">{c.injury}</p>
                  </div>
                  {c.consentSigned ? (
                    <span className="text-[10px] uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded whitespace-nowrap">✓ Permiso</span>
                  ) : (
                    <span className="text-[10px] uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded whitespace-nowrap">⚠ Sin permiso</span>
                  )}
                </div>
                {c.shortSummary ? (
                  <p className="text-xs text-neutral-700 mt-2 line-clamp-3">{c.shortSummary}</p>
                ) : c.insight ? (
                  <p className="text-xs text-neutral-700 italic mt-2 line-clamp-3">"{c.insight}"</p>
                ) : (
                  <p className="text-xs text-neutral-400 italic mt-2">
                    {c.hasNarrative
                      ? "Sin resumen aún. Vuelve a generar el borrador para crear uno."
                      : "Sin narrativa aún. Abre el caso y pulsa \"Generar con IA\"."}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-neutral-500">
                  {c.hasNarrative && (
                    <span className="text-emerald-700">📝 Narrativa</span>
                  )}
                  {c.videoUrls.length > 0 && (
                    <span>🎥 {c.videoUrls.length}</span>
                  )}
                </div>
              </button>
              <div className="flex gap-2 mt-3 pt-2 border-t border-neutral-100 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => setEditing(c)} className="text-[11px] text-neutral-500 hover:text-neutral-900">Editar metadatos</button>
                <button onClick={() => remove(c.id)} className="text-[11px] text-neutral-300 hover:text-red-600 ml-auto">Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <CaseModal item={editing === "new" ? null : editing} patientsForLink={patientsForLink} onClose={() => setEditing(null)} onSave={save} />
      )}
      {detail && (
        <CaseDetailModal caseId={detail.id} onClose={() => setDetail(null)} />
      )}
    </>
  );
}

// ============================================================================
// Detalle del caso + generador de piezas (carrusel / stories / reel)
// ============================================================================

type CaseDetail = {
  id: string;
  athleteName: string;
  injury: string;
  consentSigned: boolean;
  shortSummary: string | null;
  initialSituation: string | null;
  process: string | null;
  obstacles: string | null;
  achievements: string | null;
  initialSituationVideos: { url: string; caption?: string }[];
  processVideos: { url: string; caption?: string }[];
  obstaclesVideos: { url: string; caption?: string }[];
  achievementsVideos: { url: string; caption?: string }[];
};

type GeneratedPiece = {
  format: string;
  title: string;
  hook: string;
  caption: string;
  slides: { title: string; body: string }[];
  ctaHint: string;
};

const FORMAT_OPTIONS = [
  { key: "carousel", label: "📚 Carrusel", desc: "6-10 slides con hook + narrativa + CTA" },
  { key: "stories", label: "📸 Stories", desc: "5-8 stories consecutivas de ritmo rápido" },
  { key: "reel", label: "🎬 Reel", desc: "Guion 30-60s: planos + voz en off + texto sobre" },
];

const APARTADOS_DETAIL = [
  { key: "initialSituation" as const, videosKey: "initialSituationVideos" as const, label: "Cómo estaba / dolor principal" },
  { key: "process" as const, videosKey: "processVideos" as const, label: "Cómo ha sido su proceso" },
  { key: "obstacles" as const, videosKey: "obstaclesVideos" as const, label: "Obstáculos que ha superado" },
  { key: "achievements" as const, videosKey: "achievementsVideos" as const, label: "Qué ha conseguido" },
];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function CaseDetailModal({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFormat, setSelectedFormat] = useState<"carousel" | "stories" | "reel">("carousel");
  const [generating, setGenerating] = useState(false);
  const [piece, setPiece] = useState<GeneratedPiece | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [reelDate, setReelDate] = useState<string>(todayIso());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/content/cases/${caseId}`);
        if (!res.ok) { setError("No se pudo cargar"); return; }
        const d = await res.json();
        if (!cancelled) setData(d);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [caseId]);

  async function generatePiece() {
    setGenerating(true);
    setError(null);
    setPiece(null);
    try {
      const res = await fetch(`/api/content/cases/${caseId}/piece`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: selectedFormat }),
      });
      const text = await res.text();
      let d: any = {};
      try { d = JSON.parse(text); } catch { /* ignore */ }
      if (!res.ok || !d?.ok) { setError(d?.error || `Error ${res.status}`); return; }
      setPiece(d);
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      setGenerating(false);
    }
  }

  function copyPieceToClipboard() {
    if (!piece) return;
    const text = [
      `# ${piece.title || "Pieza"}`,
      "",
      `HOOK: ${piece.hook}`,
      "",
      ...piece.slides.map((s, i) => `--- Slide ${i + 1}${s.title ? ` · ${s.title}` : ""} ---\n${s.body}`),
      "",
      piece.caption ? `CAPTION:\n${piece.caption}` : "",
      piece.ctaHint ? `\nCTA: ${piece.ctaHint}` : "",
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function publishAndOpen(date?: string) {
    if (!piece) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/content/cases/${caseId}/publish-piece`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: piece.format,
          generated: {
            title: piece.title,
            hook: piece.hook,
            caption: piece.caption,
            slides: piece.slides,
            ctaHint: piece.ctaHint,
          },
          date: date ?? undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d?.ok) {
        setError(d?.error || `Error ${res.status} publicando pieza`);
        return;
      }
      // Redirige al editor visual. Se pierde el modal — es lo que queremos.
      router.push(d.editorUrl);
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      setPublishing(false);
    }
  }

  const hasNarrative = !!(data?.initialSituation || data?.process);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b sticky top-0 bg-white flex items-center justify-between z-10">
          <div className="min-w-0">
            <h3 className="font-medium truncate">🩺 {data?.athleteName ?? "Caso"}</h3>
            <p className="text-[11px] text-neutral-500 mt-0.5 truncate">{data?.injury}</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 text-xl px-2">✕</button>
        </div>

        <div className="p-4 space-y-4">
          {loading && <p className="text-sm text-neutral-400 italic text-center py-8">Cargando caso…</p>}
          {error && <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">{error}</div>}

          {data && (
            <>
              {data.shortSummary && (
                <div className="bg-neutral-50 border border-neutral-200 rounded p-3">
                  <div className="text-[10px] uppercase text-neutral-500 font-medium mb-1">Resumen</div>
                  <p className="text-sm text-neutral-800">{data.shortSummary}</p>
                </div>
              )}

              {!hasNarrative && (
                <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
                  Este caso todavía no tiene narrativa. Ábrelo desde la ficha del paciente y pulsa "🧠 Generar con IA" para crear los 4 apartados.
                </div>
              )}

              {hasNarrative && (
                <div className="space-y-3">
                  {APARTADOS_DETAIL.map((ap) => {
                    const text = data[ap.key];
                    const videos = data[ap.videosKey];
                    if (!text && videos.length === 0) return null;
                    return (
                      <details key={ap.key} className="border border-neutral-200 rounded p-3 open:bg-neutral-50" open>
                        <summary className="text-sm font-semibold cursor-pointer">{ap.label}</summary>
                        {text && (
                          <p className="text-xs text-neutral-700 mt-2 whitespace-pre-wrap leading-relaxed">{text}</p>
                        )}
                        {videos.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {videos.map((v, i) => (
                              <li key={i} className="text-[11px]">
                                <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                  🎥 {v.caption || v.url}
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                      </details>
                    );
                  })}
                </div>
              )}

              {/* ─── Generador de piezas ─── */}
              {hasNarrative && (
                <div className="border-t pt-4 space-y-3">
                  <h4 className="text-sm font-semibold">🎬 Generar pieza de contenido</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {FORMAT_OPTIONS.map((f) => (
                      <button
                        key={f.key}
                        onClick={() => setSelectedFormat(f.key as any)}
                        disabled={generating}
                        className={`text-left rounded p-2 border transition-colors ${
                          selectedFormat === f.key
                            ? "border-emerald-500 bg-emerald-50"
                            : "border-neutral-200 hover:border-neutral-300"
                        }`}
                      >
                        <div className="text-sm font-medium">{f.label}</div>
                        <div className="text-[10px] text-neutral-500 mt-0.5">{f.desc}</div>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={generatePiece}
                    disabled={generating}
                    className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm font-medium py-2 rounded-lg disabled:opacity-50"
                  >
                    {generating ? "Generando…" : `🧠 Generar ${FORMAT_OPTIONS.find((f) => f.key === selectedFormat)?.label}`}
                  </button>
                  {generating && (
                    <p className="text-[11px] text-neutral-500 italic text-center">
                      Sonnet está tejiendo el guión… suele tardar 15-30s.
                    </p>
                  )}

                  {piece && (
                    <div className="border-2 border-amber-300 rounded-lg p-3 bg-amber-50/40 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[10px] uppercase text-amber-800 font-semibold">
                            {FORMAT_OPTIONS.find((f) => f.key === piece.format)?.label ?? piece.format}
                          </div>
                          <h5 className="font-medium text-sm mt-0.5">{piece.title}</h5>
                        </div>
                        <button
                          onClick={copyPieceToClipboard}
                          className="text-[11px] px-2 py-1 rounded bg-white border border-amber-300 hover:bg-amber-100"
                        >
                          {copied ? "✓ Copiado" : "📋 Copiar"}
                        </button>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-neutral-500 font-medium">Hook</div>
                        <p className="text-sm font-medium">{piece.hook}</p>
                      </div>
                      <ol className="space-y-2 text-sm">
                        {piece.slides.map((s, i) => (
                          <li key={i} className="bg-white rounded p-2 border border-neutral-200">
                            <div className="text-[10px] uppercase text-neutral-500 font-semibold">
                              Slide {i + 1}{s.title ? ` · ${s.title}` : ""}
                            </div>
                            <p className="text-xs mt-1 whitespace-pre-wrap">{s.body}</p>
                          </li>
                        ))}
                      </ol>
                      {piece.caption && (
                        <div>
                          <div className="text-[10px] uppercase text-neutral-500 font-medium">Caption</div>
                          <p className="text-xs whitespace-pre-wrap">{piece.caption}</p>
                        </div>
                      )}
                      {piece.ctaHint && (
                        <div className="text-[11px] text-neutral-600 italic">
                          <strong>CTA:</strong> {piece.ctaHint}
                        </div>
                      )}

                      {/* ─── Publicar y abrir en editor visual ─── */}
                      <div className="border-t border-amber-300 pt-3 mt-2">
                        {piece.format === "reel" ? (
                          <div className="flex flex-wrap items-end gap-2">
                            <div className="flex-1 min-w-[160px]">
                              <label className="block text-[10px] uppercase text-neutral-500 font-medium mb-1">
                                Fecha de publicación
                              </label>
                              <input
                                type="date"
                                value={reelDate}
                                onChange={(e) => setReelDate(e.target.value)}
                                className="input text-xs w-full"
                                disabled={publishing}
                              />
                            </div>
                            <button
                              onClick={() => publishAndOpen(reelDate)}
                              disabled={publishing || !reelDate}
                              className="text-xs font-medium px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 whitespace-nowrap"
                            >
                              {publishing ? "Publicando…" : "📅 Programar y abrir guión"}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => publishAndOpen()}
                            disabled={publishing}
                            className="w-full text-sm font-medium px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40"
                          >
                            {publishing ? "Publicando…" : `📅 Publicar y abrir editor visual`}
                          </button>
                        )}
                        <p className="text-[10px] text-neutral-500 mt-1 italic text-center">
                          {piece.format === "reel"
                            ? "Se creará la pieza en la fecha elegida y te llevará al editor del guión."
                            : "Se creará hoy en el calendario y te llevará al editor. La fecha se puede cambiar después."}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CaseModal({ item, patientsForLink, onClose, onSave }: { item: ClinicalCase | null; patientsForLink: { id: string; fullName: string }[]; onClose: () => void; onSave: (d: any) => Promise<void> }) {
  const [athleteName, setAthleteName] = useState(item?.athleteName ?? "");
  const [injury, setInjury] = useState(item?.injury ?? "");
  const [insight, setInsight] = useState(item?.insight ?? "");
  const [consentSigned, setConsentSigned] = useState(item?.consentSigned ?? false);
  const [videoUrlsText, setVideoUrlsText] = useState((item?.videoUrls ?? []).join("\n"));
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [patientId, setPatientId] = useState(item?.patientId ?? "");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!athleteName || !injury) return;
    setSaving(true);
    const videoUrls = videoUrlsText.split("\n").map((s) => s.trim()).filter(Boolean);
    await onSave({ athleteName, injury, insight, consentSigned, videoUrls, notes, patientId: patientId || null });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">{item ? "Editar caso de éxito" : "Nuevo caso de éxito"}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Nombre del atleta</label>
              <input className="input text-sm" value={athleteName} onChange={(e) => setAthleteName(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Vincular paciente (opcional)</label>
              <select className="input text-sm" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                <option value="">— Sin vincular —</option>
                {patientsForLink.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Lesión / situación</label>
            <input className="input text-sm" value={injury} onChange={(e) => setInjury(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Insight clínico</label>
            <textarea className="input text-sm" rows={2} value={insight} onChange={(e) => setInsight(e.target.value)} placeholder="Qué aprendí, qué fue clave..." />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">URLs de vídeos (una por línea)</label>
            <textarea className="input text-sm" rows={3} value={videoUrlsText} onChange={(e) => setVideoUrlsText(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Notas</label>
            <textarea className="input text-sm" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={consentSigned} onChange={(e) => setConsentSigned(e.target.checked)} />
            Permiso del cliente firmado ✓
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="text-sm text-neutral-500">Cancelar</button>
            <button onClick={submit} disabled={!athleteName || !injury || saving} className="btn btn-primary text-sm">
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// LEAD MAGNETS (con DMs auto-calculados)
// ============================================================================

function LeadMagnetsTab({ items }: { items: LeadMagnet[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<LeadMagnet | "new" | null>(null);

  async function save(data: any) {
    const isNew = editing === "new";
    await fetch("/api/content/lead-magnets", {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isNew ? data : { id: (editing as LeadMagnet).id, ...data }),
    });
    setEditing(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar este lead magnet?")) return;
    await fetch(`/api/content/lead-magnets?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <>
      <div className="flex justify-end mb-3">
        <button onClick={() => setEditing("new")} className="btn btn-primary text-xs">+ Nuevo lead magnet</button>
      </div>

      {items.length === 0 ? (
        <section className="card text-center py-12">
          <p className="text-sm text-neutral-400 italic">Aún no hay lead magnets. Añade el primero.</p>
        </section>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((lm) => (
            <div key={lm.id} className={`card group ${lm.active ? "" : "opacity-60"}`}>
              <div className="flex justify-between items-start gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm">{lm.name}</h3>
                  {lm.keyword && (
                    <span className="inline-block mt-1 text-[10px] font-mono uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                      DM: {lm.keyword}
                    </span>
                  )}
                </div>
                {!lm.active && (
                  <span className="text-[10px] uppercase bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded">Inactivo</span>
                )}
              </div>
              {lm.description && (
                <p className="text-xs text-neutral-600 mb-2 line-clamp-3">{lm.description}</p>
              )}
              {lm.url && (
                <div className="text-xs text-neutral-500 mt-3 pt-2 border-t border-neutral-100">
                  <a href={lm.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                    Abrir →
                  </a>
                </div>
              )}
              <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => setEditing(lm)} className="text-[11px] text-neutral-500 hover:text-neutral-900">Editar</button>
                <button onClick={() => remove(lm.id)} className="text-[11px] text-neutral-300 hover:text-red-600 ml-auto">Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <LeadMagnetModal item={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={save} />
      )}
    </>
  );
}

function LeadMagnetModal({ item, onClose, onSave }: { item: LeadMagnet | null; onClose: () => void; onSave: (d: any) => Promise<void> }) {
  const [name, setName] = useState(item?.name ?? "");
  const [keyword, setKeyword] = useState(item?.keyword ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [url, setUrl] = useState(item?.url ?? "");
  const [active, setActive] = useState(item?.active ?? true);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name) return;
    setSaving(true);
    await onSave({ name, keyword, description, url, active });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">{item ? "Editar lead magnet" : "Nuevo lead magnet"}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Nombre</label>
            <input className="input text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Guía hombro CrossFit" autoFocus />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Palabra clave DM</label>
            <input className="input text-sm font-mono uppercase" value={keyword} onChange={(e) => setKeyword(e.target.value.toUpperCase())} placeholder="HOMBRO" />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Descripción</label>
            <textarea className="input text-sm" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">URL de descarga</label>
            <input className="input text-sm" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Activo
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="text-sm text-neutral-500">Cancelar</button>
            <button onClick={submit} disabled={!name || saving} className="btn btn-primary text-sm">
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
