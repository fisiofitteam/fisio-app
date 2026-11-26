# Valoración de hombro repartida entre sesiones

Una batería completa de TEST HOMBRO (semanas 1 y 14) puede estar distribuida entre varios registros de sesión del mismo día. Antes, `pilotSnapshotRefs` exigía los 15 tests en un único registro: el calendario podía parecer correcto, pero Valoraciones mostraba bloques separados sin acceso al informe conjunto.

## Comportamiento

- Se reconocen los tests por sus identificadores del protocolo. Se agrupan únicamente sesiones de la misma asignación, semana y fecha de calendario (fecha UTC almacenada por el calendario). La fecha de subida o finalización no afecta a la agrupación.
- La batería debe contener los 15 tests sin duplicados. No se juntan otros programas, asignaciones, días ni iniciales con revaloraciones. Las valoraciones completas que ya estaban en una sola sesión conservan su identidad.
- Valoraciones muestra una entrada y el total de vídeos de todas sus actividades. La carga de sesiones hermanas evita cortar una batería en los límites de las consultas de historial/futuro. Las entregas anticipadas siguen visibles.
- Todas las entradas de la batería resuelven al mismo borrador, utilizando un identificador de sesión estable. Cada vídeo conserva su sesión, tarea, identificador y versión originales; no se migran ni duplican registros.
- Guardado, publicación, comentarios, comparación con la inicial, informe privado y enlaces compartidos utilizan la misma agrupación. La publicación bloquea las entregas originales de todos sus miembros. Los enlaces públicos siguen devolviendo exclusivamente la copia publicada autorizada.
- El atleta puede abrir la batería desde cualquiera de sus sesiones originales. Las subidas siguen dirigidas al registro de origen, y los datos por test se guardan en el borrador común. La finalización y los demás contenidos de cada sesión mantienen su funcionamiento anterior.
- Un borrador guardado protege también a sus sesiones hermanas frente a separación, eliminación o sustitución desde el calendario, y frente a la regeneración/cambio de fecha/desactivación de la asignación. Las escrituras vuelven a comprobar la composición de una batería repartida dentro de la transacción.

No se cambian baremos, mediciones ni proveedor de IA. No requiere migración ni variables nuevas. La agrupación se aplica al leer las valoraciones existentes.

## Validación

Ejecutar desde la raíz con `node --import tsx scripts/<archivo>`:

- `test-shoulder-battery-grouping.ts`: cuatro sesiones, 15 vídeos, entregas anticipadas, aislamiento, incompletas/duplicadas, borrador único, versiones, publicación, protección del calendario, comparación inicial/retest e informe/enlace compartido.
- `test-shoulder-battery-view.tsx`: renderizado de una sola revisión con 15/15 vídeos, conservación de notas y recuperación de sesiones fuera del límite inicial de consulta.
- `test-patient-shoulder-rollout.ts`, `test-shoulder-rollout-access.ts`, `test-shoulder-test-feedback.ts`, `test-shoulder-narrative.ts`, `test-shoulder-report-share.ts`, `test-shoulder-legacy-review.ts`, `test-shoulder-feedback-report.tsx`, `test-assessment-history.ts`.

También `node scripts/test-shoulder-pilot.cjs`, `node scripts/test-shoulder-video-access.cjs` y `npm run build:prod`. La comprobación global de TypeScript mantiene errores previos en otras áreas del proyecto; no hay diagnósticos en los archivos de esta corrección. Las pruebas utilizan fixtures sintéticos, sin modificar fichas ni publicar informes de pacientes.
