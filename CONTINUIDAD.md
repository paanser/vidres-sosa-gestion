# Continuidad

- Fecha: 6 de noviembre de 2026.
- Objetivo: añadir margen seleccionable, importes y conceptos libres, precio
  manual por m² y presupuestos interno y para cliente.
- Rama: `feat/presupuestos-margen-conceptos`, basada en `main` (`a25a2e1`), que
  contiene correcciones posteriores a `rediseno`. El usuario autorizó publicar
  con «publica» y se integró la PR #34 en `main` (`2491599`).
  No existen instrucciones `AGENTS.md` en el repositorio clonado.
- Último commit al redactar: `2491599` (integración de la PR #34). Commits de
  implementación: `1b42c6e` y `eec7c9f`; revisión desplegada del Worker: `d19b913`.
  Este resumen se guarda después en un commit documental; consultar `git log -1`.
- Terminado:
  - Margen por presupuesto: sobre coste (`coste × (1 + porcentaje / 100)`) o
    sobre venta sin IVA (`coste / (1 - porcentaje / 100)`, inferior al 100 %).
    Se aplica a vidrio, cantos, energía y conceptos adicionales antes del IVA.
  - Importe y descripción adicionales por línea de vidrio, integrados en su
    precio o mostrados como concepto separado. El importe es por toda la línea,
    no por pieza. Los totales no cambian al cambiar la presentación.
  - Conceptos libres independientes con descripción e importe de coste sin IVA;
    permiten presupuestos sin vidrio, medidas ni tarifa. Para ello añadir el
    concepto y eliminar la línea inicial de vidrio.
  - Precio manual por m² conservado y etiquetado como editable sin tarifa.
  - PDF interno con costes y margen; PDF de cliente y WhatsApp con precios de
    venta y conceptos separados elegidos, sin costes ni margen interno.
  - Guardado, reapertura y duplicado conservan las nuevas opciones. Los
    presupuestos antiguos mantienen su cálculo y redondeo anterior.
  - `worker/data.js` admite y valida los nuevos campos y las líneas libres;
    era necesario porque el servidor exigía medidas a todas las líneas.
    No se han modificado `auth.js`, `storage.js`, `worker/security.js` ni datos reales.
- Pruebas: `npm test`, 36 aprobadas; `npx prettier --check .`, correcto;
  `git diff --check`, correcto. Navegador completo correcto, con servidor local
  simulado y base de datos en memoria, sin acceder a datos reales.
  Comprobados 390, 768, 1024 y 1440 px, totales, ambos márgenes, validaciones,
  textos escapados, PDF interno/cliente, WhatsApp, guardado, recarga y duplicado.
  Capturas locales ignoradas en `test-results/presupuesto-*.png`.
- Navegador: usar `PLAYWRIGHT_MODULE_PATH=/opt/codex/cua_node/lib/node_modules/playwright
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser` (en una sola línea).
- Cambios sin commit: ninguno tras el commit de este documento.
- GitHub: PR #34 integrada en `main`. La rama de la tarea se conserva y se
  actualiza con este documento; no se ha modificado `rediseno`.
- Publicación autorizada y realizada:
  - Worker desplegado primero desde `d19b913`: ejecución `42226140393`, correcta.
    Conserva los secretos y las rutas privadas rechazan acceso sin sesión (401).
  - Interfaz integrada en `main` (`2491599`): ejecución Pages `42226295611`,
    correcta. En la URL pública se han comprobado los controles de margen,
    conceptos libres y PDF interno. Sin pruebas que modifiquen datos reales.
  - URL: https://paanser.github.io/vidres-sosa-gestion/
  - Este commit documental activa otra publicación; comprobar su ejecución y
    `version.json` al finalizar. Los cambios funcionales ya están publicados.
- Configuración pendiente: Pages está en modo `legacy` (rama `main`, raíz),
  además del workflow `pages.yml`. El intento de cambiar a `workflow` mediante
  la API fue rechazado con 403; no se cambió esa configuración. Se canceló la
  ejecución paralela `42226294420` para evitar sobrescribir el artefacto versionado.
  Tras cada push a `main`, hasta corregir la configuración, cancelar el flujo
  automático «pages build and deployment» y comprobar que el de `pages.yml`
  termina correctamente y `version.json` coincide con el SHA publicado.
- Siguiente paso: en Settings → Pages → Build and deployment → Source, elegir
  GitHub Actions con una cuenta o integración que tenga permiso para cambiar
  Pages. La publicación actual se completa mediante el workflow del repositorio.
- El rediseño anterior no se ha retomado. Sigue vigente la parada obligatoria
  después del paso 2 antes de iniciar el paso 3.

## Cambio 1 terminado · 6 de noviembre de 2026

- Objetivo: entrada en metros con tres decimales (milímetros), sin modificar
  cálculos de precios ni datos antiguos. Plan aprobado con «ok». Solo se ha
  implementado el cambio 1 del texto adjunto.
- Rama: `feature/medidas-metros-20261106`, basada en `origin/main` (`8ada9e8`).
  Último commit previo: `351eb29` (plan). Código y esta nota se guardan juntos;
  el commit final se consulta con `git log -1` o en la rama de GitHub.
- Terminado:
  - `utils.js`: parseMeters, formatMeters, formatMeasure, conversión m a cm y
    entrada compartida con errores, confirmación por encima de 6 m y ayuda en vivo.
  - `tools.js`: metros por defecto si no hay unidad configurada; conserva cm/mm.
    Al cambiar unidad conserva la unidad histórica de cotas sin metadatos en
    el campo opcional legacyDimensionUnit. No se migran ni convierten sus valores.
  - `quotes.js`: editor y rápido, resultados Real/Aplicada, WhatsApp y copia de
    mensaje, PDF cliente/interno. Actualiza resultados sin reconstruir campos.
    Al guardar un presupuesto antiguo conserva medidas de precisión superior
    a la mostrada si no se han editado, para no cambiar importes.
  - `job-measures.js`, `app.js`, `index.html`: piezas del parte y editor de
    mediciones; el área y el guardado usan centímetros numéricos internamente.
  - `sketch.js`: confirmación en vivo del teclado, cotas en metros, transferencia
    correcta a piezas y unidad opcional por cota para evitar reinterpretaciones.
  - Tarjetas de mediciones en `app.js` y ficha del parte en `expediente.js`:
    medidas en metros. `styles.css`: medidas de 16 px y 44 px de altura, errores.
  - `worker/data.js`: permite m y valida la unidad opcional de las cotas;
    `backup.js`: valida esa unidad sin cambiar el formato de copias.
- Sin cambios en calculations.js (calc, totals y quoteDetails conservados),
  auth.js, storage.js, claves existentes, seguridad ni CSP. Sin recursos públicos
  nuevos: no hacen falta cambios en sw.js, loader.js ni pages.yml.
- Pruebas: npm test, 41 aprobadas y 0 fallos; cinco pruebas nuevas en
  tests/meters.test.cjs cubren los ejemplos solicitados, errores, formatos,
  confirmación, round6, importes antiguos y validación de unidades del servidor.
  npx prettier --check ., correcto con la versión instalada del lockfile.
  git diff --check, correcto.
- Navegador: npm run test:browser con las variables documentadas arriba, correcto.
  Nuevo scripts/check-meters-browser.cjs, invocado por check-browser.cjs;
  check-quotes-browser.cjs adapta medidas de prueba a m. Comprobados foco y campo
  estable, errores, confirmación rechazada, cálculo sin conexión, guardado,
  reapertura de antiguos, cm/mm/m, WhatsApp, PDF, rápido, piezas, cotas y edición
  de mediciones. Servidor simulado y SQLite en memoria; sin datos reales.
  Anchuras: 390, 768, 1024 y 1440 px, sin desbordamiento. Capturas locales
  ignoradas en test-results/medidas-\*.png; revisadas visualmente móvil/escritorio.
- Cambios sin commit: ninguno tras el commit conjunto de código y continuidad.
- GitHub: se sube únicamente la rama de la tarea y se comprueba el SHA remoto.
  No se ha fusionado ni publicado este cambio; main permanece en 8ada9e8.
- Publicación pendiente: cuando el usuario la autorice, desplegar primero el
  Worker que admite m y después la interfaz; el Worker publicado todavía solo
  admite cm/mm en Ajustes. Respetar el problema de Pages descrito arriba.
- Siguiente paso: entregar el cambio 1 y esperar indicación expresa antes del
  cambio 2 (peso y energía por kg). No retomar el rediseño ni publicar por iniciativa
  propia. Pendientes cambios 2, 3 y 4 del texto adjunto.
