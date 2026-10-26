import test from "node:test";
import assert from "node:assert/strict";
import { sidebarIdsForRole } from "../lib/sidebar-order";
import {
  normalizeSidebarLayout,
  validateSidebarLayout,
  flattenSidebarLayout,
  movePageToFolder,
  putSidebarFolder,
  removeSidebarFolder,
  type SidebarFolder,
  type SidebarLayout,
} from "../lib/sidebar-layout";

const allowed = sidebarIdsForRole("ceo");
const folder = (
  id = "folder-team",
  pages = ["equipo", "resumenes", "reuniones"],
): SidebarFolder => ({
  type: "folder",
  id,
  label: "Gestión de equipo",
  icon: "users",
  pages,
});
const wrap = (items: SidebarLayout["items"]): SidebarLayout => ({
  version: 1,
  items,
});
function allOnce(layout: SidebarLayout, ids = allowed) {
  const flat = flattenSidebarLayout(layout);
  assert.equal(flat.length, ids.length);
  assert.deepEqual(new Set(flat), new Set(ids));
}

test("legacy order is kept and missing/new pages remain accessible", () => {
  const menu = normalizeSidebarLayout(["equipo", "tareas"], allowed);
  assert.deepEqual(flattenSidebarLayout(menu).slice(0, 2), [
    "equipo",
    "tareas",
  ]);
  allOnce(menu);
});
test("folder settings round-trip without changing page or folder order", () => {
  const menu = validateSidebarLayout(
    wrap([{ type: "page", id: "panel" }, folder()]),
    allowed,
  );
  assert.deepEqual(
    normalizeSidebarLayout(JSON.parse(JSON.stringify(menu)), allowed),
    menu,
  );
  assert.equal(menu.items[1].id, "folder-team");
  allOnce(menu);
});
test("reading old or corrupt data never hides permitted pages", () => {
  for (const raw of [
    null,
    {},
    { version: 12, items: [] },
    [42, "equipo", "equipo"],
    {
      version: 1,
      items: [null, { type: "folder", id: "bad", pages: ["equipo"] }],
    },
  ])
    allOnce(normalizeSidebarLayout(raw, allowed));
});
test("role changes remove forbidden pages inside folders and append new permitted pages", () => {
  const old = wrap([
    folder("folder-team", ["pacientes", "equipo", "finanzas"]),
  ]);
  const closer = sidebarIdsForRole("closer");
  const menu = normalizeSidebarLayout(old, closer);
  assert.deepEqual((menu.items[0] as SidebarFolder).pages, ["equipo"]);
  allOnce(menu, closer);
});
test("save rejects forbidden pages even when nested", () => {
  for (const items of [
    [{ type: "page", id: "pacientes" }],
    [folder("folder-team", ["pacientes"])],
  ] as SidebarLayout["items"][])
    assert.throws(() =>
      validateSidebarLayout(wrap(items), sidebarIdsForRole("closer")),
    );
});
test("save rejects duplicates across root and folders", () => {
  for (const items of [
    [folder(), { type: "page", id: "equipo" }],
    [folder(), folder("folder-second", ["equipo"])],
    [folder(), folder()],
  ] as SidebarLayout["items"][])
    assert.throws(() => validateSidebarLayout(wrap(items), allowed));
});
test("save validates names, icons, IDs, depth and limits", () => {
  for (const value of [
    { ...folder(), label: " " },
    { ...folder(), label: "x".repeat(51) },
    { ...folder(), icon: "unknown" },
    { ...folder(), id: "ajustes" },
    { ...folder(), pages: [folder()] },
    { ...folder(), pages: "/private" },
  ])
    assert.throws(() =>
      validateSidebarLayout({ version: 1, items: [value] }, allowed),
    );
  assert.throws(() =>
    validateSidebarLayout(
      wrap(Array.from({ length: 13 }, (_, i) => folder(`folder-${i}`, []))),
      allowed,
    ),
  );
});
test("creating a folder moves selected pages once while preserving other pages", () => {
  const menu = normalizeSidebarLayout([], allowed);
  const next = wrap(putSidebarFolder(menu.items, folder()));
  allOnce(next);
  assert.deepEqual((next.items.at(-1) as SidebarFolder).pages, folder().pages);
});
test("editing folder membership moves pages from another folder and releases removed pages", () => {
  const menu = normalizeSidebarLayout(
    wrap([folder(), folder("folder-work", ["tareas"])]),
    allowed,
  );
  const next = wrap(
    putSidebarFolder(menu.items, {
      ...folder(),
      label: "Equipo y tareas",
      pages: ["equipo", "tareas"],
    }),
  );
  allOnce(next);
  assert.deepEqual(
    (next.items.find((item) => item.id === "folder-work") as SidebarFolder)
      .pages,
    [],
  );
  assert.ok(
    next.items.some((item) => item.type === "page" && item.id === "reuniones"),
  );
  assert.ok(
    next.items.some(
      (item) => item.type === "page" && item.id === "resumenes",
    ),
  );
});
test("removing a folder restores its children in place without deleting pages", () => {
  const menu = normalizeSidebarLayout(
    wrap([{ type: "page", id: "panel" }, folder()]),
    allowed,
  );
  const next = wrap(removeSidebarFolder(menu.items, "folder-team"));
  assert.deepEqual(flattenSidebarLayout(next).slice(0, 4), [
    "panel",
    "equipo",
    "resumenes",
    "reuniones",
  ]);
  allOnce(next);
});
test("moving pages between folders and back to root keeps every page once", () => {
  const menu = normalizeSidebarLayout(
    wrap([folder(), folder("folder-work", [])]),
    allowed,
  );
  const moved = movePageToFolder(menu.items, "equipo", "folder-work");
  assert.deepEqual(
    (moved.find((item) => item.id === "folder-work") as SidebarFolder).pages,
    ["equipo"],
  );
  allOnce(wrap(moved));
  const released = movePageToFolder(moved, "equipo", null);
  assert.deepEqual(released.at(-1), { type: "page", id: "equipo" });
  allOnce(wrap(released));
  assert.deepEqual(movePageToFolder(moved, "equipo", "folder-missing"), moved);
});
test("restoring defaults removes folders but retains all pages in role order", () => {
  assert.deepEqual(
    flattenSidebarLayout(normalizeSidebarLayout([], allowed)),
    allowed,
  );
});

test("combined FisioFit roles retain all permitted pages without duplicates", () => {
  const combined = sidebarIdsForRole("fisio", ["closer", "fisio"]);
  assert.ok(combined.includes("pacientes"));
  assert.ok(combined.includes("llamadas-venta"));
  assert.ok(combined.includes("calendario-llamadas"));
  assert.equal(new Set(combined).size, combined.length);
  const layout = validateSidebarLayout(wrap([folder("folder-clinica", ["pacientes", "testimonios", "resumenes"])]), combined);
  allOnce(layout, combined);
  assert.throws(() => validateSidebarLayout(wrap([folder("folder-ceo", ["finanzas"])]), combined));
});
