# Centro de dirección

`/fisio/informe-ceo/direccion`, exclusivo del founder activo con rol CEO. Aparece también en «Tu CEO IA», informes y dirección semanal.

- Objetivos mínimos opcionales para saldo, proyección a 30 días, cobrado, registros CRM, cierre y renovación. No se preconfiguran cifras del negocio. Las tasas sin casos resueltos son datos ausentes; no cero. Los datos con más de 48 horas o de una conexión bancaria no disponible no certifican cumplimiento. Se muestran las fechas y se distingue proyección de observación.
- El founder puede incorporar una de las tres recomendaciones de un informe al seguimiento. El servidor obtiene el texto del informe: el navegador no puede sustituirlo. Un índice único evita incorporar dos veces la misma recomendación.
- Estados: planificada, en marcha, bloqueada, completada y descartada. Plazo opcional y resultado obligatorio al cerrar. Versionado optimista e historial de eventos en transacción serializable. Las notas son privadas del founder; no se envían a Grok ni al equipo.
- Se guardan los indicadores disponibles al crear y cerrar una prioridad. Los periodos y fechas quedan visibles. No se atribuyen causalmente los cambios a la acción ni se sustituye un dato ausente por cero. Reabrir preserva el cierre anterior en el historial.
- Solo se guardan registros de seguimiento. No se ejecutan recomendaciones, cambian precios, delegan tareas ni escriben asientos. El token de Grok no permite llamar al endpoint de dirección.
- El canal de métricas existente incorpora `direction`: recuentos por estado y objetivos numéricos. No incluye títulos, notas, autores, identificadores, historial ni datos de pacientes. No se añaden rutinas ni llamadas de IA.
- Los próximos informes diarios guardan el agregado `banking` obtenido por el servidor. Una petición de Grok no puede proporcionar cifras bancarias. Los informes antiguos conservan su contenido sin reconstruir información bancaria histórica. El detalle de informe y el último informe retiran `banking` para otros CEO; la nueva vista requiere la sesión del founder.

La bandeja de validación y las reglas bancarias existentes no se modifican. La migración `ceo-direction.sql` crea exclusivamente tres tablas propias, índices y la relación de eventos; es aditiva e idempotente. No ejecutar `prisma db push`.

Pruebas: `npm run test:direction` usa datos sintéticos para roles, origen, objetivos incompletos/desactualizados, tasas sin denominador, recomendaciones de origen, idempotencia, doble revisión, historial, minimización y publicación de snapshots. Forma parte de `build:prod`. Verificar además SQL en PostgreSQL aislado, compilación y vista autenticada tras el despliegue. No crear seguimientos ficticios en producción ni aprobar gastos como prueba.

El consumo del buzón y el campo `weeklyStrategy` de los lunes dependen de la rutina externa de Grok. Esta versión no modifica esa rutina ni amplía su capacidad operativa. La delegación al equipo y la ejecución autónoma siguen requiriendo permisos explícitos separados.
