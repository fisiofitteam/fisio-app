"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const tabs = [
  ["", "Ficha clínica"], ["evolucion", "Evolución"], ["historial", "Historial"],
  ["formularios", "Resúmenes y formularios"], ["wods", "Readaptación y WODs"], ["exitos", "Éxitos"],
];
export function PatientInfoSubNav({ patientId }: { patientId: string }) {
  const pathname = usePathname();
  const base = "/fisio/paciente/" + patientId + "/info";
  return <nav aria-label="Evolución e historial" className="flex gap-1 overflow-x-auto border-b border-neutral-200 mb-4">
    {tabs.map(([segment, label]) => {
      const href = base + (segment ? "/" + segment : "");
      const active = pathname === href;
      return <Link key={segment} href={href} className={"px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 " + (active ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500")}>{label}</Link>;
    })}
  </nav>;
}
