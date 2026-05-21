import { ResourcesSidebar } from "@/components/ResourcesSidebar";

export default function ResourcesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Recursos</h1>
        <p className="text-xs text-neutral-500 mt-0.5">Plantillas, formación y documentos útiles</p>
      </header>

      <div className="flex flex-col md:flex-row gap-4">
        <ResourcesSidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
