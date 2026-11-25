# FisioFit Recorder · Chrome 0.1.0

Extensión MV3 para iniciar una grabación desde el icono de Chrome o `⌘⇧9` en Mac (`Ctrl+Shift+9` en Windows/Linux). Reutiliza el grabador, mezcla de audio, transcripción y biblioteca de FisioFit.

## Instalar en el equipo

1. Desde **Grabaciones** en FisioFit, descargar y descomprimir `FisioFit-Recorder.zip`.
2. Abrir `chrome://extensions`, activar **Modo de desarrollador**, pulsar **Cargar descomprimida** y elegir la carpeta `FisioFit-Recorder` que contiene `manifest.json`.
3. Fijar **FisioFit Recorder** desde el menú de extensiones de Chrome.

Conservar esa carpeta. Para actualizar, sustituir su contenido por el nuevo paquete y pulsar **Recargar** en `chrome://extensions`, después de guardar las grabaciones pendientes. No desinstalar la extensión para actualizar: se perderían sus copias locales. Esta versión se distribuye internamente; todavía no está publicada en Chrome Web Store.

## Uso y límites

- **Explicación**: pantalla y micrófono. **Videollamada** añade audio compartido. Cámara y transcripción son opcionales.
- Para grabar al cliente, elegir la pestaña de la llamada y activar **Compartir audio**. La disponibilidad de sonido al capturar una ventana o pantalla completa depende de Chrome y del sistema operativo. Una fuente sin audio produce un aviso antes de grabar. Usar auriculares evita capturar el cliente dos veces por los altavoces y el micrófono.
- Se mantienen los límites de la app: 30 minutos y 500 MiB por vídeo, hasta tres grabaciones terminadas pendientes.
- Cerrar los controles no detiene la grabación. Cerrar Chrome, reiniciar o suspender el ordenador puede interrumpir una grabación activa. Las grabaciones ya terminadas se conservan en IndexedDB; el aviso de falta de espacio exige guardarlas o descargarlas antes de cerrar Chrome.
- **Guardar en FisioFit** abre la app. Iniciar sesión si hace falta, recibir el vídeo, revisar y elegir título, carpeta y paciente opcional. La copia de la extensión se elimina solamente cuando el servidor confirma el guardado.
- La transcripción en español usa Web Speech del navegador con la pista mezclada. Puede procesarse remotamente, requiere conexión y disponibilidad del servicio de Chrome. Un fallo de transcripción no detiene el vídeo; se muestra el aviso y se puede editar el texto. Chrome for Testing no acredita la disponibilidad del servicio de voz de Chrome comercial.
- La cámara se compone dentro del vídeo. Su vista previa flotante es opcional; cerrar el panel puede cerrar esa vista previa, pero no elimina la cámara de la grabación.

## Desarrollo

```sh
npm ci
npm run extension:build
node scripts/test-recorder-extension.cjs
node scripts/test-recording-audio.cjs
node scripts/test-browser-transcription.cjs
```

`extensions/recorder/dist` es la extensión sin comprimir. `public/fisiofit-recorder.zip` es el paquete distribuido por `/api/recordings/extension`, con autenticación profesional. El ZIP se versiona: ejecutar `extension:build` y añadirlo al commit cada vez que cambie la extensión. La clave pública del manifiesto mantiene estable el identificador al cargarla sin comprimir; no es un secreto ni una credencial de publicación.

Prueba de integración, con Playwright disponible y Chrome for Testing que admita carga de extensiones:

```sh
CHROME_PATH="/ruta/a/chrome-for-testing" node scripts/test-recorder-extension-browser.cjs
```

Usa un perfil aislado, medios sintéticos y respuestas de red controladas: no utiliza cuentas, pacientes, micrófono ni cámara reales. Verifica grabación offscreen, dos señales de audio en el vídeo, cierre/reapertura del controlador, pausa, persistencia al reiniciar, transferencia y reintento de confirmación sin duplicar subidas. El selector nativo de pantalla, los permisos del sistema y el servicio remoto de transcripción requieren una comprobación manual en el Chrome del equipo.

## Arquitectura y permisos

El service worker administra el panel, el documento offscreen y los enlaces de transferencia. Offscreen mantiene `MediaRecorder` y la composición, aunque el panel se cierre. La extensión solo solicita `desktopCapture`, `offscreen` y `storage`: sin scripts en páginas, acceso general a sitios ni credenciales de FisioFit.

El receptor web es `/grabador-extension`. Cada enlace tiene un token aleatorio con 30 minutos de vigencia, ligado a la pestaña creada, al marco principal, al origen y a la ruta exactos. Se transmite en el fragmento y se retira de la URL visible; el HTML público solo sirve para mantenerlo durante el inicio de sesión. Pacientes y carpetas se consultan después de autenticar al profesional. La subida privada, asignación de pacientes y permisos siguen usando los endpoints existentes.

El vídeo viaja por mensajes externos en fragmentos de 512 KiB, con validación de offsets, tamaño, MIME y metadatos. Las páginas de otros orígenes, otras rutas, subframes, extensiones y otras pestañas no pueden utilizar ese enlace. La confirmación final precede al borrado de la copia local. No se ha añadido un proveedor externo de transcripción ni un nuevo almacenamiento de vídeos.
