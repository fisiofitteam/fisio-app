import { PILOT_TESTS } from "@/lib/shoulder-pilot";
import type { ShoulderTestFeedback, ShoulderTestFeedbackMap } from "@/lib/shoulder-test-feedback";

type Phase = { testFeedback?: ShoulderTestFeedbackMap; pain: { painfulTestIds?: string[] | null } };

const measured = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const number = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 2 });
const hasFeedback = (f?: ShoulderTestFeedback) =>
  !!f && (measured(f.pain) || measured(f.reps) || measured(f.loadKg) || !!f.comment?.trim());
const hasSet = (f?: ShoulderTestFeedback) => measured(f?.reps) || measured(f?.loadKg);
const flagged = (p: Phase | null | undefined, id: string) => !!p?.pain.painfulTestIds?.includes(id);

function changeText(first?: ShoulderTestFeedback, last?: ShoulderTestFeedback) {
  if (!first || !last) return "";
  const changes: string[] = [];
  if (measured(first.reps) && measured(last.reps)) {
    const d = last.reps - first.reps;
    changes.push(d === 0 ? "las mismas repeticiones" : number(Math.abs(d)) + (Math.abs(d) === 1 ? " repetición" : " repeticiones") + (d > 0 ? " más" : " menos"));
  }
  if (measured(first.loadKg) && measured(last.loadKg)) {
    const d = Math.round((last.loadKg - first.loadKg) * 100) / 100;
    changes.push(d === 0 ? "la misma carga" : number(Math.abs(d)) + " kg " + (d > 0 ? "más" : "menos"));
  }
  if (measured(first.pain) && measured(last.pain)) {
    const d = last.pain - first.pain;
    changes.push(d === 0 ? "el mismo dolor" : number(Math.abs(d)) + (Math.abs(d) === 1 ? " punto " : " puntos ") + (d > 0 ? "más" : "menos") + " de dolor");
  }
  return changes.length ? "En el retest: " + new Intl.ListFormat("es-ES", { style: "long", type: "conjunction" }).format(changes) + "." : "";
}

function PhaseReadout({ label, row, marked }: { label: string; row?: ShoulderTestFeedback; marked: boolean }) {
  return <div className="min-w-0">
    <p className="text-xs text-neutral-500">{label}</p>
    {!hasFeedback(row) && !marked ? <p className="text-sm text-neutral-500">Sin registro por test</p> : <>
      <p className="text-sm font-medium tabular-nums">{measured(row?.pain) ? "Dolor: " + number(row.pain) + "/10" : marked ? "Con dolor · intensidad sin registrar" : "Dolor sin registrar"}</p>
      {hasSet(row) && <p className="text-sm">{measured(row?.reps) && measured(row?.loadKg)
        ? number(row.reps) + (row.reps === 1 ? " repetición" : " repeticiones") + " con " + number(row.loadKg) + " kg"
        : measured(row?.reps) ? number(row.reps) + (row.reps === 1 ? " repetición" : " repeticiones") + " · carga sin registrar"
        : number(row!.loadKg!) + " kg · repeticiones sin registrar"}</p>}
      {row?.comment && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-neutral-700"><span className="sr-only">Comentario del atleta: </span>«{row.comment}»</p>}
    </>}
  </div>;
}

export function ShoulderTestFeedbackReadout({ id, current, previous, retest }: {
  id: string; current: Phase; previous?: Phase | null; retest: boolean;
}) {
  const now = current.testFeedback?.[id], before = previous?.testFeedback?.[id];
  const delta = previous && changeText(before, now);
  return <>
    <div className={previous ? "mt-1 grid grid-cols-2 gap-x-3" : "mt-1"}>
      {previous && <PhaseReadout label="Inicial · semana 1" row={before} marked={flagged(previous, id)} />}
      <PhaseReadout label={retest ? "Retest · semana 14" : "Inicial · semana 1"} row={now} marked={flagged(current, id)} />
    </div>
    {delta && <p className="mt-1 text-sm font-medium text-neutral-800">{delta}</p>}
  </>;
}

export function PublishedShoulderTestFeedback({ current, previous, retest }: { current: Phase; previous?: Phase | null; retest: boolean }) {
  const hasEntry = (id: string) => hasFeedback(current.testFeedback?.[id]) || hasFeedback(previous?.testFeedback?.[id]);
  if (!PILOT_TESTS.some(t => hasEntry(t.id))) return null;
  const tests = PILOT_TESTS.filter(t => hasEntry(t.id) || flagged(current,t.id) || flagged(previous,t.id));
  // Show reported attempts first, including incomplete 8RM sets; keep the rest available without a wall of cards.
  const rows = tests.map((test, index) => ({
    test, index, set: hasSet(current.testFeedback?.[test.id]) || hasSet(previous?.testFeedback?.[test.id]),
    pain: Math.max(current.testFeedback?.[test.id]?.pain ?? -1, previous?.testFeedback?.[test.id]?.pain ?? -1),
  })).sort((a,b) => Number(b.set) - Number(a.set) || b.pain - a.pain || a.index - b.index);
  const list = (subset: typeof rows) => <ul className="divide-y divide-neutral-200">{subset.map(({test, set}) =>
    <li key={test.id} className="py-2">
      <h4 className="text-sm font-semibold">{test.name}</h4>
      {set && <p className="text-xs text-neutral-500">Intento registrado · brazo afectado</p>}
      <ShoulderTestFeedbackReadout id={test.id} current={current} previous={previous} retest={retest} />
    </li>)}</ul>;
  return <section id="sensaciones-por-test" className="scroll-mt-4 border-t border-neutral-200 pt-3" aria-label="Sensaciones por test">
    <h3 className="font-semibold">Tus sensaciones por test</h3>
    <p className="text-xs text-neutral-600">El dolor, los comentarios y los intentos que apuntaste durante las pruebas.</p>
    {list(rows.slice(0, 3))}
    {rows.length > 3 && <details><summary className="cursor-pointer text-sm font-medium">Ver las demás pruebas con registro ({rows.length - 3})</summary>{list(rows.slice(3))}</details>}
  </section>;
}

export function ShoulderTestPainOverview({ current, openTest }: {current: Phase; openTest: (id: string) => void}) {
  const rated = PILOT_TESTS.filter(t => measured(current.testFeedback?.[t.id]?.pain));
  const painful = rated.filter(t => current.testFeedback![t.id].pain! > 0).sort((a,b) => current.testFeedback![b.id].pain! - current.testFeedback![a.id].pain!);
  const unquantified = PILOT_TESTS.filter(t => flagged(current,t.id) && !measured(current.testFeedback?.[t.id]?.pain));
  if (!rated.length && !unquantified.length) return null;
  return <div className="space-y-1 text-sm">
    {rated.length > 0 && <p className="text-xs text-neutral-600">Intensidad registrada en {rated.length} de {PILOT_TESTS.length} pruebas.{!painful.length && " Todas las intensidades registradas son 0/10."}</p>}
    {painful.length > 0 && <div><p className="text-xs font-medium">Pruebas con dolor, de mayor a menor intensidad:</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">{painful.map(t => <li key={t.id}><button type="button" onClick={() => openTest(t.id)} className="underline">{t.name}: {current.testFeedback![t.id].pain}/10</button></li>)}</ul></div>}
    {unquantified.length > 0 && <p className="text-xs">Con dolor, sin intensidad registrada: {unquantified.map((t,i) => <span key={t.id}>{i > 0 && " · "}<button type="button" className="underline" onClick={() => openTest(t.id)}>{t.name}</button></span>)}</p>}
  </div>;
}
