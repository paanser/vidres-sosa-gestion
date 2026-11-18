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

### Hitos y búsqueda de expedientes

Los botones M (Medido), F (Fabricado), PM (Pendiente Montaje) y MO (Montado)
aparecen solo en los partes de trabajo y son indicadores independientes:
gris significa pendiente y verde completado.
No cambian el estado comercial ni los cálculos del expediente. Cada pulsación
se confirma mediante `/api/state`, con la revisión existente, antes de mostrar
el cambio. Los registros antiguos empiezan con todos los hitos pendientes.

Los hitos se guardan en el objeto `hitos` del registro JSON de D1, sin migración
SQL. Los presupuestos no muestran botones ni filtros de hitos. Los datos
de hitos de presupuestos antiguos se conservan por compatibilidad. El Worker
valida las cuatro claves y sus valores booleanos. Un fallo de red o conflicto
deja visible el estado guardado y muestra el error, sin afirmar que se haya
guardado localmente.

Trabajos permite buscar por cliente, referencia y fecha (AAAA-MM-DD o
DD/MM/AAAA), además de los campos anteriores, y filtrar por hito y por
pendiente/completado. En presupuestos, la búsqueda por cliente, referencia y
fecha actúa sobre el listado sin reconstruir el formulario que se está editando.

Validación: `npm test` y `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`.
Las pruebas de navegador incluyen alternancia, recarga del estado del Worker/D1,
filtros de trabajos y ausencia de hitos en presupuestos. Estas pruebas usan el
backend de pruebas; no modifican D1 remoto ni despliegan recursos.

## Hoja imprimible para visitas

En la cabecera de cualquier expediente, «Hoja de visita PDF» prepara una hoja A4
con cliente, teléfono, dirección, población, cita, responsable, descripción y notas.
Incluye campos para completar fecha y operario y un recuadro de cuadrícula de 5 mm
con líneas finas para escribir medidas, anotaciones o croquis a boli. El logo VS
aparece centrado al fondo como marca de agua suave, debajo de la cuadrícula. Los textos
largos continúan en otras páginas y se conserva un mínimo de 12 cm de cuadrícula.
Usa «Abrir PDF e imprimir» o «Guardar PDF» e imprime a tamaño real (100 %).
El PDF se genera en el dispositivo y toma los datos guardados del expediente;
no incluye importes. No requiere cambios en el Worker.

### Inicio personal por usuario

En **Inicio** puedes alternar entre **Panel de gestión** y **Calendario** con los botones superiores. **Clientes** tiene un acceso directo en el menú principal.

Desde el **icono de personalización en la esquina inferior derecha de Inicio**, que abre las opciones en una ventana oculta por defecto, cada usuario puede elegir el panel o el calendario y mostrar u ocultar el resumen, los próximos trabajos, las notas y los presupuestos por reclamar. Es posible ocultar todos los bloques y restablecer la configuración inicial.

Las preferencias se guardan en la cuenta mediante `/api/preferences/home`, separadas de los datos compartidos y de sus copias de seguridad. Se recuperan al iniciar o recargar la aplicación en cualquier dispositivo. Para publicar este cambio, aplicar primero la migración D1 `0004_home_preferences.sql` y desplegar el backend antes del frontend (el flujo de despliegue existente aplica las migraciones).

### Vistas de presupuestos

Al abrir Presupuestos se muestra directamente la lista de presupuestos guardados,
con «Nuevo presupuesto» y «Presupuesto rápido» arriba. El formulario completo de
cliente, medidas y precios se abre al crear, abrir o duplicar un presupuesto.
«Volver a presupuestos» cierra el formulario y vuelve a la lista; si hay cambios
sin guardar, pide confirmación antes de descartarlos. Un formulario abierto se
conserva al consultar otro apartado y regresar.

El icono de deslizadores de la esquina inferior derecha abre la personalización
de cada apartado. En Presupuestos permite elegir entre tarjetas y una lista con
estado, número, fecha, cliente/detalle, neto sin IVA y total con IVA. La lista es
la vista inicial; sus opciones por fila incluyen WhatsApp, duplicar y eliminar.
Cambiar de vista conserva el formulario y los filtros. La elección se recuerda
para cada usuario en ese navegador, independientemente de los demás apartados.

El botón «Enviar por WhatsApp» conserva el envío del mensaje de texto.
Para enviar el archivo, pulsa «PDF para cliente» y después «Compartir PDF»:
elige la aplicación y el contacto en el menú del dispositivo. Si el navegador
no permite compartir archivos, se descarga el PDF para adjuntarlo manualmente.

## Recargo energético y destinatario de WhatsApp

La tarifa fija del recargo energético se consulta y modifica únicamente en
Ajustes → Configuración general, en €/kg. El valor inicial es 0,314 €/kg si no hay
una tarifa por kg configurada; se puede guardar 0 para desactivarlo. Los presupuestos
normales, rápidos y duplicados toman esa tarifa al crearse. Los guardados conservan sus condiciones. El peso usa superficie real × cantidad × espesor total del vidrio
× 2,5; en dobles se suman ambos vidrios sin incluir la cámara de aire.

Al seleccionar una tarifa de vidrio se completa el espesor si se reconoce en su
nombre (también en laminados). En dobles se suman los espesores de las caras.
El espesor sigue siendo editable; si el vidrio no lo indica, hay que introducirlo.

En «Canto pulido», al elegir «Por tarifa», el selector «Tarifa del canto» muestra los importes €/ml de
las tarifas disponibles y permite elegir una independientemente de la del vidrio.
También se puede introducir un precio manual, tanto en el presupuesto normal
como en el rápido. Las tarifas con canto a cero se muestran a cero hasta que
se configure su importe en Tarifas.

El canto pulido se calcula por los metros lineales de los lados seleccionados,
multiplicados por dos en doble acristalamiento y por uno en monolítico, y por
la cantidad de unidades. Por ejemplo, un doble de 1 × 1 m con todo el perímetro
pulido suma 4 × 2 = 8 metros lineales. El pulido no modifica los kilos ni añade
recargo energético. La energía se calcula únicamente sobre el peso del vidrio.

Al abrir WhatsApp, tanto para presupuesto como para seguimiento, el diálogo
permite elegir el teléfono de la ficha o escribir otro número con prefijo
internacional. El número alternativo no modifica la ficha ni se conserva para
el siguiente envío. No es necesario añadir el destinatario a los contactos.

### Orden y filtros de expedientes

En Trabajos, «Ordenar por» permite ordenar por referencia, creación, cliente,
responsable o fecha de cita, en ambos sentidos. El orden se recuerda para cada
usuario en ese navegador y se conserva al cambiar entre tarjetas y lista compacta.
«Más filtros» permite combinar responsable, estado, tipo de cliente y un rango
inclusivo de fechas de creación. Los filtros se conservan al cambiar entre activos,
finalizados, archivo y todos; «Limpiar filtros» los retira junto con la búsqueda y
los hitos, conservando el orden y el ámbito elegidos.

La creación procede del evento inicial del historial y se muestra en la zona
horaria del dispositivo; no se utiliza la fecha de cita ni una edición posterior.
Los expedientes antiguos sin ese evento indican «Sin fecha registrada», quedan al
final al ordenar por creación y se excluyen cuando se aplica un rango de creación.
Este cambio solo afecta al frontend y no necesita cambios en el Worker ni en D1.

Los presupuestos guardados a cero muestran la tarifa aplicada y el botón
«Aplicar tarifa actual de Ajustes», que recalcula el borrador con la tarifa
actual. Guarda el presupuesto para conservar el cambio.

En «Canto pulido», el selector «Precio del pulido» permite elegir Manual e
introducir €/ml, o Por tarifa de vidrio para copiar el precio de canto del
catálogo. Disponible en el presupuesto normal y rápido; se conservan al guardar.
El precio manual no cambia al seleccionar otro vidrio. Si la tarifa no tiene
precio de pulido, se indica para que puedas introducirlo manualmente.
El desglose muestra el importe del pulido y el recargo por separado.

### Recargos de doble acristalamiento

Al inicio del presupuesto normal y rápido, junto al metraje mínimo, el bloque
«Recargos · doble acristalamiento» permite activar o desactivar las reglas de la
tabla. Los nuevos presupuestos las activan; los anteriores conservan sus importes
y pueden activarlas expresamente. Los ajustes se guardan con cada presupuesto.

En líneas con «Calcular doble acristalamiento», se detecta por pieza un lado
real superior a 2.400 mm (+20 %) y el tramo de superficie real: superior a 4 m²
(+25 %), a 5 m² (+50 %) o a 8 m² (+100 %). Solo se aplica el tramo correspondiente,
sin sumar los de superficie inferior ni sustituir un tramo desactivado por otro.
El recargo de lado se suma al de superficie. La cantidad de piezas no cambia el
tramo. El aviso de cada línea muestra los recargos detectados, incluso desactivados.

«Formas y mecanizados de este vidrio» permite indicar las formas manualmente y
contar los ángulos distintos de 90° y los lados curvos por pieza. Cada recargo se
calcula sobre el coste facturable del vidrio (con su redondeo comercial y metraje
mínimo), sin cantos, energía ni extras. Se toma el mayor entre porcentaje y mínimo
en euros, por pieza y por ángulo/lado cuando corresponda, y se multiplica por la
cantidad. Los recargos seleccionados se suman sin capitalización; forman parte del coste total sobre el que se aplica el margen comercial
y se mantienen con tarifa fija.
El PDF interno detalla los recargos y el del cliente los incluye en el vidrio.
La facturación automática usa el mismo cálculo.

«Ver medidas del parte» está justo encima de los campos de ancho y alto
del primer vidrio, después de la configuración del acristalamiento.

## Margen comercial del vidrio

El porcentaje se aplica sobre el coste total del vidrio, incluidos cantos,
manufacturas, mano de obra, recargos energéticos y extras asociados. Por ejemplo,
100 € de coste total con un margen del 100 % son 200 € de venta antes de IVA.
Mostrar recargos o extras por separado no cambia el margen ni el total. Los
conceptos libres independientes y el aluminio conservan su tratamiento propio.
