# Configurar el dictado con IA

El dictado básico funciona sin este servicio. La IA necesita conexión y es opcional.

1. Publica `worker/worker.js` como Worker de Cloudflare (módulos ES).
2. Configura **en Cloudflare**, nunca en la web, `OPENAI_API_KEY` y `ACCESS_CODE` (un código largo y privado). Configura `ALLOWED_ORIGIN` como `https://paanser.github.io`.
3. Crea un namespace Workers KV y vincúlalo con el nombre `USAGE`.
4. Copia la URL HTTPS publicada a `window.VIDRES_AI_ENDPOINT` en `ai-config.js`.
5. En un parte, abre Dictar parte, introduce texto ficticio, pulsa Interpretar con IA y revisa todos los campos antes de guardar.

## Límites y seguridad

- El código se compara usando hashes SHA-256 de longitud fija y `crypto.subtle.timingSafeEqual` cuando está disponible. El fallback recorre los 32 bytes completos sin salir en el primer error; JavaScript no ofrece una garantía formal de tiempo constante frente a optimizaciones del motor.
- Se admiten como máximo 10 consultas/minuto por conexión IP y 500/mes en total. Las IP se usan como un hash, no se guardan en claro; las claves de minuto caducan a los 120 segundos.
- **Ambos contadores son aproximados**: Workers KV es de consistencia eventual y la secuencia leer/incrementar/escribir no es atómica. Peticiones simultáneas pueden superar los límites o perder incrementos. Para un límite estricto hace falta coordinar las cuotas mediante un Durable Object u otro almacenamiento transaccional. Esta aplicación no lo despliega automáticamente ni contrata servicios.
- Una conexión compartida (oficina) comparte límite por minuto. Si falta CF-Connecting-IP se aplica una cuota común `sin-ip`. Cloudflare establece ese encabezado al recibir peticiones públicas.
- Los intentos autorizados consumen cuota aunque el proveedor falle; evita reintentos automáticos ilimitados.
- La llamada al modelo `gpt-4.1-nano` utiliza `max_completion_tokens`. Las respuestas no válidas devuelven un error claro y mantienen disponible el análisis básico.
- CORS no es autenticación multiusuario. El código compartido es apropiado para pruebas controladas, no sustituye cuentas y permisos.
- El texto viaja a Cloudflare y al proveedor IA. No envíes datos reales de clientes sin resolver acceso, tratamiento de datos y obligaciones legales.
- No existe un tope monetario garantizado por estos contadores. Revisa límites de gasto, alertas, precios y contratos en el proveedor.

## Comprobaciones

`npm test` prueba el Worker con un proveedor simulado: origen, código, cuota por minuto, cuota mensual, JSON inválido y campos para revisión. No hace llamadas a OpenAI ni incurre en gasto. Una prueba real de despliegue y facturación requiere configurar los servicios anteriores; las pruebas locales no acreditan su configuración.
