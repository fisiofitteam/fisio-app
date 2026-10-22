import { PatientInfoSubNav } from "@/components/PatientInfoSubNav";
export default function InfoLayout({ children, params }: { children: React.ReactNode; params: { id: string } }) {
  return <div><PatientInfoSubNav patientId={params.id} />{children}</div>;
}
