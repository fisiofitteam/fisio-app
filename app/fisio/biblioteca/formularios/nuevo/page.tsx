import Link from "next/link";
import { FormLibraryEditor } from "@/components/FormLibraryEditor";

export default function NewFormPage() {
  return (
    <div>
      <Link href="/fisio/biblioteca/formularios" className="text-xs text-neutral-500">← Formularios</Link>
      <h2 className="font-semibold mt-1 mb-4">Nuevo formulario</h2>
      <FormLibraryEditor form={null} />
    </div>
  );
}
