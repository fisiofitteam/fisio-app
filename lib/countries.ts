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

// Orden: España primero (default). Después todos los hispanohablantes en
// alfabético, luego el resto de países frecuentes (Europa/EEUU), y "Otro" al
// final como catch-all. La bandera y el prefijo se derivan del iso2/dialCode.
export const COUNTRIES: readonly Country[] = [
  { label: "España", iso2: "ES", dialCode: "+34" },

  // ── Países hispanohablantes ────────────────────────────────────────────
  { label: "Argentina", iso2: "AR", dialCode: "+54" },
  { label: "Bolivia", iso2: "BO", dialCode: "+591" },
  { label: "Chile", iso2: "CL", dialCode: "+56" },
  { label: "Colombia", iso2: "CO", dialCode: "+57" },
  { label: "Costa Rica", iso2: "CR", dialCode: "+506" },
  { label: "Cuba", iso2: "CU", dialCode: "+53" },
  { label: "Ecuador", iso2: "EC", dialCode: "+593" },
  { label: "El Salvador", iso2: "SV", dialCode: "+503" },
  { label: "Guatemala", iso2: "GT", dialCode: "+502" },
  { label: "Guinea Ecuatorial", iso2: "GQ", dialCode: "+240" },
  { label: "Honduras", iso2: "HN", dialCode: "+504" },
  { label: "México", iso2: "MX", dialCode: "+52" },
  { label: "Nicaragua", iso2: "NI", dialCode: "+505" },
  { label: "Panamá", iso2: "PA", dialCode: "+507" },
  { label: "Paraguay", iso2: "PY", dialCode: "+595" },
  { label: "Perú", iso2: "PE", dialCode: "+51" },
  { label: "Puerto Rico", iso2: "PR", dialCode: "+1" },
  { label: "República Dominicana", iso2: "DO", dialCode: "+1" },
  { label: "Uruguay", iso2: "UY", dialCode: "+598" },
  { label: "Venezuela", iso2: "VE", dialCode: "+58" },

  // ── Resto de países frecuentes ─────────────────────────────────────────
  { label: "Alemania", iso2: "DE", dialCode: "+49" },
  { label: "Andorra", iso2: "AD", dialCode: "+376" },
  { label: "Bélgica", iso2: "BE", dialCode: "+32" },
  { label: "Brasil", iso2: "BR", dialCode: "+55" },
  { label: "Canadá", iso2: "CA", dialCode: "+1" },
  { label: "Estados Unidos", iso2: "US", dialCode: "+1" },
  { label: "Francia", iso2: "FR", dialCode: "+33" },
  { label: "Irlanda", iso2: "IE", dialCode: "+353" },
  { label: "Italia", iso2: "IT", dialCode: "+39" },
  { label: "Marruecos", iso2: "MA", dialCode: "+212" },
  { label: "Países Bajos", iso2: "NL", dialCode: "+31" },
  { label: "Portugal", iso2: "PT", dialCode: "+351" },
  { label: "Reino Unido", iso2: "GB", dialCode: "+44" },
  { label: "Suiza", iso2: "CH", dialCode: "+41" },

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
