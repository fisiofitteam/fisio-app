"use client";

import { useEffect } from "react";

export default function AnunciosError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[Anuncios] runtime error", error);
  }, [error]);

  return (
    <div className="p-4">
      <h2 className="font-medium mb-2 text-red-700">Error en Anuncios</h2>
      <p className="text-sm whitespace-pre-wrap">{error.message}</p>
      {error.digest && <p className="text-xs text-neutral-500 mt-1">digest: {error.digest}</p>}
      {error.stack && (
        <pre className="text-[10px] bg-neutral-100 p-2 rounded overflow-x-auto mt-2">{error.stack}</pre>
      )}
      <button onClick={reset} className="btn btn-primary text-xs mt-3">Reintentar</button>
    </div>
  );
}
