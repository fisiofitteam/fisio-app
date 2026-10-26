import { normalizeSidebarOrder, SIDEBAR_PAGES } from "@/lib/sidebar-order";

export const SIDEBAR_FOLDER_ICONS = [
  { id: "folder", label: "Carpeta" },
  { id: "users", label: "Personas" },
  { id: "briefcase", label: "Maletín" },
  { id: "calendar", label: "Calendario" },
  { id: "clipboard", label: "Portapapeles" },
  { id: "messages", label: "Bocadillo de diálogo" },
  { id: "book", label: "Libro" },
  { id: "chart", label: "Indicador" },
  { id: "megaphone", label: "Megáfono" },
  { id: "heart", label: "Corazón" },
  { id: "target", label: "Diana" },
  { id: "settings", label: "Engranaje" },
] as const;
export type SidebarFolderIconName = (typeof SIDEBAR_FOLDER_ICONS)[number]["id"];
export type SidebarFolder = {
  type: "folder";
  id: string;
  label: string;
  icon: SidebarFolderIconName;
  pages: string[];
};
export type SidebarNode = { type: "page"; id: string } | SidebarFolder;
export type SidebarLayout = { version: 1; items: SidebarNode[] };
export const MAX_SIDEBAR_FOLDERS = 12;
const folderId = /^folder-[a-zA-Z0-9_-]{1,64}$/;
const iconIds = new Set<string>(SIDEBAR_FOLDER_ICONS.map((icon) => icon.id));
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Read old flat orders and newer layouts safely; every permitted page remains reachable. */
export function normalizeSidebarLayout(
  raw: unknown,
  allowedIds: string[],
): SidebarLayout {
  const known = new Set(SIDEBAR_PAGES.map((page) => page.id));
  const allowed = [...new Set(allowedIds.filter((id) => known.has(id)))];
  const permitted = new Set(allowed),
    seen = new Set<string>(),
    folders = new Set<string>();
  const items: SidebarNode[] = [];
  const input = Array.isArray(raw)
    ? normalizeSidebarOrder(raw).map((id) => ({ type: "page", id }))
    : record(raw) && raw.version === 1 && Array.isArray(raw.items)
      ? raw.items
      : [];
  function take(value: unknown): value is string {
    if (typeof value !== "string" || !permitted.has(value) || seen.has(value))
      return false;
    seen.add(value);
    return true;
  }
  for (const node of input) {
    if (!record(node)) continue;
    if (node.type === "page" && take(node.id))
      items.push({ type: "page", id: node.id });
    else if (
      node.type === "folder" &&
      typeof node.id === "string" &&
      folderId.test(node.id) &&
      !folders.has(node.id) &&
      folders.size < MAX_SIDEBAR_FOLDERS &&
      typeof node.label === "string" &&
      node.label.trim() &&
      Array.isArray(node.pages)
    ) {
      folders.add(node.id);
      items.push({
        type: "folder",
        id: node.id,
        label: node.label.trim().slice(0, 50),
        icon:
          typeof node.icon === "string" && iconIds.has(node.icon)
            ? (node.icon as SidebarFolderIconName)
            : "folder",
        pages: node.pages.filter(take),
      });
    }
  }
  for (const id of allowed) if (!seen.has(id)) items.push({ type: "page", id });
  return { version: 1, items };
}

/** Strict write validation; permissions come from the server session. */
export function validateSidebarLayout(
  raw: unknown,
  allowedIds: string[],
): SidebarLayout {
  if (
    !record(raw) ||
    raw.version !== 1 ||
    !Array.isArray(raw.items) ||
    raw.items.length > allowedIds.length + MAX_SIDEBAR_FOLDERS
  )
    throw new Error("La configuración del menú no es válida.");
  const allowed = new Set(allowedIds),
    seen = new Set<string>(),
    folders = new Set<string>();
  function page(id: unknown) {
    if (typeof id !== "string" || !allowed.has(id) || seen.has(id))
      throw new Error("El menú contiene páginas no permitidas o repetidas.");
    seen.add(id);
  }
  for (const node of raw.items) {
    if (!record(node))
      throw new Error("La configuración del menú no es válida.");
    if (node.type === "page") page(node.id);
    else if (node.type === "folder") {
      if (
        typeof node.id !== "string" ||
        !folderId.test(node.id) ||
        folders.has(node.id)
      )
        throw new Error("La carpeta no es válida o está repetida.");
      folders.add(node.id);
      if (folders.size > MAX_SIDEBAR_FOLDERS)
        throw new Error(`Puedes crear hasta ${MAX_SIDEBAR_FOLDERS} carpetas.`);
      if (
        typeof node.label !== "string" ||
        !node.label.trim() ||
        node.label.trim().length > 50
      )
        throw new Error(
          "Pon un nombre de entre 1 y 50 caracteres a cada carpeta.",
        );
      if (typeof node.icon !== "string" || !iconIds.has(node.icon))
        throw new Error("Selecciona un icono de la lista.");
      if (!Array.isArray(node.pages) || node.pages.length > allowedIds.length)
        throw new Error("Las páginas de la carpeta no son válidas.");
      node.pages.forEach(page);
    } else
      throw new Error("Solo puedes agrupar páginas en carpetas de un nivel.");
  }
  return normalizeSidebarLayout(raw, allowedIds);
}

export function flattenSidebarLayout(layout: SidebarLayout): string[] {
  return layout.items.flatMap((node) =>
    node.type === "folder" ? node.pages : [node.id],
  );
}

export function movePageToFolder(
  items: SidebarNode[],
  pageId: string,
  destination: string | null,
): SidebarNode[] {
  if (
    !items.some((node) =>
      node.type === "page" ? node.id === pageId : node.pages.includes(pageId),
    )
  )
    return items;
  if (
    destination &&
    !items.some((node) => node.type === "folder" && node.id === destination)
  )
    return items;
  const next = items
    .filter((node) => node.type !== "page" || node.id !== pageId)
    .map(
      (node): SidebarNode =>
        node.type === "folder"
          ? {
              ...node,
              pages: [
                ...node.pages.filter((id) => id !== pageId),
                ...(node.id === destination ? [pageId] : []),
              ],
            }
          : node,
    );
  if (!destination) next.push({ type: "page", id: pageId });
  return next;
}

export function putSidebarFolder(
  items: SidebarNode[],
  folder: SidebarFolder,
): SidebarNode[] {
  const previous = items.find(
    (node): node is SidebarFolder =>
      node.type === "folder" && node.id === folder.id,
  );
  const selected = new Set(folder.pages);
  const released = (previous?.pages ?? []).filter((id) => !selected.has(id));
  const next = items
    .filter((node) => node.type !== "page" || !selected.has(node.id))
    .map(
      (node): SidebarNode =>
        node.id === folder.id
          ? folder
          : node.type === "folder"
            ? { ...node, pages: node.pages.filter((id) => !selected.has(id)) }
            : node,
    );
  if (!previous) next.push(folder);
  const position = next.findIndex((node) => node.id === folder.id);
  next.splice(
    position + 1,
    0,
    ...released.map((id): SidebarNode => ({ type: "page", id })),
  );
  return next;
}

export function removeSidebarFolder(
  items: SidebarNode[],
  id: string,
): SidebarNode[] {
  return items.flatMap((node): SidebarNode[] =>
    node.type === "folder" && node.id === id
      ? node.pages.map((pageId) => ({ type: "page", id: pageId }))
      : [node],
  );
}
