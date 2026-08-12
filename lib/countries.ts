// Lista de países que se ofrecen en el formulario de /agenda y otros
// puntos donde el paciente/lead indica su país de residencia.
//
// Cada entrada guarda:
//   - `label`  → nombre en español que se guarda en BD (Lead.country / Patient.country)
//   - `iso2`   → código ISO-3166-1 alpha-2, para derivar la bandera emoji
//   - `dialCode` → prefijo telefónico E.164 (con "+"), autoinsertado en el
//                  input de teléfono para que el lead no tenga que escribirlo
//                  y no lo pueda olvidar / equivocar.
//
// España va primero (default). Resto en orden alfabético + "Otro" al final
// como catch-all (dialCode "" → el usuario tendrá que meter el prefijo).

export type Country = {
  label: string;
  iso2: string; // "ES", "AR"…
  dialCode: string; // "+34", "+54"…
};

export const COUNTRIES: readonly Country[] = [
  { label: "España", iso2: "ES", dialCode: "+34" },
  { label: "Andorra", iso2: "AD", dialCode: "+376" },
  { label: "Argentina", iso2: "AR", dialCode: "+54" },
  { label: "Chile", iso2: "CL", dialCode: "+56" },
  { label: "Colombia", iso2: "CO", dialCode: "+57" },
  { label: "Estados Unidos", iso2: "US", dialCode: "+1" },
  { label: "Francia", iso2: "FR", dialCode: "+33" },
  { label: "Italia", iso2: "IT", dialCode: "+39" },
  { label: "México", iso2: "MX", dialCode: "+52" },
  { label: "Perú", iso2: "PE", dialCode: "+51" },
  { label: "Portugal", iso2: "PT", dialCode: "+351" },
  { label: "Reino Unido", iso2: "GB", dialCode: "+44" },
  { label: "Uruguay", iso2: "UY", dialCode: "+598" },
  { label: "Venezuela", iso2: "VE", dialCode: "+58" },
  // Catch-all: si el lead elige "Otro" mostramos el input de teléfono con
  // placeholder que pide meter el prefijo internacional dentro del número.
  { label: "Otro", iso2: "", dialCode: "" },
] as const;

export const DEFAULT_COUNTRY: Country = COUNTRIES[0]; // España

/** Búsqueda por label ("España") o iso2 ("ES"). Case-insensitive. */
export function findCountry(labelOrIso: string | null | undefined): Country | null {
  if (!labelOrIso) return null;
  const q = labelOrIso.trim().toUpperCase();
  return (
    COUNTRIES.find((c) => c.iso2.toUpperCase() === q) ??
    COUNTRIES.find((c) => c.label.toUpperCase() === q) ??
    null
  );
}

/**
 * Bandera emoji derivada del ISO-3166 alpha-2. Cada letra se convierte al
 * "regional indicator symbol" correspondiente (offset 0x1F1A5 desde 'A').
 * Ejemplo: "ES" → "🇪🇸". Si el país no tiene iso2 (p.ej. "Otro"), devuelve "🌍".
 */
export function countryFlag(iso2: string | null | undefined): string {
  if (!iso2 || iso2.length !== 2) return "🌍";
  const A = 0x1f1e6; // Regional Indicator Symbol Letter A
  const base = "A".charCodeAt(0);
  const code = iso2.toUpperCase();
  return String.fromCodePoint(A + (code.charCodeAt(0) - base)) +
    String.fromCodePoint(A + (code.charCodeAt(1) - base));
}

/** Helper de compat: array de solo labels para lugares donde ya se usaba así. */
export const COUNTRY_LABELS: readonly string[] = COUNTRIES.map((c) => c.label);
