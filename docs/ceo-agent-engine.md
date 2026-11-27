# CEO IA — motor departamental y hoja de ruta recuperada

Fecha de auditoría: 27 de noviembre de 2026. Base: fisio-app `3611608` (PR #85). Mandato de desarrollo activo del fundador, separado de AUT-001 y de la automatización de coordinación. Presupuesto de API autorizado en esta sesión: máximo 10 USD/mes. La clave se configura exclusivamente en Vercel.

## Auditoría de lo existente

| Área | Evidencia anterior al cambio | Estado real |
| --- | --- | --- |
| Página CEO IA | PR #85, rutas `/fisio/ceo-ia` | Publicada: resumen, informes, comunicaciones, objetivos, semana. Verificada autenticada el 27/11. |
| Informes Grok | `grok-ceo.ts`, rutas metrics/report, informe diario del 27/11 visible | Funciona el intercambio externo de datos agregados e informes. No era un motor multiagente. |
| Buzón externo | `grok-ceo-exchange`, PR #78 fusionado el 26/11 | Canal con autenticación y trazas; configurar un token no prueba que el bot haya respondido. Se conserva el buzón anterior. |
| Objetivos y resultados | PR #84, `CeoPriority`, `CeoDirectionSettings` | Seguimiento humano con línea base/cierre; no memoria estratégica general ni ejecución autónoma. |
| Stripe y Ponto | PR #81/#82, banco y validación | AIS, deduplicación, candidatos manuales, conciliación de payouts, recurrencias y proyecciones provisionales. Nada de pagos. |
| Equipo de agentes | Ningún runtime empresarial equivalente en la base | Pendiente antes de este cambio. Otros asistentes de la app no son departamentos del CEO. |
| Coordinación | main `849c3494…` en fisiofitcross-ceo; PR 1–7 abiertos | Propuestas documentales, no funciones desplegadas ni autorizaciones operativas. |
| Documentación estratégica | inbox/outbox/reviews 0005–0009 en main y ramas de PR | Revisadas identidad, fundador, modelo, SOPs, KPIs, finanzas, gobierno y conexión. El inventario de 15 documentos locales de Grok no equivale a disponer de sus 15 contenidos íntegros: no se ha verificado la constitución interna completa. |

El README documental y algunos mensajes de coordinación describen fases anteriores a las conexiones actuales. Se conserva su alcance histórico; no se reinterpreta AUT-001 como permiso de desarrollo ni se cambia su automatización.

## Hoja de ruta aprobada recuperada

1. Informes visuales y contrato estructurado: existente; se añaden informes por departamento.
2. Comunicación bidireccional: buzón externo existente; ahora conversación directa por API y encargos trazables.
3. Decisiones y seguimiento: prioridades existentes; ahora propuesta → aprobación del fundador → inicio manual registrado → evaluación.
4. Gastos de verdad: Stripe/Ponto y bandeja existentes, sin contabilización automática.
5. Memoria e histórico: ahora memoria compartida/privada por agente, criterios del fundador, decisiones, hipótesis, experimentos, aprendizajes y resultados.
6. Ejecución autorizada: solo recopilación y análisis, cola interna y preparación de recomendaciones. No se habilitan herramientas económicas, externas, clínicas, de personal o permisos.
7. Revisión diaria operativa y semanal estratégica: se preservan informes externos y semanal; el nuevo cron del producto procesa revisiones departamentales independientes.

El mandato del 27/11 añade motor común, CFO primero, otros cinco departamentos, consejo con dependencias, costes y aislamiento. No fija nuevos objetivos numéricos de negocio ni aprueba políticas comerciales propuestas en los PR documentales.

## Implementación

- Un registro versionado de CEO/Grok, CFO, CMO, CSO, COO, CXO y CTO. Identidad/misión/KPIs/fuentes en código; cadencia, pausa y criterios del fundador persistidos por agente.
- Herramientas internas de evidencia numérica con lista permitida por rol y segundo filtrado en el runtime. El modelo no recibe Prisma, SQL, URLs, credenciales ni herramientas de escritura. Sin acceso a historias, transcripciones, nombres de pacientes o datos de pago.
- CFO: libro de cobros/contratos/gastos; subconjunto Ponto validado; pagos del equipo registrados; base y variable del equipo estimadas; saldo/conciliación/suscripciones/previsión; renovaciones esperadas; objetivos/desviaciones. Cada hecho lleva unidad, periodo, antigüedad, definición y calidad.
- CMO: CRM y métricas numéricas del calendario de contenido. CSO: conversión, citas/resultados y seguimiento. COO: capacidad calculada con consultas agregadas de ocupación y configuración, sin fichas individuales. CXO: renovaciones agregadas. CTO: recuentos de tickets/errores. Estas fuentes tienen límites explícitos y no se presentan como cobertura completa de cada departamento.
- Cola persistente con prioridad, estados, dependencias inmutables, propiedad por fundador, idempotencia, lease de 4 minutos, máximo 3 intentos explícitos y recuperación de interrupciones. Las dependencias solo apuntan a tareas anteriores del mismo espacio, impidiendo ciclos por construcción.
- Consejo: departamentos primero, síntesis después. El CEO puede solicitar hasta 3 análisis internos; profundidad limitada a 2, sin delegación recursiva abierta. Despacho duradero desde los resultados guardados para recuperarse de una interrupción entre análisis y entrega.
- Un análisis departamental solicitado por el fundador genera entrega interna al CEO. El canal read-only existente incluye las últimas conclusiones departamentales. No se modifica la vigilancia ni se concede escritura adicional a los tokens externos.
- Memoria: contexto de preferencias, revisiones vencidas y registros recientes, más dos ejecuciones anteriores. El contexto se limita para ahorrar coste; los registros completos siguen en base de datos. La IA solo escribe propuestas. El fundador conserva aprobación/rechazo y registra inicio/resultado manual con versión optimista y auditoría.
- Experimentos: hipótesis/descripción, indicador, línea base, objetivo, fecha, resultado y feedback. El cambio del indicador no demuestra causalidad. Registrar o aprobar no lanza acciones ni gasto.
- API xAI Responses con modelo fijo `grok-4.20-0309-non-reasoning`, salida JSON validada, sin herramientas remotas, sin almacenamiento de conversaciones en el proveedor (`store:false`), timeout y sin reintentos automáticos de pago.
- Revisión programada según cadencia (CFO/CSO/CEO 24 h; CMO/COO/CXO 72 h; CTO 168 h), cola comprobada cada hora. Encargos manuales pueden procesarse desde el panel. Evidencia idéntica reutiliza un análisis reciente, sin nueva llamada. No existe vigilancia continua por cada movimiento: los cambios se recogen en la siguiente revisión o encargo.
- ChatGPT figura como arquitectura/auditoría externa. No se simula un octavo agente autónomo que no existe.

## Costes y límites

Presupuesto compartido de 10.000.000 microUSD por mes de Madrid. Cada llamada reserva atómicamente 100.000 microUSD (0,10 USD), frente a un máximo de entrada de 48.000 bytes y 2.200 tokens de salida, con el modelo no razonador fijo y sin herramientas facturables. Se liquida con `usage.cost_in_usd_ticks`; si el proveedor no devuelve coste o la llamada se interrumpe, se conserva íntegra la reserva como consumo conservador. Modelo inesperado o coste superior a la reserva bloquea nuevas llamadas hasta revisión técnica. No se cambia a otro modelo silenciosamente.

Este registro cubre las llamadas del motor, no otros usos de la cuenta xAI. El límite de saldo/proveedor es una segunda protección frente a cambios de tarifa o usos ajenos. Las tarifas verificadas al implementar fueron 1,25 USD/M entrada y 2,50 USD/M salida; revisar antes de cambiar modelo/tarifa. Documentación oficial consultada: https://docs.x.ai/developers/models/grok-4.20-non-reasoning ; https://docs.x.ai/developers/rest-api-reference/inference/responses ; https://docs.x.ai/developers/cost-tracking .

## Seguridad, despliegue y pruebas

Sesión exacta del fundador y rol CEO en API/páginas nuevas; origen estricto en mutaciones; cron con CRON_SECRET, solo producción y fundador activo. Escritura deshabilitada en previews. Textos de agentes y memoria nunca conceden permisos. La app no incorpora ejecutores para operaciones sensibles. No se accede a datos clínicos identificables. El contenido libre escrito por el fundador debe ser empresarial: se eliminan patrones comunes de credenciales/correos/cuentas/enlaces, pero eso no constituye una anonimización general de texto libre.

Migración `scripts/sql/ceo-agent-engine.sql`, aditiva e idempotente, en la transacción de build de producción. No `db push` sobre Neon ni cambios en tablas históricas. Pruebas en SQLite efímera con exclusivamente las nuevas tablas y fixtures ficticios: contrato, proveedor, errores/costes desconocidos, tamaño de contexto, aislamiento, concurrencia, idempotencia, dependencias, entrega CFO→CEO, consejos, aprobaciones, versiones, experimentos, presupuesto y recuperación tras caída. Suites existentes de CEO, Ponto, dirección y soporte pasan. `next build` verificado. TypeScript global conserva errores previos ajenos al cambio; no nuevos errores en este módulo.

## Control de calidad financiera

La primera prueba real confirmó conexión y medición de consumo, pero detectó una inferencia inválida del modelo: tratar contratado menos cobrado de periodos/cohortes distintos como deuda pendiente. También inventó un porcentaje con costes de equipo. Ninguna recomendación fue aprobada ni ejecutada. Se añadió validación previa a publicación: importes y porcentajes deben existir en la evidencia; se rechazan inferencias de deuda no acreditada. Los cálculos nuevos corresponden a adaptadores deterministas, no al texto del modelo.

Las referencias de evidencia se restringen en el JSON Schema a los indicadores disponibles para cada agente. Los importes se entregan al modelo en euros y las desviaciones de tasas en puntos porcentuales. Se impide describir una previsión positiva como caja negativa. Los fallos guardan sus diagnósticos y su respuesta original para auditoría, sin mostrarlos como recomendaciones. La reutilización de resultados incluye el encargo y, en el CEO, las conclusiones departamentales.

Los informes anteriores que incumplen el control se retiran del contexto y de las entregas al CEO, y sus propuestas pasan a cuarentena. Se conserva el original en auditoría y su coste. Una validación automática no demuestra corrección semántica total: siguen siendo recomendaciones revisables, no contabilidad ni autoridad operativa. Pruebas sintéticas reproducen ambos errores y comprueban cuarentena, aislamiento y consumo conservado.

## Validación en producción — 27/11/2026

Despliegues #86–#90 verificados. La API real está activa con la clave sensible de producción; no fue necesario compartirla en el chat. El consejo inicial completó CFO, CMO, CSO, COO, CXO y CTO antes de la síntesis del CEO. Se comprobó que la síntesis esperaba una dependencia fallida y continuó después de su reintento correcto. La conversación directa recuperó el consejo y diferenció datos disponibles en la empresa de restricciones departamentales. Consumo acumulado a las 13:01 de Madrid: 0,1453 USD, sin reservas pendientes, incluyendo todos los fallos.

La validación detectó errores semánticos del modelo y falsos positivos del filtro que se reprodujeron en pruebas y se corrigieron. Se conservan ejecuciones antiguas rechazadas y propuestas retiradas en el historial; no son decisiones del fundador ni acciones ejecutadas. Los especialistas solo reciben objetivos asociados a sus fuentes, y el CEO recibe el alcance de cada departamento para contrastar limitaciones. Esta comprobación funcional no convierte todas las afirmaciones del modelo en hechos verificados: las recomendaciones requieren revisión y las limitaciones de fuentes siguen vigentes.

## Backlog priorizado, sin confundir límites con funcionalidades terminadas

| Prioridad | Siguiente capacidad | Dependencia/criterio de finalización |
| --- | --- | --- |
| Completado | Verificación real de API, seis departamentos, consejo y chat | El 27/11 a las 13:01 (Madrid): seis análisis completados, síntesis dependiente del CEO y conversación con memoria verificadas en producción. Consumo acumulado observado: 0,1453 USD, incluidas pruebas fallidas. |
| P1 | Previsión por vencimientos a 13 semanas y escenarios | Agenda completa de compromisos de caja y criterios de escenarios. Hoy existe extrapolación provisional, no caja comprometida. |
| P1 | Margen y rentabilidad contable | Ingreso devengado neto, costes variables atribuibles y cobertura contable acordados; hoy se informa como no disponible. |
| P1 | Nómina final conciliada | Contrastar estimación con liquidación final; no contabilizar desde agentes. |
| P1 | Marketing con atribución/CAC/ROAS | Fuente completa de inversión, atribución y cohortes; integración Meta de la app no equivale a atribución validada en este motor. |
| P1 | Objeciones y evaluación comercial | Fuente previamente anonimizada y normalizada. No habilitar lectura de transcripciones identificables para resolverlo. |
| P1 | Experiencia/SLA/adherencia | Instrumentación agregada no clínica, definiciones y denominadores; no inferir satisfacción desde renovaciones. |
| P1 | Capacidad efectiva en horas | Coeficientes y horas netas de servicio. Plazas configuradas no prueban capacidad real. |
| P2 | Disparadores por cambios relevantes y contexto más amplio | Actualmente revisiones/encargos y deduplicación. Añadir eventos transaccionales sin disparar un LLM por movimiento. |
| P2 | Ejecución operativa de bajo riesgo | Catálogo específico, autorización verificable por acción, caducidad/revocación y reversión. Ninguna acción económica/externa está habilitada. |
| P2 | Importar constitución completa de Grok | Obtener las versiones efectivas de sus 15 documentos, revisar discrepancias; no inventarlas desde el inventario. |

Rollback: revertir código y cron; conservar tablas nuevas para no perder auditoría. Pausar agentes desde Equipo IA o retirar la clave detiene nuevas inferencias; una llamada en curso puede finalizar y queda auditada.
