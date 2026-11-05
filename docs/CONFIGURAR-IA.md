# Dictado e IA

El dictado básico del navegador sigue funcionando sin OpenAI. La interpretación IA se realiza exclusivamente desde el Worker autenticado; consulta [el despliegue completo](SEGURIDAD-DESPLIEGUE.md).

Configura `OPENAI_API_KEY` mediante el prompt de `wrangler secret put`, nunca en `ai-config.js`, HTML, localStorage, GitHub o archivos de copia. `ai-config.js` contiene solo la URL pública del Worker.

`POST /ai/interpretar` necesita `Authorization: Bearer ...` y una sesión completa. La ruta raíz antigua también exige esa sesión. El código compartido `ACCESS_CODE` ya no sirve. Un usuario pendiente de cambiar su contraseña inicial tampoco puede consumir IA.

La cuota se reserva en D1 de forma atómica antes de contactar con OpenAI: diez solicitudes por minuto e IP y quinientas al mes en total. Las llamadas fallidas al proveedor también consumen la reserva. La conexión de una oficina comparte el límite de IP. El contador de Ajustes es informativo y local; el servidor aplica las cuotas reales. Estas cuotas limitan solicitudes, no garantizan un coste monetario concreto; conserva las alertas de gasto de tu proveedor.

Se utiliza `gpt-4.1-nano`, salida JSON, límite de respuesta y timeout de quince segundos. Los campos se limitan y validan. La IA nunca decide marcar un trabajo como Crítico y el formulario siempre requiere revisión antes de guardar.

Las pruebas sustituyen el proveedor por una respuesta ficticia y comprueban que una petición sin sesión o sin cuota no consume OpenAI. No se ha realizado una llamada de pago para esta entrega.
