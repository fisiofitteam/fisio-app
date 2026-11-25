# Adaptador público de WODs · Hombro

Primera versión gratuita para personas externas. Entrada: `/adaptador-wod`. Gestión: `/fisio/contenido/lead-magnets/adaptador-wod`, enlazada desde Contenido → Lead magnets. WhatsApp reutiliza el número ya configurado para el autotest de hombro.

## Recorrido

Perfil con nombre, teléfono, consentimiento sanitario, situación del hombro, cuatro grupos de movimiento, equipo disponible y objetivo. El consentimiento comercial es opcional y separado. Se guarda un perfil externo, sin crear pacientes ni asignar niveles clínicos del servicio.

El usuario indica semáforo y dolor previo, pega un WOD o sube foto/captura, revisa el texto y obtiene una propuesta por línea. Los movimientos no reconocidos o ambiguos se conservan y piden aclaración. Las alternativas requieren confirmación de tolerancia previa y equipo disponible; no heredan kilos o repeticiones del original. El autotest de cuatro pruebas existente es opcional y no diagnostica ni desbloquea cargas.

Cada WOD conserva su perfil de partida, entrada, resultado y versión del motor. El registro posterior recoge dolor, respuesta general, esfuerzo opcional y, por ejercicio, si hizo lo propuesto, otra variante/dosis o lo omitió y si hubo molestias. La respuesta del día siguiente se habilita tras 18 horas desde el primer registro de finalización. El historial es paginado y persiste entre visitas.

## Regla de ajuste inicial

El motor usa tres estados internos por movimiento: pedir alternativa, ajustar exigencia y mantener dosis previamente tolerada. No son niveles de paciente ni una progresión clínica validada.

- El dolor marcado en un ejercicio reduce un paso solo en ese movimiento realizado como se propuso.
- Un empeoramiento general reduce por prudencia los movimientos realizados, sin atribuir la causa a uno concreto.
- Se considera empeoramiento también dolor posterior ≥5/10 o aumento ≥2 puntos posterior/al día siguiente respecto al previo.
- Tres registros consecutivos favorables, con dolor previo/posterior/al día siguiente ≤2/10 y respuesta al día siguiente igual o mejor, recuperan un paso como máximo hasta la tolerancia declarada.
- Sin respuesta al día siguiente, o si cambió/omitió el ejercicio, no hay crédito para progresar ese movimiento. No se aprende del original cuando se realizó un sustituto.
- La evolución se calcula con los últimos 100 WODs finalizados, ordenados por finalización. Al llegar a la necesidad de alternativa no se reintroduce automáticamente el movimiento que molestó. La revisión profesional puede ser necesaria.

Estos umbrales son valores conservadores del producto, revisables por el responsable clínico. No se presenta evidencia de que tres registros, 18 horas o estos cortes validen una progresión de crosstraining. Las recomendaciones son cualitativas: no prescriben kilos, porcentajes o dosis nuevas.

La vigilancia de la respuesta posterior/al día siguiente y la reducción de repeticiones/ritmo o el aumento de descansos se apoyan de forma general en [NHS Inform: ejercicios de hombro](https://www.nhsinform.scot/illnesses-and-conditions/muscle-bone-and-joints/arm-shoulder-and-hand-problems-and-conditions/exercises-for-shoulder-problems/). Las señales de consulta se contrastaron con [NHS: dolor de hombro](https://www.nhs.uk/symptoms/shoulder-pain/). Estas fuentes no validan este algoritmo ni sus sustituciones para WODs.

## Acceso, datos y costes

Token aleatorio de 256 bits, hash en base de datos y cookie HttpOnly/SameSite. El enlace de recuperación usa fragmento, se retira de la barra al abrirse y debe guardarse en privado. Copiar el enlace vuelve a mostrar la misma clave del perfil; borrar el perfil la invalida. No se recupera ni fusiona por teléfono sin verificarlo. Sin el enlace/cookie se crea otro perfil.

Se utilizan tablas `PublicWodProfile`, `PublicWodEntry` y `PublicWodRateLimit`, separadas de pacientes. Validación estricta, comprobación de origen, pertenencia de cada WOD, límites de cuerpo y cuotas duraderas contra abuso. No se registra contenido sanitario ni claves en logs. Hay borrado propio y por CEO, con cascada del historial, y eliminación a los 180 días de inactividad mediante cron autenticado.

Equipo comercial: métricas y seguimiento; contacto disponible con opt-in o petición de ayuda. Equipo sanitario/dirección: acceso al detalle y contacto para atención. Un clic en WhatsApp se registra como clic, no como conversación ni como consentimiento comercial. No se envían mensajes automáticamente.

Las fotos pasan por el lector de WODs existente (Anthropic); el adaptador no almacena la imagen. Se comprime en el dispositivo y se limita en servidor. Debe estar disponible `ANTHROPIC_API_KEY`. Sin proveedor se mantiene entrada manual. No existe pago ni contador de créditos de uso; las cuotas son contra abuso.

## Activación

1. Desplegar con el comando habitual `npm run build:prod`.
2. Como CEO, abrir Contenido → Lead magnets → Adaptador de WODs y pulsar **Preparar almacenamiento** si aparece. Ejecuta únicamente la migración aditiva y repetible de estas tres tablas. Alternativa de operador: `scripts/migrations/20261125-public-wod.sql` en PostgreSQL.
3. Verificar `CRON_SECRET` para la tarea diaria de caducidad y `ANTHROPIC_API_KEY` para OCR; ambas son configuraciones usadas por la app.
4. Hacer un recorrido con datos ficticios, incluyendo foto real de pizarra, registro y siguiente propuesta. Revisar textos y reglas clínicas antes de difundir el enlace a público.

No ejecutar `prisma db push` sobre producción para esta entrega. La migración nueva no modifica tablas de pacientes. Retirar las rutas de entrada revierte la disponibilidad sin borrar registros; las tablas pueden conservarse.

## Verificación de esta entrega

- `node --import tsx scripts/test-public-wod.ts`: reglas, señales, ambigüedad, alternativas, ajustes por movimiento y progresión con respuesta diferida.
- `node --import tsx scripts/test-public-wod-api.ts`: origen, autenticación, pertenencia, duplicados, consentimiento, acceso por rol, feedback diferido y revocación/borrado.
- Regresión: scripts `test-wod-readiness-api.ts`, `test-wod-readiness-rules.cjs` y `test-wod-readiness-client.cjs` existentes.
- Migración ejecutada dos veces y borrado en cascada comprobado en PostgreSQL local aislado (PGlite).
- Navegador sobre Next + base aislada: alta, WOD, dolor previo/posterior, thruster marcado como molesto, siguiente propuesta ajustando solo thruster y persistencia tras recarga.
- Compilación de producción completada. El chequeo TypeScript global conserva errores ajenos preexistentes; no aparecen diagnósticos en los archivos nuevos.
- OCR con proveedor real y recorrido de producción pendientes de verificar durante activación; en local no se usaron secretos de producción ni datos de pacientes.
