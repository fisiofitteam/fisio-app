# Grabaciones de FisioFit

Grabador propio para profesionales, implementado con las API del navegador. No incorpora código de Cap ni necesita un servidor Cap, MySQL, S3 o servicios adicionales.

## Uso

En el menú lateral: **Grabaciones** (`/fisio/grabaciones`). Muestra las grabaciones generales y de pacientes a las que el profesional tiene acceso, con búsqueda por título/nombre, filtro por paciente y paginación. Desde «Nueva grabación» se puede grabar directamente sin paciente (opción inicial) o vincular uno de los pacientes accesibles. El selector se bloquea durante la captura, revisión o subida para evitar cambiar de paciente con una grabación pendiente.

También se mantiene en la ficha del paciente: **Evolución e historial → Grabaciones**. Ambos accesos usan los mismos registros y permisos, sin duplicar vídeos.

1. Elegir cámara, micrófono y audio compartido opcionales.
2. Pulsar «Empezar a grabar» y seleccionar pantalla, ventana o pestaña en el selector del navegador. Puede ser WhatsApp u otra aplicación.
3. La cámara aparece en una burbuja en directo mientras se graba o está en pausa. Para seguir viéndola sobre WhatsApp u otra ventana, pulsar «Cámara flotante». Se puede mover y redimensionar con los controles del navegador. Cerrarla devuelve la cámara a la burbuja sin detener la grabación.
4. Mantener abierta la pestaña del grabador, aunque se trabaje en otra ventana. Pausar/reanudar y terminar desde ella.
5. Revisar el vídeo, añadir título/notas y guardarlo. También se puede descargar una copia.
6. Compartir manualmente mediante un enlace que caduca a los 30 días. Se puede renovar o desactivar desde el historial.

Límites: 30 minutos / 500 MiB. Chrome o Edge de escritorio son los navegadores recomendados. El audio de ventanas/pestañas depende del navegador y sistema operativo. No es una aplicación nativa: cerrar el navegador interrumpe la captura. La cámara se compone como círculo sobre la pantalla, con una salida de hasta 1280 píxeles de ancho; sin cámara se conserva la resolución seleccionada.

La grabación terminada queda temporalmente en IndexedDB, por profesional y paciente, hasta guardar o descartar. Esto permite recuperar una subida fallida al volver a la misma ficha. No recupera una captura todavía en curso tras cerrar el navegador. Si el navegador impide la copia local, se muestra el aviso para descargarla.

## Permisos y almacenamiento

- Cualquier profesional con sesión activa puede crear grabaciones generales. Son privadas para su autor y dirección (CEO/head success); el enlace compartido sigue siendo explícito. Las grabaciones con paciente conservan el acceso clínico: CEO/head success y fisios asignados o derivados, incluidos roles adicionales.
- No aparece en el panel del paciente, recursos ni resúmenes. El paciente no puede listar ni abrir las rutas internas, aunque conozca el identificador.
- Vídeos en Vercel Blob **privado**; metadatos y relación con paciente/profesional en Neon/PostgreSQL.
- Se reutiliza `ASSESSMENT_BLOB_READ_WRITE_TOKEN`. Opcionalmente, `RECORDINGS_BLOB_READ_WRITE_TOKEN` permite un almacén privado separado. No usar un almacén público.
- La reserva de subida genera una ruta aleatoria sin datos del paciente y vincula creador, paciente, tamaño y MIME. El token de subida dura una hora. Blob verifica la firma de su callback; el servidor comprueba el objeto con `head` sobre la ruta reservada.
- Reproducción interna con sesión y comprobación de acceso en cada petición. Los vídeos privados se transmiten por la aplicación con soporte Range; su URL de almacenamiento no se entrega al navegador.
- Compartir es explícito: token aleatorio de 256 bits, solo hash almacenado, 30 días de duración. El enlace muestra únicamente título y vídeo; no incluye notas ni ficha. Quien reciba el enlace puede abrirlo hasta caducidad/revocación. Reemitirlo invalida el anterior.
- Compartidos sin caché ni indexación ni referer. Se comprueban de nuevo al solicitar el vídeo.
- Borrar revoca primero el acceso, elimina el objeto y después el registro. Si Blob falla, el historial permite reintentar. La caducidad/revocación no elimina copias que alguien ya haya descargado.

## Carpetas personales

«Mis carpetas» permite crear, renombrar, filtrar y eliminar carpetas. Cada vídeo puede estar en una carpeta distinta para cada profesional, sin alterar su ubicación para el resto. Se elige una carpeta al guardar o desde el selector de cada vídeo. La carpeta activa se propone al iniciar una nueva grabación. Borrar una carpeta elimina solo esa clasificación: conserva los vídeos y los devuelve a «Sin carpeta» para su propietario.

La tabla `RecordingFolder` pertenece a un profesional; `RecordingFolderEntry` contiene una única asignación por vídeo/profesional. Todas las escrituras comprueban que la carpeta pertenece al actor y que mantiene acceso al vídeo. Una carpeta nunca concede acceso a una grabación.

## Despliegue

La instalación inicial usa `scripts/migrations/20261119-patient-recordings.sql`. Para grabaciones generales y carpetas, aplicar `scripts/migrations/20261119-general-recording-folders.sql` antes del despliegue: permite paciente nulo y añade las tablas de organización personal. No modifica las grabaciones existentes. Es una migración aditiva: crea la tabla `PatientRecording` y sus índices sin modificar datos existentes. Después desplegar mediante el flujo habitual de Git/Vercel. El build genera Prisma con `schema.production.prisma`; `schema.prisma` conserva la versión de desarrollo en Git.

No se necesitan nuevas variables cuando ya está configurado el almacén privado de valoraciones. No sustituir el token existente: otros vídeos dependen de él. Una reversión de aplicación puede dejar la tabla sin usar, conservando sus archivos; no borrar datos al revertir.

## Validación

- `node scripts/test-recordings.cjs`: rutas reales con dobles controlados de Prisma/almacenamiento/sesión. Prueba permisos por rol/asignación/derivación, origen, reservas, ruta/metadatos, idempotencia, enlaces, caducidad, revocación, privacidad y reintento de eliminación.
- `npm run build:prod`: compilación completa de Next.js. La comprobación global de TypeScript tiene errores previos ajenos a este cambio; comprobar también que no hay diagnósticos en los archivos del grabador.
- Prueba de navegador con vídeo/audio sintéticos: permiso cancelado, cámara+voz, pausa/reanudación, vista previa, copia local y guardado. No graba la pantalla/cámara del usuario durante las pruebas.
- Tras desplegar, comprobar reserva/subida/reproducción/Range/compartir/revocar/borrar con datos sintéticos, y limpiar todas las cuentas/sesiones/archivos de prueba creados.

## Alcance

Incluye captura, pausa, cámara superpuesta, voz/audio compartido, vista previa, descarga y archivo clínico privado. No incluye edición de vídeo, zooms automáticos, transcripción, aplicación nativa ni grabación con el navegador cerrado. Los archivos de vídeo y su transferencia consumen la capacidad del plan Blob/Vercel actual.
