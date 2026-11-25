# Contexto previo de llamadas · Skalex

Contrato consultado el 25/11/2026 en `https://zapp.skalex.pro/docs/api/datos`.

En las tarjetas de llamadas aparece **Contexto para la llamada · Skalex · IA**. Se consulta al acercarse la tarjeta al área visible, con un máximo de dos peticiones concurrentes. Las siguientes visitas usan la copia guardada. La primera consulta puede tardar 5–20 segundos; cada petición al proveedor tiene 35 segundos de timeout y el endpoint de la app permite 90 segundos para el fallback entre teléfono e Instagram.

Skalex proporciona `aiInsights.available`, `generatedAt`, `data` y, cuando no está disponible, `reason`. `data` tiene claves libres definidas por la configuración del negocio. Se muestran todos los campos no vacíos, incluyendo claves nuevas, listas y objetos. Se traducen nombres conocidos de dolor, situación, objetivos, tratamientos previos, obstáculos, objeciones, interés y preparación de la llamada. No se inventa una respuesta si Skalex no la envía. Las notas manuales y el formulario de reserva permanecen separados; el resumen posterior de Meet tampoco cambia.

## Identidad, permisos y recuperación

- Consulta por teléfono exacto, incluyendo `customerContactPhone` de Instagram. Si no hay coincidencia, se prueba el usuario exacto de Instagram. Nunca se consulta por coincidencia parcial de nombre.
- Cada conversación devuelta debe coincidir con el identificador solicitado. Entre varios resultados del mismo lead, se prefiere el resumen disponible de la conversación más reciente.
- Caché en `SkalexCallInsight`, asociada al lead con borrado en cascada. Una huella de sus identificadores invalida el contexto si cambian el teléfono/Instagram. La tabla no modifica notas ni campos clínicos existentes.
- CEO y setter tienen el alcance del panel. Un closer principal o secundario solo consulta sus llamadas. La autorización se comprueba antes de acceder a la caché o al proveedor. Endpoint POST con comprobación de origen y respuesta privada `no-store`.
- Una reserva temporal en la base de datos evita solicitudes simultáneas del cron y varios usuarios. Los errores y estados no disponibles se guardan con espera antes de reintentar. `generating` tiene hasta dos reintentos automáticos adicionales; después queda el botón manual.
- `not_enough_messages` muestra el recuento recibido; no se presenta como error ni resumen vacío. El límite diario, falta de configuración, timeout y otros fallos tienen mensajes específicos.

## Sincronización y despliegue

La API genera el resumen una sola vez por conversación cuando el lead ha escrito al menos seis mensajes. Por eso el cron existente, cada 30 minutos, usa los listados paginados `/conversations/started` y `/conversations/active` para actualizar el embudo. La actividad conserva un cursor temporal con cinco minutos de solapamiento, que solo avanza cuando toda la importación termina. Las actualizaciones de listados conservan las asociaciones previas a leads/pacientes.

El detalle se prepara solo para llamadas agendadas desde ayer hasta los próximos 30 días, en lotes de cuatro. Las tarjetas pueden consultar otras llamadas agendadas al abrir el panel. No se generan resúmenes completos para toda la base de leads o pacientes. Un resumen ya generado en Skalex no se regenera con conversaciones posteriores: se muestra su fecha original.

Requiere `SKALEX_API_KEY` en el servidor y, opcionalmente, `SKALEX_BASE_URL` (por defecto `https://zapp.skalex.pro/api/v1`). No se envían claves al navegador.

Antes del despliegue, aplicar explícitamente `scripts/migrations/20261125-skalex-call-insights.sql` a Postgres. La migración es aditiva e idempotente: crea solo la tabla de caché y conserva los datos existentes. En local, aplicar también el SQL antes de probar las vistas conectadas.

Pruebas: `node scripts/test-skalex-insights.cjs`, `npm run build:prod`. El script cubre claves variables, valores ausentes, estados del proveedor, identidad exacta, fallback de contacto, caché y concurrencia, alcance de closers secundarios, protección de origen, timeout, paginación y conservación de asociaciones.
