import { LibrarySidebar } from "@/components/LibrarySidebar";

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Biblioteca</h1>
        <p className="text-xs text-neutral-500 mt-0.5">Todo el contenido reutilizable</p>
      </header>

      <div className="flex flex-col md:flex-row gap-4">
        <LibrarySidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
