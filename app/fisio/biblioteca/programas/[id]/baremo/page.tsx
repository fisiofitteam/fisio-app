import Link from "next/link";
import { notFound } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { canUseEvidence } from "@/lib/patient-evidence";
import { PILOT_PROGRAM_ID } from "@/lib/shoulder-pilot";
import { getPilotConfigRecord } from "@/lib/shoulder-pilot-config-server";
import { ShoulderRubricEditor } from "@/components/ShoulderRubricEditor";
export const dynamic="force-dynamic";
export default async function RubricPage({params}:{params:{id:string}}){
  const user=await getActiveProfessional();
  if(params.id!==PILOT_PROGRAM_ID || !canUseEvidence(user)) notFound();
  const current=await getPilotConfigRecord();
  return <main className="mx-auto max-w-4xl space-y-5 pb-16">
    <Link href={`/fisio/biblioteca/programas/${PILOT_PROGRAM_ID}?view=1`} className="text-sm text-neutral-500">← Volver al programa</Link>
    <div><div className="text-xs font-semibold text-amber-700">Biblioteca · Hombro</div><h1 className="text-2xl font-bold">Baremo del perfil de hombro</h1>
    <p className="mt-1 text-sm text-neutral-600">Las valoraciones inicial y final de cada atleta comparten el mismo baremo. Los cambios se aplican a las nuevas evaluaciones que aún no tengan un baremo asignado.</p></div>
    <Link href={`/fisio/biblioteca/programas/${PILOT_PROGRAM_ID}/baremo/ejemplo`} className="inline-block rounded-lg border px-3 py-2 text-sm font-semibold">Probar con un informe de ejemplo →</Link>
    <ShoulderRubricEditor initial={current.config} revision={current.revision} editable={user.role==="ceo"&&!user.impersonating}/>
  </main>
}
