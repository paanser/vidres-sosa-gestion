# Configuración de IA para dictado de partes

La IA no estará activa hasta configurar y publicar un Worker.

1. Crear Cloudflare Worker y pegar el código de `worker/worker.js`.
2. Añadir secretos: `OPENAI_API_KEY`, `ACCESS_CODE` (código privado largo) y `ALLOWED_ORIGIN` = `https://paanser.github.io`.
3. Crear namespace Workers KV y binding `USAGE`.
4. Publicar el Worker y poner su URL HTTPS en `ai-config.js`, variable `window.VIDRES_AI_ENDPOINT`.
5. En la aplicación pulsar «Interpretar con IA», introducir código privado y revisar todos los campos antes de Guardar.

**Gasto:** el límite de 500 llamadas mensuales del Worker es aproximado y NO constituye un tope monetario de 2 €. Configura un límite de gasto estricto en el proveedor si está disponible. Las alertas no garantizan detener cargos.

**Privacidad y seguridad:** esta web continúa siendo una demo pública sin autenticación multiusuario ni base de datos segura. No utilizar datos reales de clientes hasta añadir control de acceso y tratamiento de datos apropiado. El texto se envía al Worker y al proveedor de IA. El código compartido solo es adecuado para pruebas controladas.
