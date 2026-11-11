# Piloto de perfil de hombro

Solo está disponible para fichas de prueba en el programa TEST HOMBRO (Hombre), en las baterías completas de la semana 1 y la semana 14. No se migran vídeos ni se reescriben informes publicados.

## Probar la experiencia

1. Como profesional, puedes ver un ejemplo sin introducir datos: Biblioteca → Programas → TEST HOMBRO (Hombre) → Ver baremo → Probar con un informe de ejemplo. El ejemplo es ficticio y no se guarda.
2. Como atleta de prueba, abre Mi semana → Mis valoraciones de hombro → Valoración inicial. Registra el dolor inicial y sube un vídeo al PVC lift off o al bumper hold. No hay que activar una casilla para la revisión asistida. En cada prueba puedes apuntar cuánto te dolió (0–10) y dejar un comentario, incluso si no tienes vídeo. En face pull y press, indica también las repeticiones que hiciste con el brazo afectado y el peso que utilizaste. Un intento de menos de ocho repeticiones se conserva como tal, sin generar una nota de 8RM. Al finalizar, registra el dolor general y aclara cuáles de las pruebas sin intensidad anotada te dolieron.
3. Como profesional, abre Ficha → Evolución e historial → Evolución → Abrir revisión y perfil. Pulsa **Revisar todo con IA** al principio de la revisión para preparar propuestas de los vídeos compatibles pendientes. Si también quieres analizar pruebas ya verificadas, marca **Incluir tests ya revisados**. Puedes seguir usando la acción individual. Una propuesta no modifica tus medidas: abre el test, compárala con el vídeo e incorpora los datos que hayas comprobado. Si falla un vídeo, los demás continúan.
4. Guarda el borrador y verifica cada test, o indica por qué no se puede valorar. Solo al publicar ve el paciente el radar, las seis capacidades, las simetrías de 8RM y las observaciones cualitativas. Una capacidad sin datos queda sin valorar. Al menos un test debe estar valorado.
5. Repite el recorrido desde Revaloración (semana 14) de la misma asignación. En la cuenta de prueba se puede abrir desde Mi semana sin esperar a su fecha. Una inicial publicada permite comparar resultados. El detalle por test muestra la intensidad, los comentarios y, en las dos pruebas de 8RM, los intentos declarados de ambas semanas. En el ejemplo ficticio, el face pull pasa de 2 repeticiones con 8 kg y dolor 6/10 a 8 con 10 kg y dolor 3/10. Un campo en blanco sigue sin registrar. La tolerancia conserva su fórmula: cada prueba dolorosa cuenta una sola vez, también cuando ya figuraba en el listado final.

## Qué analiza la IA

En los dos isométricos (PVC lift off y bumper hold), la IA propone tiempos de sostén, de altura sobre las orejas y de pérdida de posición o recolocación. La estabilidad se calcula a partir del tiempo de sostén y la pérdida de postura; los intervalos solapados se cuentan una sola vez. Un temblor no resta puntos. Si no se distingue la posición, el dato queda pendiente de revisión. Los cuatro movimientos específicos generan observaciones cualitativas; los nueve tests restantes se valoran manualmente. Las notas y el radar se calculan con el baremo del programa.

El análisis empieza cuando lo pide un profesional con acceso a la ficha. Para preparar la propuesta se envían fotogramas a Anthropic, sin el audio, la URL privada ni la ficha del paciente. Las retiradas de permiso registradas se respetan. Los vídeos antiguos entregados para revisión manual sin habilitar la IA siguen siendo de revisión manual. El análisis admite vídeos que el navegador pueda decodificar de entre 0,5 y 60 segundos. El límite de subida sigue siendo de 1 GB.

En los borradores antiguos, un valor que mezclaba pérdidas de postura y temblores no se reutiliza como pérdida de postura: se conservan los demás tiempos y se revisa esa medición con el nuevo criterio. Los informes ya publicados conservan sus notas; el radar no compara la estabilidad entre metodologías diferentes.

## Despliegue

El piloto usa las tablas de `scripts/migrations/20261111-shoulder-pilot.sql` y `scripts/migrations/20261111-shoulder-pilot-config.sql`, el almacén privado de valoraciones y el proveedor Anthropic existente (`ANTHROPIC_API_KEY`; opcional `SHOULDER_VIDEO_AI_MODEL`). Los pesos de cada asignación se fijan en la primera escritura para que su inicial y su retest utilicen los mismos. La mejora de revisión en lote no requiere variables nuevas.

Las pruebas `npx tsx scripts/test-shoulder-test-feedback.ts` y `npx tsx scripts/test-shoulder-feedback-report.tsx` cubren las sensaciones por test: escritura parcial, publicación y presentación de cambios entre semanas.

Pruebas del baremo, del acceso y del análisis: `node scripts/test-shoulder-pilot.cjs`, `node scripts/test-shoulder-video-access.cjs`, `npx tsx scripts/test-shoulder-analysis-queue.ts` y `npx tsx scripts/test-shoulder-video.ts`. Esta última usa una imagen sintética, ffmpeg y un proveedor simulado; no necesita imágenes de pacientes ni credenciales.
