// Lista corta de países servida en el formulario de /agenda y en el modal
// de envíos del setter. España va primero (default). El resto en orden
// alfabético + "Otro" como catch-all al final.
//
// Mantenemos los valores en español porque el formulario público es en español;
// si más adelante internacionalizamos, esto pasa a ser un mapa { code, label }.

export const COUNTRIES = [
  "España",
  "Andorra",
  "Argentina",
  "Chile",
  "Colombia",
  "Estados Unidos",
  "Francia",
  "Italia",
  "México",
  "Perú",
  "Portugal",
  "Reino Unido",
  "Uruguay",
  "Venezuela",
  "Otro",
] as const;

export const DEFAULT_COUNTRY = "España";
