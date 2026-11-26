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

En `/fisio/soporte`, accesible desde el menú y desde Mi CEO:

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

Cuatro tablas nuevas: `SupportConversation`, `SupportMessage`, `SupportTicket` y `SupportTicketEvent`. La conversación usa versión y bloqueo temporal de 90 s, con el proveedor fuera de la transacción. El proveedor tiene timeout de 45 s y no reintenta automáticamente. La ruta de chat permite hasta 60 s. Los avisos usan control de versión y eventos auditables; cada envío tiene clave de idempotencia. Tickets y sus notificaciones se guardan en la misma transacción.

Límites: 20 consultas/10 min, 10 avisos/hora y 30 actualizaciones/10 min por profesional. JSON máximo 16 KB, rutas locales validadas, cuerpos estrictos, autenticación profesional y respuestas `private, no-store`. El historial visible carga los últimos 60 mensajes; se conserva el historial anterior en base de datos.

`build:prod` ejecuta `db:migrate:support` tras la migración CEO. `scripts/sql/team-support.sql` crea únicamente las nuevas tablas/índices dentro de una transacción, de forma idempotente. El script solo se ejecuta en `VERCEL_ENV=production` y no imprime secretos ni usa `prisma db push`. En desarrollo aislado se puede aplicar el SQL a PostgreSQL con `prisma db execute --schema prisma/schema.prisma --file scripts/sql/team-support.sql`. Nunca apuntar una prueba local a producción.

## Verificación

`npm run test:support` prueba los handlers y servicios reales con almacenamiento transaccional simulado y proveedor simulado: sesión, roles adicionales, aislamiento, rutas/cuerpos maliciosos, acceso a pacientes, recuentos, minimización del contexto, errores de IA, enlaces permitidos, conversación persistente, concurrencia, reintentos, resumen editable, adjuntos opcionales, estados, respuestas y destinatarios. No consume IA ni escribe en producción.

Después de desplegar, comprobar burbuja, consulta de ayuda, navegación/recarga y apertura del formulario. Verificar que un aviso real llega a la bandeja CEO y una respuesta a la campanita del autor. No enviar avisos de prueba al equipo durante la comprobación visual.
