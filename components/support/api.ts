export async function supportFetch<T>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store",
  });
  let data;
  try { data = await response.json(); } catch { throw new Error("No se pudo conectar con soporte. Comprueba que tu sesión sigue abierta."); }
  if (!response.ok) throw new Error(data.error || "No se pudo completar la acción.");
  return data;
}
