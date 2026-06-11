"use client";

import { useEffect } from "react";

export default function RecursosError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[Recursos] runtime error", error);
  }, [error]);

  return (
    <div className="p-4">
      <h2 className="font-medium mb-2">Error en Recursos</h2>
      <p className="text-sm text-red-700 mb-2 whitespace-pre-wrap">{error.message}</p>
      {error.digest && <p className="text-xs text-neutral-500 mb-2">digest: {error.digest}</p>}
      {error.stack && (
        <pre className="text-[10px] bg-neutral-100 p-2 rounded overflow-x-auto">{error.stack}</pre>
      )}
      <button onClick={reset} className="btn btn-primary text-xs mt-3">Reintentar</button>
    </div>
  );
}
