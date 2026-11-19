// Offline interaction regression: no database, network, real AI or patient data.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { renderToStaticMarkup } = require("react-dom/server");
const React = require("react");

let current;
const hookReact = {
  useState(initial) {
    const h = current, index = h.index++;
    if (!(index in h.slots)) h.slots[index] = typeof initial === "function" ? initial() : initial;
    return [h.slots[index], (value) => {
      const next = typeof value === "function" ? value(h.slots[index]) : value;
      if (!Object.is(next, h.slots[index])) { h.slots[index] = next; h.dirty = true; }
    }];
  },
  useRef(initial) {
    const h = current, index = h.index++;
    if (!(index in h.slots)) h.slots[index] = { current: initial };
    return h.slots[index];
  },
  useEffect(effect, deps) {
    const h = current, index = h.index++, before = h.slots[index];
    if (!before || deps.some((value, i) => !Object.is(value, before.deps[i]))) {
      h.effects.push(() => {
        before?.cleanup?.();
        h.slots[index] = { deps, cleanup: effect() };
      });
    }
  },
};
const modules = new Map();
function load(file) {
  file = path.resolve(__dirname, "..", file);
  if (modules.has(file)) return modules.get(file);
  const mod = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length ?? 0, 0, `valid TSX syntax: ${file}`);
  const js = compiled.outputText;
  function localRequire(name) {
    if (name === "react") return hookReact;
    if (name === "next/navigation") return { useRouter: () => ({ refresh() {} }) };
    if (name.startsWith("@/")) {
      const base = name.slice(2);
      return load(base + (fs.existsSync(path.resolve(__dirname, "..", base + ".tsx")) ? ".tsx" : ".ts"));
    }
    return require(name);
  }
  new Function("require", "module", "exports", js)(localRequire, mod, mod.exports);
  modules.set(file, mod.exports);
  return mod.exports;
}
const { WodAdapter } = load("components/WodAdapter.tsx");
const { WodReadinessBadge } = load("components/WodReadinessBadge.tsx");
const { WOD_READINESS_OPTIONS } = load("lib/wod-readiness.ts");
const store = new Map();
const RealDate = Date;
let now = new RealDate("2026-11-20T12:00:00.000Z").getTime();
global.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
};
const listeners = { focus: new Set(), visibilitychange: new Set() };
const events = {
  addEventListener(type, handler) { listeners[type].add(handler); },
  removeEventListener(type, handler) { listeners[type].delete(handler); },
};
global.window = { ...events };
global.document = { ...events, visibilityState: "visible" };
function dispatch(type) { [...listeners[type]].forEach((handler) => handler()); }
global.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
  removeItem: (key) => store.delete(key),
};
global.alert = () => {};
let requests = [];
global.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  requests.push({ url, body });
  return { ok: true, json: async () => ({ readiness: body.readiness, lines: [{ raw: body.rawText, state: "OK", adaptedLoad: "20 kg" }] }) };
};
function nodes(tree, predicate, result = []) {
  if (Array.isArray(tree)) tree.forEach((item) => nodes(item, predicate, result));
  else if (tree && typeof tree === "object") {
    if (predicate(tree)) result.push(tree);
    nodes(tree.props?.children, predicate, result);
  }
  return result;
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (tree === null || tree === undefined || typeof tree === "boolean") return "";
  if (typeof tree === "object") return text(tree.props?.children);
  return String(tree);
}
function mount(programType) {
  const h = { slots: [], effects: [], index: 0, dirty: true, tree: null };
  h.render = () => {
    let attempts = 0;
    do {
      assert(++attempts < 20, "render settles");
      current = h; h.index = 0; h.effects = []; h.dirty = false;
      h.tree = WodAdapter({ patientId: "synthetic-athlete", programType, preamble: React.createElement("p", null, "BETA PREAMBLE") });
      h.effects.forEach((effect) => effect());
    } while (h.dirty);
    return h.tree;
  };
  h.button = (label) => nodes(h.tree, (node) => node.type === "button" && text(node).includes(label))[0];
  h.radio = (value) => nodes(h.tree, (node) => node.type === "input" && node.props.type === "radio" && node.props.value === value)[0];
  h.select = (value) => {
    if (h.button("Cambiar")) { h.button("Cambiar").props.onClick(); h.render(); }
    h.radio(value).props.onChange(); h.render();
    h.button("Continuar").props.onClick(); h.render();
  };
  h.write = (value) => { nodes(h.tree, (node) => node.type === "textarea" && node.props.placeholder?.startsWith("Pega"))[0].props.onChange({ target: { value } }); h.render(); };
  h.adapt = async () => { await h.button("Adaptar a mi caso").props.onClick(); h.render(); };
  h.render(); return h;
}
async function main() {
  const key = "fisio-wod-adapter-v1:synthetic-athlete";
  store.set(key, JSON.stringify({ rawText: "10 press", adapted: [{ raw: "OLD RESULT", state: "OK" }], rpe: null, pain: 0, savedAt: "2020-01-01T12:00:00.000Z" }));
  const h = mount("RECUPERA");
  assert.equal(nodes(h.tree, (node) => node.type === "input" && node.props.type === "radio").length, 3);
  for (const option of WOD_READINESS_OPTIONS) {
    assert.equal(h.radio(option.value).props.checked, false);
    assert(text(h.tree).includes(option.description));
  }
  assert(h.button("Continuar").props.disabled);
  assert(!h.button("Adaptar a mi caso"));
  assert.equal(nodes(h.tree, (node) => node.type === "textarea").length, 0);
  assert(!text(h.tree).includes("BETA PREAMBLE"));
  assert(!text(h.tree).includes("OLD RESULT"));
  h.radio("AMBER").props.onChange(); h.render();
  assert(!h.button("Adaptar a mi caso"), "choice still requires Continue");
  h.button("Continuar").props.onClick(); h.render();
  assert(text(h.tree).includes("BETA PREAMBLE"));
  assert.equal(nodes(h.tree, (node) => node.type === "textarea")[0].props.value, "10 press");
  await h.adapt();
  assert.equal(requests.at(-1).body.readiness, "AMBER");
  assert(h.button("Registrar al terminar"));
  h.select("RED"); assert(!h.button("Registrar al terminar"));
  await h.adapt();
  h.write("20 press"); assert(!h.button("Registrar al terminar"));
  await h.adapt();
  h.button("Registrar al terminar").props.onClick(); h.render();
  await h.button("Enviar a mi fisio").props.onClick(); h.render();
  const logged = requests.findLast((request) => request.url === "/api/wod/log").body;
  assert.equal(logged.readiness, "RED");
  assert.equal(logged.rawText, "20 press");
  assert(logged.adaptedText.includes("20 kg"), "OK-state load survives logging");
  assert.equal(h.radio("RED").props.checked, false);
  assert.equal(store.has(key), false);

  // Changing state while a request is in flight cannot resurrect its old result.
  h.select("GREEN"); h.write("30 press");
  const normalFetch = global.fetch;
  let finish;
  global.fetch = () => new Promise((resolve) => { finish = resolve; });
  const pending = h.button("Adaptar a mi caso").props.onClick(); h.render();
  h.select("RED");
  finish({ ok: true, json: async () => ({ readiness: "GREEN", lines: [{ raw: "STALE RESULT", state: "OK" }] }) });
  await pending; h.render();
  assert(!h.button("Registrar al terminar"));
  assert(!text(h.tree).includes("STALE RESULT"));
  global.fetch = normalFetch;

  // Reopening keeps only the draft for eligible programmes, never prior readiness.
  await h.adapt();
  const reopened = mount("CONSOLIDA");
  assert.equal(reopened.radio("RED").props.checked, false);
  assert(reopened.button("Continuar").props.disabled);
  assert(!reopened.button("Adaptar a mi caso"));
  assert(!reopened.button("Registrar al terminar"));
  // Normal focus preserves readiness; a new local day requires a fresh choice.
  reopened.select("AMBER"); await reopened.adapt();
  dispatch("focus"); reopened.render();
  assert(reopened.button("Registrar al terminar"));
  now += 24 * 60 * 60 * 1000;
  dispatch("visibilitychange"); reopened.render();
  assert(!reopened.button("Adaptar a mi caso"));
  assert.equal(reopened.radio("AMBER").props.checked, false);
  reopened.select("RED");
  assert.equal(nodes(reopened.tree, (node) => node.type === "textarea")[0].props.value, "30 press");
  const beforeDayChange = requests.length;
  now += 24 * 60 * 60 * 1000;
  await reopened.adapt();
  assert.equal(requests.length, beforeDayChange, "adapt checks date even without a focus event");
  assert(reopened.button("Continuar").props.disabled);

  // Starting OCR removes the prior adaptation before the async result arrives.
  reopened.select("GREEN"); await reopened.adapt();
  let finishPhoto;
  global.fetch = () => new Promise((resolve) => { finishPhoto = resolve; });
  nodes(reopened.tree, (node) => node.type === "input" && node.props.type === "file")[0].props.onChange({ target: { files: [new Blob(["synthetic"], { type: "image/png" })] } });
  reopened.render();
  assert(!reopened.button("Registrar al terminar"));
  finishPhoto({ ok: true, json: async () => ({ text: "10 squats" }) });
  await new Promise((resolve) => setImmediate(resolve)); reopened.render();
  assert(!reopened.button("Registrar al terminar"));
  assert(nodes(reopened.tree, (node) => node.type === "textarea")[0].props.value.includes("10 squats"));
  global.fetch = normalFetch;

  for (const program of ["ADVANCE", "PREVENTION", null]) {
    const other = mount(program);
    assert.equal(nodes(other.tree, (node) => node.type === "input" && node.props.type === "radio").length, 0);
  }
  assert.equal(renderToStaticMarkup(React.createElement(WodReadinessBadge, { readiness: null })), "");
  assert.equal(renderToStaticMarkup(React.createElement(WodReadinessBadge, { readiness: "OTHER" })), "");
  assert(renderToStaticMarkup(React.createElement(WodReadinessBadge, { readiness: "AMBER" })).includes("Ámbar"));
  console.log("PASS: two-step fresh readiness, exact descriptions, draft retention, day/focus guards, color/text/OCR invalidation, stale-response rejection, OK load history, programme gating and legacy badges.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
