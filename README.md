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
sin modificar el cálculo ni la copia interna. El PDF se obtiene con el diálogo
de impresión del navegador, seleccionando guardar como PDF.

D1 guarda los registros de negocio, usuarios, hashes de sesiones, numeración y controles de seguridad. D1 guarda también fotos y documentos por bloques sin acceso público. El navegador conserva los datos descargados en memoria; en localStorage solo se escriben el token de sesión, preferencias visuales, fecha de copia y el contador informativo local de IA.

Los datos anteriores de localStorage/IndexedDB **se conservan sin modificarlos**. El administrador puede revisarlos e importarlos desde Ajustes. La importación muestra diferencias, descarga una copia previa y verifica los archivos antes de confirmar una transacción. También admite las copias JSON anteriores.

Los guardados esperan confirmación del servidor. Una revisión global detecta ediciones simultáneas y devuelve 409 en lugar de sobrescribir datos. Ante un conflicto, conserva el formulario y recarga antes de volver a editar. Los presupuestos reservan su referencia anual en el servidor; puede haber saltos si se abandona un guardado.

Se necesita conexión para consultar o guardar los datos. La PWA solo conserva los archivos públicos de la interfaz, nunca respuestas de la API, contraseñas o datos de negocio. Una revocación no puede retirar archivos que un usuario ya haya descargado fuera de la aplicación.

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
