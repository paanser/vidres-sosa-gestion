# Seguridad, despliegue y migración

## Qué se entrega

Interfaz vanilla con login y administración; Worker con usuarios, sesiones, datos e IA; migración SQL; configuración de Wrangler; script de primer acceso; pruebas y documentación. No se han creado recursos de Cloudflare ni trasladado datos reales. La URL de la interfaz sigue siendo `https://paanser.github.io/vidres-sosa-gestion/`.

La aplicación se ha preparado sobre los cambios de cierre administrativo y archivo de trabajos de `d456ef57e7a7f89898184b51541afe7c206d501c`. Conserva facturado, cobrado, fecha de cierre, archivo y navegación de tarjetas.

## Almacenamiento y seguridad

| Elemento             | Implementación                                                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contraseñas          | PBKDF2-SHA-256, sal aleatoria individual de 128 bits, 100.000 iteraciones y HMAC-SHA-256 posterior con `PASSWORD_PEPPER`, secreto separado de D1                                                |
| Límite del algoritmo | Workers Web Crypto limita PBKDF2 a 100.000 iteraciones; el pepper protege también ante una copia aislada de D1. No se usa SHA-256 directo para contraseñas                                      |
| Sesiones             | Token aleatorio de 256 bits; D1 solo conserva SHA-256 del token, usuario y versión de credenciales; no hay fecha de vencimiento                                                                 |
| Revocación           | Cambio de contraseña, desactivación o eliminación invalidan todas las sesiones. Lecturas en el primario de D1; permisos y sesión se comprueban nuevamente dentro de la transacción de escritura |
| Último administrador | Triggers SQL impiden su eliminación, desactivación o degradación incluso si llegan peticiones concurrentes                                                                                      |
| Fuerza bruta         | Cinco fallos por usuario o IP en una ventana de 15 minutos bloquean temporalmente; mensajes genéricos y hash del identificador de la IP                                                         |
| Datos                | D1, registros JSON validados por colección; API de estado con revisión optimista y transacción D1                                                                                               |
| Adjuntos             | Bucket R2 privado. Cada descarga necesita sesión; no se publican URLs R2 ni enlaces permanentes sin autenticación                                                                               |
| IA                   | Sesión completa, 10 solicitudes/minuto por IP y 500/mes en total con reservas atómicas; máximo de respuesta y timeout; clave solo en Cloudflare                                                 |
| XSS                  | `textContent` o `VSUtils.esc`, validación de tipos y enlaces, CSP sin JavaScript inline, sin manejadores HTML inline                                                                            |
| CORS                 | Exclusivamente `https://paanser.github.io`. CORS no sustituye al token y no restringe a una ruta concreta de ese dominio                                                                        |
| Caché                | `no-store` en respuestas privadas; service worker solo para la lista de archivos públicos                                                                                                       |

El token se almacena en localStorage y se envía como `Authorization: Bearer ...`. Se eligió esta opción para que funcione de forma persistente entre `github.io` y `workers.dev`: las cookies HttpOnly entre estos sitios son cookies de terceros y algunos navegadores las bloquean. Una cookie HttpOnly sería preferible al alojar interfaz y API bajo el mismo sitio. El token es la única credencial persistente necesaria del navegador; nunca se incluye en archivos del repositorio, URLs o registros.

Todo el origen `https://paanser.github.io` comparte almacenamiento web entre sus rutas. Mantén seguras las demás páginas de ese origen; para aislar la app de otros repositorios Pages, una evolución aconsejable es un dominio propio. El servidor no confía en roles, nombres ni banderas de sesión del navegador.

Una sesión válida no caduca por tiempo, pero el navegador puede borrar su almacenamiento. La pantalla se vuelve a verificar al recuperar el foco y cada 30 segundos mientras está visible. Una petición tras la revocación se rechaza inmediatamente; los datos ya recibidos en memoria se ocultan al detectarla. Sin conexión no se permite un nuevo arranque con datos privados.

## 1. Preparar herramientas y Cloudflare

Instala Node.js 24 y Python 3. Desde la raíz del proyecto:

```sh
npm ci
npm install --no-save wrangler@4
npx wrangler login
```

Wrangler y las credenciales de Cloudflare son herramientas locales; no deben copiarse a la web ni al repositorio. El uso de D1/R2 y el presupuesto de CPU pueden requerir activar servicios o un plan compatible en tu cuenta. `worker/wrangler.jsonc` pide 100 ms de CPU; comprueba que el plan lo admite para PBKDF2. No reduzcas el coste del hash para eludir los límites de un plan.

Crea la base de datos y el bucket:

```sh
npx wrangler d1 create vidres-sosa
npx wrangler r2 bucket create vidres-sosa-privado
```

Copia el `database_id` devuelto por Cloudflare en `worker/wrangler.jsonc`, sustituyendo el marcador. Conserva `binding: DB`. El nombre del bucket debe coincidir con la configuración y su binding es `FILES`.

En Cloudflare, comprueba que R2 no tiene habilitado acceso público, URL de desarrollo pública ni dominio público. Todos los archivos pasan por el Worker autenticado.

Aplica la migración:

```sh
npx wrangler d1 migrations apply vidres-sosa --remote --config worker/wrangler.jsonc
```

No apliques esta migración sobre una base ajena con otras tablas del mismo nombre. Guarda los identificadores reales de recursos en tu configuración de despliegue; no contienen secretos.

## 2. Desplegar primero el Worker protegido

```sh
npx wrangler deploy --config worker/wrangler.jsonc
```

Sin los secretos de inicio, el login falla de forma cerrada. No hay acceso anónimo a datos ni al proxy de OpenAI. El código anterior `ACCESS_CODE` ya no se acepta, incluso en la ruta raíz.

Configura los secretos mediante los prompts de Wrangler, sin escribir valores en comandos, archivos o capturas:

```sh
npx wrangler secret put PASSWORD_PEPPER --config worker/wrangler.jsonc
npx wrangler secret put ADMIN_INITIAL_PASSWORD --config worker/wrangler.jsonc
npx wrangler secret put OPENAI_API_KEY --config worker/wrangler.jsonc
```

- `PASSWORD_PEPPER`: genera y guarda en un gestor seguro un valor aleatorio de al menos 32 caracteres, preferiblemente 32 bytes o más. Es necesario para validar contraseñas. No lo cambies ni pierdas: no puede recuperarse desde D1. Su rotación requiere restablecer las contraseñas.
- `ADMIN_INITIAL_PASSWORD`: introduce la contraseña temporal acordada para el primer administrador. Su valor no aparece en esta documentación ni en ningún archivo.
- `OPENAI_API_KEY`: clave real del proveedor. Si ya está configurada en el mismo Worker, puedes conservarla. La app de gestión funciona sin IA; solo su endpoint devuelve 503 si falta la clave.

La URL esperada está en `ai-config.js`: `https://vidres-sosa-ia.pausosagomez.workers.dev`. Si Cloudflare devuelve otra, actualiza ese valor **y** el origen permitido en `connect-src` de la CSP de `index.html`. La URL no es un secreto. El origen del frontend en producción permanece fijado en el servidor a `https://paanser.github.io`.

Los bindings KV `USAGE` y el secreto `ACCESS_CODE` ya no se utilizan. Después de verificar el nuevo Worker puedes retirar el secreto antiguo:

```sh
npx wrangler secret delete ACCESS_CODE --config worker/wrangler.jsonc
```

## 3. Primer acceso y contraseña definitiva

Completa este paso enseguida, antes de publicar el frontend: la credencial inicial es temporal y conocida por diseño.

Desde una terminal interactiva, ejecuta:

```sh
python scripts/activar-admin.py https://vidres-sosa-ia.pausosagomez.workers.dev
```

El script pide las contraseñas sin mostrarlas, realiza el primer login del usuario `pau`, cambia obligatoriamente a una nueva contraseña de al menos ocho caracteres y cierra la sesión de la terminal. No imprime ni guarda tokens. La contraseña nueva debe ser distinta de la inicial.

La creación de Pau y la marca de inicialización se guardan en la misma transacción. No existe un endpoint público de bootstrap y no se recrea la cuenta al borrar otros usuarios. El secreto inicial nunca se devuelve al cliente. Las sesiones iniciales solo permiten consultar la identidad, cambiar contraseña o cerrar sesión.

Retira el secreto temporal tras completar el cambio:

```sh
npx wrangler secret delete ADMIN_INITIAL_PASSWORD --config worker/wrangler.jsonc
```

Si haces el primer acceso desde el navegador en vez del script, verás la pantalla obligatoria de cambio y no podrás entrar en la app antes de completarla. El script permite terminar ese paso antes de publicar la interfaz.

Para recuperación, crea un segundo administrador y conserva su acceso en un gestor seguro. No borres la base ni reinstales la migración como método de recuperar una contraseña.

## 4. Publicar GitHub Pages

Ejecuta antes:

```sh
npm test
npx prettier --check .
```

Integra la entrega en `main` y comprueba el workflow **Publicar Vidres Sosa Gestión**. La acción construye `public/` con una lista explícita de recursos frontend; no copia `worker/`, pruebas, configuraciones, archivos `.env`, `.dev.vars` ni copias.

GitHub Pages sigue usando GitHub Actions como fuente. El workflow asigna el SHA a `version.json`, recursos y caché PWA. Revisa la publicación y abre la app con conexión. En dispositivos que tengan instalada la versión anterior, acepta la actualización y recarga antes de introducir datos.

El frontend y el código JavaScript son públicos. Lo protegido son los datos y las acciones del servidor. Eliminar visualmente la pantalla de login no permite consultar D1, R2 o IA sin un token válido.

## 5. Importar los datos existentes

1. Antes de actualizar un dispositivo con datos, descarga desde la versión anterior una **copia completa con fotos y documentos**. Las copias contienen información privada: guárdalas fuera del repositorio.
2. Inicia sesión como administrador en la nueva versión y abre Ajustes.
3. Elige **Revisar e importar datos de este dispositivo**, o utiliza **Importar copia JSON**.
4. Revisa cantidades, trabajos con la misma referencia y contenido diferente, y trabajos actuales ausentes de la copia. La operación sustituye los componentes incluidos; no mezcla automáticamente referencias iguales de distintos dispositivos.
5. Se descargará una copia completa previa del servidor. Comprueba que existe en Descargas y confirma la importación.
6. Los adjuntos se suben a una zona privada de preparación y se comprueban por SHA-256 y tamaño. Hasta el commit no son visibles en la app.
7. El servidor valida referencias y formatos y confirma los registros y referencias a archivos en una sola transacción, siempre que nadie haya modificado la revisión del servidor durante la importación.
8. Recarga y comprueba trabajos, clientes, croquis, presupuestos, cierre administrativo, fotos y documentos desde otro dispositivo.

No se borran ni modifican los originales de localStorage/IndexedDB. Por tanto, siguen siendo accesibles dentro de ese perfil del navegador hasta que decidas limpiarlo, una vez verificados el servidor y las copias. La protección nueva no puede cifrar retroactivamente esos originales. Las escrituras nuevas de negocio solo van al servidor.

Si tienes datos diferentes en varios dispositivos, prepara una copia unificada y resuelve las referencias duplicadas antes de importar el segundo. Una segunda importación no es una fusión automática. Si hay una operación de recuperación local pendiente, resuélvela y exporta una copia coherente antes de importar.

Una interrupción antes del commit conserva el estado anterior del servidor. Si se pierde la respuesta justo al confirmar, recarga y revisa el resultado antes de repetir la importación. No se afirma que una descarga se haya guardado en disco: debe comprobarlo la persona que importa.

Los registros tienen límites: estado de hasta 8 MB por petición, 5.000 registros por colección, un registro de hasta aproximadamente 500 KB, documentos de hasta 8 MB e imágenes de hasta 20 MB por subida. La interfaz comprime fotografías. La importación JSON completa admite hasta 250 MB antes de separar sus adjuntos. Para volúmenes superiores, habrá que adaptar la importación y paginación; no dividas copias sustituyendo sin revisar.

## Endpoints

| Ruta y método                    | Permiso y comportamiento                                                    |
| -------------------------------- | --------------------------------------------------------------------------- |
| `POST /auth/login`               | Público, único acceso a credenciales; rate limit por usuario e IP           |
| `GET /auth/me`                   | Identidad de la sesión, también durante cambio obligatorio                  |
| `POST /auth/change-password`     | Contraseña actual + nueva; revoca todas las sesiones y emite una nueva      |
| `POST /auth/logout`              | Revoca la sesión actual                                                     |
| `GET /admin/users`               | Lista pública de campos de usuario, sin hashes ni sales; solo administrador |
| `POST /admin/users`              | Nombre, usuario, contraseña y rol; solo administrador                       |
| `PATCH /admin/users/:id`         | Activar/desactivar; revoca sesiones; solo administrador                     |
| `DELETE /admin/users/:id`        | Eliminar; solo administrador; protege último administrador                  |
| `POST /admin/users/:id/password` | Restablecer contraseña y revocar sesiones; solo administrador               |
| `GET /api/state`                 | Estado de negocio compartido y revisión; sesión completa                    |
| `PUT /api/state`                 | Sustituye el estado validado si coincide la revisión; transacción           |
| `POST /api/quote-number`         | Reserva una referencia de presupuesto en el servidor                        |
| `GET /api/files`                 | Metadatos de adjuntos visibles de trabajos existentes                       |
| `PUT /api/files/:id`             | Sube archivo privado con metadatos, revisión y versión                      |
| `GET /api/files/:id`             | Descarga autenticada, `attachment`, `nosniff`, `no-store`                   |
| `DELETE /api/files/:id`          | Borra la referencia y avanza revisión                                       |
| `POST /admin/imports`            | Abre preparación vinculada a administrador y revisión                       |
| `POST /admin/imports/:id`        | Confirma datos y manifiesto de archivos verificados                         |
| `DELETE /admin/imports/:id`      | Cancela una preparación                                                     |
| `POST /ai/interpretar`           | IA con sesión completa y cuota atómica                                      |

Se usa una API de estado compartido para conservar las relaciones y transacciones del prototipo, en lugar de múltiples escrituras independientes por entidad. Los registros se almacenan por separado en D1. Los guardados del navegador están serializados y solo actualizan la memoria después de recibir confirmación. Ante una revisión obsoleta, no se reintenta sobrescribiendo automáticamente.

Las únicas peticiones HTTP sin sesión son login y preflight `OPTIONS`. Un origen ajeno se rechaza con 403 antes de procesar la petición. Con el origen correcto, o sin encabezado Origin en un cliente de terminal, una ruta protegida sin sesión devuelve 401. Las respuestas sin Origin no conceden permiso CORS. Un empleado recibe 403 en administración aunque fabrique una petición a mano.

## Mantenimiento y copias

El cron interno de Cloudflare limpia contadores vencidos y preparaciones canceladas o abandonadas durante más de siete días. Recorre R2 en lotes de 100 objetos por ejecución y elimina objetos sin referencia con más de 24 horas de antigüedad. Mantiene un cursor para continuar. No caduca ni elimina sesiones por antigüedad. La limpieza no tiene endpoint HTTP.

Exporta copias completas periódicas y protege además las copias de D1, R2 y el pepper con los mecanismos de tu cuenta. Prueba su restauración en un entorno separado. Una copia JSON no está cifrada y puede incluir datos personales. La protección técnica de acceso no sustituye las decisiones de retención y tratamiento de esos datos.

Los registros administrativos no incluyen contraseñas, tokens, cuerpos de login ni claves del proveedor. No habilites registro de cuerpos o encabezados Authorization en herramientas externas.

## Probar sin gastar OpenAI

```sh
npm ci
npm test
node tests/worker.test.cjs
node tests/frontend.test.cjs
npx prettier --check .
```

También puedes ejecutar `npm run check:secrets` (Python 3), que revisa patrones en el historial y el árbol de trabajo sin imprimir credenciales. En Windows puedes usar `py scripts/check-secrets.py`. No sustituye una revisión manual.

Las pruebas de backend usan SQLite real y transacciones/triggers, con bindings D1/R2 simulados y OpenAI simulado. Las del frontend ejecutan login y almacenamiento en un contexto JavaScript aislado; no sustituyen un navegador real.

Comprobador opcional de navegador:

```sh
npm install --no-save playwright
npx playwright install chromium
npm run test:browser
```

Sirve la interfaz por interceptación en su origen HTTPS real y conecta sus peticiones al Worker de pruebas. Usa cuentas ficticias; no toca D1/R2 reales ni OpenAI. Comprueba login, cambio obligatorio, creación de parte con medición y foto, usuarios, XSS, sesión persistente y empleado sin administración. Guarda captura en `test-results/`, carpeta ignorada. Puedes indicar `CHROMIUM_PATH` si usas un Chromium del sistema.

**Limitación de esta entrega:** Chromium no pudo arrancar dentro de las restricciones de sockets del entorno de ejecución. Las pruebas automatizadas de Node sí se han ejecutado. No se ha certificado el runtime real de Cloudflare, la publicación de esta versión, ni iPhone/Android; completa las pruebas de aceptación siguientes tras configurar los servicios.

## Lista de aceptación

- [ ] Login correcto abre la app; login incorrecto y usuario inexistente dan el mismo mensaje genérico.
- [ ] Primer acceso obliga a cambiar contraseña; rutas de datos e IA devuelven 403 mientras está pendiente.
- [ ] Contraseñas de menos de ocho caracteres se rechazan en creación, cambio propio y restablecimiento administrativo.
- [ ] Empleado no ve Usuarios ni importación administrativa y recibe 403 al llamar a esas rutas.
- [ ] Crear un segundo administrador funciona; eliminar o desactivar al último activo devuelve 409.
- [ ] Cerrar el navegador y volver a abrir conserva la sesión; Cerrar sesión la revoca.
- [ ] Cambiar contraseña y desactivar un usuario revocan todas sus sesiones, incluidas las de otro dispositivo.
- [ ] Cinco fallos por usuario o IP bloquean temporalmente; el bloqueo deja de aplicarse después de 15 minutos.
- [ ] Peticiones sin token a estado, adjuntos, administración, raíz antigua e IA devuelven 401 sin llamar a OpenAI.
- [ ] Un origen diferente recibe 403 y no obtiene un encabezado CORS que le permita leer respuestas.
- [ ] Crear/editar trabajos, clientes, mediciones/croquis, presupuestos, tarifas y notas persiste al recargar y se ve desde otro dispositivo.
- [ ] Fotos/documentos se pueden descargar con sesión y no mediante una URL pública de R2.
- [ ] Dos dispositivos editando la misma revisión producen un conflicto 409 sin sobrescribir el primer guardado.
- [ ] Un fallo de red mantiene el formulario y no muestra un éxito ficticio.
- [ ] Importación verificada conserva campos de cierre y archivos, no borra originales locales y no expone datos antes del commit.
- [ ] Nombres, notas, nombres de archivo y campos con etiquetas HTML se muestran como texto, incluidos Usuarios y PDF.
- [ ] La versión PWA anterior se actualiza con conexión; la nueva no abre datos privados sin validar sesión.

Prueba HTTP sin sesión (no consume IA):

```sh
curl -i https://vidres-sosa-ia.pausosagomez.workers.dev/api/state -H 'Origin: https://paanser.github.io'
curl -i https://vidres-sosa-ia.pausosagomez.workers.dev/ai/interpretar -H 'Origin: https://paanser.github.io' -H 'Content-Type: application/json' --data '{"text":"Parte ficticio de prueba"}'
```

Ambas deben devolver 401. No copies tokens reales a comandos ni a capturas para hacer las comprobaciones autenticadas; utiliza la interfaz o el comprobador con fixtures.
