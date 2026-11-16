# FacturaDirecta Clásico

## Uso en Gestión

1. Guarda el presupuesto. En el listado, abre sus opciones (···) y pulsa
   «Emigrar a FacturaDirecta». El editor también tiene el botón. La operación
   está disponible para administradores.
2. Revisa la ficha de cliente, la fecha, las líneas de venta, la base, el IVA y
   el total. Gestión usa el presupuesto guardado en el servidor. Si la ficha de
   cliente vinculada existe, usa sus datos fiscales. Se busca el cliente por NIF.
   Para crear una ficha nueva, elige persona física o empresa y completa el
   nombre fiscal cuando proceda.
3. La opción inicial es «Presupuesto». Pulsa «Crear presupuesto» para
   guardarlo en FacturaDirecta. Conserva la fecha del presupuesto y las
   observaciones visibles en el PDF. FacturaDirecta asigna su referencia.
   «Factura» conserva el flujo de borrador o definitiva para cuando se habilite
   expresamente.
4. Vuelve a abrir el botón y selecciona el tipo de documento para consultar
   su referencia. Cada tipo se registra por separado y el presupuesto de
   Gestión se conserva.

Los vidrios se facturan como un lote por línea, con la cantidad de piezas y las
medidas en el concepto. Las líneas de venta separadas se conservan. Si un
presupuesto antiguo redondeaba la suma en lugar de cada línea, la revisión muestra
el ajuste exacto de redondeo. Los costes y márgenes quedan fuera del XML.
El adaptador coteja base, IVA y total devueltos y guarda la referencia incluso
si hay discrepancias para revisión. La operación tampoco solicita el envío por
correo.

## Despliegue y verificación

GitHub Actions aplica las migraciones `0005_facturadirecta.sql` y
`0006_facturadirecta_estimates.sql` antes de desplegar el Worker. La segunda
conserva las referencias anteriores de factura y admite una referencia
independiente para el presupuesto. Los secretos `FACTURADIRECTA_API_KEY` y
`FACTURADIRECTA_CLASSIC_ACCOUNT` ya están vinculados a `vidres-sosa-ia`.
El token se usa en el Worker como usuario de HTTP Basic con `x` como contraseña.
Las peticiones XML van al subdominio configurado, por HTTPS y sin redirecciones.

El 16 de noviembre de 2026 la consulta autenticada desde el Worker devolvió
HTTP 200 para ambas facturas. FacturaDirecta envió `invoiceSerial` vacío en
los dos casos. `invoiceNumber` fue `2898` y `2897`, y
`invoiceNumberFormatted` fue `02898` y `02897`, respectivamente. El código
omite serie y número en el alta para que FacturaDirecta gestione la
numeración. La verificación en vivo usó únicamente lecturas.

La ruta `GET /api/facturadirecta/connection?number=02898` exige sesión de
administrador, funciona con la creación deshabilitada y devuelve solo los
campos de identificación de la factura cuyo número impreso coincide. La
consulta al proveedor se limita a dos coincidencias.

La vista previa de comprobación caduca el 17 de noviembre de 2026 a
las 15:47, hora peninsular. Se eliminó la vista previa anterior. La versión
33 de producción siguió activa al 100 %.

El despliegue de producción habilita la migración de presupuestos mediante
`FACTURADIRECTA_CLASSIC_ESTIMATES_ENABLED=true` y deshabilita la creación de
facturas mediante `FACTURADIRECTA_CLASSIC_ENABLED=false`. Ambas opciones se
controlan en el servidor de forma independiente.

Las pruebas de creación usan presupuestos ficticios y una API simulada.
El XML de presupuesto usa `POST /api/estimates.xml`, `documentDate` y
`documentLines`. La creación del presupuesto y su envío por correo son
operaciones separadas. Gestión solo usa la primera.

## Duplicados e incidencias

D1 reserva el ID del presupuesto y el tipo de documento antes de llamar a
FacturaDirecta. Otra solicitud para el mismo tipo recibe el estado guardado. El alta de cliente también
se reserva por NIF para evitar dos altas simultáneas desde presupuestos
distintos. La referencia se guarda en D1, independiente del presupuesto y
disponible desde otros dispositivos.

La referencia clásica consultada no documenta una clave de idempotencia. Si una
creación queda sin confirmar, la app bloquea otro intento y muestra el estado
guardado. Busca la etiqueta `Vidres Sosa <referencia de presupuesto>` en
FacturaDirecta y comprueba la ficha por NIF si se iba a crear. El estado
pendiente también cubre la interrupción del Worker antes de guardar una
respuesta. Cualquier desbloqueo requiere cotejar el resultado con FacturaDirecta.

## Contrato y pruebas

- [Autenticación XML](https://web.archive.org/web/20150101222833/http://dev.facturadirecta.com/site/index.html).
- [Clientes](https://web.archive.org/web/20141211181832/http://dev.facturadirecta.com/site/rest-api/clients.html).
- [Presupuestos, líneas y numeración](https://web.archive.org/web/20141211181842/http://dev.facturadirecta.com/site/rest-api/estimates.html).
- [Facturas, borradores y numeración](https://web.archive.org/web/20150101225705/http://dev.facturadirecta.com/site/rest-api/invoices.html).

`npm test` cubre el contrato simulado y el flujo real del Worker con SQLite local.
`npm run test:browser` incluye el acceso, la revisión y la confirmación simulada
desde el listado y el editor.
