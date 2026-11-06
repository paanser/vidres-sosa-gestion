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

- Fecha: 2026-11-06 · Tarea: selección Reuglass e incremento solo del vidrio.
- Causa: autocompletado por nombre sin selector de tarifa; margen global sobre todos los costes y dos fórmulas en pantalla.
- Solución: selector por identificador con nombre/precio; un único incremento del vidrio, sin margen en mano de obra, cantos, energía ni extras. Presupuestos anteriores conservan su fórmula hasta editar, con aviso.
- Validación: npm test, navegador completo (390/768/1024/1440 px, Reuglass, PDF, WhatsApp y persistencia), Prettier, revisión de secretos y git diff --check correctos.
- Integración: el usuario autoriza integrar automáticamente el PR #36 en main al superar CI; la integración activa el flujo habitual de publicación del repositorio. Sin despliegue manual ni borrado de rama.
