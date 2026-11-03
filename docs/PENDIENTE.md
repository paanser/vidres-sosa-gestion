# Pendiente y decisiones futuras

- Vista semanal y agenda por instalador, con conflictos y distribución de horas.
- Cuentas de usuario, permisos por rol y acceso privado a los expedientes y documentos.
- Base de datos centralizada y sincronización entre dispositivos: evaluar Supabase, Firebase o un backend propio, región de alojamiento, mantenimiento, exportación, coste y dependencia del proveedor antes de elegir.
- Resolución de conflictos entre pestañas y dispositivos; no presentar localStorage como base de datos multiusuario.
- Copias automáticas externas, cifrado, retención, restauraciones periódicas verificadas y recuperación ante pérdida de un dispositivo.
- RGPD: contratos con proveedores, base de legitimación, información a clientes, minimización, derechos, conservación/borrado, registro de accesos y revisión profesional. Esta aplicación no acredita cumplimiento legal.
- Cuotas estrictas de IA mediante almacenamiento transaccional (por ejemplo Durable Objects), límites de gasto y revisión de abuso; los límites actuales de KV no son atómicos.
- Prueba física de iPhone, Android, lápiz táctil, teclado virtual e instalación PWA. Validar también impresoras reales y las opciones PDF de cada navegador.
- Documentos grandes: valorar exportación por streaming o ZIP; el JSON con archivos necesita memoria y aumenta el tamaño por codificación.
- Originales de fotos: actualmente se comprimen y no se conservan íntegros. Acordar resolución, almacenamiento y copia de originales antes de cambiarlo.
- Importación de catálogos PDF: actualmente solo registra nombre y fecha; no extrae precios ni conserva el PDF en Ajustes.
