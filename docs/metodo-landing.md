# Landing pública /metodo

## Uso del equipo

- Página pública: `/metodo`. Enlace recomendado para Instagram: `/metodo?utm_source=instagram&utm_medium=bio&utm_campaign=metodo`.
- Contenido → Método: `/fisio/contenido/metodo`. CEO y setter ven las métricas. Solo CEO puede editar y publicar (`?tab=editor`).
- El editor guarda titulares, textos, orden de preguntas e historias, visibilidad, imágenes, vídeo, SEO, herramientas, botones y mensaje de WhatsApp. El número vacío hereda la configuración comercial de la landing de agenda; no hay un segundo número obligatorio.
- Imágenes: subida mediante el componente existente de Blob. La fotografía del equipo reutiliza la imagen pública de la landing de agenda si su campo está vacío; se puede sustituir desde este editor o volver a la foto compartida con «Usar la foto de agenda». No es necesario subirla otra vez. Vídeos: URL de YouTube o archivo MP4/WebM/MOV público de Blob; portada opcional. Nada se reproduce automáticamente. La presentación y ambas fotos de Ales siguen disponibles, sin material de stock ni sustitutos inventados.
- Resultados: seleccionar una fuente de Testimonios (general/legacy, preparada) o Casos de éxito activos. Escribir el nombre público, título, extracto y comparativa autorizados; documentar la autorización y activar su publicación. No se copian notas clínicas, datos del paciente ni texto privado. Si cambia el origen, la historia deja de aparecer hasta revisar y renovar su selección/autorización. Para renovar una fuente modificada, quitarla de esta selección y volver a añadirla desde el buscador; esto no borra el original.
- Las historias sin autorización no pueden publicarse. La autorización exige verificar que cubre **este uso público** del archivo y los textos. Una biblioteca interna no constituye permiso de publicación. La sección pública se omite mientras no haya historias autorizadas.
- Las herramientas están desactivadas inicialmente; activarlas individualmente y mostrar su sección cuando corresponda.
- Los cambios usan revisión optimista para evitar pisar una edición concurrente. Desactivar «Página publicada» devuelve 404 en la ruta pública y el contacto.

## Medición y atribución

No se crea identificador analítico hasta aceptar la medición. Aceptar y rechazar tienen igual prominencia. La preferencia se conserva 180 días; se puede cambiar desde el pie. Retirarla desactiva la medición y elimina el visitante y sus eventos/referencias asociadas. No elimina datos operativos del CRM, facturas o transacciones. Los vídeos externos solo se cargan tras pulsar su botón, con aviso previo.

- Visitantes = navegadores consentidos, no personas ni todo el tráfico.
- Página, scroll (25/50/75/100), vídeo (inicio y porcentaje **realmente reproducido**, sin contar saltos ni repeticiones), historias y filtros se deduplican por visita y objetivo.
- UTMs: etiquetas limitadas. No se guardan URL completa, fbclid, email, teléfono, respuestas clínicas o IP en claro. Se conserva la primera fuente consentida.
- WhatsApp: redirección HTTP del mismo origen, sin popup; el número se resuelve en servidor. Solo con consentimiento se añade una referencia aleatoria `MF-…` al texto. Una apertura es **clic**, nunca mensaje enviado. La medición no impide contactar si falla.
- Conversación real: el equipo confirma haber recibido ese mensaje en «Métricas y atribución». Al agendar, introduce la referencia en «Origen /método» de la tarjeta de la llamada. Closer solo puede vincular sus llamadas; CEO/setter pueden revisar el conjunto. La referencia y el lead tienen enlace único; se exige motivo para corregir una atribución.
- No se modifica la atribución UTM que ya tuviera el lead ni se emparejan personas por parecido, teléfono o proximidad temporal. La API actual de Skalex no ofrece confirmación del mensaje con esta referencia; por eso esta fase es explícita, no automática.
- El informe usa la **cohorte de referencias creadas en el intervalo** (Europe/Madrid), con resultados conocidos hasta ahora, aunque la venta ocurra después. Fuentes, campañas, conversaciones, llamadas y ventas aparecen separadas.
- Facturado: facturas EUR no anuladas, relacionadas directamente con una venta del lead atribuido. Cobros: únicamente transacciones de ingreso vinculadas explícitamente por `PatientInvoice.transactionId`. Sin enlace documental se muestra ausencia de información, no se presume cobro. No equivale a caja neta ni atribuye devoluciones/renovaciones no relacionadas.
- Exportación JSON agregada y API autenticada `GET /api/metodo/admin/metrics?from=AAAA-MM-DD&to=AAAA-MM-DD&format=aggregate`: contrato `schemaVersion:1`, definiciones, cobertura, límites y desglose de campañas. No incluye contactos individuales y queda preparada para el agente de dirección. No se crea una clave pública ni se amplían permisos del agente.

## Arquitectura y seguridad

- CMS reutilizado: `LandingConfig`, id `metodo`. Las otras landings no cambian.
- Identidad pública: FisioFitTeam. El bloque de equipo conserva el identificador interno `founder` por compatibilidad; la fotografía añade `media.team` al JSON existente. Sin migración SQL. El DTO público hereda exclusivamente `groupImageUrl` de agenda, validada con la misma lista de medios públicos de método; no copia sus cifras ni el resto del contenido. Una imagen propia del equipo tiene prioridad. Si portada y equipo están ocultos, se elimina URL, descripción y póster de este medio del DTO y no se consulta la foto de agenda.
- Los antiguos textos predeterminados de fundador, marca, descripción del vídeo, SEO y WhatsApp se actualizan en la normalización solo si coinciden exactamente con el valor histórico. Se conservan las personalizaciones, los campos vacíos intencionados y la visibilidad. La lectura no escribe ni modifica la revisión guardada; el siguiente guardado del editor persiste la configuración normalizada mediante los controles de concurrencia existentes.
- DTO público explícito: no incluye IDs de fuentes, autorizaciones, notas, fichas ni fuentes ocultas. React escapa los textos. URLs de medios y herramientas se validan con listas permitidas; no HTML arbitrario ni enlaces privados.
- Ruta pública exacta en middleware; las rutas `/api/metodo/admin/*` siguen protegidas por sesión y autorización en servidor. Mutaciones exigen mismo origen, contenido JSON y límites de tamaño. Endpoints de analítica tienen límites por minuto persistidos usando HMAC, sin almacenar IP en claro.
- Configuración, atribución y retirada generan controles de concurrencia/auditoría cuando corresponde. No se modifica la estructura de tablas existentes salvo el campo de relación virtual Prisma en Lead.
- Cinco tablas nuevas e índices: `MetodoVisitor`, `MetodoEvent`, `MetodoContact`, `MetodoAudit`, `MetodoRateLimit`. DDL idempotente en `lib/metodo/migration.ts`, replicado por modelos en los tres esquemas. Se inicializan en la primera operación de analítica/admin bajo bloqueo transaccional PostgreSQL. No ejecutar `prisma db push` para este cambio. La lectura pública de contenido no necesita estas tablas.
- Retención diaria `/api/cron/metodo-retention` a las 03:40 UTC, protegida por `CRON_SECRET`. Eventos/visitantes 180 días, referencias/auditoría 730 días; buckets de rate limit caducan en 2 minutos y se limpian a diario. Confirmar que `CRON_SECRET` está configurada en Vercel para habilitar la limpieza programada.
- Si la cuenta de DB no permite DDL, las métricas fallan de forma explícita y WhatsApp sigue disponible sin atribución; aplicar el DDL versionado con el procedimiento de administración de DB.
- SEO/canonical/Open Graph propios, render servidor dinámico, imágenes Next optimizadas, vídeo diferido, sin SDK publicitario. Viewport con zoom, foco visible, enlace de salto, FAQ nativa, reduced-motion y diseño móvil.

## Comprobaciones

- `node scripts/test-metodo.cjs`: pruebas sintéticas de migración exacta de defaults y conservación de personalizaciones, herencia/validación/prioridad/ocultación de la foto del equipo, publicación autorizada, revocación por cambio de fuente, DTO público, secciones ocultas, URLs, origen, roles, consentimiento, WhatsApp, visionado sin saltos y fechas con cambio horario.
- `node scripts/test-skalex-insights.cjs`: regresión del contexto comercial existente.
- `npm run build:prod`: build completo. El proyecto ya omite lint/tipos durante build; se ejecuta `npx tsc --noEmit` por separado y se documentan los errores previos fuera de esta funcionalidad.
- Revisión visual con componentes reales a ancho de escritorio y viewport de iframe de 390 px. No equivale a probar el navegador nativo de Instagram en iPhone/Android; conviene comprobar el enlace final desde ambos dispositivos antes de cambiar la bio.
- Las dos fotografías de Ales ya publicadas se integran directamente en el diseño. Presentación y testimonios/casos se muestran cuando existen contenidos seleccionados y autorizados; no se añaden sustitutos ni resultados ficticios.

## Reversión

Despublicar desde el editor detiene el acceso público y la medición nueva. Se puede revertir el commit sin borrar datos existentes; las cinco tablas aditivas pueden quedarse para conservar el historial. No eliminar tablas como parte de una reversión rutinaria.

## Dirección visual FisioFitTeam · 25/11/2026

- Referencia visual aportada por el equipo: https://www.myodetox.com/. Se aplican fotografía amplia, tipografía ligera, espacio y jerarquía serena con contenidos propios; no se reutilizan sus imágenes, testimonios, cifras ni afirmaciones clínicas.
- Portada con la foto real del equipo de agenda a todo el ancho y degradado CSS para conservar legibilidad sin tapar caras. En móvil mantiene el ancho completo de la fotografía, sin recortar personas. Un medio de portada explícito mantiene prioridad; en ese caso, o si portada está oculta, la foto del equipo aparece en «El equipo».
- Logo oficial exportado como PNG transparente desde Canva, diseño `DAGkcG8zTTI`, guardado en `public/brand/fisiofitteam.png`. Se importa estáticamente y se optimiza con Next Image desde `/_next/static/media`; no requiere abrir rutas nuevas del middleware. No es una recreación del logo. Las fotografías existentes se sirven con Next Image y los vídeos siguen cargándose al pulsar.
- El equipo protagoniza el relato. Las fotografías de Ales se componen como un díptico sobre el origen, conservando proporciones y pie identificativo. Se eliminan el subrayado de la portada, los símbolos ornamentales y la composición de tarjetas de la versión anterior.
- Metodología en acordeón con primer paso abierto, botones nativos, `aria-expanded`, paneles etiquetados, foco visible y movimiento reducido. FAQ y llamadas a la acción conservan su funcionamiento. Amarillo reservado al logo, acentos y contacto final.
- `media.team` hereda exclusivamente la foto pública validada de agenda, sin duplicar archivos ni requerir otra subida. Imagen propia opcional desde el editor; no se cambia la revisión guardada por leer la página. Se mantiene la eliminación de medios de secciones ocultas.
- Nombre del sitio, Open Graph y defaults comerciales usan FisioFitTeam mediante migración exacta de valores históricos; los textos personalizados se respetan. Testimonios, autorizaciones, medición, atribución, permisos y número compartido mantienen su comportamiento.
- Validación: pruebas sintéticas de método, build de producción, revisión visual de componentes reales a 1348 px y frames móviles de 390/320 px, navegación y acordeones. No hay desbordamiento horizontal en ambos tamaños. TypeScript global mantiene errores ajenos a método; no hay diagnósticos en los archivos modificados. No se ha probado físicamente el navegador interno de Instagram.
