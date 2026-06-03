import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Configuración de Capacitor para "FisioFit App".
 *
 * Arquitectura: WebView nativo que carga la web hospedada en Vercel. Esto nos
 * permite:
 *  - Iterar en main → desplegar a Vercel → cambio visible en la app en segundos,
 *    sin re-enviar a App Store / Google Play.
 *  - Mantener intacto el SSR, auth de Next.js, y todas las API routes.
 *
 * El precio: la app necesita conexión para arrancar. Mostramos `webDir`
 * (capacitor-www/) como fallback offline.
 *
 * Cuando lleguemos a publicar:
 *  - Bundle ID: com.fisiofitteam.app
 *  - App name: "FisioFit App"
 *  - Apple Developer team y signing certs se configuran en Xcode.
 */
const config: CapacitorConfig = {
  appId: "com.fisiofitteam.app",
  appName: "FisioFit App",
  webDir: "capacitor-www",

  server: {
    // URL remota: la web vive en Vercel. La app es solo el shell.
    url: "https://app.fisiofitteam.com",
    // En producción no permitir mixed content (todo HTTPS).
    androidScheme: "https",
    // Permitir navegación a otros subdominios del proyecto si los hay
    // (Stripe Checkout, Google Meet, etc. se abren en navegador externo igualmente).
    allowNavigation: [
      "app.fisiofitteam.com",
      "*.fisiofitteam.com",
      "checkout.stripe.com",
      "*.stripe.com",
    ],
  },

  // Configuración por-plataforma.
  ios: {
    // Color de fondo mientras carga (negro del brand). Evita flash blanco.
    backgroundColor: "#0A0A0A",
    // ContentInset "always" → respeta safe areas (notch/home indicator).
    contentInset: "always",
  },

  android: {
    backgroundColor: "#0A0A0A",
    // Permitir que la WebView haga zoom (accesibilidad).
    allowMixedContent: false,
  },

  // Plugins.
  plugins: {
    SplashScreen: {
      // Mostrar splash 1.5s mientras la web carga. Auto-hide cuando JS está listo.
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#0A0A0A",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    StatusBar: {
      // Barra de estado oscura con texto claro (combina con el fondo negro de la app).
      style: "DARK",
      backgroundColor: "#0A0A0A",
    },
  },
};

export default config;
