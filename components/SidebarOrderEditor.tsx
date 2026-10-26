"use client";

import { useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  ArrowDown,
  GripVertical,
  FolderPlus,
  Pencil,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { SIDEBAR_PAGES, sidebarIdsForRole } from "@/lib/sidebar-order";
import {
  MAX_SIDEBAR_FOLDERS,
  SIDEBAR_FOLDER_ICONS,
  normalizeSidebarLayout,
  movePageToFolder,
  putSidebarFolder,
  removeSidebarFolder,
  type SidebarFolder,
  type SidebarNode,
  type SidebarLayout,
} from "@/lib/sidebar-layout";
import { saveSidebarLayout } from "@/app/fisio/ajustes/menu/actions";
import { SidebarFolderIcon } from "@/components/SidebarFolderIcon";
import { WorkDialog } from "@/components/SidebarDialog";

export function SidebarOrderEditor({
  initialLayout,
  role,
  allowedPages,
}: {
  initialLayout: SidebarLayout;
  role: string;
  allowedPages?: string[];
}) {
  const router = useRouter();
  const allowed = allowedPages ?? sidebarIdsForRole(role);
  const pages = allowed.map(
    (id) => SIDEBAR_PAGES.find((page) => page.id === id)!,
  );
  const initial = normalizeSidebarLayout(initialLayout, allowed);
  const [items, setItems] = useState<SidebarNode[]>(initial.items);
  const [saved, setSaved] = useState(JSON.stringify(initial.items));
  const [dragged, setDragged] = useState<{
    id: string;
    container: string | null;
  } | null>(null);
  const [folderForm, setFolderForm] = useState<SidebarFolder | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const folders = items.filter(
    (item): item is SidebarFolder => item.type === "folder",
  );
  const dirty = JSON.stringify(items) !== saved;
  const pageLabel = (id: string) =>
    pages.find((page) => page.id === id)?.label ?? id;
  function change(next: SidebarNode[]) {
    setItems(next);
    setMessage("");
  }

  function move(id: string, target: number, container: string | null) {
    const siblings = container
      ? (folders.find((folder) => folder.id === container)?.pages ?? [])
      : items.map((item) => item.id);
    const source = siblings.indexOf(id);
    if (
      source < 0 ||
      target < 0 ||
      target >= siblings.length ||
      source === target
    )
      return;
    const reordered = [...siblings];
    reordered.splice(source, 1);
    reordered.splice(target, 0, id);
    change(
      container
        ? items.map((item) =>
            item.type === "folder" && item.id === container
              ? { ...item, pages: reordered }
              : item,
          )
        : reordered.map((key) => items.find((item) => item.id === key)!),
    );
  }
  function dragProps(id: string, index: number, container: string | null) {
    return {
      draggable: !saving,
      onDragStart: (event: DragEvent) => {
        event.stopPropagation();
        setDragged({ id, container });
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", id);
      },
      onDragEnd: () => setDragged(null),
      onDragOver: (event: DragEvent) => {
        if (!saving && dragged?.container === container) event.preventDefault();
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (!saving && dragged?.container === container)
          move(dragged.id, index, container);
        setDragged(null);
      },
    };
  }
  function arrows(
    id: string,
    label: string,
    index: number,
    count: number,
    container: string | null,
  ) {
    return (
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          aria-label={`Subir ${label}`}
          title="Subir"
          className="rounded border p-1.5 disabled:opacity-30"
          disabled={saving || index === 0}
          onClick={() => move(id, index - 1, container)}
        >
          <ArrowUp size={13} />
        </button>
        <button
          type="button"
          aria-label={`Bajar ${label}`}
          title="Bajar"
          className="rounded border p-1.5 disabled:opacity-30"
          disabled={saving || index === count - 1}
          onClick={() => move(id, index + 1, container)}
        >
          <ArrowDown size={13} />
        </button>
      </div>
    );
  }
  function pageRow(
    id: string,
    index: number,
    container: string | null,
    count: number,
  ) {
    return (
      <li
        key={id}
        {...dragProps(id, index, container)}
        className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-100 bg-white px-2 py-2 text-sm"
      >
        <GripVertical
          size={14}
          aria-hidden="true"
          className="shrink-0 cursor-grab text-neutral-400"
        />
        <span className="min-w-[100px] flex-1">{pageLabel(id)}</span>
        <select
          aria-label={`Ubicación de ${pageLabel(id)}`}
          disabled={saving}
          value={container ?? ""}
          onChange={(event) =>
            change(movePageToFolder(items, id, event.target.value || null))
          }
          className="max-w-[150px] rounded-md border border-neutral-200 bg-transparent px-1.5 py-1 text-xs"
        >
          <option value="">Sin carpeta</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.label}
            </option>
          ))}
        </select>
        {arrows(id, pageLabel(id), index, count, container)}
      </li>
    );
  }
  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const result = await saveSidebarLayout({ version: 1, items });
      setItems(result.items);
      setSaved(JSON.stringify(result.items));
      setMessage("Tu menú se ha guardado. Solo afecta a tu cuenta.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar. Inténtalo de nuevo.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || !dirty}
          onClick={save}
        >
          {saving ? "Guardando…" : "Guardar mi menú"}
        </button>
        <button
          type="button"
          className="btn btn-ghost inline-flex items-center gap-2"
          disabled={saving || folders.length >= MAX_SIDEBAR_FOLDERS}
          onClick={() =>
            setFolderForm({
              type: "folder",
              id: `folder-${crypto.randomUUID()}`,
              label: "",
              icon: "folder",
              pages: [],
            })
          }
        >
          <FolderPlus size={16} /> Crear carpeta
        </button>
        <button
          type="button"
          className="text-xs text-neutral-500 underline"
          disabled={saving}
          onClick={() => {
            if (
              folders.length &&
              !confirm(
                "¿Restaurar el menú original? Se quitarán tus carpetas y se recuperará el orden predeterminado. Las páginas no se borran. Pulsa Guardar mi menú para aplicar el cambio.",
              )
            )
              return;
            change(normalizeSidebarLayout([], allowed).items);
          }}
        >
          Restaurar menú predeterminado
        </button>
      </div>
      <p className="text-xs text-neutral-500">
        Arrastra para ordenar dentro de cada grupo o utiliza las flechas. El
        selector de cada página permite moverla a una carpeta o dejarla suelta.
        Los cambios se aplican al guardar.
      </p>
      {dirty && (
        <p className="text-xs text-amber-700">Hay cambios sin guardar.</p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(240px,1fr)]">
        <section className="rounded-xl border bg-white p-3">
          <h2 className="mb-3 font-medium">Tus páginas y carpetas</h2>
          <ol className="space-y-2" aria-label="Organización del menú">
            {items.map((item, index) =>
              item.type === "page" ? (
                pageRow(item.id, index, null, items.length)
              ) : (
                <li
                  key={item.id}
                  className="rounded-xl border border-neutral-200 p-2"
                >
                  <div
                    {...dragProps(item.id, index, null)}
                    className="flex flex-wrap items-center gap-2 rounded-lg bg-neutral-50 px-2 py-2"
                  >
                    <GripVertical
                      size={14}
                      aria-hidden="true"
                      className="shrink-0 cursor-grab text-neutral-400"
                    />
                    <SidebarFolderIcon name={item.icon} />
                    <span className="min-w-0 flex-1 break-words text-sm font-medium">
                      {item.label}
                    </span>
                    <button
                      type="button"
                      title="Editar nombre e icono"
                      aria-label={`Editar nombre e icono de ${item.label}`}
                      disabled={saving}
                      onClick={() =>
                        setFolderForm({ ...item, pages: [...item.pages] })
                      }
                      className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
                    >
                      <Pencil size={14} />
                      Editar nombre e icono
                    </button>
                    <button
                      type="button"
                      title="Quitar carpeta y conservar sus páginas"
                      aria-label={`Quitar carpeta ${item.label}`}
                      disabled={saving}
                      onClick={() =>
                        change(removeSidebarFolder(items, item.id))
                      }
                      className="p-1.5 text-neutral-500 hover:text-red-700"
                    >
                      <Trash2 size={14} />
                    </button>
                    {arrows(item.id, item.label, index, items.length, null)}
                  </div>
                  <ol
                    className="mt-2 space-y-1 border-l border-neutral-200 pl-2"
                    aria-label={`Páginas de ${item.label}`}
                  >
                    {item.pages.map((id, childIndex) =>
                      pageRow(id, childIndex, item.id, item.pages.length),
                    )}
                  </ol>
                  {!item.pages.length && (
                    <p className="px-3 py-3 text-xs text-neutral-500">
                      Carpeta vacía. Edítala para seleccionar páginas. No
                      aparecerá en el sidebar hasta que tenga alguna.
                    </p>
                  )}
                </li>
              ),
            )}
          </ol>
        </section>
        <section className="rounded-xl border bg-neutral-50 p-4 lg:sticky lg:top-4">
          <h2 className="mb-3 font-medium">Vista previa de tu menú</h2>
          <ol aria-label="Vista previa del menú" className="space-y-1 text-sm">
            {items.map((item) =>
              item.type === "page" ? (
                <li key={item.id} className="px-2 py-2">
                  {pageLabel(item.id)}
                </li>
              ) : item.pages.length ? (
                <li key={item.id}>
                  <details open className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-2 font-medium hover:bg-neutral-100 [&::-webkit-details-marker]:hidden">
                      <SidebarFolderIcon name={item.icon} />
                      <span className="min-w-0 flex-1 break-words">
                        {item.label}
                      </span>
                      <ChevronDown size={14} className="shrink-0" />
                    </summary>
                    <ol className="ml-4 border-l border-neutral-200 pl-3 text-neutral-600">
                      {item.pages.map((id) => (
                        <li key={id} className="py-2">
                          {pageLabel(id)}
                        </li>
                      ))}
                    </ol>
                  </details>
                </li>
              ) : null,
            )}
          </ol>
        </section>
      </div>
      {folderForm && (
        <FolderEditor
          key={folderForm.id}
          folder={folderForm}
          pages={pages}
          items={items}
          onClose={() => setFolderForm(null)}
          onApply={(folder) => {
            change(putSidebarFolder(items, folder));
            setFolderForm(null);
          }}
        />
      )}
    </div>
  );
}

function FolderEditor({
  folder,
  pages,
  items,
  onClose,
  onApply,
}: {
  folder: SidebarFolder;
  pages: { id: string; label: string }[];
  items: SidebarNode[];
  onClose: () => void;
  onApply: (folder: SidebarFolder) => void;
}) {
  const [draft, setDraft] = useState(folder);
  const editing = items.some((item) => item.id === folder.id);
  return (
    <WorkDialog
      title={editing ? "Personalizar carpeta" : "Crear una carpeta"}
      onClose={onClose}
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.label.trim())
            onApply({ ...draft, label: draft.label.trim() });
        }}
      >
        <div className="space-y-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-sm text-neutral-600">
            Escribe el nombre que quieras y elige un símbolo para tu carpeta.
          </p>
          <label className="block text-sm font-medium">
            Nombre que aparecerá en tu menú
            <input
              required
              maxLength={50}
              value={draft.label}
              onChange={(event) =>
                setDraft({ ...draft, label: event.target.value })
              }
              placeholder="Escribe el nombre de tu carpeta"
              className="input mt-1 w-full bg-white"
              autoFocus
            />
          </label>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Elige el icono</legend>
            <div className="grid max-w-sm grid-cols-6 gap-2">
              {SIDEBAR_FOLDER_ICONS.map((icon) => (
                <button
                  type="button"
                  key={icon.id}
                  title={icon.label}
                  aria-label={`Icono: ${icon.label}`}
                  aria-pressed={draft.icon === icon.id}
                  onClick={() => setDraft({ ...draft, icon: icon.id })}
                  className="flex h-11 items-center justify-center rounded-lg border border-neutral-200 bg-white hover:border-neutral-400"
                  style={
                    draft.icon === icon.id
                      ? {
                          background: "#FEF097",
                          borderColor: "#D5D6CA",
                          color: "#141717",
                        }
                      : undefined
                  }
                >
                  <SidebarFolderIcon name={icon.id} size={20} />
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <p className="mb-2 text-xs text-neutral-500">
              Así se verá tu carpeta
            </p>
            <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm font-medium">
              <SidebarFolderIcon name={draft.icon} />
              <span className="min-w-0 flex-1 break-words">
                {draft.label.trim() || "Tu carpeta"}
              </span>
              <ChevronDown size={14} className="shrink-0" />
            </div>
          </div>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">
            Páginas de la carpeta
          </legend>
          <div className="grid max-h-64 gap-2 overflow-y-auto rounded-xl border p-3 sm:grid-cols-2">
            {pages.map((page) => {
              const current = items.find(
                (item): item is SidebarFolder =>
                  item.type === "folder" && item.pages.includes(page.id),
              );
              return (
                <label
                  key={page.id}
                  className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-neutral-50"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={draft.pages.includes(page.id)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        pages: event.target.checked
                          ? [...draft.pages, page.id]
                          : draft.pages.filter((id) => id !== page.id),
                      })
                    }
                  />
                  <span>
                    {page.label}
                    {current && current.id !== folder.id && (
                      <span className="block text-[10px] text-neutral-400">
                        Ahora en {current.label}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Las páginas seleccionadas se moverán a esta carpeta. Las que quites
            volverán al menú principal.
          </p>
        </fieldset>
        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={!draft.label.trim()}
        >
          {editing ? "Aplicar cambios" : "Crear carpeta"}
        </button>
        <p className="text-center text-xs text-neutral-500">
          Después, pulsa Guardar mi menú para guardar tu configuración.
        </p>
      </form>
    </WorkDialog>
  );
}
