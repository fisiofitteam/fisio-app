# Valoración de hombro repartida entre sesiones

Una batería completa de TEST HOMBRO (semanas 1 y 14) puede estar distribuida entre varios registros de sesión del mismo día. El calendario podía parecer correcto, pero Valoraciones mostraba bloques separados sin acceso al informe conjunto. Además, el antiguo endpoint `move-task` convertía cada bloque movido en un programa/asignación suelta: agrupar solamente dentro de la asignación original no resolvía esos casos.

## Comportamiento

- Se reconocen los tests por sus identificadores del protocolo. Se agrupan sesiones de la misma asignación, semana y fecha de calendario (fecha UTC almacenada por el calendario). La fecha de subida o finalización no afecta a la agrupación.
- Recuperación del formato antiguo: si una batería original está incompleta, se buscan bloques de hombro en programas marcados `isStandalone`, del mismo paciente y fecha. Solo se incorporan cuando existe una única batería original candidata ese día y el conjunto contiene exactamente los 15 tests, sin duplicados. No se infiere la pertenencia por nombres. Otros programas (p. ej., tobillo), pacientes y fechas quedan excluidos. Si hay dos asignaciones o inicial/retest coincidentes, no se adivina el destino de los bloques sueltos.
- El informe conserva como ancla una sesión del programa original, aunque una sesión suelta tenga un ID anterior. Así se mantiene la semana correcta (incluida la 14, aunque el bloque suelto tenga semana 1), la asignación, el baremo y el enlace con la valoración inicial. Las valoraciones completas existentes conservan su identidad.
- Prevención: mover un test de la batería desde el calendario mantiene ahora su asignación y semana. Las demás actividades conservan su comportamiento anterior. No se necesita reasignar programas manualmente para recuperar las baterías antiguas compatibles.
- Valoraciones muestra una entrada y el total de vídeos de todas sus actividades. La carga de sesiones hermanas, incluidas las sueltas, evita cortar una batería en los límites de las consultas del fisio y del historial del paciente, incluso si solo se recuperó inicialmente un bloque suelto. Las entregas anticipadas siguen visibles.
- Todas las entradas de la batería resuelven al mismo borrador, utilizando un identificador de sesión estable. Cada vídeo conserva su sesión, tarea, identificador y versión originales; no se migran ni duplican registros.
- El DTO de vídeo del editor usa `sessionId` para el informe canónico y `sourceSessionId` para la sesión almacenada. Se aplica después de comprobar paciente/sesión/tarea de origen. Esto permite que los reproductores y la cola del cliente encuentren los 15 vídeos; contar 15 en la cabecera por sí solo no verifica que estén disponibles dentro de cada test. El endpoint de análisis sigue comprobando el origen real con `sourceRefs`.
- Guardado, publicación, comentarios, comparación con la inicial, informe privado y enlaces compartidos utilizan la misma agrupación. La publicación bloquea las entregas originales de todos sus miembros. Los enlaces públicos siguen devolviendo exclusivamente la copia publicada autorizada.
- El atleta puede abrir la batería desde cualquiera de sus sesiones originales. Las subidas siguen dirigidas al registro de origen, y los datos por test se guardan en el borrador común. La finalización y los demás contenidos de cada sesión mantienen su funcionamiento anterior.
- Un borrador guardado protege también a sus sesiones hermanas frente a separación, eliminación o sustitución desde el calendario, y frente a la regeneración/cambio de fecha/desactivación de la asignación. Las escrituras vuelven a comprobar la composición de una batería repartida dentro de la transacción.

No se cambian baremos, mediciones ni proveedor de IA. No requiere migración ni variables nuevas. La agrupación se aplica al leer las valoraciones existentes.

## Validación

Ejecutar desde la raíz con `node --import tsx scripts/<archivo>`:

- `test-shoulder-battery-grouping.ts`: cuatro sesiones, 15 vídeos, entregas anticipadas, aislamiento, incompletas/duplicadas, borrador único, versiones, publicación, protección del calendario, comparación inicial/retest e informe/enlace compartido.
- `test-shoulder-battery-move.ts`: endpoint real de movimiento de tareas, preservación de asignación/semana y referencias de vídeo en inicial/retest, autorización, protección de borradores y movimientos de otras actividades.
- `test-shoulder-battery-view.tsx`: renderizado de una sola revisión con 15/15 vídeos, conservación de notas y recuperación de sesiones fuera del límite inicial de consulta.
- `test-patient-shoulder-rollout.ts`, `test-shoulder-rollout-access.ts`, `test-shoulder-test-feedback.ts`, `test-shoulder-narrative.ts`, `test-shoulder-report-share.ts`, `test-shoulder-legacy-review.ts`, `test-shoulder-feedback-report.tsx`, `test-assessment-history.ts`.

Repetir `test-shoulder-battery-grouping.ts` con `SPLIT_STANDALONE=1` para ejecutar acceso, guardado, publicación, informe compartido, protección de cada asignación y comparación inicial/retest sobre cuatro asignaciones distintas. También `node scripts/test-shoulder-pilot.cjs`, `node scripts/test-shoulder-video-access.cjs` y `npm run build:prod`. La comprobación global de TypeScript mantiene errores previos en otras áreas del proyecto; no hay diagnósticos en los archivos de esta corrección. Las pruebas utilizan fixtures sintéticos, sin modificar fichas ni publicar informes de pacientes.
