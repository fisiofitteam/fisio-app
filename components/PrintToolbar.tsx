"use client";

import { useRouter } from "next/navigation";

// Barra superior del informe imprimible. Se oculta al imprimir (.print-toolbar).
export function PrintToolbar({ title }: { title: string }) {
  const router = useRouter();
  return (
    <div className="print-toolbar sticky top-0 z-10 bg-white border-b border-neutral-200 px-4 py-3 flex items-center justify-between gap-3 mb-6">
      <button onClick={() => router.back()} className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Volver
      </button>
      <span className="text-xs text-neutral-400 truncate hidden sm:block">{title}</span>
      <button onClick={() => window.print()} className="btn btn-primary text-sm">
        🖨️ Guardar como PDF
      </button>
    </div>
  );
}
