# Continuidad

- Fecha: 6 de noviembre de 2026.
- Objetivo: añadir margen seleccionable, importes y conceptos libres, precio
  manual por m² y presupuestos interno y para cliente.
- Rama: `feat/presupuestos-margen-conceptos`, basada en `main` (`a25a2e1`), que
  contiene correcciones posteriores a `rediseno`. No se ha modificado `main`.
  No existen instrucciones `AGENTS.md` en el repositorio clonado.
- Último commit al redactar: `eec7c9f` (editor, documentos y pruebas de navegador).
  Anterior: `1b42c6e` (cálculos, validación del servidor y pruebas). Este resumen
  se guarda después en un commit documental; consultar `git log -1` para su SHA.
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
- GitHub: se sube la rama de la tarea con los commits al cerrar la sesión;
  comprobar la referencia remota si se retoma desde otro entorno.
- Publicación: no publicado, sin merge ni cambios en `main` o `rediseno`.
  La función necesita tanto el frontend como la validación nueva del Worker.
- Siguiente paso: revisar la rama y, con autorización para publicar, desplegar
  primero el Worker y después integrar el frontend en `main` para GitHub Pages.
  No publicar solo el frontend: el Worker anterior rechaza conceptos sin medidas.
- El rediseño anterior no se ha retomado. Sigue vigente la parada obligatoria
  después del paso 2 antes de iniciar el paso 3.
