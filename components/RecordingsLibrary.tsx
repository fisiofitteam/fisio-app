"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RecordingLibraryResult } from "@/lib/recording-library";
import { ScreenRecorder } from "./ScreenRecorder";
import { RecordingList } from "./RecordingList";

type PatientOption = { id: string; fullName: string };
export function RecordingsLibrary({ initialData, patients, professionalId, enabled }: {
  initialData: RecordingLibraryResult; patients: PatientOption[]; professionalId: string; enabled: boolean;
}) {
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [q, setQ] = useState(""), [patientFilter, setPatientFilter] = useState("");
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [data, setData] = useState(initialData), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const firstLoad = useRef(true);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  const selectedPatient = patients.find(patient => patient.id === selectedPatientId);

  useEffect(() => {
    if (firstLoad.current) { firstLoad.current = false; return; }
    const controller = new AbortController();
    setLoading(true); setError("");
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q, patientId: patientFilter, page: String(page) });
        const response = await fetch("/api/recordings?" + params, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(response.status === 403 ? "No tienes acceso a estas grabaciones." : "No se han podido cargar las grabaciones.");
        const next = await response.json();
        if (!controller.signal.aborted) setData(next);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "No se han podido cargar las grabaciones.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, q ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q, patientFilter, page, revision]);

  return <main className="space-y-6">
    <header><h1 className="text-2xl font-semibold">Grabaciones</h1><p className="mt-1 text-sm text-neutral-500">Graba y consulta las explicaciones de tus pacientes. Archivo interno del equipo.</p></header>
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 space-y-4" aria-label="Nueva grabación">
      <div><h2 className="text-lg font-semibold">Nueva grabación</h2><p className="text-sm text-neutral-500">Elige al paciente. El vídeo se guardará también en su ficha, dentro de Evolución e historial → Grabaciones.</p></div>
      <label className="block text-sm font-medium">Paciente de la nueva grabación
        <select value={selectedPatientId} disabled={recordingBusy} onChange={e => setSelectedPatientId(e.target.value)} className="mt-1 block w-full max-w-lg rounded-lg border border-neutral-200 bg-white p-2.5 disabled:opacity-60">
          <option value="">Selecciona un paciente…</option>
          {patients.map(patient => <option key={patient.id} value={patient.id}>{patient.fullName}</option>)}
        </select>
      </label>
      {!patients.length && <p className="text-sm text-neutral-500">Todavía no tienes pacientes con acceso clínico.</p>}
      {recordingBusy && <p className="text-xs text-neutral-500">Guarda o descarta la grabación antes de cambiar de paciente.</p>}
      {selectedPatient && <ScreenRecorder key={selectedPatient.id} patientId={selectedPatient.id} patientName={selectedPatient.fullName}
        professionalId={professionalId} enabled={enabled} onBusyChange={setRecordingBusy} onSaved={reload} />}
    </section>
    <section aria-label="Buscar grabaciones" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Buscar por título o paciente<input type="search" value={q} maxLength={160} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Buscar grabaciones…" className="mt-1 w-full rounded-lg border border-neutral-200 bg-white p-2.5" /></label>
        <label className="text-sm">Filtrar por paciente<select value={patientFilter} onChange={e => { setPatientFilter(e.target.value); setPage(1); }} className="mt-1 w-full rounded-lg border border-neutral-200 bg-white p-2.5">
          <option value="">Todos los pacientes</option>{patients.map(patient => <option key={patient.id} value={patient.id}>{patient.fullName}</option>)}
        </select></label>
      </div>
      {loading && <p role="status" className="text-sm text-neutral-500">Cargando grabaciones…</p>}
      {error && <div role="alert" className="text-sm text-red-700">{error} <button className="underline" onClick={reload}>Reintentar</button></div>}
      <div aria-busy={loading} className={loading ? "opacity-60" : ""}>
        <RecordingList recordings={data.recordings} total={data.total} onChanged={reload} emptyMessage={q || patientFilter ? "No hay grabaciones para esta búsqueda." : "Las grabaciones guardadas aparecerán aquí y en la ficha de su paciente."} />
      </div>
      {data.total > data.pageSize && <nav aria-label="Páginas de grabaciones" className="flex items-center justify-between gap-3 text-sm">
        <button className="btn btn-ghost" disabled={loading || data.page <= 1} onClick={() => setPage(data.page - 1)}>Anterior</button>
        <span>Página {data.page} de {Math.ceil(data.total / data.pageSize)}</span>
        <button className="btn btn-ghost" disabled={loading || data.page * data.pageSize >= data.total} onClick={() => setPage(data.page + 1)}>Siguiente</button>
      </nav>}
    </section>
  </main>;
}
