# Grabaciones internas con Cap

Estado: integración preparada; servidor Cap y migración pendientes de despliegue.

- Solo profesionales con acceso clínico al paciente pueden abrir, crear o quitar enlaces.
- No se incluyen en recursos, resúmenes ni panel del paciente.
- Se vinculan pegando el enlace tras grabar en Cap Desktop; no hay sincronización automática.
- Quitar del historial borra la referencia, no el vídeo alojado en Cap.
- Compartir el enlace se hace manualmente. La visibilidad del vídeo se controla en Cap.

## Activación

1. Desplegar Cap como servicio independiente siguiendo https://cap.so/docs/self-hosting.
   Necesita Docker/VPS, Railway o Coolify, MySQL, almacenamiento S3 y servidor multimedia.
2. Configurar HTTPS, secretos únicos, copias de seguridad, correo e invitaciones al equipo.
   Establecer CAP_VIDEOS_DEFAULT_PUBLIC=false y restringir altas al equipo.
3. Configurar Cap Desktop > Settings > Cap Server URL con la URL del servicio.
4. Aplicar scripts/migrations/20261119-patient-recordings.sql en PostgreSQL antes de publicar esta rama.
5. Establecer CAP_SERVER_URL=https://<dominio-cap> en FisioFit y desplegar.
6. Probar creación, apertura, copiar enlace y eliminación con un paciente de prueba;
   comprobar 403 para pacientes y profesionales sin acceso al paciente.

No se han contratado servicios ni configurado un servidor público.
