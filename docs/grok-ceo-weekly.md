# Dirección estratégica semanal
La vista semanal usa el informe grok_daily publicado el lunes: su snapshot de los últimos siete días completos equivale a la semana cerrada. No suma ventanas móviles ni reconstruye cifras ausentes. Muestra objetivos, historial de decisiones y respuestas consultivas del buzón.
El contrato diario mantiene compatibilidad hacia atrás. Los lunes admite el campo opcional weeklyStrategy: {summary, risks, focus, nextActions, decisions}. Es un análisis consultivo; no autoriza acciones. Hasta que la rutina externa lo publique, se verá el diagnóstico diario del lunes, claramente etiquetado. No se añade ninguna ejecución ni coste de IA. La vista se actualiza cuando llega el informe habitual.
Prueba: npx tsx scripts/test-grok-ceo-weekly.ts.
