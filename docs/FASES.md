# Validación de la autenticación y el almacenamiento remoto

La implementación sigue las fases acordadas: backend de usuarios/sesiones; login y cierre; Usuarios en Ajustes; protección de IA, registros y adjuntos; importación y documentación.

## Pruebas ejecutadas

- Cálculos de medidas, redondeos, IVA/recargo y validación de cotas existentes.
- Backend con SQLite real, transacciones y triggers: bootstrap desde secreto, cambio obligatorio, contraseñas mínimas, roles, último administrador, revocación y sesiones sin vencimiento.
- Cinco fallos por usuario/IP, errores genéricos y desbloqueo temporal.
- CORS, rechazo sin sesión y ausencia de llamadas OpenAI no autorizadas.
- Datos compartidos, validación y conflictos que revierten la transacción sin sobrescribir.
- Archivos privados, versión de adjuntos e importación con manifiesto y verificación.
- Cuotas atómicas de IA y proveedor simulado; ningún gasto real de OpenAI.
- Frontend en contexto JavaScript aislado: login, cambio obligatorio, persistencia, revocación, cola de guardados, fallo de red, originales locales conservados y reserva de numeración del servidor.
- Protección frente a doble envío, escape HTML y comprobaciones de CSP/artefacto público.
- Comprobación de sintaxis de todos los archivos JavaScript y formato Prettier.

## Límites de lo comprobado

El 5 de noviembre de 2026 se completaron 31 casos automatizados y el despliegue real de Cloudflare, sin R2 ni cambio de plan. Se comprobó el login inicial en el Worker, el cambio obligatorio y el rechazo 401 de datos, archivos, usuarios e IA sin sesión. La sesión de prueba se revocó.

También pasó Chromium móvil en GitHub Actions: login y cambio obligatorio, parte con medición y foto, usuarios con texto escapado, sesión persistente y empleado sin Usuarios ni importación administrativa. El navegador usa datos ficticios y bindings de prueba; no crea expedientes reales en producción. La interfaz se publicó correctamente en GitHub Pages.

Evidencias: [backend](https://github.com/paanser/vidres-sosa-gestion/actions/runs/42001920408), [navegador](https://github.com/paanser/vidres-sosa-gestion/actions/runs/42003351946) y [publicación](https://github.com/paanser/vidres-sosa-gestion/actions/runs/42003352073).

Quedan las pruebas en dispositivos físicos iPhone/Android y la comprobación de la importación con las copias del propietario. No se han importado datos personales ni realizado llamadas de pago a OpenAI.

La matriz completa de aceptación y los comandos de despliegue están en [Seguridad y despliegue](SEGURIDAD-DESPLIEGUE.md). Completa la prueba visual y funcional en iPhone/Android y en el Worker real antes de utilizar datos reales.
