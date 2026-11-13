# Vidres Sosa · Gestión

Aplicación en español para partes, clientes, mediciones/croquis, presupuestos, notas, fotografías y documentos. Interfaz HTML/CSS/JavaScript vanilla en GitHub Pages; backend Cloudflare Worker con D1, incluidos adjuntos privados.

**Esta versión requiere desplegar y configurar primero el nuevo Worker.** El frontend no abre los datos si la autenticación o el servidor no están disponibles. No publiques únicamente la interfaz sobre el Worker antiguo.

## Acceso y permisos

- Login antes de cargar la aplicación o consultar sus datos. Diseño móvil, botones grandes y mostrar/ocultar contraseña.
- Perfil inicial Pau, usuario `pau`; la contraseña temporal procede exclusivamente de un secreto de Cloudflare. Primer acceso con cambio obligatorio y mínimo de ocho caracteres.
- En Ajustes se muestra el usuario activo, cambio de contraseña y Cerrar sesión.
- Solo administradores ven Usuarios y pueden crear cuentas, restablecer contraseñas, activar, desactivar o eliminar usuarios. El servidor vuelve a comprobar los permisos. El último administrador activo queda protegido en SQL.
- Sesiones sin caducidad de tiempo. Cambiar contraseña, desactivar o eliminar al usuario revoca sus sesiones; Cerrar sesión revoca la sesión actual. Borrar el almacenamiento del navegador también pierde la sesión.
- Las peticiones de IA exigen sesión válida y cuotas del servidor. El código compartido anterior ya no autoriza llamadas.

## Datos compartidos

El PDF de cliente usa una cabecera con la marca Vidres Sosa, datos de empresa,
recuadro del cliente, tabla de conceptos y resumen de base, IVA y total. En
Ajustes → Configuración general se editan los datos de empresa, condiciones y
validez, y se puede cargar un logo PNG, JPG, WebP o GIF de hasta 2 MB. En GIF se usa el primer fotograma. La imagen se
reduce para guardarla con la configuración; sin imagen se muestra la marca de texto.

Los presupuestos toman CIF/NIF, teléfono, dirección y correo de la ficha del
cliente. En el presupuesto rápido se introducen en «Datos del cliente» y se
conservan con ese presupuesto, aunque después exista una ficha con el mismo nombre.
Al final del editor, «Datos visibles en el PDF para cliente» permite ocultar
medidas, unidades, m² (incluido el total), precio por m², observaciones,
condiciones y validez. El precio por m² está oculto por defecto e incluye los
conceptos integrados cuando se muestra. Estas opciones se guardan y duplican
sin modificar el cálculo ni la copia interna. El botón PDF genera un archivo PDF en el dispositivo y muestra las opciones
Abrir PDF y Guardar PDF. En dispositivos que comparten archivos también aparece
Compartir PDF. No depende del diálogo de impresión del navegador.

D1 guarda los registros de negocio, usuarios, hashes de sesiones, numeración y controles de seguridad. D1 guarda también fotos y documentos por bloques sin acceso público. El navegador conserva los datos descargados en memoria; en localStorage solo se escriben el token de sesión, preferencias visuales, fecha de copia y el contador informativo local de IA.

Los datos anteriores de localStorage/IndexedDB **se conservan sin modificarlos**. El administrador puede revisarlos e importarlos desde Ajustes. La importación muestra diferencias, descarga una copia previa y verifica los archivos antes de confirmar una transacción. También admite las copias JSON anteriores.

Los guardados esperan confirmación del servidor. Una revisión global detecta ediciones simultáneas y devuelve 409 en lugar de sobrescribir datos. Ante un conflicto, conserva el formulario y recarga antes de volver a editar. Los presupuestos reservan su referencia anual en el servidor; puede haber saltos si se abandona un guardado.

Se necesita conexión para consultar o guardar los datos compartidos. La sección «Mediciones sin cobertura» permite guardar explícitamente borradores de medidas y fotos en IndexedDB del dispositivo, separados por usuario, e importarlos al recuperar la conexión. Hay que iniciar sesión y abrir la app con conexión antes de ir a la obra. Estos borradores no se incluyen en la copia del servidor y se pierden al borrar los datos del navegador. La PWA solo conserva los archivos públicos de la interfaz, nunca respuestas de la API, contraseñas o datos de negocio. Una revocación no puede retirar archivos que un usuario ya haya descargado fuera de la aplicación.

## Despliegue, migración y pruebas

Sigue [la guía completa](docs/SEGURIDAD-DESPLIEGUE.md). Incluye Wrangler, D1, secretos, primer acceso, publicación de Pages, migración, pruebas y recuperación.

Con Node.js 24:

```sh
npm ci
npm test
npx prettier --check .
```

Las pruebas usan SQLite real mediante `node:sqlite` y el Worker con un proveedor IA simulado. No necesitan Cloudflare ni consumen crédito OpenAI. El comprobador opcional de Chromium está en `scripts/check-browser.cjs`; consulta la guía para instalar Playwright y ejecutarlo.

El flujo de GitHub Actions valida pruebas y formato, y publica solo una lista explícita de archivos frontend. Excluye backend, configuración, copias y secretos del artefacto Pages. El Worker se despliega por separado.

## Documentación

- [Seguridad, despliegue y migración](docs/SEGURIDAD-DESPLIEGUE.md).
- [Dictado e IA](docs/CONFIGURAR-IA.md).
- [Validación y pruebas pendientes](docs/FASES.md).
- [Evolución pendiente](docs/PENDIENTE.md).

## Presupuestos de aluminio con dibujo

En Presupuestos, «Añadir aluminio con dibujo» permite introducir una descripción
libre, el coste de fábrica por toda la línea (sin IVA) y un incremento porcentual
propio del aluminio. Para fijar directamente el precio de venta se puede usar
incremento cero. El margen general del vidrio no modifica el aluminio.

Se puede adjuntar un recorte JPG, PNG o WebP de hasta 8 MB. Se debe subir solo
el dibujo que se quiera mostrar al cliente: el programa no elimina precios ni
datos de fábrica de la imagen. Se comprime a JPEG y se guarda en el registro
privado del presupuesto, incluidas sus copias de seguridad y duplicados. Se
admiten hasta 60.000 caracteres por dibujo y 350.000 por presupuesto; si se
supera el límite hay que recortar más o dividir el presupuesto. No hay lectura
automática de PDF ni editor de recortes en esta versión.

El PDF del cliente muestra el dibujo, la descripción y la venta sin costes ni
incrementos internos. La copia interna incluye costes y margen añadido. Los
vidrios se añaden con las líneas habituales y sus medidas de corte; no se deducen
las medidas del vidrio a partir de las cotas exteriores del dibujo.

Este cambio requiere actualizar primero el Worker, que valida el nuevo tipo de
línea, y después la interfaz mediante el flujo habitual del repositorio.

La generación PDF usa jsPDF y AutoTable, incluidos en `vendor/` con sus licencias.
Se cargan desde el mismo sitio, sin CDN ni envío de documentos a terceros.
El documento conserva los campos seleccionados para cliente, dibujos y logo; la
copia interna incluye los costes. Al editar los datos se retiran los enlaces
al PDF anterior para evitar enviar un documento desactualizado.

## Gestión de pedidos, agenda, cobros y montaje

Desde Inicio o Calendario abre «Agenda semanal, pedidos y cobros». En el
expediente, «Pedidos, cobros y montaje» abre directamente la gestión del trabajo.

- Pedidos desde las mediciones, selección de piezas, proveedor, referencia,
  entrega e instrucciones. Guardan una copia de las medidas de corte y croquis,
  independiente de las ediciones posteriores. Hoja PDF local con cotas en mm,
  acabados y croquis, sin importes internos. La creación exige revisar las piezas.
  La recepción registra cantidades acumuladas por pieza; admite editar entrega,
  referencia e instrucciones. Los pedidos no se envían automáticamente.
- Agenda semanal filtrada por responsable y avisos de solapamiento cuando ambos
  trabajos tienen hora y duración. Al planificar un solapamiento exige indicarlo
  expresamente. Cambiar fecha, hora o responsable en el parte retira la confirmación
  previa del montaje. Inicio avisa de entregas vencidas, material incompleto para
  instalar y montajes sin confirmar.
- Venta acordada con IVA, anticipos y pagos fechados, saldo pendiente y eliminación
  confirmada de movimientos incorrectos. Con un importe acordado positivo, el
  control «cobrado» se actualiza según el saldo registrado. La venta sin IVA se
  introduce aparte para calcular beneficio y margen sobre costes sin IVA deducible.
  Costes de material, mano de obra, desplazamiento, repetición y otros; resultados
  provisionales hasta completar todos los costes. No genera facturas fiscales.
- Cierre con fecha, firmante, conformidad, incidencias, pendientes, firma opcional
  y selección/subida de fotos finales. Parte PDF local con firma y fotografías.
  Guardar el cierre conserva el estado del trabajo para poder resolver pendientes.
- Guardar como plantilla desde un trabajo conserva descripción, tipo de cliente,
  notas y especificaciones de piezas sin sus medidas. Se aplica desde el selector
  del nuevo parte; requiere confirmar la sustitución de esos campos y piezas.
  Los presupuestos existentes se pueden seguir duplicando desde su editor.
- Borradores locales de medición con fotos para trabajar sin cobertura con la app
  previamente abierta. Importación manual al expediente elegido, con identificadores
  estables y conservación del borrador ante fallos parciales. Reintentar no duplica
  la medición. Un borrador cuya importación se ha iniciado queda vinculado al mismo
  expediente hasta completarla; no puede editarse durante una importación parcial.

La gestión compartida se almacena en `operativa` dentro del trabajo, se valida en
el Worker y viaja con las copias existentes. No requiere migraciones SQL. Publicar
primero el Worker y después la interfaz. Los nuevos módulos públicos se incluyen
en el Service Worker y en la lista explícita del artefacto Pages.

### Precios por cliente y retroceso móvil

En Clientes → Editar ficha se puede guardar un recargo porcentual (por ejemplo, 80 %) o una tarifa de venta del vidrio en €/m². Al seleccionar el cliente o iniciar una oferta desde su trabajo, el presupuesto copia el perfil. Los campos de precio de la oferta permiten ajustes puntuales sin modificar la ficha ni otras ofertas guardadas. Cambiar después el perfil del cliente no recalcula ofertas anteriores.

La tarifa fija sustituye únicamente la venta del vidrio sobre la superficie facturable, incluido el metraje mínimo. Cantos, energía y conceptos adicionales se suman aparte; aluminio conserva su incremento propio. El coste original permanece en el desglose interno. Los PDF y mensajes utilizan los mismos totales del presupuesto.

En móvil, un deslizamiento horizontal de al menos 80 px desde los primeros 24 px del borde izquierdo regresa a la sección anterior. Los gestos cortos, verticales, sobre controles o con un diálogo abierto no activan el retroceso. El borrador del presupuesto permanece en memoria al cambiar de sección.
