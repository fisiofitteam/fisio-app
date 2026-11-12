# Valoraciones con vídeos de test

Una actividad ASSESSMENT contiene instrucciones generales y hasta 30 test con ID estable, nombre, instrucciones y enlace de ejemplo. Se crea en el calendario del paciente o en un programa. Duplicar programas/semanas/tareas conserva la definición; cada sesión tiene sus propias entregas.

El cliente puede entregar un MP4/MOV/WebM de hasta 1 GiB por test asignado, mediante subida multipart directa. La recomendación visible es recortar a un minuto (no es un límite técnico de duración). Puede sustituirlo hasta que el fisio lo marque revisado; la entrega anterior sigue visible hasta confirmar la nueva. Los vídeos se guardan sin esperar a completar la sesión.

Evolución muestra valoraciones, entregas y comentarios del fisio. El historial semanal y el contexto del caso de éxito incluyen los vídeos entregados y sus comentarios. La IA recibe metadatos y texto, no analiza visualmente el vídeo. No se convierten automáticamente en testimonios públicos.

## Reproducir una entrega

En Evolución, los vídeos de test de Éxitos, el historial y la revisión de hombro, cada entrega espera hasta que se pulse **Reproducir vídeo**. Abrir la ficha no inicia descargas de clips en otros bloques. Una marca temporal de la revisión abre la entrega en ese punto. Si la carga se interrumpe o el formato no se puede reproducir, se puede reintentar o descargar el original manteniendo los permisos de la ficha.

El reproductor pide los tramos del archivo que necesita para empezar o avanzar. El punto de acceso sirve los datos en streaming y permite consultar las cabeceras sin transferir el vídeo. Comprueba el acceso a la entrega y, cuando la URL contiene una versión, que siga siendo la que se está revisando. La descarga conserva todo el archivo original. No se modifica el formato de los vídeos ya entregados.

## Activación
1. Creado el almacén **privado** fisiofit-valoraciones (fra1), store_yCVBBlYg58E5QvZx.
2. Conectado al proyecto fisio-app en Production y Preview con ASSESSMENT_BLOB_READ_WRITE_TOKEN. Se conserva el almacén público existente.
3. Migración aditiva aplicada a producción el 22/10/2026; verificada tabla inicialmente vacía.
4. Desplegar esta rama; comprobar con un cliente de prueba: subida multipart, confirmación, reproducción con rangos, sustitución, revisión y bloqueo de sustitución.
5. Verificar en móvil iOS/Android antes de anunciar el flujo al equipo. No se han modificado workouts existentes.

## Verificación realizada
- scripts/test-assessment-media.ts: peticiones de rango, saltos, lectura de cabeceras, cancelación y descarga completa con un origen simulado.
- scripts/test-assessment-videos.ts: permisos de paciente y fisio, solo test asignados, rechazo de autoasignación, límite exacto de tamaño, MIME, confirmación verificada, sustitución, revisión obsoleta, bloqueo tras revisar y reproducción privada con HTTP Range. Base de datos/Blob simulados; no usa datos clínicos.
- scripts/test-patient-evidence.ts: regresión de permisos y resúmenes.
- Compilación de producción.
- Interfaz de editor/cliente con datos ficticios y respuestas de lectura simuladas.

## Consideraciones
No se ha probado todavía una subida real a Blob ni un archivo de 1 GiB: la prueba real se realizará tras el despliegue con datos ficticios. Los vídeos requieren sesión de cliente propietario o profesional clínico con acceso; no se publican URLs abiertas. La eliminación de una sesión conserva las entregas como archivo dentro de Evolución. Las sustituciones no borran automáticamente los blobs anteriores; se podrá añadir una política de retención/limpieza por separado. El listado muestra hasta 100 sesiones y 500 entregas recientes.
