import {notFound} from "next/navigation";
import {getActiveProfessional} from "@/lib/session";
import {prisma} from "@/lib/prisma";
import {canAccessEvidencePatient} from "@/lib/patient-evidence";
import {PILOT_PROGRAM_ID} from "@/lib/shoulder-pilot";
import {matchesPilotSnapshot} from "@/lib/shoulder-pilot-snapshot";
import {ShoulderContactComparison} from "@/components/ShoulderContactComparison";
export const dynamic="force-dynamic";
export default async function ContactComparisonPage({params}:{params:{sessionId:string}}){
  const professional=await getActiveProfessional();if(!professional)notFound();
  const session=await prisma.programSession.findUnique({where:{id:params.sessionId},select:{weekNumber:true,tasksSnapshot:true,assignment:{select:{patientId:true,programId:true}}}});
  if(!session||session.assignment.programId!==PILOT_PROGRAM_ID||![1,14].includes(session.weekNumber)||!matchesPilotSnapshot(session.tasksSnapshot)||!(await canAccessEvidencePatient(session.assignment.patientId,professional)))notFound();
  return <ShoulderContactComparison key={params.sessionId} sessionId={params.sessionId}/>;
}
