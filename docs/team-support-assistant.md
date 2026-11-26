# Asistente interno y Soporte y mejoras

El equipo dispone de una burbuja **Ayuda** en el layout profesional. La conversación se conserva al navegar, minimizar y recargar. No aparece en las rutas de pacientes ni públicas. Cada profesional tiene su propio chat; ni siquiera el CEO consulta el chat privado de otro profesional mediante estas rutas.

## Ayuda contextual

- Anthropic, con la credencial existente `ANTHROPIC_API_KEY`. Modelo por defecto `claude-sonnet-4-6`; override opcional `SUPPORT_ASSISTANT_MODEL`.
- Guía versionada en `lib/support/guide.ts`, con rutas de código de referencia. Al cambiar una funcionalidad, revisar el artículo y subir `GUIDE_VERSION`. Se registra también el SHA de despliegue. No se descarga GitHub por consulta.
- La sección proviene de `usePathname`; el servidor valida la ruta y obtiene roles/permisos de la sesión, incluyendo roles adicionales y suplantación.
- Diagnósticos de solo lectura: autorización clínica, reconocimiento de batería, entregas recibidas, marcas vinculadas al vídeo actual y existencia de publicación. Estos recuentos no garantizan que el formulario local permita publicar ni sustituyen la validación clínica del informe.
- No se leen automáticamente notas, métricas clínicas, formularios del navegador ni contenido de vídeos. Los identificadores dinámicos se eliminan del contexto enviado al proveedor. La consulta escrita por el profesional y los últimos 16 mensajes sí forman parte del contexto del chat.
- El modelo no tiene herramientas ejecutables. Su única salida estructurada es una respuesta y hasta seis pasos. Los enlaces se construyen desde artículos permitidos por el servidor. Los mensajes son texto escapado, sin HTML ni enlaces arbitrarios ejecutables.
- Sin credencial, timeout o salida inválida: respuesta de respaldo explícita con accesos y comprobaciones disponibles, sin simular éxito de IA.

## Avisos y seguimiento

**Reportar un problema / Proponer una mejora** abre un formulario editable con título, descripción y prioridad. No se envía al hablar con el chat: requiere **Enviar al CEO**. Se guarda la pantalla, versión y contexto técnico. Adjuntar los últimos ocho mensajes es opcional y está desmarcado; se conserva una instantánea, nunca un enlace al chat futuro.

En `/fisio/soporte`, accesible desde el menú y desde Mi CEO, **Nueva propuesta** y **Reportar un problema** abren un formulario manual: no requieren conversar antes con el asistente. El envío abre el aviso creado y actualiza la bandeja. El formulario admite hasta 8 archivos y 8 enlaces HTTPS por envío. Se pueden seleccionar o arrastrar archivos y pegar capturas desde el portapapeles; cada archivo tiene progreso y se confirma antes de habilitar el envío. Los enlaces tienen título opcional; Loom se reconoce visualmente. Las respuestas admiten también adjuntos y enlaces, incluso sin texto adicional.

Los archivos se muestran con previsualización de imágenes, reproductor de vídeo/audio y descarga. Los documentos se sirven como descarga. Los enlaces se abren en otra pestaña: no se incrustan ni se consultan automáticamente y conservan los permisos del servicio de origen. Los adjuntos no se envían al modelo de IA.

Permisos del panel:

| Función | Profesional | CEO principal o adicional |
| --- | --- | --- |
| Consultar avisos | Propios | Todos |
| Añadir información | Propios | Todos |
| Cambiar estado o prioridad | No | Sí |
| Consultar chat privado ajeno | No | No |

Estados: nuevo, en curso, falta información, resuelto y descartado. Prioridades: baja, normal, alta y bloquea el trabajo. Filtros por estado, tipo y prioridad, 30 avisos por página. El seguimiento muestra las últimas 200 actualizaciones e indica el total si se supera ese límite; todas permanecen almacenadas.

Cada nuevo aviso notifica a los CEOs activos. Una respuesta/cambio del CEO notifica al autor, y una ampliación del autor notifica a los CEOs; se excluye al actor de las notificaciones de actualización. La campanita respeta preferencias. También muestra ahora las notificaciones personales de setters, conservando sus avisos de rol.

Resolver un aviso es seguimiento administrativo. No modifica código, pacientes, valoraciones, calendarios, cobros ni permisos. Las correcciones continúan por el flujo de desarrollo habitual.

## Persistencia y despliegue

Tablas: `SupportConversation`, `SupportMessage`, `SupportTicket`, `SupportTicketEvent` y `SupportAttachment`. La conversación usa versión y bloqueo temporal de 90 s, con el proveedor fuera de la transacción. El proveedor tiene timeout de 45 s y no reintenta automáticamente. La ruta de chat permite hasta 60 s. Los avisos usan control de versión y eventos auditables; cada envío tiene clave de idempotencia. Tickets, vinculación de adjuntos y notificaciones se guardan en la misma transacción. La migración añade `linksJson` a tickets/eventos y la tabla de adjuntos sin modificar los avisos anteriores.

Límites: 20 consultas/10 min, 10 avisos/hora y 30 actualizaciones/10 min por profesional. JSON máximo 48 KB, rutas locales validadas, cuerpos estrictos, autenticación profesional y respuestas `private, no-store`. El historial visible carga los últimos 60 mensajes; se conserva el historial anterior en base de datos.

Los adjuntos reutilizan el almacenamiento privado de grabaciones (`RECORDINGS_BLOB_READ_WRITE_TOKEN`, con fallback a `ASSESSMENT_BLOB_READ_WRITE_TOKEN`). No se usa el almacén público de imágenes. El servidor reserva un UUID/ruta sin nombres personales y emite un token limitado al propietario, MIME, tamaño y caducidad de una hora; máximo 100 MB por archivo, 20 reservas/hora. La subida va directamente a Blob, con multipart para archivos grandes; no atraviesa el límite de cuerpo de las funciones de Vercel. El navegador confirma por POST autenticado y el servidor comprueba los metadatos reales con `head`. No se añade un webhook público ni una excepción al middleware.

Antes del envío, solo el propietario puede leer o retirar los archivos. Al enviar, la transacción solo acepta adjuntos propios, confirmados, vigentes y sin vincular; después, cada reproducción/descarga comprueba el acceso al ticket (autor o CEO). Las URLs Blob nunca se exponen. Se reutiliza el streaming con rangos de los vídeos, con MIME/disposición propios y `nosniff`. HTML, SVG y ejecutables no están admitidos. Retirar un archivo sin enviar elimina su objeto privado; las reservas abandonadas de más de 24 h se limpian para ese propietario al reservar nuevas subidas (hasta ocho por llamada). No se retiran adjuntos de avisos enviados.

`build:prod` ejecuta `db:migrate:support` tras la migración CEO. `scripts/sql/team-support.sql` crea únicamente las nuevas tablas/índices dentro de una transacción, de forma idempotente. El script solo se ejecuta en `VERCEL_ENV=production` y no imprime secretos ni usa `prisma db push`. En desarrollo aislado se puede aplicar el SQL a PostgreSQL con `prisma db execute --schema prisma/schema.prisma --file scripts/sql/team-support.sql`. Nunca apuntar una prueba local a producción.

## Verificación

`npm run test:support` prueba los handlers y servicios reales con almacenamiento transaccional simulado y proveedor simulado: sesión, roles adicionales, aislamiento, rutas/cuerpos maliciosos, acceso a pacientes, recuentos, minimización del contexto, errores de IA, conversación persistente, concurrencia, reintentos, resumen editable, estados, respuestas y destinatarios. Incluye propuestas manuales, enlaces peligrosos, formatos/tamaños, tokens acotados, finalización, rechazo de almacenamiento público, acceso antes/después del envío, vinculación atómica, reintentos, retiradas y respuestas con archivos o solo enlace. No consume IA ni escribe en producción.

Después de desplegar, comprobar burbuja, consulta de ayuda, navegación/recarga y apertura del formulario. Verificar que un aviso real llega a la bandeja CEO y una respuesta a la campanita del autor. No enviar avisos de prueba al equipo durante la comprobación visual.
