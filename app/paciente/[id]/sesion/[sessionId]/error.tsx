"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function SessionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Sesión paciente] runtime error", error);
  }, [error]);

  return (
    <main className="max-w-md mx-auto px-4 py-6">
      <header className="mb-3">
        <h1 className="text-xl font-semibold">Algo no ha cargado bien</h1>
        <p className="text-sm text-neutral-500 mt-1">
          No te preocupes, no has perdido nada. Avísanos en el grupo y te lo arreglamos.
        </p>
      </header>

      <div className="card bg-amber-50 border-amber-200 text-sm space-y-2">
        <p className="text-amber-900 font-medium">⚠ Error técnico</p>
        <p className="text-amber-900 whitespace-pre-wrap break-words text-xs">
          {error.message}
        </p>
        {error.digest && (
          <p className="text-[10px] text-amber-700">ref: {error.digest}</p>
        )}
      </div>

      <div className="mt-4 flex gap-2 flex-wrap">
        <button onClick={reset} className="btn btn-primary text-sm">
          Reintentar
        </button>
        <Link href="/paciente" className="btn btn-ghost border border-neutral-200 text-sm">
          Volver a mi semana
        </Link>
      </div>
    </main>
  );
}
