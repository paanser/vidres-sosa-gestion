# Vidres Sosa · Gestión

Aplicación estática para una cristalería: partes, clientes, mediciones con croquis, presupuestos de vidrio, fotografías y documentos. Está escrita en HTML, CSS y JavaScript y funciona en GitHub Pages **sin framework ni compilación**.

> **Prototipo local: no debe utilizarse con datos reales de clientes hasta añadir inicio de sesión, permisos, una base de datos segura y resolver el tratamiento de datos personales.** Compartir la dirección de la web no comparte los trabajos entre dispositivos.

## Funciones

- Inicio con activos, hoy, críticos, atrasados y trabajos sin fecha.
- Nuevo parte a pantalla completa, estado manual, fecha, hora y duración opcionales.
- Trabajos activos con búsqueda por cliente, referencia, dirección, notas y teléfono; acceso a finalizados mediante el selector.
- Expediente con resumen, mediciones y croquis, fotos, presupuestos, documentos e historial. Contacto por llamada y WhatsApp desde la ficha de cliente.
- Presupuestos con medidas reales y aplicadas a múltiplos de 6 cm, cantos por lados, cantidades, IVA y recargo configurables. Borrador, Enviado, Aceptado y Rechazado; duplicar, eliminar e imprimir/guardar PDF sin ventanas emergentes.
- Herramientas: clientes, calendario y consulta de tarifas. Importación CSV con actualización por nombre y eliminación de tarifas.
- Copias JSON de datos o completas con archivos. Instalación como PWA y apertura sin conexión después de la primera carga.
- Dictado básico y servicio IA opcional; la información se revisa antes de guardar.

## Probar en Windows

1. Descarga el repositorio y abre una terminal dentro de su carpeta.
2. Instala Python 3 si aún no lo tienes. Inicia el servidor:

   ```powershell
   py -m http.server 8000
   ```

3. Escribe `http://localhost:8000` en el navegador. Mantén esa terminal abierta. Para parar el servidor, pulsa Ctrl+C.

No abras `index.html` haciendo doble clic: la carga de módulos, IndexedDB y el modo sin conexión necesitan un servidor local. En otros sistemas, el comando es `python3 -m http.server 8000`.

Para probar sin conexión, abre primero la aplicación con internet y espera a que termine de cargar. Desactiva la red y recarga. El dictado con IA, la obtención de direcciones y los servicios externos requieren conexión. Safari/iPhone puede ofrecer «Compartir → Añadir a pantalla de inicio»; otros navegadores muestran su opción de instalación. La disponibilidad depende del navegador y del sistema.

## Formato y pruebas

Instala Node.js 22 o 24 y ejecuta:

```powershell
npm ci
npm run format
npm test
```

Prettier solo es una herramienta de desarrollo. No hace falta ejecutarlo ni instalar dependencias para usar la web. `npm test` utiliza el runner incluido en Node y prueba cálculos y Worker con datos ficticios; no llama a servicios de pago. Consulta [las comprobaciones por fases](docs/FASES.md) para los recorridos manuales en navegador.

## GitHub Pages y actualizaciones

El flujo `.github/workflows/pages.yml` comprueba pruebas y formato en las PR y publica la web solo si las comprobaciones pasan al integrar cambios en `main`, o al iniciarlo manualmente desde Actions seleccionando `main`. Debe estar habilitado GitHub Pages con GitHub Actions como fuente. Comprueba el resultado de la ejecución en Actions: guardar una rama o crear una PR no publica la web.

La publicación genera `version.json` y la versión del service worker con el SHA del commit. `loader.js` aplica esa versión a los recursos; no hay que editar los parámetros `?v=` de cada archivo. La caché se renueva por versión y solo se eliminan cachés de esta aplicación. Cuando hay una actualización, se ofrece recargar; guarda primero los formularios abiertos. El service worker no guarda llamadas a IA ni respuestas de servicios externos. Si el primer arranque se hace sin red antes de preparar la caché, no puede abrir la aplicación.

El directorio `worker/` no se despliega automáticamente en Cloudflare desde GitHub Pages. Sigue [Configurar IA](docs/CONFIGURAR-IA.md) para publicar y configurar ese servicio por separado.

## Dónde se guardan los datos

Todo se guarda en el perfil del navegador de ese dispositivo:

| Datos                   | Almacenamiento                                       |
| ----------------------- | ---------------------------------------------------- |
| Trabajos                | localStorage, `vidres-sosa-demo-v01`                 |
| Clientes                | localStorage, `vidres-clientes-v1`                   |
| Presupuestos            | localStorage, `vs-quote-prototype-v1`                |
| Tarifas                 | localStorage, `vs-tariffs-prototype-v1`              |
| Configuración y empresa | localStorage, `vs-config-v1`                         |
| Mediciones y croquis    | IndexedDB, `vidres-gestion-v1`, almacén `mediciones` |
| Fotos                   | IndexedDB, `vidres-fotos-v1`                         |
| Documentos              | IndexedDB, `vidres-documentos-v1`                    |

Se migra automáticamente `vidres-mediciones-v1` a IndexedDB: se copia conservando el orden de piezas, se lee de nuevo y se comprueba antes de eliminar la clave antigua. Si hay conflicto o fallo, el original se conserva y se detiene el inicio con un aviso. Las claves antiguas ajenas a esta migración no se borran. Los archivos del catálogo de tarifas PDF de Ajustes solo se registran por nombre; para conservar un archivo hay que adjuntarlo al expediente.

localStorage tiene un límite pequeño, habitualmente alrededor de 5 MB. IndexedDB dispone de más espacio, pero su cuota depende del dispositivo; tampoco es ilimitado ni garantiza conservación permanente. El modo privado, la limpieza del navegador, la pérdida del dispositivo o la falta de espacio pueden hacer perder datos. No hay sincronización entre dispositivos ni protección frente a ediciones simultáneas de varios usuarios. Usa copias frecuentes y evita modificar los mismos datos desde varias pestañas.

Los presupuestos nuevos reservan una referencia anual al guardarse, conservando un contador para evitar reutilizar referencias borradas. Los presupuestos anteriores conservan su identificador. Un fallo después de reservar una referencia puede dejar un salto; la seguridad de no repetirla tiene prioridad. Los presupuestos guardan sus condiciones numéricas de IVA y recargo; cambiar Ajustes afecta a presupuestos nuevos. Los antiguos sin esos campos mantienen el cálculo original del 21 % sin recargo.

El recargo porcentual se aplica al subtotal de vidrio y cantos antes del IVA. El recargo en €/m² usa la superficie aplicada (redondeada) multiplicada por la cantidad. Se mantiene desactivado hasta que se elige expresamente un modo y un valor. Para WhatsApp se presupone el prefijo español 34 cuando la ficha contiene nueve dígitos sin prefijo.

## Copias y recuperación

En Ajustes:

- **Descargar datos JSON:** trabajos, clientes, mediciones/croquis, presupuestos, tarifas, configuración y numeración.
- **Copia completa con fotos y documentos:** incluye además los archivos codificados; puede ocupar aproximadamente un tercio más que los archivos originales y consume memoria durante su preparación.
- **Importar copia JSON:** valida el formato y descarga primero una copia completa del estado actual. Comprueba que el navegador haya permitido esa descarga y que el archivo exista en Descargas. La aplicación no puede acreditar por sí sola que se haya guardado en tu disco.

Antes de probar una restauración, exporta una copia y utiliza otro perfil de navegador. Las copias antiguas que no incluyen presupuestos, configuración o archivos no borran esos componentes actuales. Las referencias de la numeración no retroceden. La restauración y la eliminación de trabajos utilizan un registro temporal de recuperación en IndexedDB: si se interrumpen, al siguiente arranque se intenta recuperar el estado anterior antes de mostrar los datos. Esto no sustituye una copia externa; si falla el propio almacenamiento del navegador, conserva la sesión y los archivos de copia.

Ajustes muestra la fecha de la última exportación solicitada. Inicio avisa cuando pasan más de 14 días sin copia. Las copias contienen información sensible: guárdalas en un lugar privado, con acceso limitado. JSON no es un formato cifrado.

## Límites de la IA

La clave del proveedor permanece en el Worker, nunca en el navegador. El código compartido no sustituye usuarios. Los límites por minuto y mes de Workers KV son aproximados por su consistencia eventual; no constituyen un tope estricto de gasto. Las pruebas locales no verifican secretos, facturación ni despliegue real. Consulta [los detalles del Worker](docs/CONFIGURAR-IA.md).

## Evolución pendiente

Consulta [PENDIENTE](docs/PENDIENTE.md). La evolución a un sistema compartido requiere acordar arquitectura, costes y migración; no se ha contratado ni configurado automáticamente ningún servicio de pago.
