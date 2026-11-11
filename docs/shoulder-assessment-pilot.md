# Piloto de perfil de hombro

Disponible únicamente para fichas marcadas como **paciente de prueba**, en el programa TEST HOMBRO (Hombre) y sus baterías completas de la semana 1 y la semana 14. No se migran vídeos ni se reescriben sesiones antiguas.

## Probar la experiencia

1. Para ver el resultado sin introducir datos, como profesional abre Biblioteca → Programas → TEST HOMBRO (Hombre) → Ver baremo → Probar con un informe de ejemplo. Cambia entre inicial y comparación. El ejemplo es ficticio y no se guarda.
2. Con el acceso normal del atleta de prueba, entra en Mi semana → Mis valoraciones de hombro → Valoración inicial. Registra tu dolor antes de los tests y sube un vídeo al PVC lift off o al bumper hold. Para análisis asistido, autoriza el tratamiento opcional de fotogramas. Registra dolor final, pruebas dolorosas o Ninguno, y las cargas de los 8RM. No se precisa subir los 15 vídeos a la vez.
3. En la ficha del paciente, Evolución e historial → Evolución → Abrir revisión y perfil. Abre una prueba con vídeo compatible, elige Proponer revisión con IA, contrasta la propuesta con la reproducción original e incorpora solo los datos que puedas verificar. También se puede trabajar manualmente. Guarda el borrador.
4. Verifica cada test o márcalo como no valorable con una razón. Al publicar, el paciente ve el radar, seis explicaciones desplegables, simetrías 8RM y cuatro comentarios de movimientos. Una capacidad sin datos queda sin valorar. Al menos una prueba debe estar valorada.
5. Repite los pasos desde Revaloración (semana 14), en la misma asignación. En la cuenta de prueba puedes abrir el retest desde Mi semana sin esperar su fecha. La comparación aparece cuando existe una inicial publicada.

## Qué analiza la IA

Los dos isométricos generan propuestas de tiempos; los cuatro movimientos específicos generan borradores cualitativos. Las demás medidas las introduce el fisio (las cargas de 8RM también puede declararlas el atleta). El motor del baremo calcula las notas y el radar. La revisión se inicia en el panel del fisio: no hay trabajos de análisis en segundo plano al subir el archivo. Consentimiento por sesión, desactivado por defecto y revocable. Se envían fotogramas muestreados al proveedor Anthropic, no el audio, la URL privada ni la ficha del paciente. Si el vídeo no se puede evaluar, queda revisión manual.

Los vídeos para IA deben ser decodificables por el navegador y durar entre 0,5 y 60 s; para la subida se mantiene el límite previo de 1 GB. El muestreo por fotogramas no acredita la ausencia de temblores finos. Contrastar los tiempos, altura y observaciones con la revisión del equipo antes de ampliar el piloto.

## Despliegue

Aplicar con transacción las migraciones aditivas `scripts/migrations/20261111-shoulder-pilot.sql` y `scripts/migrations/20261111-shoulder-pilot-config.sql` antes del despliegue. Usa la conexión existente al almacén privado de valoraciones y el proveedor Anthropic existente (`ANTHROPIC_API_KEY`; opcional `SHOULDER_VIDEO_AI_MODEL`). No hace falta configurar variables nuevas si los dos servicios ya funcionan. Se congela el baremo por asignación en la primera escritura. Los cambios del CEO solo afectan a evaluaciones nuevas sin baremo fijado.

Pruebas: `node scripts/test-shoulder-pilot.cjs`, `node scripts/test-shoulder-video-access.cjs`, `npx tsx scripts/test-shoulder-video.ts` (usa ffmpeg local para generar la imagen sintética). El último test usa el SDK real contra un proveedor simulado. No necesita credenciales ni imágenes de pacientes.
