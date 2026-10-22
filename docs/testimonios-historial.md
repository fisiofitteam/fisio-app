# Testimonios e historial del cliente

## Uso

- Testimonios reúne el material del equipo. Subir o arrastrar imágenes, vídeos, PDF o TXT y después usar Asignar a cliente en la tarjeta. El buscador encuentra nombre y apellidos sin distinguir tildes. Pendientes de asignar filtra el material sin cliente. Desde la ficha se asigna automáticamente.
- Éxitos muestra el mismo material dentro de Evolución e historial, sin duplicar archivos.
- Crear caso permite importar un TXT de WhatsApp. La generación IA incorpora la última conversación importada, los WODs, formularios y notas de los archivos, además del contexto clínico anterior.
- Los TXT se conservan en base de datos y se descargan mediante una ruta autenticada. No se envían al almacenamiento público.
- Los archivos multimedia usan el Blob público ya utilizado por la app, con rutas de identificadores aleatorios. Sus enlaces se pueden copiar/abrir para compartir. No se analiza automáticamente el contenido visual ni el audio: la IA recibe las notas escritas.
- Desde Crear caso se pueden seleccionar vídeos de Éxitos y añadirlos al apartado elegido. Guardar el caso conserva esa selección; el consentimiento existente no se modifica automáticamente.
- Historial agrupa semanas plegadas, con sesiones, WODs, respuestas y archivos. El cron guarda el resumen aunque haya solo una sesión o fuentes complementarias; repetirlo sin cambios no vuelve a generar la narrativa.
- El material se muestra en directo por fecha de subida. Para actualizar la narrativa tras cambios posteriores, usar Actualizar resumen semanal. Los resúmenes antiguos no se regeneran masivamente.

## Límites

Vídeos/imágenes/PDF hasta 250 MB mediante subida directa; TXT hasta 1 MB y 200.000 caracteres. El contexto IA total mayor de 450.000 caracteres se rechaza con mensaje explícito en lugar de recortarlo. Se utiliza la última exportación de WhatsApp para no duplicar chats solapados. Lista paginada de 30 archivos; historial paginado de 12 semanas.

## Despliegue

1. Aplicar scripts/migrations/20261022-patient-evidence.sql y después scripts/migrations/20261022-unassigned-evidence.sql a la base de datos de destino antes de desplegar. Es una migración aditiva: crea únicamente PatientEvidence, índices y su relación con Patient.
2. Mantener BLOB_READ_WRITE_TOKEN y ANTHROPIC_API_KEY existentes en el despliegue.
3. Desplegar esta rama. Los enlaces antiguos de ficha, evolución, formularios y WODs redirigen a las nuevas pestañas.
4. Comprobar en el entorno de destino una subida real de MP4/MOV, una captura, un TXT y una generación IA con paciente de prueba. Estas comprobaciones requieren los servicios reales y no se ejecutaron contra producción.

## Validación

- Prisma production schema validado y cliente generado.
- Build de producción completado contra configuración local sin datos reales.
- scripts/test-patient-evidence.ts: permisos, fuentes combinadas, formularios, límite de semana, persistencia, semanas sin rehab e idempotencia/regeneración.
- TypeScript tiene incidencias previas en archivos ajenos; comparar con la rama base. No se desactiva ninguna validación adicional.

Los archivos sin cliente solo son accesibles a su autor y a dirección. Al asignar o cambiar cliente se comprueba el acceso al cliente de destino; la actualización evita sobrescribir una asignación concurrente.
