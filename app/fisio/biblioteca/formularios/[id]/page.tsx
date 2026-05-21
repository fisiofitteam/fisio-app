import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FormLibraryEditor } from "@/components/FormLibraryEditor";

export default async function FormDetailPage({ params }: { params: { id: string } }) {
  const form = await prisma.formLibrary.findUnique({ where: { id: params.id } });
  if (!form) notFound();
  return (
    <div>
      <Link href="/fisio/biblioteca/formularios" className="text-xs text-neutral-500">← Formularios</Link>
      <h2 className="font-semibold mt-1 mb-4">{form.name}</h2>
      <FormLibraryEditor
        form={{
          id: form.id,
          name: form.name,
          description: form.description ?? "",
          questions: JSON.parse(form.questions),
        }}
      />
    </div>
  );
}
