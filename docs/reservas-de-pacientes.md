# Reservas clínicas y primera venta

Desde **Llamadas de venta**, la acción **Reservar plaza para valoración** permite vincular una ficha al lead y asignarle un fisio para pautar los test. Se puede abrir sin señal, registrar una señal ya cobrada por otro medio o utilizar el enlace de pago de reserva para cobrarla. Son alternativas: no hay que registrar manualmente la señal si ya se envió un enlace. Crear una cita por sí solo no da de alta al paciente.

La ficha aparece en **Pacientes** con el distintivo **En reserva**. La reserva permite trabajar en el calendario clínico, pero no abre un periodo de programa ni suma un alta, una renovación o una comisión de renovación. Si hay señal, su cobro se contabiliza en la fecha en que se recibió.

Desde **Vender programa**, en la ficha o en la llamada, se indica el **precio total** acordado. La app muestra la señal y el saldo que queda por cobrar. La confirmación de pago activa el primer programa en la misma ficha y conserva el fisio, los test y sus vídeos. Un pago fraccionado crea una única alta y registra cada cobro cuando se recibe; solo una continuación posterior puede ser una renovación.

## Despliegue

Aplicar antes de publicar las dos migraciones aditivas de `scripts/migrations/20261113-*.sql`. Los campos de las ventas nuevas son opcionales y el indicador de primera venta de un enlace antiguo de renovación tiene el valor inicial `false`. Ningún cobro anterior se reclasifica en masa.
