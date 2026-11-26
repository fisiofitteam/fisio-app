# CEO IA
El espacio /fisio/ceo-ia reúne Resumen, Informes, Comunicaciones, Objetivos y seguimiento, y Estrategia semanal.
El menú incorpora un acceso independiente junto a Panel en el orden predeterminado. Los menús personalizados conservan su orden y sus carpetas; el nuevo acceso se añade como página independiente.

El panel principal mantiene la organización personal («Mi día») y un acceso compacto a CEO IA. El resumen, el buzón y los objetivos dejan de estar incrustados en ese panel.
Los informes enlazan al buzón conservando su identificador; la comunicación mantiene el informe y las decisiones de origen.

Las páginas e interfaces conservan sus permisos: informes y resumen para CEO; comunicaciones, objetivos y estrategia semanal solo para el founder. Los endpoints y tokens no amplían acceso.

Compatibilidad: /fisio/informe-ceo conserva el parámetro report y reconoce #buzon-ceo desde el navegador; /direccion y /semanal redirigen a sus nuevas secciones, conservando week. Las notificaciones nuevas ya apuntan al espacio.
No hay migraciones de datos ni cambios en decisiones, automatizaciones, gastos o conciliación.

Validación: scripts/test-ceo-ia-navigation.ts comprueba avisos antiguos, origen del informe, permisos del menú y conservación de carpetas. Revisar también la suite de menús y CEO y la compilación.
