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

Los bindings D1/R2 se simulan, aunque se ejecuta SQL real. No se ha desplegado esta versión en Cloudflare ni verificado su CPU real o facturación. Chromium no pudo iniciarse por las restricciones de sockets del entorno. El script opcional `scripts/check-browser.cjs` permite ejecutar la prueba de navegador fuera de ese entorno.

La matriz completa de aceptación y los comandos de despliegue están en [Seguridad y despliegue](SEGURIDAD-DESPLIEGUE.md). Completa la prueba visual y funcional en iPhone/Android y en el Worker real antes de utilizar datos reales.
